/**
 * Workflow A — Invoice Payee Extraction
 * n8n Workflow SDK source (re-validatable via n8n MCP validate_workflow)
 *
 * Cloud ID: vqSkkv9egxmIVpdv
 * Webhook:  POST /webhook/extract
 * Input:    multipart/form-data { file: xlsx, googleAccessToken: string }
 * Output:   Filled xlsx binary (Content-Disposition: attachment)
 *
 * Code node logic lives in backend/src/nodes/*.js
 * Prompt text lives in backend/prompts/gemini-extraction.txt
 *
 * Credentials needed after import (assign in n8n UI):
 *   Webhook "Receive File Upload"        → Admin Token (httpHeaderAuth, ID: REIlq9U7MYnIUAey)
 *   OpenRouter Analyze nodes             → OpenRouter API (openRouterApi)
 *   HTTP Request nodes                   → NO credential (uses forwarded user Bearer token)
 */

import { workflow, trigger, node, ifElse, merge, expr } from '@n8n/workflow-sdk';

/** OpenRouter model — nvidia/nemotron-nano-12b-v2-vl:free (vision-language) */
const OPENROUTER_MODEL_ID = 'nvidia/nemotron-nano-12b-v2-vl:free';

// ── Trigger ──────────────────────────────────────────────────────────────────
const receiveUpload = trigger({
  type: 'n8n-nodes-base.webhook',
  version: 2.1,
  config: {
    name: 'Receive File Upload',
    parameters: {
      httpMethod: 'POST',
      path: 'extract',
      authentication: 'headerAuth',
      responseMode: 'responseNode',
      options: { binaryData: true },
    },
  },
});

// ── Code nodes ───────────────────────────────────────────────────────────────
// (jsCode verbatim in backend/src/nodes/)

const normalizeUpload = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Normalize Upload',
    parameters: {
      mode: 'runOnceForEachItem',
      // see backend/src/nodes/normalizeUpload.js
      jsCode: `
const bin = $binary?.data || $binary?.file || Object.values($binary || {})[0] || null;
if (!bin) throw new Error('No file binary found. Send multipart/form-data with field "data".');
const token = $json.body?.googleAccessToken || $json.googleAccessToken || '';
return { json: { ...$json, _uploadToken: token }, binary: { data: bin } };
`,
    },
  },
});

const parseSpreadsheet = node({
  type: 'n8n-nodes-base.extractFromFile',
  version: 1.1,
  config: {
    name: 'Parse Spreadsheet',
    parameters: { operation: 'xlsx', binaryPropertyName: 'data', options: { headerRow: true, includeEmptyCells: true } },
  },
});

const detectColumns = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Detect Columns & Add Token',
    parameters: {
      mode: 'runOnceForAllItems',
      // see backend/src/nodes/detectColumns.js
      jsCode: `
const items = $input.all();
if (!items.length) return [];
const token = $('Normalize Upload').first().json._uploadToken || '';
const keys = Object.keys(items[0].json);
const find = (re) => keys.find(k => re.test(k)) || '';
const dLinkKey = find(/drive.*link|invoice.*link|invoice.*url|link|url|drive|invoice|file/i);
const payeeKey = find(/payee|beneficiary|account[_\\s-]?name|acc[_\\s-]?name/i);
const acctKey  = find(/account[_\\s-]?no|acct|a\\/c|bank[_\\s-]?acc|acc.*no/i);
const ifscKey  = find(/ifsc/i);
// #region agent log
fetch('http://127.0.0.1:7278/ingest/2c22404a-379e-4acd-837f-babf35680249',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'6dd146'},body:JSON.stringify({sessionId:'6dd146',runId:'exec69-debug',hypothesisId:'H1',location:'workflow-a-extraction.ts:detect-columns',message:'Detect columns input snapshot',data:{rowCount:items.length,hasToken:!!token,dLinkKey,payeeKey,acctKey,ifscKey},timestamp:Date.now()})}).catch(()=>{});
// #endregion
return items.map((item, idx) => ({
  json: {
    ...item.json,
    _idx: idx, _token: token,
    _driveLink: dLinkKey ? String(item.json[dLinkKey] || '').trim() : '',
    _payee: payeeKey ? String(item.json[payeeKey] || '').trim() : '',
    _acct: acctKey ? String(item.json[acctKey] || '').trim() : '',
    _ifsc: ifscKey ? String(item.json[ifscKey] || '').trim() : '',
    _payeeKey: payeeKey, _acctKey: acctKey, _ifscKey: ifscKey, _dLinkKey: dLinkKey,
    _originalKeys: keys, _status: '',
  },
}));
`,
    },
  },
});

