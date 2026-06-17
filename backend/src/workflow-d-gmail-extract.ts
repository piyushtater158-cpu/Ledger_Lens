/**
 * Workflow D — Gmail Attachment Extract
 * Webhook: POST /webhook/gmail-extract
 * Input: { googleAccessToken, messageId, attachmentId, mimeType, filename }
 * Output: { payee, accountNumber, ifsc, amount, currency, confidence, status }
 */

import { workflow, trigger, node, ifElse, merge, expr } from '@n8n/workflow-sdk';

const receiveGmailExtract = trigger({
  type: 'n8n-nodes-base.webhook',
  version: 2.1,
  config: {
    name: 'Receive Gmail Extract',
    parameters: {
      httpMethod: 'POST',
      path: 'gmail-extract',
      authentication: 'headerAuth',
      responseMode: 'responseNode',
      options: {},
    },
  },
});

const parseExtractBody = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Parse Extract Body',
    parameters: {
      mode: 'runOnceForEachItem',
      jsCode: `
const body = $json.body || $json;
const token = String(body.googleAccessToken || '').trim();
const messageId = String(body.messageId || '').trim();
const attachmentId = String(body.attachmentId || '').trim();
const mimeType = String(body.mimeType || '').trim();
const filename = String(body.filename || '').trim();
if (!token) throw new Error('googleAccessToken is required');
if (!messageId) throw new Error('messageId is required');
if (!attachmentId) throw new Error('attachmentId is required');
if (!mimeType) throw new Error('mimeType is required');
if (!filename) throw new Error('filename is required');
return { json: { token, messageId, attachmentId, mimeType, filename, _idx: 0 } };
`,
    },
  },
});

const fetchAttachmentBytes = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.4,
  config: {
    name: 'Fetch Attachment Bytes',
    onError: 'continueRegularOutput',
    parameters: {
      method: 'GET',
      url: expr(`{{ "https://gmail.googleapis.com/gmail/v1/users/me/messages/" + $json.messageId + "/attachments/" + $json.attachmentId }}`),
      sendHeaders: true,
      specifyHeaders: 'keypair',
      headerParameters: {
        parameters: [{ name: 'Authorization', value: expr(`{{ "Bearer " + $json.token }}`) }],
      },
      options: { response: { response: { neverError: true } } },
    },
  },
});

const restoreRowAfterDownload = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Restore Row After Download',
    parameters: {
      mode: 'runOnceForEachItem',
      jsCode: `
function fromBase64Url(input) {
  const normalized = String(input || '').replace(/-/g, '+').replace(/_/g, '/');
  const padLen = (4 - (normalized.length % 4)) % 4;
  return normalized + '='.repeat(padLen);
}
const row = $('Parse Extract Body').item.json;
const payload = $json || {};
const dataBase64Url = payload.data || '';
if (!dataBase64Url) {
  return { json: { ...row, _fileClass: 'error', _mimeType: row.mimeType || '', _geminiMimeType: row.mimeType || '', _fileName: row.filename || '', _downloadFailed: true, _status: 'Error: attachment fetch failed' } };
}
const base64 = fromBase64Url(dataBase64Url);
const binaryBuffer = Buffer.from(base64, 'base64');
const binary = await this.helpers.prepareBinaryData(binaryBuffer, row.filename || 'invoice', row.mimeType || 'application/octet-stream');
let fileClass = 'error';
let geminiMimeType = row.mimeType || 'application/octet-stream';
let status = '';
if (row.mimeType === 'application/pdf') {
  fileClass = 'document';
  geminiMimeType = 'application/pdf';
} else if (String(row.mimeType || '').startsWith('image/')) {
  fileClass = 'image';
  geminiMimeType = row.mimeType;
} else {
  status = 'unsupported';
}
return { json: { ...row, _fileClass: fileClass, _mimeType: row.mimeType || '', _geminiMimeType: geminiMimeType, _fileName: row.filename || '', _downloadFailed: false, _status: status }, binary: { invoiceFile: binary } };
`,
    },
  },
});

const classifyInvoiceAttachment = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Classify Invoice Attachment',
    parameters: {
      mode: 'runOnceForEachItem',
      jsCode: `// Full implementation in backend/src/nodes/classifyInvoiceAttachment.js`,
    },
  },
});

const openRouterImage = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'OpenRouter Analyze Image',
    parameters: { mode: 'runOnceForEachItem', jsCode: `// Full implementation in backend/src/nodes/prepareOpenRouterPayload.js` },
  },
});

const openRouterDoc = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'OpenRouter Analyze Document',
    parameters: { mode: 'runOnceForEachItem', jsCode: `// Full implementation in backend/src/nodes/prepareOpenRouterPayload.js` },
  },
});

