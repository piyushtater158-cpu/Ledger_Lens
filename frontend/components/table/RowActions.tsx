import { C } from '@/lib/colors';
import type { RowStatus } from '@/lib/types';

interface Props {
  rowId: string;
  status: RowStatus;
  onRerun: (rowId: string) => void;
}

export default function RowActions({ rowId, status, onRerun }: Props) {
  if (status === 'error') {
    return (
      <button
        onClick={() => onRerun(rowId)}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 5,
          background: C.white, border: `1px solid ${C.line}`,
          color: C.blueDeep, borderRadius: 8, padding: '6px 11px',
          font: '600 12px "IBM Plex Sans"', cursor: 'pointer',
        }}
      >
        ↻ Re-run
      </button>
    );
  }
  if (status === 'unsupported') {
    return <span style={{ font: '500 11.5px "IBM Plex Sans"', color: C.faint }}>Skipped</span>;
  }
  if (status === 'processing') {
    return <span style={{ font: '500 11.5px "IBM Plex Mono"', color: C.faint }}>···</span>;
  }
  if (status === 'pending') {
    return <span style={{ font: '500 11.5px "IBM Plex Sans"', color: C.faint }}>Queued</span>;
  }
  return null;
}
