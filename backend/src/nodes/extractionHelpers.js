/**
 * Shared helpers prepended into Parse Image/Document nodes (Workflows A + B).
 * Not a standalone n8n node.
 */

const IFSC_REGEX = /^[A-Z]{4}0[A-Z0-9]{6}$/;

function extractRawModelText(data) {
  if (!data) return '';
  if (typeof data.text === 'string') return data.text;
  if (typeof data.output === 'string') return data.output;
  if (typeof data.content === 'string') return data.content;
  const openAiContent = data.choices?.[0]?.message?.content;
  if (typeof openAiContent === 'string') return openAiContent;
  if (Array.isArray(openAiContent)) {
    return openAiContent
      .filter((part) => part?.type === 'text' && typeof part.text === 'string')
      .map((part) => part.text)
      .join('');
  }
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

function normalizeCurrency(val) {
  const s = String(val ?? '').trim();
  if (!s) return '';
  if (/^[A-Za-z]{3}$/.test(s)) return s.toUpperCase();
  return s;
}

function normalizeConfidence(raw, payee, acct, ifsc, amount) {
  if (typeof raw === 'number' && raw > 0) return Math.min(1, raw);
  const filled = [payee, acct, ifsc, amount].filter(Boolean).length;
  if (filled === 0) return 0;
  return Math.min(0.95, 0.45 + filled * 0.12);
}

function normalizeExtractionFields(p) {
  return {
    payee: String(p.payee ?? p.account_name ?? p.beneficiary ?? p.account_payee ?? '').trim(),
    account_number: String(
      p.account_number ??
        p.accountNumber ??
        p.bank_number ??
        p.bank_account_number ??
        p.bank_account ??
        ''
    ).replace(/\D/g, ''),
    ifsc: String(p.ifsc ?? p.IFSC ?? p.ifsc_code ?? '').toUpperCase().trim(),
    amount: normalizeAmount(
      p.amount ?? p.total ?? p.total_amount ?? p.invoice_amount ?? p.invoice_total
    ),
    currency: normalizeCurrency(
      p.currency ?? p.currency_code ?? p.currencyCode ?? p.invoice_currency
    ),
    confidence: typeof p.confidence === 'number' ? p.confidence : 0,
  };
}

function hasExtractionFields(data) {
  if (!data || typeof data !== 'object') return false;
  return (
    data.payee !== undefined ||
    data.account_name !== undefined ||
    data.beneficiary !== undefined ||
    data.account_number !== undefined ||
    data.accountNumber !== undefined ||
    data.bank_account_number !== undefined ||
    data.ifsc !== undefined ||
    data.IFSC !== undefined ||
    data.amount !== undefined ||
    data.total !== undefined ||
    data.currency !== undefined ||
    data.currency_code !== undefined
  );
}

function parseExtractionPayload(data) {
  if (hasExtractionFields(data)) {
    return normalizeExtractionFields(data);
  }
  const raw = extractRawModelText(data);
  if (!raw) return null;
  const cleaned = raw.replace(/```json?\n?/gi, '').replace(/```/g, '').trim();
  try {
    return normalizeExtractionFields(JSON.parse(cleaned));
  } catch (_) {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) return null;
    return normalizeExtractionFields(JSON.parse(match[0]));
  }
}

function detectHallucination(payee, acct, ifsc) {
  if (acct.length >= 10 && /^(\d)\1+$/.test(acct)) return 'repeated-digit account number';
  if (ifsc && !IFSC_REGEX.test(ifsc)) return 'invalid IFSC format';
  return '';
}

function finalizeExtraction(p) {
  const payee = p.payee;
  const acct = p.account_number;
  const ifsc = p.ifsc;
  const amount = p.amount;
  const currency = p.currency;
  const confidence = normalizeConfidence(p.confidence, payee, acct, ifsc, amount);
  return { payee, acct, ifsc, amount, currency, confidence };
}