const openRouterHttpImage = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.2,
  config: {
    name: 'OpenRouter HTTP Image',
    onError: 'continueRegularOutput',
    retryOnFail: true,
    maxTries: 5,
    waitBetweenTries: 15000,
    parameters: {
      method: 'POST',
      url: 'https://openrouter.ai/api/v1/chat/completions',
      authentication: 'predefinedCredentialType',
      nodeCredentialType: 'openRouterApi',
      sendHeaders: true,
      headerParameters: {
        parameters: [
          { name: 'HTTP-Referer', value: 'https://ledgerlens.app' },
          { name: 'X-Title', value: 'LedgerLens Invoice Extraction' },
        ],
      },
      sendBody: true,
      specifyBody: 'json',
      jsonBody: expr(`{{ $json._openRouterBody ? JSON.stringify($json._openRouterBody) : JSON.stringify({ error: $json.error || "Missing OpenRouter request body" }) }}`),
      options: { timeout: 120000 },
    },
  },
});

const openRouterHttpDocument = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.2,
  config: {
    name: 'OpenRouter HTTP Document',
    onError: 'continueRegularOutput',
    retryOnFail: true,
    maxTries: 5,
    waitBetweenTries: 15000,
    parameters: {
      method: 'POST',
      url: 'https://openrouter.ai/api/v1/chat/completions',
      authentication: 'predefinedCredentialType',
      nodeCredentialType: 'openRouterApi',
      sendHeaders: true,
      headerParameters: {
        parameters: [
          { name: 'HTTP-Referer', value: 'https://ledgerlens.app' },
          { name: 'X-Title', value: 'LedgerLens Invoice Extraction' },
        ],
      },
      sendBody: true,
      specifyBody: 'json',
      jsonBody: expr(`{{ $json._openRouterBody ? JSON.stringify($json._openRouterBody) : JSON.stringify({ error: $json.error || "Missing OpenRouter request body" }) }}`),
      options: { timeout: 120000 },
    },
  },
});

const parseImageResult = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Parse Image Result',
    parameters: { mode: 'runOnceForEachItem', jsCode: `// Full implementation in backend/src/nodes/parseRowResult.js` },
  },
});

const parseDocResult = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Parse Document Result',
    parameters: { mode: 'runOnceForEachItem', jsCode: `// Full implementation in backend/src/nodes/parseRowResult.js` },
  },
});

const mergeResults = merge({
  version: 3.2,
  config: { name: 'Merge Results', parameters: { mode: 'append' } },
});

const isExtractable = ifElse({
  version: 2.2,
  config: {
    name: 'Is Extractable?',
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' },
        conditions: [{ leftValue: expr('{{ $json._isPaymentInvoice === true && ($json._fileClass === "document" || $json._fileClass === "image") }}'), operator: { type: 'boolean', operation: 'true' } }],
        combinator: 'and',
      },
    },
  },
});

const isImageFile = ifElse({
  version: 2.2,
  config: {
    name: 'Is Image File?',
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: '', typeValidation: 'strict' },
        conditions: [{ leftValue: expr('{{ $json._fileClass }}'), operator: { type: 'string', operation: 'equals' }, rightValue: 'image' }],
        combinator: 'and',
      },
    },
  },
});

const respondUnsupported = node({
  type: 'n8n-nodes-base.respondToWebhook',
  version: 1.5,
  config: {
    name: 'Respond Unsupported',
    parameters: {
      respondWith: 'json',
      responseBody: expr(`{{ JSON.stringify({ payee: "", accountNumber: "", ifsc: "", amount: "", currency: "", confidence: 0, status: $json._status || "unsupported" }) }}`),
      options: { responseCode: 200, responseHeaders: { entries: [{ name: 'Access-Control-Allow-Origin', value: '*' }] } },
    },
  },
});

const respondWithResult = node({
  type: 'n8n-nodes-base.respondToWebhook',
  version: 1.5,
  config: {
    name: 'Respond With Result',
    parameters: {
      respondWith: 'json',
      responseBody: expr(`{{ JSON.stringify($json) }}`),
      options: { responseCode: 200, responseHeaders: { entries: [{ name: 'Access-Control-Allow-Origin', value: '*' }] } },
    },
  },
});

export default workflow('gmail-extract-v2-local', 'Gmail Attachment Extract')
  .add(receiveGmailExtract)
  .to(parseExtractBody)
  .to(fetchAttachmentBytes)
  .to(restoreRowAfterDownload)
  .to(classifyInvoiceAttachment)
  .to(
    isExtractable
      .onTrue(
        isImageFile
          .onTrue(openRouterImage.to(openRouterHttpImage.to(parseImageResult.to(mergeResults.input(0)))))
          .onFalse(openRouterDoc.to(openRouterHttpDocument.to(parseDocResult.to(mergeResults.input(1)))))
      )
      .onFalse(respondUnsupported)
  )
  .add(mergeResults)
  .to(respondWithResult);
