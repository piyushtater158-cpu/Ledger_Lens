import { C } from '@/lib/colors';
import type { InvoiceRow } from '@/lib/types';
import InvoiceTableRow from './InvoiceTableRow';

interface Props {
  rows: InvoiceRow[];
  editing: { rowId: string; field: string } | null;
  editValue: string;
  onEditValue: (v: string) => void;
  onStartEdit: (rowId: string, field: string, current: string) => void;
  onCommitEdit: () => void;
  onCancelEdit: () => void;
  onRerun: (rowId: string) => void;
}

const HEADERS = ['#', 'File', 'Payee Name', 'Account No', 'IFSC', 'Amount', 'Status', 'Actions'];

export default function InvoiceTable({ rows, editing, editValue, onEditValue, onStartEdit, onCommitEdit, onCancelEdit, onRerun }: Props) {
  return (
    <div style={{ background: C.white, border: `1px solid ${C.line}`, borderRadius: 12, overflow: 'hidden' }}>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: C.greySoft }}>
              {HEADERS.map((h) => (
                <th key={h} style={{
                  padding: '11px 14px',
                  textAlign: h === 'Amount' || h === 'Actions' ? 'right' : 'left',
                  font: '600 11.5px "IBM Plex Sans"',
                  color: C.inkFaint,
                  borderBottom: `1px solid ${C.line}`,
                  whiteSpace: 'nowrap',
                  letterSpacing: '0.3px',
                }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <InvoiceTableRow
                key={row.id}
                row={row}
                index={i}
                editing={editing}
                editValue={editValue}
                onEditValue={onEditValue}
                onStartEdit={onStartEdit}
                onCommitEdit={onCommitEdit}
                onCancelEdit={onCancelEdit}
                onRerun={onRerun}
              />
            ))}
          </tbody>
        </table>
      </div>
      {rows.length === 0 && (
        <div style={{ padding: '48px 20px', textAlign: 'center', font: '400 14px "IBM Plex Sans"', color: C.faint }}>
          No rows loaded
        </div>
      )}
    </div>
  );
}
