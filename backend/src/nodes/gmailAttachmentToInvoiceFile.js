/**
 * Node: "Restore Row After Download" (Workflow D adapter)
 * Workflow: D (Gmail Attachment Extract)
 * Mode: runOnceForEachItem
 */

function fromBase64Url(input) {
  const normalized = String(input || '').replace(/-/g, '+').replace(/_/g, '/');
  const padLen = (4 - (normalized.length % 4)) % 4;
  return normalized + '='.repeat(padLen);
}

const row = $('Parse Extract Body').item.json;
const payload = $json || {};
const dataBase64Url = payload.data || '';

if (!dataBase64Url) {
  return {
    json: {
      ...row,
      _fileClass: 'error',
      _mimeType: row.mimeType || '',
      _geminiMimeType: row.mimeType || '',
      _fileName: row.filename || '',
      _downloadFailed: true,
      _status: 'Error: attachment fetch failed',
    },
  };
}

const base64 = fromBase64Url(dataBase64Url);
const binaryBuffer = Buffer.from(base64, 'base64');
const binary = await this.helpers.prepareBinaryData(
  binaryBuffer,
  row.filename || 'invoice',
  row.mimeType || 'application/octet-stream'
);

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

return {
  json: {
    ...row,
    _fileClass: fileClass,
    _mimeType: row.mimeType || '',
    _geminiMimeType: geminiMimeType,
    _fileName: row.filename || '',
    _downloadFailed: false,
    _status: status,
  },
  binary: { invoiceFile: binary },
};
