/**
 * Node: "Sort Rows By Index"
 * Workflow: A (Invoice Payee Extraction — vqSkkv9egxmIVpdv)
 * Mode: runOnceForAllItems
 *
 * Purpose: n8n's parallel branches (image vs document vs unsupported vs no-link) may
 * arrive in any order. This node sorts all output rows back into their original
 * spreadsheet order using the hidden `__sortIdx` field, then strips it before output.
 */

return $input.all()
  .sort((a, b) => (a.json.__sortIdx || 0) - (b.json.__sortIdx || 0))
  .map(item => { const { __sortIdx, ...rest } = item.json; return { json: rest }; });
