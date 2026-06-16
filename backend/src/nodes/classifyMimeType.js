/**
 * Node: "Classify MimeType" — Workflow A
 * Reads row from $('Parse Drive File ID').item.json
 */

const meta = $json;
const row = $('Parse Drive File ID').item.json;

if (row._status && row._status.startsWith('Error')) {
  return { json: { ...row, _fileClass: 'error' } };
}

if (meta.error) {
  const code = meta.error.code || 0;
  const status =
    code === 401
      ? 'Error: Google session expired — sign out and sign in again'
      : 'Error: Drive file not accessible (check permissions)';
  return {
    json: { ...row, _mimeType: '', _fileName: '', _fileClass: 'error', _status: status, _downloadUrl: '' },
  };
}

const mime = meta.mimeType || '';
const fileId = row._fileId || '';
let fileClass = 'document';
let status = '';
let exportAsPdf = false;

if (mime.startsWith('image/')) {
  fileClass = 'image';
} else if (mime.startsWith('application/vnd.google-apps.')) {
  fileClass = 'document';
  exportAsPdf = true;
} else if (!mime) {
  fileClass = 'error';
  status = 'Error: Drive file not accessible (check permissions)';
} else {
  // PDF and other binary formats — download directly. DOC/DOCX are downloaded then
  // converted to PDF in Restore Row After Download before Gemini Analyze Document.
  fileClass = 'document';
}

let downloadUrl = '';
if (fileId && fileClass !== 'error') {
  downloadUrl = exportAsPdf
    ? `https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=application%2Fpdf`
    : `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;
}

return {
  json: {
    ...row,
    _mimeType: mime,
    _fileName: meta.name || '',
    _fileClass: fileClass,
    _status: status,
    _downloadUrl: downloadUrl,
  },
};
