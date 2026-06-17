/**
 * Node: "Classify Invoice Attachment"
 * Workflow: D (Gmail Attachment Extract)
 * Mode: runOnceForEachItem
 *
 * Heuristic gate before OpenRouter extraction. Rejects decorative email images and
 * documents that are unlikely to contain Indian bank payment details.
 */

const row = $('Restore Row After Download').item.json;

if (row._downloadFailed) {
  return { json: { ...row } };
}

const filename = String(row._fileName || row.filename || '').toLowerCase();
const mimeType = String(row._mimeType || row.mimeType || '').toLowerCase();
const subject = String(row.subject || '').toLowerCase();
const context = `${filename} ${subject}`;

const DECORATIVE_IMAGE =
  /(?:^|[-_])(?:logo|hero|banner|icon|avatar|footer|header|spacer|pixel|signature|badge|thumbnail|emoji|social|instagram|linkedin|twitter|facebook|youtube|yt|fb|white)(?:[-_.]|$)/i;
const INVOICE_HINT =
  /(?:invoice|inv[-_]?\d|bill|receipt|tax|gst|payment|proforma|debit[\s_-]?note|credit[\s_-]?note|purchase\s*order|po[-_]?\d)/i;
const RECEIPT_ONLY =
  /(?:receipt|payment[\s_-]?confirmation|paid\s*receipt|order[\s_-]?confirmation)/i;

function reject(reason) {
  return {
    json: {
      ...row,
      _isPaymentInvoice: false,
      _status: `not_invoice: ${reason}`,
      _fileClass: 'skipped',
    },
    binary: $binary,
  };
}

if (row._fileClass === 'error' || row._fileClass === 'skipped') {
  return { json: { ...row } };
}

if (DECORATIVE_IMAGE.test(filename)) {
  return reject('decorative email image');
}

if (mimeType.startsWith('image/') && !INVOICE_HINT.test(context)) {
  return reject('image without invoice filename or subject');
}

if (mimeType === 'application/pdf' && RECEIPT_ONLY.test(filename) && !INVOICE_HINT.test(subject)) {
  // SaaS/card receipts (e.g. Receipt-1234.pdf) — still allow extraction attempt but flag low priority
  // Only skip if filename is receipt-only AND subject looks like a payment receipt not a vendor invoice
  if (/receipt from|your receipt|payment received|thank you for your purchase/i.test(subject)) {
    return reject('payment receipt without bank transfer details');
  }
}

if (mimeType === 'application/pdf' || INVOICE_HINT.test(context)) {
  return {
    json: {
      ...row,
      _isPaymentInvoice: true,
      _status: '',
    },
    binary: $binary,
  };
}

return reject('no invoice signals in attachment');
