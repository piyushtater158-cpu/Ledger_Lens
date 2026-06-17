export type Screen = 'upload' | 'mapping' | 'dashboard' | 'gmail';
export type RowStatus = 'pending' | 'processing' | 'done' | 'error' | 'unsupported' | 'skipped';

export interface UploadedFile {
  name: string;
  rowCount: number;
  headers: string[];
  rawData: Record<string, unknown>[];
  file: File;
}

export interface ColumnMapping {
  driveLink: string;
  payee: string;
  acct: string;
  ifsc: string;
  amount: string;
  currency?: string;
}

export interface InvoiceRow {
  id: string;
  index: number;
  fileName: string;
  driveLink: string;
  payee: string;
  acct: string;
  ifsc: string;
  amount: string;
  currency: string;
  status: RowStatus;
  error?: string;
  errorType?: 'auth' | 'drive' | 'gemini' | 'other';
  confidence?: number;
  source: 'sheet' | 'gmail';
  sender?: string;
  subject?: string;
  emailDate?: string;
  attachmentName?: string;
  messageId?: string;
  attachmentId?: string;
  mimeType?: string;
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

export interface Toast {
  id: string;
  text: string;
  kind: 'success' | 'info' | 'error';
}

export interface ExtractionResult {
  payee: string;
  acct: string;
  ifsc: string;
  amount?: string;
  currency?: string;
  status: RowStatus;
  error?: string;
  confidence?: number;
}
