/**
 * LedgerLens FE↔BE contract types.
 * Frontend imports these; backend/src/ references them in comments.
 */

/** POST /api/extract — multipart/form-data */
export interface ExtractRequest {
  file: File;
  // googleAccessToken injected server-side from session
}

/** POST /api/extract-row — JSON body */
export interface ExtractRowRequest {
  driveLink: string;
  // googleAccessToken injected server-side from session
}

/**
 * Response from POST /webhook/extract-row (Workflow B → /api/extract-row → frontend).
 *
 * Shape divergence note:
 *   Workflow A (bulk)  → _extractedAcct  → written to spreadsheet _acctKey column
 *   Workflow B (row)   → accountNumber   → frontend rerun() maps this to InvoiceRow.acct
 *
 * This is intentional. Do not normalise without updating both the n8n workflow
 * (backend/workflows/invoice-extract-row.workflow.json) and frontend/app/api/extract-row/route.ts.
 */
export interface ExtractRowResponse {
  payee: string;
  accountNumber: string;
  ifsc: string;
  amount: string;
  currency: string;
  confidence: number;
  status: string; // 'Done' | 'Error: ...' | 'Unsupported - manual (...)'
}

/** Per-row shape used on the frontend (see frontend/lib/types.ts InvoiceRow) */
export interface RowContract {
  payee: string;
  acct: string;
  ifsc: string;
  confidence?: number;
  status: string;
}
