import type { ColumnMapping, ExtractionResult, InvoiceRow, RowStatus } from './types';

export function autoDetectColumns(headers: string[]): Partial<ColumnMapping> {
  const find = (re: RegExp) => headers.find((h) => re.test(h)) ?? '';
  return {
    driveLink: find(/drive.*link|invoice.*link|invoice.*url|link|url|drive|invoice|file/i),
    payee: find(/payee|beneficiary|account[_\s-]?name|acc[_\s-]?name/i),
    acct: find(/account[_\s-]?no|acct|a\/c|bank[_\s-]?acc|acc.*no/i),
    ifsc: find(/ifsc/i),
    amount: find(/amount|total|value|sum|invoice.*amount/i),
  };
}

export async function parseN8nResultBlob(
  blob: Blob,
  mapping: ColumnMapping
): Promise<ExtractionResult[]> {
  const XLSX = await import('xlsx');
  const buffer = await blob.arrayBuffer();
  const wb = XLSX.read(buffer, { type: 'array' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws);

  return rows.map((row) => {
    const statusRaw = String(row['Status'] ?? '').toLowerCase();
    let status: RowStatus = 'done';
    let error: string | undefined;

    if (statusRaw.startsWith('error')) {
      status = 'error';
      error = String(row['Status'] ?? '');
    } else if (statusRaw.startsWith('unsupported')) {
      status = 'unsupported';
    } else if (statusRaw === 'no drive link') {
      status = 'unsupported';
    }

    const conf = parseFloat(String(row['Confidence'] ?? '0'));

    return {
      payee: String(row[mapping.payee] ?? ''),
      acct: String(row[mapping.acct] ?? ''),
      ifsc: String(row[mapping.ifsc] ?? ''),
      amount: mapping.amount ? String(row[mapping.amount] ?? '') : '',
      status,
      error,
      confidence: isNaN(conf) ? undefined : conf,
    };
  });
}

export async function buildDownloadBlob(
  rawData: Record<string, unknown>[],
  rows: InvoiceRow[],
  mapping: ColumnMapping,
  headers: string[]
): Promise<Blob> {
  const XLSX = await import('xlsx');

  const output = rawData.map((orig, i) => {
    const row = rows[i];
    const result: Record<string, unknown> = { ...orig };
    if (row) {
      if (mapping.payee) result[mapping.payee] = row.payee;
      if (mapping.acct) result[mapping.acct] = row.acct;
      if (mapping.ifsc) result[mapping.ifsc] = row.ifsc;
      if (mapping.amount) result[mapping.amount] = row.amount;
      result['Status'] = row.status;
      if (row.confidence != null) result['Confidence'] = row.confidence;
    }
    return result;
  });

  const wb = XLSX.utils.book_new();
  const allHeaders = [...headers, 'Status', 'Confidence'];
  const ws = XLSX.utils.json_to_sheet(output, { header: allHeaders });
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
  const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
  return new Blob([buf], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

export async function buildGmailDownloadBlob(rows: InvoiceRow[]): Promise<Blob> {
  const XLSX = await import('xlsx');
  const sheetRows = rows.map((r) => ({
    'Sender': r.sender ?? '',
    'Email Date': r.emailDate ? new Date(r.emailDate).toLocaleDateString() : '',
    'Subject': r.subject ?? '',
    'Attachment': r.attachmentName ?? '',
    'Payee': r.payee,
    'Account No': r.acct,
    'IFSC': r.ifsc,
    'Amount': r.amount,
    'Status': r.status,
    'Confidence': r.confidence !== undefined ? Number(r.confidence).toFixed(2) : '',
  }));
  const headers = ['Sender', 'Email Date', 'Subject', 'Attachment', 'Payee', 'Account No', 'IFSC', 'Amount', 'Status', 'Confidence'];
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(sheetRows, { header: headers });
  XLSX.utils.book_append_sheet(wb, ws, 'Gmail Invoices');
  const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
  return new Blob([buf], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

export async function parseUploadedFile(file: File): Promise<{
  headers: string[];
  rawData: Record<string, unknown>[];
}> {
  const XLSX = await import('xlsx');
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: 'array' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rawData = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, {
    defval: '',
  });
  const headers =
    rawData.length > 0
      ? Object.keys(rawData[0])
      : XLSX.utils.sheet_to_json<string[]>(ws, { header: 1 })[0] ?? [];
  return { headers, rawData };
}
