import { C } from '@/lib/colors';

interface Props {
  rowId: string;
  field: 'payee' | 'acct' | 'ifsc';
  value: string;
  editing: { rowId: string; field: string } | null;
  editValue: string;
  onEditValue: (v: string) => void;
  onStart: (rowId: string, field: string, current: string) => void;
  onCommit: () => void;
  onCancel: () => void;
}

export default function EditableCell({ rowId, field, value, editing, editValue, onEditValue, onStart, onCommit, onCancel }: Props) {
  const isEditing = editing?.rowId === rowId && editing?.field === field;

  if (isEditing) {
    return (
      <input
        autoFocus
        value={editValue}
        onChange={(e) => onEditValue(e.target.value)}
        onBlur={onCommit}
        onKeyDown={(e) => { if (e.key === 'Enter') onCommit(); if (e.key === 'Escape') onCancel(); }}
        style={{
          border: `1.5px solid ${C.blue}`,
          borderRadius: 6,
          padding: '5px 9px',
          font: '500 12.5px "IBM Plex Mono"',
          color: C.ink,
          outline: 'none',
          width: '100%',
          background: '#fafcff',
        }}
      />
    );
  }

  return (
    <span
      onClick={() => onStart(rowId, field, value)}
      title="Click to edit"
      style={{
        font: '500 12.5px "IBM Plex Mono"',
        color: value ? C.ink : C.faint,
        cursor: 'text',
        display: 'block',
        padding: '5px 2px',
        borderRadius: 4,
        transition: 'background .1s',
        minWidth: 60,
      }}
      onMouseEnter={(e) => { (e.target as HTMLElement).style.background = C.greySoft; }}
      onMouseLeave={(e) => { (e.target as HTMLElement).style.background = 'transparent'; }}
    >
      {value || '—'}
    </span>
  );
}
