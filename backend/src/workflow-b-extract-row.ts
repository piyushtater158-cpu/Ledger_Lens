/**
 * Workflow B — Invoice Extract Row
 * n8n Workflow SDK source (re-validatable via n8n MCP validate_workflow)
 *
 * Cloud ID: LmdFhorOYBoJgXGl
 * Webhook:  POST /webhook/extract-row
 * Input:    JSON { driveLink: string, googleAccessToken: string }
 * Output:   JSON { payee, accountNumber, ifsc, confidence, status }
 *
 * Code node logic lives in backend/src/nodes/*.js
 * Prompt text lives in backend/prompts/gemini-extraction.txt
 *
 * Credentials needed after import (assign in n8n UI):
 *   Webhook "Receive Row Re-run"           → Admin Token (httpHeaderAuth, ID: REIlq9U7MYnIUAey)
 *   OpenRouter Analyze nodes               → OpenRouter API (openAiApi — base URL https://openrouter.ai/api/v1)
 *   HTTP Request nodes                     → NO credential (uses forwarded user Bearer token)
 */

import { workflow, trigger, node, ifElse, merge, expr } from '@n8n/workflow-sdk';

const OPENROUTER_MODEL_ID = 'nvidia/nemotron-nano-12b-v2-vl:free';

// ── Trigger ──────────────────────────────────────────────────────────────────
const receiveRowRerun = trigger({
  type: 'n8n-nodes-base.webhook',
  version: 2.1,
  config: {
    name: 'Receive Row Re-run',
    parameters: {
      httpMethod: 'POST',
      path: 'extract-row',
      authentication: 'headerAuth',
      responseMode: 'responseNode',
      options: {},
    },
  },
});

// ── Code nodes ───────────────────────────────────────────────────────────────

const parseRequestBody = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Parse Request Body',
    parameters: {
      mode: 'runOnceForEachItem',
      // see backend/src/nodes/parseRequestBody.js
      jsCode: `
const body = $json.body || $json;
const driveLink = body.driveLink || '';
const token = body.googleAccessToken || '';
if (!driveLink) throw new Error('driveLink is required');
if (!token) throw new Error('googleAccessToken is required');
const m1 = driveLink.match(/\\/d\\/([a-zA-Z0-9_-]+)/);
const m2 = driveLink.match(/[?&]id=([a-zA-Z0-9_-]+)/);
const fileId = (m1 && m1[1]) || (m2 && m2[1]) || '';
if (!fileId) throw new Error('Could not parse Drive file ID from: ' + driveLink);
return { json: { driveLink, token, fileId } };
`,
    },
  },
});

const getDriveMetadata = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.4,
  config: {
    name: 'Get Drive Metadata',
    onError: 'continueRegularOutput',
    parameters: {
      method: 'GET',
      url: expr(`{{ "https://www.googleapis.com/drive/v3/files/" + $json.fileId + "?fields=mimeType%2Cname" }}`),
      sendHeaders: true,
      specifyHeaders: 'keypair',
      headerParameters: { parameters: [{ name: 'Authorization', value: expr(`{{ "Bearer " + $json.token }}`) }] },
      options: { response: { response: { neverError: true } } },
    },
  },
});

const classifyMimeType = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Classify MimeType',
    parameters: {
      mode: 'runOnceForEachItem',
      // see backend/src/nodes/classifyMimeType.js (Workflow B version — reads from 'Parse Request Body')
      jsCode: `
const meta = $json;
const row = $('Parse Request Body').item.json;
if (meta.error) {
  const code = meta.error.code || 0;
  const status = code === 401 ? 'Error: Google session expired — sign out and sign in again' : 'Error: Drive file not accessible (check permissions)';
  return { json: { ...row, _mimeType: '', _fileName: '', _fileClass: 'error', _status: status, _downloadUrl: '' } };
}
const mime = meta.mimeType || '';
const fileId = row.fileId || '';
let fileClass = 'document', status = '', exportAsPdf = false;
if (mime.startsWith('image/')) fileClass = 'image';
else if (mime.startsWith('application/vnd.google-apps.')) { fileClass = 'document'; exportAsPdf = true; }
else if (!mime) { fileClass = 'error'; status = 'Error: Drive file not accessible (check permissions)'; }
let downloadUrl = '';
if (fileId && fileClass !== 'error') {
  downloadUrl = exportAsPdf
    ? 'https://www.googleapis.com/drive/v3/files/' + fileId + '/export?mimeType=application%2Fpdf'
    : 'https://www.googleapis.com/drive/v3/files/' + fileId + '?alt=media';
}
return { json: { ...row, _mimeType: mime, _fileName: meta.name || '', _fileClass: fileClass, _status: status, _downloadUrl: downloadUrl } };
`,
    },
  },
});

