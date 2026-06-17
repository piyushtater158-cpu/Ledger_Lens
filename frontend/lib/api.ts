// API client wrappers for the two n8n extraction routes.
// See shared/contracts.ts (project root) for the documented FE↔BE contract.

interface FetchError extends Error {
  status: number;
  errBody: unknown;
}

function makeFetchError(message: string, status: number, errBody: unknown): FetchError {
  const e = new Error(message) as FetchError;
  e.status = status;
  e.errBody = errBody;
  return e;
}

export async function extractFile(file: File): Promise<Blob> {
  const fd = new FormData();
  fd.append('file', file);
  const res = await fetch('/api/extract', { method: 'POST', body: fd });
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({ error: 'Unknown error' }));
    throw makeFetchError(errBody.error ?? res.statusText, res.status, errBody);
  }
  return res.blob();
}

export interface ExtractRowResult {
  payee: string;
  accountNumber: string; // NOTE: maps to InvoiceRow.acct — see shared/contracts.ts
  ifsc: string;
  amount: string;
  confidence: number;
  status: string;
}

export async function extractRow(driveLink: string): Promise<ExtractRowResult> {
  const res = await fetch('/api/extract-row', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ driveLink }),
  });
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({ error: 'Failed' }));
    throw makeFetchError(errBody.error ?? res.statusText, res.status, errBody);
  }
  return res.json();
}

export interface GmailDiscoverParams {
  query?: string;
  after: number;
  before: number;
  maxMessages?: number;
}

export interface GmailInvoice {
  id: string;
  messageId: string;
  attachmentId: string;
  mimeType: string;
  filename: string;
  sender: string;
  subject: string;
  emailDate: string;
}

export interface DiscoverResponse {
  invoices: GmailInvoice[];
  truncated: boolean;
  scanned: number;
}

export async function discoverGmail(params: GmailDiscoverParams): Promise<DiscoverResponse> {
  const res = await fetch('/api/gmail-discover', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({ error: 'Failed' }));
    throw makeFetchError(errBody.error ?? res.statusText, res.status, errBody);
  }
  return res.json();
}

export interface ExtractGmailAttachmentParams {
  messageId: string;
  attachmentId: string;
  mimeType: string;
  filename: string;
}

export async function extractGmailAttachment(params: ExtractGmailAttachmentParams): Promise<ExtractRowResult> {
  const res = await fetch('/api/gmail-extract', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({ error: 'Failed' }));
    throw makeFetchError(errBody.error ?? res.statusText, res.status, errBody);
  }
  return res.json();
}
