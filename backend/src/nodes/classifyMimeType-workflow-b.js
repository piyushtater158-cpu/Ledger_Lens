/**
 * Node: "Classify MimeType" — Workflow B
 * Reads row from $('Parse Request Body').item.json
 */

const meta = $json;
const row = $('Parse Request Body').item.json;

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
const fileId = row.fileId || '';
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