const downloadFile = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.4,
  config: {
    name: 'Download Invoice File',
    onError: 'continueRegularOutput',
    parameters: {
      method: 'GET',
      url: expr(`{{ $json._downloadUrl }}`),
      sendHeaders: true,
      specifyHeaders: 'keypair',
      headerParameters: { parameters: [{ name: 'Authorization', value: expr(`{{ "Bearer " + $json.token }}`) }] },
      options: { response: { response: { responseFormat: 'file', outputPropertyName: 'invoiceFile' } } },
    },
  },
});

const restoreRow = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Restore Row After Download',
    parameters: {
      mode: 'runOnceForEachItem',
      // see backend/src/nodes/restoreRowAfterDownload.js
      jsCode: `
const row = $('Classify MimeType').item.json;
const binData = $binary?.invoiceFile || null;
if (!binData) {
  return {
    json: {
      ...row,
      _status: 'Error: file download failed (check Drive permissions)',
      _downloadFailed: true,
    },
  };
}
const OFFICE_DOC_MIMES = new Set([
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);
const mime = row._mimeType || '';
const fileId = row._fileId || row.fileId || '';
const token = row._token || row.token || '';
// #region agent log
fetch('http://127.0.0.1:7278/ingest/2c22404a-379e-4acd-837f-babf35680249',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'6dd146'},body:JSON.stringify({sessionId:'6dd146',runId:'exec70-debug',hypothesisId:'H1',location:'workflow-b-extract-row.ts:restore-entry',message:'Restore node input snapshot',data:{mime,hasBinary:!!binData,hasFileId:!!fileId,hasToken:!!token,fileClass:row._fileClass||''},timestamp:Date.now()})}).catch(()=>{});
// #endregion
if (!OFFICE_DOC_MIMES.has(mime)) {
  return { json: { ...row, _downloadFailed: false }, binary: { invoiceFile: binData } };
}
if (!fileId || !token) {
  return {
    json: {
      ...row,
      _status: 'Error: missing Drive file ID or token for DOC/DOCX conversion',
      _downloadFailed: true,
    },
  };
}
let copyId = '';
try {
  const copy = await this.helpers.httpRequest({
    method: 'POST',
    url: \`https://www.googleapis.com/drive/v3/files/\${fileId}/copy\`,
    headers: {
      Authorization: \`Bearer \${token}\`,
      'Content-Type': 'application/json',
    },
    body: {
      mimeType: 'application/vnd.google-apps.document',
      name: \`__ledgerlens_convert_\${fileId}\`,
    },
    json: true,
  });
  copyId = copy.id;
  const pdfBuffer = await this.helpers.httpRequest({
    method: 'GET',
    url: \`https://www.googleapis.com/drive/v3/files/\${copyId}/export?mimeType=application/pdf\`,
    headers: { Authorization: \`Bearer \${token}\` },
    encoding: 'arraybuffer',
  });
  const pdfName = (row._fileName || 'invoice').replace(/\\.[^.]+$/i, '') + '.pdf';
  const pdfBinary = await this.helpers.prepareBinaryData(pdfBuffer, pdfName, 'application/pdf');
  return {
    json: {
      ...row,
      _downloadFailed: false,
      _geminiMimeType: 'application/pdf',
      _convertedFromOffice: true,
    },
    binary: { invoiceFile: pdfBinary },
  };
} catch (e) {
  const msg = String(e.message || e);
  const needsReauth = /403|insufficient|permission|scope/i.test(msg);
  // #region agent log
  fetch('http://127.0.0.1:7278/ingest/2c22404a-379e-4acd-837f-babf35680249',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'6dd146'},body:JSON.stringify({sessionId:'6dd146',runId:'exec70-debug',hypothesisId:'H2',location:'workflow-b-extract-row.ts:doc-conversion-error',message:'DOC/DOCX conversion failed',data:{mime,errorMessage:msg,needsReauth},timestamp:Date.now()})}).catch(()=>{});
  // #endregion
  return {
    json: {
      ...row,
      _status: needsReauth
        ? 'Error: DOC/DOCX conversion needs Drive access — sign out and sign in again'
        : 'Error: could not convert DOC/DOCX to PDF — ' + msg,
      _downloadFailed: true,
    },
  };
} finally {
  if (copyId && token) {
    try {
      await this.helpers.httpRequest({
        method: 'DELETE',
        url: \`https://www.googleapis.com/drive/v3/files/\${copyId}\`,
        headers: { Authorization: \`Bearer \${token}\` },
      });
    } catch (_) {}
  }
}
`,
    },
  },
});

