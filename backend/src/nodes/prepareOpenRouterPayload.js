/**
 * Nodes: "OpenRouter Analyze Image" + "OpenRouter Analyze Document" (prepare step)
 * Workflows: A + B
 * Mode: runOnceForEachItem
 *
 * Builds the OpenRouter vision request body. The following HTTP Request node
 * performs the authenticated call using the openRouterApi credential.
 */

const OPENROUTER_MODEL = 'nvidia/nemotron-nano-12b-v2-vl:free';

const EXTRACTION_PROMPT = `You are reading an invoice document. Extract ONLY these four fields and return valid JSON with no prose, no markdown, no code fences:

{"payee":"string","account_number":"string","ifsc":"string","amount":"string","confidence":0.0}

Rules:
- payee: the account payee or beneficiary name exactly as printed
- account_number: digits only, no spaces or dashes
- ifsc: exactly 11 characters, uppercase (e.g. HDFC0001234)
- amount: invoice total or grand total as printed (digits and decimal point only, no currency symbols or commas). Always include this field when visible on the invoice.
- confidence: 0.0 to 1.0
- If a field is missing or unreadable, use "" and lower confidence`;

const bin = $binary?.invoiceFile || null;
if (!bin) {
  return { json: { error: 'No invoice file binary found for OpenRouter analysis' } };
}

const buffer = await this.helpers.getBinaryDataBuffer(0, 'invoiceFile');
const base64 = Buffer.from(buffer).toString('base64');

let mime = $('Restore Row After Download').item.json._geminiMimeType
  || $('Restore Row After Download').item.json._mimeType
  || bin.mimeType
  || 'application/octet-stream';

if (mime === 'application/octet-stream' && $('Restore Row After Download').item.json._fileClass === 'image') {
  mime = 'image/jpeg';
}
if (mime !== 'application/pdf' && !mime.startsWith('image/')) {
  if ($('Restore Row After Download').item.json._fileClass === 'document') {
    mime = 'application/pdf';
  }
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
  },
};
