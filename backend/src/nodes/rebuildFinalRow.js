/**
 * Node: "Rebuild Final Row"
 * Workflow: A (Invoice Payee Extraction — vqSkkv9egxmIVpdv)
 * Mode: runOnceForEachItem
 *
 * Purpose: Reconstruct the output row in the user's original column order. Starts with
 * all original columns (preserving values for non-extracted fields), then overwrites the
 * detected payee/account/IFSC/amount columns with extracted values, and appends `Status`,
 * `Confidence`, and a hidden `__sortIdx` used by the next sort step.
 */

const r = $json;
const keys = r._originalKeys || [];
const out = {};
for (const k of keys) out[k] = r[k] !== undefined ? r[k] : '';
if (r._payeeKey && r._extractedPayee) out[r._payeeKey] = r._extractedPayee;
if (r._acctKey && r._extractedAcct) out[r._acctKey] = r._extractedAcct;
if (r._ifscKey && r._extractedIfsc) out[r._ifscKey] = r._extractedIfsc;
if (r._amountKey && r._extractedAmount) out[r._amountKey] = r._extractedAmount;
out['Status']     = r._status || '';
out['Confidence'] = r._confidence !== undefined && r._confidence !== '' ? Number(r._confidence).toFixed(2) : '';
out['__sortIdx']  = r._idx;
return { json: out };
