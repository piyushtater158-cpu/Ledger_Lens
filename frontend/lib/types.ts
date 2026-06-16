export type Screen = 'upload' | 'mapping' | 'dashboard';
export type RowStatus = 'pending' | 'processing' | 'done' | 'error' | 'unsupported';

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
  status: RowStatus;
  error?: string;
  errorType?: 'auth' | 'drive' | 'gemini' | 'other';
  confidence?: number;
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
  status: RowStatus;
  error?: string;
  confidence?: number;
}
