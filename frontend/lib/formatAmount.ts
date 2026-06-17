/** Format amount with currency as printed on the invoice (symbol or code prefix). */
export function formatAmountWithCurrency(currency?: string, amount?: string): string {
  const amt = String(amount ?? '').trim();
  if (!amt) return '';
  const cur = String(currency ?? '').trim();
  if (!cur) return amt;
  const isSymbol = cur.length <= 2 || /^[$₹€£¥]/.test(cur);
  return isSymbol ? `${cur}${amt}` : `${cur} ${amt}`;
}
