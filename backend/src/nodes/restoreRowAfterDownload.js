/**
 * Node: "Restore Row After Download"
 * Workflows: A (Invoice Payee Extraction) + B (Invoice Extract Row)
 * Mode: runOnceForEachItem
 *
 * Re-attaches row metadata after Drive download. Office DOC/DOCX files are converted
 * to PDF via Google Drive (copy -> Google Doc -> export PDF) because:
 *  - OpenRouter vision rejects raw Office uploads (400 Bad Request)
 *  - n8n's Code node sandbox disallows require('zlib'), so local DOCX ZIP parsing fails
 * Temporary conversion copies are deleted immediately after export.
 */

const OFFICE_DOC_MIMES = new Set([
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);

function isOfficeDocMime(mime, fileName) {
  return OFFICE_DOC_MIMES.has(mime) || /\.docx?$/i.test(fileName || '');
}

function getDriveCredentials(row) {
  return {
    fileId: row._fileId || row.fileId || '',
    token: row._token || row.token || '',
  };
}

async function convertOfficeDocToPdf(fileId, token, fileName) {
  let copyId = '';
  try {
    const copy = await this.helpers.httpRequest({
      method: 'POST',
      url: `https://www.googleapis.com/drive/v3/files/${fileId}/copy`,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: {
        mimeType: 'application/vnd.google-apps.document',
        name: `__ledgerlens_convert_${fileId}`,
      },
      json: true,
    });
    copyId = copy.id;

    const pdfBuffer = await this.helpers.httpRequest({
      method: 'GET',
      url: `https://www.googleapis.com/drive/v3/files/${copyId}/export?mimeType=application/pdf`,
      headers: { Authorization: `Bearer ${token}` },
      encoding: 'arraybuffer',
    });

    const pdfName = (fileName || 'invoice').replace(/\.[^.]+$/i, '') + '.pdf';
    return await this.helpers.prepareBinaryData(pdfBuffer, pdfName, 'application/pdf');
  } finally {
    if (copyId && token) {
      try {
        await this.helpers.httpRequest({
          method: 'DELETE',
          url: `https://www.googleapis.com/drive/v3/files/${copyId}`,
          headers: { Authorization: `Bearer ${token}` },
        });
      } catch (_) {}
    }
  }
}

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

const mime = row._mimeType || binData.mimeType || '';
const fileName = row._fileName || binData.fileName || '';

if (!isOfficeDocMime(mime, fileName)) {
  return { json: { ...row, _downloadFailed: false }, binary: { invoiceFile: binData } };
}

const { fileId, token } = getDriveCredentials(row);
if (!fileId || !token) {
  return {
    json: {
      ...row,
      _status: 'Error: missing Drive file ID or token for DOC/DOCX conversion',
      _downloadFailed: true,
    },
  };
}

try {
  const pdfBinary = await convertOfficeDocToPdf.call(this, fileId, token, fileName);
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
  const needsReauth = /403|401|insufficient|permission|scope/i.test(msg);
  return {
    json: {
      ...row,
      _status: needsReauth
        ? 'Error: DOC/DOCX conversion needs Drive write access — sign out and sign in again'
        : 'Error: could not convert DOC/DOCX to PDF — ' + msg,
      _downloadFailed: true,
    },
  };
}
