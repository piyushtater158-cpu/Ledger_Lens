/**
 * Node: "Parse Attachments"
 * Workflow: C (Gmail Invoice Discovery)
 * Mode: runOnceForAllItems
 *
 * Scans all PDF/image attachments per message, filters decorative email embeds,
 * dedupes receipt/invoice pairs, and returns only invoice candidates.
 */

function toIsoDate(headerDate) {
  if (!headerDate) return '';
  const parsed = new Date(headerDate);
  return Number.isNaN(parsed.getTime()) ? '' : parsed.toISOString();
}

function headerValue(headers, name) {
  const match = (headers || []).find((h) => String(h.name || '').toLowerCase() === name.toLowerCase());
  return String(match?.value || '').trim();
}

function collectParts(part, out) {
  if (!part) return;
  const filename = String(part.filename || '').trim();
  const mimeType = String(part.mimeType || '').trim();
  const attachmentId = String(part.body?.attachmentId || '').trim();

  if (
    filename &&
    attachmentId &&
    (mimeType === 'application/pdf' || mimeType.startsWith('image/'))
  ) {
    out.push({ filename, mimeType, attachmentId });
  }

  for (const child of part.parts || []) {
    collectParts(child, out);
  }
}

const DECORATIVE_IMAGE =
  /(?:^|[-_])(?:logo|hero|banner|icon|avatar|footer|header|spacer|pixel|signature|badge|thumbnail|emoji|social|instagram|linkedin|twitter|facebook|youtube|yt|fb|white)(?:[-_.]|$)/i;
const INVOICE_HINT =
  /(?:invoice|inv[-_]?\d|bill|receipt|tax|gst|payment|proforma|debit[\s_-]?note|credit[\s_-]?note)/i;

function isDecorativeAttachment(filename) {
  return DECORATIVE_IMAGE.test(filename.toLowerCase());
}

function isInvoiceCandidate(filename, subject, mimeType) {
  const context = `${filename} ${subject}`.toLowerCase();
  if (isDecorativeAttachment(filename)) return false;
  if (mimeType === 'application/pdf') return true;
  if (mimeType.startsWith('image/') && INVOICE_HINT.test(context)) return true;
  return false;
}

function attachmentPriority(filename, mimeType) {
  const name = filename.toLowerCase();
  if (mimeType === 'application/pdf' && /invoice/i.test(name)) return 0;
  if (mimeType === 'application/pdf' && /bill/i.test(name)) return 1;
  if (mimeType === 'application/pdf') return 2;
  if (INVOICE_HINT.test(name)) return 3;
  return 9;
}

function pickBestPerMessage(candidates) {
  if (candidates.length <= 1) return candidates;
  const pdfs = candidates.filter((c) => c.mimeType === 'application/pdf');
  if (pdfs.length > 1) {
    pdfs.sort((a, b) => attachmentPriority(a.filename, a.mimeType) - attachmentPriority(b.filename, b.mimeType));
    const invoicePdf = pdfs.find((p) => /invoice/i.test(p.filename.toLowerCase()));
    if (invoicePdf) return [invoicePdf];
    return [pdfs[0]];
  }
  return candidates;
}

const searchResult = $('Search Gmail Messages').first()?.json || {};
if (searchResult.error) {
  const err = searchResult.error;
  const code = err.code || err.status || 500;
  const details = Array.isArray(err.details) ? err.details : [];
  const scopeInsufficient =
    code === 403 ||
    details.some((d) => d.reason === 'ACCESS_TOKEN_SCOPE_INSUFFICIENT');
  const message = scopeInsufficient
    ? 'Gmail permission denied — sign out and sign in again to grant Gmail read access'
    : String(err.message || 'Gmail API error');
  return [{ json: { error: message, errorCode: code, invoices: [], truncated: false, scanned: 0 } }];
}

const input = $input.all();
if (!input.length) {
  return [{ json: { invoices: [], truncated: false, scanned: 0 } }];
}

const parserSeed = $('Parse Discover Body').first().json || {};
const seen = new Set();
const invoices = [];
let scanned = 0;

for (const item of input) {
  const message = item.json || {};
  if (message.error || !message.id) continue;

  scanned += 1;
  const headers = message.payload?.headers || [];
  const sender = headerValue(headers, 'From');
  const subject = headerValue(headers, 'Subject');
  const emailDate = toIsoDate(headerValue(headers, 'Date'));

  const parts = [];
  collectParts(message.payload, parts);

  const candidates = parts.filter((part) =>
    isInvoiceCandidate(part.filename, subject, part.mimeType)
  );
  const selected = pickBestPerMessage(candidates);

  for (const part of selected) {
    const key = `${message.id}:${part.attachmentId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    invoices.push({
      id: key,
      messageId: message.id,
      attachmentId: part.attachmentId,
      mimeType: part.mimeType,
      filename: part.filename,
      sender,
      subject,
      emailDate,
    });
  }
}

const maxMessages = parserSeed.maxMessages || 200;
const truncated = invoices.length >= maxMessages;
const cappedInvoices = truncated ? invoices.slice(0, maxMessages) : invoices;

return [{ json: { invoices: cappedInvoices, truncated, scanned } }];
