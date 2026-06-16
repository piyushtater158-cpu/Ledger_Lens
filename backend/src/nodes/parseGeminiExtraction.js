/**
 * Nodes: "Parse Image Extraction" + "Parse Document Extraction"
 * Workflow: A (Invoice Payee Extraction — vqSkkv9egxmIVpdv)
 * Mode: runOnceForEachItem
 */

const row = $('Restore Row After Download').item.json;
if (row._downloadFailed) return { json: row };

function formatError(err) {
  if (err == null || err === '') return 'unknown error';
  if (typeof err === 'string') return err;
  return err.message || JSON.stringify(err);
}

function getPrepareError() {
  for (const name of ['OpenRouter Analyze Image', 'OpenRouter Analyze Document']) {
    try {
      const prep = $(name).first()?.json;
      if (prep?.error) return formatError(prep.error);
    } catch (_) {}
  }
  return '';
}

const prepareError = getPrepareError();
if (prepareError) {
  return { json: { ...row, _status: 'Error: extraction analyze failed - ' + prepareError } };
}

if ($json.error) {
  return { json: { ...row, _status: 'Error: extraction analyze failed - ' + formatError($json.error) } };
}

function extractRawModelText(data) {
  if (!data) return '';
  if (typeof data.text === 'string') return data.text;
  if (typeof data.output === 'string') return data.output;
  if (typeof data.content === 'string') return data.content;
  const openAiContent = data.choices?.[0]?.message?.content;
  if (typeof openAiContent === 'string') return openAiContent;
  const openAiText = data.choices?.[0]?.text;
  if (typeof openAiText === 'string') return openAiText;
  const messageContent = data.message?.content;
  if (typeof messageContent === 'string') return messageContent;
  const partText = data.content?.parts?.[0]?.text;
  if (typeof partText === 'string') return partText;
  return '';
}

function normalizeAmount(val) {
  const s = String(val ?? '').trim();
  if (!s) return '';
  return s.replace(/[^\d.]/g, '');
}

function parseExtractionPayload(data) {
  if (
    data.payee !== undefined ||
    data.account_number !== undefined ||
    data.ifsc !== undefined ||
    data.amount !== undefined ||
    data.total !== undefined
  ) {
    return data;
  }
  const raw = extractRawModelText(data);
  if (!raw) return null;
  const cleaned = raw.replace(/```json?\n?/gi, '').replace(/```/g, '').trim();
  return JSON.parse(cleaned);
}

try {
  const p = parseExtractionPayload($json);
  if (!p) {
    return { json: { ...row, _status: 'Error: model returned empty extraction' } };
  }

  if (p.error) {
    return { json: { ...row, _status: 'Error: extraction analyze failed - ' + p.error } };
  }

  const payee = String(p.payee || '').trim();
  const acct = String(p.account_number || p.bank_number || p.bank_account_number || '')
    .replace(/\D/g, '');
  const ifsc = String(p.ifsc || '').toUpperCase().trim();
  const amount = normalizeAmount(
    p.amount ?? p.total ?? p.total_amount ?? p.invoice_amount ?? p.invoice_total
  );
  const confidence = typeof p.confidence === 'number' ? p.confidence : 0;

  const _parseSource = extractRawModelText($json) ? 'model-text' : 'top-level';

  if (!payee && !acct && !ifsc && !amount) {
    return {
      json: {
        ...row,
        _status: 'Error: model returned empty extraction',
        _confidence: confidence,
        _parseSource,
      },
    };
  }

  return {
    json: {
      ...row,
      _extractedPayee: payee,
      _extractedAcct: acct,
      _extractedIfsc: ifsc,
      _extractedAmount: amount,
      _confidence: confidence,
      _status: 'Done',
      _parseSource,
    },
  };
} catch (e) {
  return { json: { ...row, _status: 'Error: model response not parseable - ' + e.message } };
}