const parseDriveFileId = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Parse Drive File ID',
    parameters: {
      mode: 'runOnceForEachItem',
      // see backend/src/nodes/parseDriveFileId.js
      jsCode: `
const link = $json._driveLink || '';
const m1 = link.match(/\\/d\\/([a-zA-Z0-9_-]+)/);
const m2 = link.match(/[?&]id=([a-zA-Z0-9_-]+)/);
const fileId = (m1 && m1[1]) || (m2 && m2[1]) || '';
if (!fileId) return { json: { ...$json, _status: 'Error: could not parse Drive file ID', _fileId: '' } };
return { json: { ...$json, _fileId: fileId } };
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
      url: expr(`{{ "https://www.googleapis.com/drive/v3/files/" + $json._fileId + "?fields=mimeType%2Cname" }}`),
      sendHeaders: true,
      specifyHeaders: 'keypair',
      headerParameters: { parameters: [{ name: 'Authorization', value: expr(`{{ "Bearer " + $json._token }}`) }] },
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
      // see backend/src/nodes/classifyMimeType.js (Workflow A version — reads from 'Parse Drive File ID')
      jsCode: `
const meta = $json;
const row = $('Parse Drive File ID').item.json;
if (row._status && row._status.startsWith('Error')) return { json: { ...row, _fileClass: 'error' } };
if (meta.error) {
  const code = meta.error.code || 0;
  const status = code === 401 ? 'Error: Google session expired — sign out and sign in again' : 'Error: Drive file not accessible (check permissions)';
  return { json: { ...row, _mimeType: '', _fileName: '', _fileClass: 'error', _status: status, _downloadUrl: '' } };
}
const mime = meta.mimeType || '';
const fileId = row._fileId || '';
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
// #region agent log
fetch('http://127.0.0.1:7278/ingest/2c22404a-379e-4acd-837f-babf35680249',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'6dd146'},body:JSON.stringify({sessionId:'6dd146',runId:'exec69-debug',hypothesisId:'H2',location:'workflow-a-extraction.ts:classify-mime',message:'Classified row',data:{idx:row._idx,mime,fileClass,hasDownloadUrl:!!downloadUrl,status},timestamp:Date.now()})}).catch(()=>{});
// #endregion
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
      headerParameters: { parameters: [{ name: 'Authorization', value: expr(`{{ "Bearer " + $json._token }}`) }] },
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
fetch('http://127.0.0.1:7278/ingest/2c22404a-379e-4acd-837f-babf35680249',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'6dd146'},body:JSON.stringify({sessionId:'6dd146',runId:'exec70-debug',hypothesisId:'H1',location:'workflow-a-extraction.ts:restore-entry',message:'Restore node input snapshot',data:{idx:row._idx,mime,hasBinary:!!binData,hasFileId:!!fileId,hasToken:!!token,fileClass:row._fileClass||''},timestamp:Date.now()})}).catch(()=>{});
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
  fetch('http://127.0.0.1:7278/ingest/2c22404a-379e-4acd-837f-babf35680249',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'6dd146'},body:JSON.stringify({sessionId:'6dd146',runId:'exec70-debug',hypothesisId:'H2',location:'workflow-a-extraction.ts:doc-conversion-error',message:'DOC/DOCX conversion failed',data:{idx:row._idx,mime,errorMessage:msg,needsReauth},timestamp:Date.now()})}).catch(()=>{});
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
// OpenRouter via openRouterApi credential — model: ${OPENROUTER_MODEL_ID}
// Full implementation: backend/src/nodes/openRouterAnalyze.js
`;

// see backend/src/nodes/parseGeminiExtraction.js (identical for image + document)
const PARSE_EXTRACTION_JS = `
// Parser with Gemini + OpenRouter/OpenAI fallbacks
// Full implementation: backend/src/nodes/parseGeminiExtraction.js
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

const parseImageExtraction = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Parse Image Extraction',
    parameters: { mode: 'runOnceForEachItem', jsCode: PARSE_EXTRACTION_JS },
  },
});

const parseDocExtraction = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Parse Document Extraction',
    parameters: { mode: 'runOnceForEachItem', jsCode: PARSE_EXTRACTION_JS },
  },
});

const passNonDownloadable = node({
  type: 'n8n-nodes-base.set',
  version: 3.4,
  config: { name: 'Pass Non-Downloadable', parameters: { mode: 'manual', includeOtherFields: true, assignments: { assignments: [] } } },
});

const markNoDriveLink = node({
  type: 'n8n-nodes-base.set',
  version: 3.4,
  config: {
    name: 'Mark No Drive Link',
    parameters: {
      mode: 'manual', includeOtherFields: true,
      assignments: { assignments: [{ id: 'a1', name: '_status', value: 'No Drive Link', type: 'string' }] },
    },
  },
});

