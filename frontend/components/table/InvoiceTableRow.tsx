import { C } from '@/lib/colors';
import type { InvoiceRow } from '@/lib/types';
import StatusBadge from '@/components/StatusBadge';
import FileCell from './FileCell';
import EditableCell from './EditableCell';
import RowActions from './RowActions';

interface Props {
  row: InvoiceRow;
  index: number;
  editing: { rowId: string; field: string } | null;
  editValue: string;
  onEditValue: (v: string) => void;
  onStartEdit: (rowId: string, field: string, current: string) => void;
  onCommitEdit: () => void;
  onCancelEdit: () => void;
  onRerun: (rowId: string) => void;
}

export default function InvoiceTableRow({ row, index, editing, editValue, onEditValue, onStartEdit, onCommitEdit, onCancelEdit, onRerun }: Props) {
  const bg = row.status === 'processing' ? '#fafcff' : row.status === 'error' ? '#fffafa' : '#fff';

  return (
    <tr style={{ borderBottom: `1px solid ${C.lineSoft}`, background: bg, transition: 'background .3s' }}>
      <td style={{ padding: '13px 14px', font: '500 12.5px "IBM Plex Mono"', color: C.faint, verticalAlign: 'middle' }}>{index + 1}</td>
      <td style={{ padding: '13px 14px', verticalAlign: 'middle' }}>
        <FileCell fileName={row.fileName} />
      </td>
      {(['payee', 'acct', 'ifsc'] as const).map((field) => (
        <td key={field} style={{ padding: '13px 14px', verticalAlign: 'middle' }}>
          <EditableCell
            rowId={row.id}
            field={field}
            value={row[field]}
            editing={editing}
            editValue={editValue}
            onEditValue={onEditValue}
            onStart={onStartEdit}
            onCommit={onCommitEdit}
            onCancel={onCancelEdit}
          />
        </td>
      ))}
      <td style={{ padding: '13px 14px', verticalAlign: 'middle', textAlign: 'right' }}>
        <span style={{ font: '500 12.5px "IBM Plex Mono"', color: row.amount ? C.inkSoft : C.faint }}>
          {row.amount || '—'}
        </span>
      </td>
      <td style={{ padding: '13px 14px', verticalAlign: 'middle' }}>
        <StatusBadge status={row.status} error={row.error} />
      </td>
      <td style={{ padding: '13px 14px', verticalAlign: 'middle', textAlign: 'right' }}>
        <RowActions rowId={row.id} status={row.status} onRerun={onRerun} />
      </td>
    </tr>
  );
}
