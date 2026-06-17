/**
 * Nodes: "OpenRouter Analyze Image" + "OpenRouter Analyze Document" (prepare step)
 * Workflows: A + B
 * Mode: runOnceForEachItem
 *
 * Builds the OpenRouter request body. PDFs/images use vision. DOC/DOCX are converted to
 * PDF in Restore Row After Download; _geminiMimeType routes them through the PDF vision path.
 * Legacy _officeDocText text mode is still supported if present on the row.
 */

const OPENROUTER_MODEL = 'google/gemini-2.5-flash';

const OPENROUTER_REQUEST_OPTIONS = {
  model: OPENROUTER_MODEL,
  max_tokens: 1024,
  response_format: { type: 'json_object' },
  // Disable reasoning for direct JSON extraction.
  reasoning: { effort: 'none' },
};

const EXTRACTION_PROMPT = `You are reading an invoice document. Extract ONLY these five fields and return valid JSON with no prose, no markdown, no code fences:

{"payee":"string","account_number":"string","ifsc":"string","amount":"string","currency":"string","confidence":0.0}

Rules:
- payee: the account payee or beneficiary name exactly as printed on THIS invoice
- account_number: digits only, no spaces or dashes — copy exactly from the document
- ifsc: exactly 11 characters, uppercase, copied from the document (format: 4 letters + 0 + 6 alphanumeric)
- amount: invoice total or grand total numeric value only (digits and decimal point, no currency symbols or commas)
- currency: the invoice currency exactly as shown — ISO code when printed (USD, INR, EUR) or symbol ($, ₹, €). Examples: "USD", "INR", "$", "₹"
- confidence: 0.0 to 1.0 — use 0.0 if you cannot read the document clearly
- If a field is missing or unreadable, use "" and set confidence below 0.5
- NEVER invent, guess, or reuse placeholder values — only copy text visible on the invoice`;

const row = $('Restore Row After Download').item.json;

function checksumHex(buffer) {
  let hash = 2166136261;
  for (const byte of buffer) {
    hash ^= byte;
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16);
}

function debugLog(hypothesisId, location, message, data) {
  // #region agent log
  if (typeof fetch === 'function') {
    fetch('http://127.0.0.1:7278/ingest/2c22404a-379e-4acd-837f-babf35680249',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'86ecbf'},body:JSON.stringify({sessionId:'86ecbf',runId:'exec107-investigation',hypothesisId,location,message,data,timestamp:Date.now()})}).catch(()=>{});
  }
  // #endregion
}

if (row._downloadFailed) {
  return { json: { error: row._status || 'Invoice file unavailable', _skipOpenRouter: true } };
}

if (row._officeDocText) {
  const _openRouterBody = {
    ...OPENROUTER_REQUEST_OPTIONS,
    messages: [
      {
        role: 'user',
        content:
          EXTRACTION_PROMPT +
          '\n\n--- Invoice document text ---\n' +
          row._officeDocText,
      },
    ],
  };
  return {
    json: {
      _openRouterBody,
      _openRouterModel: OPENROUTER_MODEL,
      _prepareMime: 'text/plain',
      _prepareIdx: row._idx,
      _prepareMode: 'text',
    },
  };
}

const bin = $input.item.binary?.invoiceFile || $binary?.invoiceFile || null;
if (!bin) {
  return { json: { error: 'No invoice file binary found for OpenRouter analysis' } };
}

const itemIndex = typeof $itemIndex === 'number' ? $itemIndex : 0;
const buffer = await this.helpers.getBinaryDataBuffer(itemIndex, 'invoiceFile');
const base64 = Buffer.from(buffer).toString('base64');
const fileChecksum = checksumHex(buffer);

let mime = row._geminiMimeType || row._mimeType || bin.mimeType || 'application/octet-stream';

if (mime === 'application/octet-stream' && row._fileClass === 'image') {
  mime = 'image/jpeg';
}

const dataUrl = `data:${mime};base64,${base64}`;

debugLog('H1', 'prepareOpenRouterPayload.js:post-binary', 'Prepared binary for OpenRouter', {
  idx: row._idx,
  fileId: row._fileId || '',
  fileName: row._fileName || bin.fileName || '',
  convertedFromOffice: !!row._convertedFromOffice,
  mime,
  byteLength: buffer.length,
  fileChecksum,
});

function buildVisionContent(prompt) {
  if (mime === 'application/pdf') {
    return [
      {
        type: 'file',
        file: {
          filename: row._fileName || bin.fileName || 'invoice.pdf',
          file_data: dataUrl,
        },
      },
      { type: 'text', text: prompt },
    ];
  }

  return [
    {
      type: 'image_url',
      image_url: { url: dataUrl },
    },
    { type: 'text', text: prompt },
  ];
}

const _openRouterBody = {
  ...OPENROUTER_REQUEST_OPTIONS,
  messages: [
    {
      role: 'user',
      content: buildVisionContent(EXTRACTION_PROMPT),
    },
  ],
};

debugLog('H2', 'prepareOpenRouterPayload.js:payload-shape', 'Built OpenRouter request payload', {
  idx: row._idx,
  mode: 'vision',
  mime,
  contentType: mime === 'application/pdf' ? 'file+text' : 'image_url+text',
  fileChecksum,
});

return {
  json: {
    _openRouterBody,
    _openRouterModel: OPENROUTER_MODEL,
    _prepareMime: mime,
    _prepareIdx: row._idx,
    _prepareMode: 'vision',
    _prepareFileId: row._fileId || '',
    _prepareByteLength: buffer.length,
    _prepareFileChecksum: fileChecksum,
  },
};
