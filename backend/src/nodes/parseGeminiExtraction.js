/**
 * Nodes: "Parse Image Extraction" + "Parse Document Extraction"
 * Workflow: A (Invoice Payee Extraction — vqSkkv9egxmIVpdv)
 * Mode: runOnceForEachItem
 *
 * Depends on extractionHelpers.js (prepended by sync script).
 */

const row = $('Restore Row After Download').item.json;

function buildRowOutput(row, { payee = '', acct = '', ifsc = '', amount = '', currency = '', confidence = 0, status, _parseSource = '' }) {
  return {
    json: {
      ...row,
      _extractedPayee: payee,
      _extractedAcct: acct,
      _extractedIfsc: ifsc,
      _extractedAmount: amount,
      _extractedCurrency: currency,
      _confidence: confidence,
      _status: status,
      ...(_parseSource ? { _parseSource } : {}),
    },
  };
}

if (row._downloadFailed) return buildRowOutput(row, { status: row._status || 'Error: download failed' });

function formatError(err) {
  if (err == null || err === '') return 'unknown error';
  if (typeof err === 'string') return err;
  return err.message || JSON.stringify(err);
}

function formatOpenRouterHttpError(err) {
  const msg = formatError(err);
  if (/too many requests|429|rate limit/i.test(msg)) {
    return 'OpenRouter rate limit (429) — wait and retry, or switch off the free-tier model';
  }
  return msg;
}

function getPrepareError() {
  const analyzeNode =
    row._fileClass === 'image' ? 'OpenRouter Analyze Image' : 'OpenRouter Analyze Document';
  try {
    const prep = $(analyzeNode).item?.json;
    if (prep?.error) return formatError(prep.error);
  } catch (_) {}
  return '';
}

const prepareError = getPrepareError();
if (prepareError) {
  return buildRowOutput(row, { status: 'Error: extraction analyze failed - ' + prepareError });
}

if ($json.error) {
  const httpErr = formatOpenRouterHttpError($json.error);
  return buildRowOutput(row, { status: 'Error: extraction failed - ' + httpErr });
}

try {
  const p = parseExtractionPayload($json);
  if (!p) {
    return buildRowOutput(row, { status: 'Error: model returned empty extraction', _parseSource: 'empty' });
  }

  if (p.error) {
    return buildRowOutput(row, { status: 'Error: extraction analyze failed - ' + p.error, _parseSource: 'error-field' });
  }

  const { payee, acct, ifsc, amount, currency, confidence } = finalizeExtraction(p);
  const _parseSource = extractRawModelText($json) ? 'model-text' : 'top-level';

  const hallucinationReason = detectHallucination(payee, acct, ifsc);
  if (hallucinationReason) {
    return buildRowOutput(row, {
      payee,
      acct,
      ifsc,
      amount,
      currency,
      confidence,
      status: 'Error: model returned unreliable extraction - ' + hallucinationReason,
      _parseSource,
    });
  }

  if (!payee && !acct && !ifsc && !amount) {
    return buildRowOutput(row, { confidence, status: 'Error: model returned empty extraction', _parseSource });
  }

  return buildRowOutput(row, {
    payee,
    acct,
    ifsc,
    amount,
    currency,
    confidence,
    status: 'Done',
    _parseSource,
  });
} catch (e) {
  return buildRowOutput(row, { status: 'Error: model response not parseable - ' + e.message, _parseSource: 'parse-error' });
}