const rebuildFinalRow = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Rebuild Final Row',
    parameters: {
      mode: 'runOnceForEachItem',
      // see backend/src/nodes/rebuildFinalRow.js
      jsCode: `
const r = $json;
const keys = r._originalKeys || [];
const out = {};
for (const k of keys) out[k] = r[k] !== undefined ? r[k] : '';
if (r._payeeKey && r._extractedPayee !== undefined) out[r._payeeKey] = r._extractedPayee;
if (r._acctKey  && r._extractedAcct  !== undefined) out[r._acctKey]  = r._extractedAcct;
if (r._ifscKey  && r._extractedIfsc  !== undefined) out[r._ifscKey]  = r._extractedIfsc;
out['Status']     = r._status || '';
out['Confidence'] = r._confidence !== undefined && r._confidence !== '' ? Number(r._confidence).toFixed(2) : '';
out['__sortIdx']  = r._idx;
// #region agent log
fetch('http://127.0.0.1:7278/ingest/2c22404a-379e-4acd-837f-babf35680249',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'6dd146'},body:JSON.stringify({sessionId:'6dd146',runId:'exec69-debug',hypothesisId:'H3',location:'workflow-a-extraction.ts:rebuild-row',message:'Rebuilt output row',data:{idx:r._idx,status:r._status||'',hasPayee:!!r._extractedPayee,hasAcct:!!r._extractedAcct,hasIfsc:!!r._extractedIfsc},timestamp:Date.now()})}).catch(()=>{});
// #endregion
return { json: out };
`,
    },
  },
});

const sortRows = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Sort Rows By Index',
    parameters: {
      mode: 'runOnceForAllItems',
      // see backend/src/nodes/sortRowsByIndex.js
      jsCode: `
const all = $input.all();
// #region agent log
fetch('http://127.0.0.1:7278/ingest/2c22404a-379e-4acd-837f-babf35680249',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'6dd146'},body:JSON.stringify({sessionId:'6dd146',runId:'exec69-debug',hypothesisId:'H4',location:'workflow-a-extraction.ts:sort-rows',message:'Final row count before xlsx',data:{count:all.length},timestamp:Date.now()})}).catch(()=>{});
// #endregion
return all
  .sort((a, b) => (a.json.__sortIdx || 0) - (b.json.__sortIdx || 0))
  .map(item => { const { __sortIdx, ...rest } = item.json; return { json: rest }; });
`,
    },
  },
});

const convertToXlsx = node({
  type: 'n8n-nodes-base.convertToFile',
  version: 1.1,
  config: {
    name: 'Convert to XLSX',
    parameters: { operation: 'xlsx', binaryPropertyName: 'outputFile', options: { fileName: 'invoices_filled.xlsx', headerRow: true, sheetName: 'Sheet1' } },
  },
});

const returnFilledFile = node({
  type: 'n8n-nodes-base.respondToWebhook',
  version: 1.5,
  config: {
    name: 'Return Filled File',
    parameters: {
      respondWith: 'binary', responseDataSource: 'set', inputFieldName: 'outputFile',
      options: {
        responseCode: 200,
        responseHeaders: { entries: [
          { name: 'Content-Disposition', value: 'attachment; filename="invoices_filled.xlsx"' },
          { name: 'Access-Control-Allow-Origin', value: '*' },
        ]},
      },
    },
  },
});

// ── Merge nodes ───────────────────────────────────────────────────────────────
const mergeExtractionResults = merge({ version: 3.2, config: { name: 'Merge Extraction Results', parameters: { mode: 'append' } } });
const mergeAfterDownload = merge({ version: 3.2, config: { name: 'Merge After Download Check', parameters: { mode: 'append' } } });
const mergeAllRows = merge({ version: 3.2, config: { name: 'Merge All Rows', parameters: { mode: 'append' } } });

// ── Branch nodes ─────────────────────────────────────────────────────────────
const hasDriveLink = ifElse({
  version: 2.2,
  config: {
    name: 'Has Drive Link?',
    parameters: {
      conditions: {
        options: { caseSensitive: false, leftValue: '', typeValidation: 'loose' },
        conditions: [{ leftValue: expr('{{ $json._driveLink }}'), operator: { type: 'string', operation: 'notEmpty' } }],
        combinator: 'and',
      },
    },
  },
});

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
export default workflow('vqSkkv9egxmIVpdv', 'Invoice Payee Extraction')
  .add(receiveUpload)
  .to(normalizeUpload)
  .to(parseSpreadsheet)
  .to(detectColumns)
  .to(
    hasDriveLink
      .onTrue(
        parseDriveFileId
          .to(getDriveMetadata)
          .to(classifyMimeType)
          .to(
            isExtractable
              .onTrue(
                downloadFile
                  .to(restoreRow)
                  .to(
                    isImageFile
                      .onTrue(openRouterImage.to(parseImageExtraction.to(mergeExtractionResults.input(0))))
                      .onFalse(openRouterDoc.to(parseDocExtraction.to(mergeExtractionResults.input(1))))
                  )
              )
              .onFalse(passNonDownloadable.to(mergeAfterDownload.input(1)))
          )
      )
      .onFalse(markNoDriveLink.to(mergeAllRows.input(1)))
  )
  .add(mergeExtractionResults)
  .to(mergeAfterDownload.input(0))
  .add(mergeAfterDownload)
  .to(mergeAllRows.input(0))
  .add(mergeAllRows)
  .to(rebuildFinalRow)
  .to(sortRows)
  .to(convertToXlsx)
  .to(returnFilledFile);
