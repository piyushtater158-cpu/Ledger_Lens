import type { RowStatus } from './types';

/** Map n8n / spreadsheet status strings to dashboard RowStatus. */
export function normalizeRowStatus(raw: string | undefined | null): RowStatus {
  const s = String(raw ?? '').trim().toLowerCase();
  if (!s || s === 'done') return 'done';
  if (s.startsWith('error')) return 'error';
  if (s.startsWith('unsupported') || s === 'no drive link') return 'unsupported';
  if (s === 'pending' || s === 'processing') return s as RowStatus;
  return 'done';
}

export function rowStatusErrorMessage(raw: string | undefined | null): string | undefined {
  const original = String(raw ?? '').trim();
  if (!original) return undefined;
  const normalized = normalizeRowStatus(original);
  if (normalized === 'error' || normalized === 'unsupported') return original;
  return undefined;
}
