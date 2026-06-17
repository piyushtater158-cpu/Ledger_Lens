/**
 * Nodes: "OpenRouter Analyze Image" + "OpenRouter Analyze Document" (prepare step)
 * Workflows: A + B
 * Mode: runOnceForEachItem
 *
 * Builds the OpenRouter request body. PDFs/images use vision. DOC/DOCX are converted to
 * PDF in Restore Row After Download; _geminiMimeType routes them through the PDF vision path.
 * Legacy _officeDocText text mode is still supported if present on the row.
 */

const OPENROUTER_MODEL = 'nvidia/nemotron-nano-12b-v2-vl:free';

const EXTRACTION_PROMPT = `You are reading an invoice document. Extract ONLY these four fields and return valid JSON with no prose, no markdown, no code fences:

{"payee":"string","account_number":"string","ifsc":"string","amount":"string","confidence":0.0}

Rules:
- payee: the account payee or beneficiary name exactly as printed on THIS invoice
- account_number: digits only, no spaces or dashes — copy exactly from the document
- ifsc: exactly 11 characters, uppercase, copied from the document (format: 4 letters + 0 + 6 alphanumeric)
- amount: invoice total or grand total as printed (digits and decimal point only, no currency symbols or commas)
- confidence: 0.0 to 1.0 — use 0.0 if you cannot read the document clearly
- If a field is missing or unreadable, use "" and set confidence below 0.5
- NEVER invent, guess, or reuse placeholder values — only copy text visible on the invoice`;

const row = $('Restore Row After Download').item.json;

if (row._downloadFailed) {
  return { json: { error: row._status || 'Invoice file unavailable', _skipOpenRouter: true } };
}

if (row._officeDocText) {
  const _openRouterBody = {
    model: OPENROUTER_MODEL,
    max_tokens: 1024,
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

const bin = $binary?.invoiceFile || null;
if (!bin) {
  return { json: { error: 'No invoice file binary found for OpenRouter analysis' } };
}

const buffer = await this.helpers.getBinaryDataBuffer(0, 'invoiceFile');
const base64 = Buffer.from(buffer).toString('base64');

let mime = row._geminiMimeType || row._mimeType || bin.mimeType || 'application/octet-stream';

if (mime === 'application/octet-stream' && row._fileClass === 'image') {
  mime = 'image/jpeg';
}

const dataUrl = `data:${mime};base64,${base64}`;

function buildVisionContent(prompt) {
  if (mime === 'application/pdf') {
    return [
      {
        type: 'file',
        file: {
          filename: 'invoice.pdf',
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
  model: OPENROUTER_MODEL,
  max_tokens: 1024,
  messages: [
    {
      role: 'user',
      content: buildVisionContent(EXTRACTION_PROMPT),
    },
  ],
};

return {
  json: {
    _openRouterBody,
    _openRouterModel: OPENROUTER_MODEL,
    _prepareMime: mime,
    _prepareIdx: row._idx,
    _prepareMode: 'vision',
  },
};
