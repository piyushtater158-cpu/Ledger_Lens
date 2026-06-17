import { C } from '@/lib/colors';
import { formatAmountWithCurrency } from '@/lib/formatAmount';
import type { InvoiceRow } from '@/lib/types';
import StatusBadge from '@/components/StatusBadge';
import FileCell from './FileCell';
import EditableCell from './EditableCell';
import RowActions from './RowActions';

interface Props {
  row: InvoiceRow;
  index: number;
  isGmailMode: boolean;
  editing: { rowId: string; field: string } | null;
  editValue: string;
  onEditValue: (v: string) => void;
  onStartEdit: (rowId: string, field: string, current: string) => void;
  onCommitEdit: () => void;
  onCancelEdit: () => void;
  onRerun: (rowId: string) => void;
}

function truncate(s: string | undefined, max: number) {
  if (!s) return '—';
  return s.length > max ? s.slice(0, max) + '…' : s;
}

export default function InvoiceTableRow({ row, index, isGmailMode, editing, editValue, onEditValue, onStartEdit, onCommitEdit, onCancelEdit, onRerun }: Props) {
  const bg = row.status === 'processing' ? '#fafcff' : row.status === 'error' ? '#fffafa' : '#fff';
  const cellStyle = { padding: '13px 14px', verticalAlign: 'middle' as const };

  return (
    <tr style={{ borderBottom: `1px solid ${C.lineSoft}`, background: bg, transition: 'background .3s' }}>
      <td style={{ ...cellStyle, font: '500 12.5px "IBM Plex Mono"', color: C.faint }}>{index + 1}</td>

      {isGmailMode ? (
        <>
          <td style={cellStyle}>
            <span style={{ font: '400 12px "IBM Plex Sans"', color: C.inkSoft }} title={row.sender}>
              {truncate(row.sender, 30)}
            </span>
          </td>
          <td style={cellStyle}>
            <span style={{ font: '400 12px "IBM Plex Mono"', color: C.faint, whiteSpace: 'nowrap' }}>
              {row.emailDate ? new Date(row.emailDate).toLocaleDateString() : '—'}
            </span>
          </td>
          <td style={cellStyle}>
            <span style={{ font: '400 12px "IBM Plex Sans"', color: C.inkSoft }} title={row.subject}>
              {truncate(row.subject, 40)}
            </span>
          </td>
          <td style={cellStyle}>
            <span style={{ font: '400 12px "IBM Plex Sans"', color: C.ink }}>
              {row.attachmentName ?? '—'}
            </span>
          </td>
        </>
      ) : (
        <td style={cellStyle}>
          <FileCell fileName={row.fileName} />
        </td>
      )}

      {(['payee', 'acct', 'ifsc'] as const).map((field) => (
        <td key={field} style={cellStyle}>
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

      <td style={{ ...cellStyle, textAlign: 'right' }}>
        <span style={{ font: '500 12.5px "IBM Plex Mono"', color: row.amount ? C.inkSoft : C.faint }}>
          {formatAmountWithCurrency(row.currency, row.amount) || '—'}
        </span>
      </td>
      <td style={cellStyle}>
        <StatusBadge status={row.status} error={row.error} />
      </td>
      <td style={{ ...cellStyle, textAlign: 'right' }}>
        <RowActions rowId={row.id} status={row.status} onRerun={onRerun} />
      </td>
    </tr>
  );
}
