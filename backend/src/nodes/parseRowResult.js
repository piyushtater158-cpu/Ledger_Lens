/**
 * Nodes: "Parse Image Result" + "Parse Document Result"
 * Workflow: B (Invoice Extract Row — LmdFhorOYBoJgXGl)
 * Mode: runOnceForEachItem
 *
 * Depends on extractionHelpers.js (prepended by sync script).
 */

const row = $('Restore Row After Download').item.json;

function buildResult({ payee = '', accountNumber = '', ifsc = '', amount = '', currency = '', confidence = 0, status }) {
  return { json: { payee, accountNumber, ifsc, amount, currency, confidence, status } };
}

if (row._downloadFailed) {
  return buildResult({ status: row._status || 'Error: download failed' });
}

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
  return buildResult({ status: 'Error: extraction analyze failed - ' + prepareError });
}

if ($json.error) {
  return buildResult({ status: 'Error: extraction failed - ' + formatOpenRouterHttpError($json.error) });
}

try {
  const p = parseExtractionPayload($json);
  if (!p) {
    return buildResult({ status: 'Error: model returned empty extraction' });
  }

  if (p.error) {
    return buildResult({ status: 'Error: extraction analyze failed - ' + p.error });
  }

  const { payee, acct, ifsc, amount, currency, confidence } = finalizeExtraction(p);
  const accountNumber = acct;

  // #region agent log
  if (typeof fetch === 'function') {
    fetch('http://127.0.0.1:7278/ingest/2c22404a-379e-4acd-837f-babf35680249',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'440105'},body:JSON.stringify({sessionId:'440105',runId:'currency-extract',hypothesisId:'H1',location:'parseRowResult.js:post-parse',message:'Parsed extraction with currency',data:{amount,currency,hasPayee:!!payee,hasAcct:!!accountNumber,hasIfsc:!!ifsc},timestamp:Date.now()})}).catch(()=>{});
  }
  // #endregion

  const hallucinationReason = detectHallucination(payee, accountNumber, ifsc);
  if (hallucinationReason) {
    return buildResult({
      payee,
      accountNumber,
      ifsc,
      amount,
      currency,
      confidence,
      status: 'Error: model returned unreliable extraction - ' + hallucinationReason,
    });
  }

  if (!payee && !accountNumber && !ifsc && !amount) {
    return buildResult({ confidence, status: 'Error: model returned empty extraction' });
  }

  const hasBankDetails = Boolean(accountNumber && ifsc) || Boolean(payee && (accountNumber || ifsc));
  const amountOnly = amount && !payee && !accountNumber && !ifsc;

  if (amountOnly || !hasBankDetails) {
    return buildResult({
      payee,
      accountNumber,
      ifsc,
      amount,
      currency,
      confidence,
      status: 'not_invoice: no bank payment details found',
    });
  }

  return buildResult({ payee, accountNumber, ifsc, amount, currency, confidence, status: 'Done' });
} catch (e) {
  return buildResult({ status: 'Error: model response not parseable - ' + e.message });
}
