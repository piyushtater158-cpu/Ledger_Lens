import { C } from '@/lib/colors';
import { normalizeRowStatus } from '@/lib/rowStatus';
import type { RowStatus } from '@/lib/types';

const MAP: Record<RowStatus, { bg: string; line: string; col: string; label: string }> = {
  pending: { bg: C.greySoft, line: '#e0e5ec', col: C.grey, label: 'Pending' },
  processing: { bg: C.blueSoft, line: '#cfe0fe', col: C.blueDeep, label: 'Processing' },
  done: { bg: C.greenSoft, line: C.greenLine, col: C.greenInk, label: 'Done' },
  error: { bg: C.redSoft, line: C.redLine, col: C.redInk, label: 'Error' },
  unsupported: { bg: C.amberSoft, line: C.amberLine, col: C.amberInk, label: 'Unsupported' },
  skipped: { bg: C.greySoft, line: '#e0e5ec', col: C.grey, label: 'Skipped' },
};

export default function StatusBadge({
  status,
  error,
}: {
  status: RowStatus;
  error?: string;
}) {
  const normalized = normalizeRowStatus(status);
  const m = MAP[normalized] ?? MAP.error;

  let lead: React.ReactNode;
  if (normalized === 'processing') {
    lead = (
      <span
        className="spin"
        style={{
          display: 'inline-block',
          width: 11,
          height: 11,
          border: '2px solid #bcd1fb',
          borderTopColor: C.blue,
          borderRadius: '50%',
        }}
      />
    );
  } else if (normalized === 'done') {
    lead = <span style={{ color: C.green, fontSize: 11, fontWeight: 700 }}>✓</span>;
  } else if (normalized === 'error') {
    lead = (
      <span style={{ color: C.red, fontSize: 12, fontWeight: 700, lineHeight: 1 }}>!</span>
    );
  } else {
    lead = (
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: '50%',
          background: normalized === 'unsupported' ? C.amber : C.grey,
          display: 'inline-block',
        }}
      />
    );
  }

  return (
    <span
      className="pop"
      title={
        normalized === 'error'
          ? (error ?? '')
          : normalized === 'unsupported'
          ? 'File type not supported (e.g. .docx). Mark as done manually.'
          : normalized === 'skipped'
          ? (error ?? 'Not a payment invoice — skipped')
          : ''
      }
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        background: m.bg,
        border: `1px solid ${m.line}`,
        color: m.col,
        padding: '4px 10px',
        borderRadius: 99,
        font: `600 11.5px "IBM Plex Sans"`,
        cursor: normalized === 'error' || normalized === 'unsupported' ? 'help' : 'default',
        whiteSpace: 'nowrap',
      }}
    >
      {lead}
      {m.label}
    </span>
  );
}