// see backend/src/nodes/openRouterAnalyze.js (identical for image + document branches)
const OPENROUTER_ANALYZE_JS = `
// OpenRouter via openAiApi credential — model: ${OPENROUTER_MODEL_ID}
// Full implementation: backend/src/nodes/openRouterAnalyze.js
`;

// see backend/src/nodes/parseRowResult.js (identical for image + document in Workflow B)
const PARSE_ROW_JS = `
// Parser with Gemini + OpenRouter/OpenAI fallbacks
// Full implementation: backend/src/nodes/parseRowResult.js
`;

const openRouterImage = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'OpenRouter Analyze Image',
    onError: 'continueRegularOutput',
    retryOnFail: true,
    maxTries: 3,
    waitBetweenTries: 3000,
    parameters: {
      mode: 'runOnceForEachItem',
      jsCode: OPENROUTER_ANALYZE_JS,
    },
  },
});

const openRouterDoc = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'OpenRouter Analyze Document',
    onError: 'continueRegularOutput',
    retryOnFail: true,
    maxTries: 3,
    waitBetweenTries: 3000,
    parameters: {
      mode: 'runOnceForEachItem',
      jsCode: OPENROUTER_ANALYZE_JS,
    },
  },
});

const parseImageResult = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Parse Image Result',
    parameters: { mode: 'runOnceForEachItem', jsCode: PARSE_ROW_JS },
  },
});

const parseDocResult = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Parse Document Result',
    parameters: { mode: 'runOnceForEachItem', jsCode: PARSE_ROW_JS },
  },
});

const respondUnsupported = node({
  type: 'n8n-nodes-base.respondToWebhook',
  version: 1.5,
  config: {
    name: 'Respond Unsupported',
    parameters: {
      respondWith: 'json',
      responseBody: expr(`{{ JSON.stringify({ payee: "", accountNumber: "", ifsc: "", amount: "", confidence: 0, status: $json._status }) }}`),
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

// ── Merge + branch nodes ──────────────────────────────────────────────────────
const mergeResults = merge({ version: 3.2, config: { name: 'Merge Results', parameters: { mode: 'append' } } });

const isExtractable = ifElse({
  version: 2.2,
  config: {
    name: 'Is Extractable?',
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' },
        conditions: [{ leftValue: expr('{{ $json._fileClass === "document" || $json._fileClass === "image" }}'), operator: { type: 'boolean', operation: 'true' } }],
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

// ── Workflow graph ────────────────────────────────────────────────────────────
export default workflow('LmdFhorOYBoJgXGl', 'Invoice Extract Row')
  .add(receiveRowRerun)
  .to(parseRequestBody)
  .to(getDriveMetadata)
  .to(classifyMimeType)
  .to(
    isExtractable
      .onTrue(
        downloadFile
          .to(restoreRow)
          .to(
            isImageFile
              .onTrue(openRouterImage.to(parseImageResult.to(mergeResults.input(0))))
              .onFalse(openRouterDoc.to(parseDocResult.to(mergeResults.input(1))))
          )
      )
      .onFalse(respondUnsupported)
  )
  .add(mergeResults)
  .to(respondWithResult);
