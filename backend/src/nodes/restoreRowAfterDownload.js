/**
 * Node: "Restore Row After Download"
 * Workflows: A (Invoice Payee Extraction) + B (Invoice Extract Row)
 * Mode: runOnceForEachItem
 *
 * Purpose: After the HTTP Request node downloads the file binary, n8n loses the original
 * JSON row. This node re-attaches the row data from the Classify step and exposes the
 * downloaded file binary as `invoiceFile`. Office DOC/DOCX files are converted to PDF
 * via the Drive copy+export API so Gemini Analyze Document can process them.
 */

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

  const pdfName = (row._fileName || 'invoice').replace(/\.[^.]+$/i, '') + '.pdf';
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
        url: `https://www.googleapis.com/drive/v3/files/${copyId}`,
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch (_) {
      // Best-effort cleanup of temporary Google Doc copy
    }
  }
}
