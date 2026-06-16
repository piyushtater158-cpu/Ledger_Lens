import type { InvoiceRow } from '@/lib/types';
import Banners from '@/components/dashboard/Banners';
import StatsBar from '@/components/dashboard/StatsBar';
import InvoiceTable from '@/components/table/InvoiceTable';

interface Props {
  rows: InvoiceRow[];
  running: boolean;
  editing: { rowId: string; field: string } | null;
  editValue: string;
  total: number;
  done: number;
  errCount: number;
  unsupported: number;
  processing: number;
  pending: number;
  hasAuth: boolean;
  allDone: boolean;
  allFailed: boolean;
  progress: number;
  onRun: () => void;
  onDownload: () => void;
  onNewFile: () => void;
  onEditValue: (v: string) => void;
  onStartEdit: (rowId: string, field: string, current: string) => void;
  onCommitEdit: () => void;
  onCancelEdit: () => void;
  onRerun: (rowId: string) => void;
}

export default function DashboardScreen({
  rows, running, editing, editValue,
  total, done, errCount, unsupported, processing, pending,
  hasAuth, allDone, allFailed, progress,
  onRun, onDownload, onNewFile,
  onEditValue, onStartEdit, onCommitEdit, onCancelEdit, onRerun,
}: Props) {
  return (
    <div className="fade-in">
      <Banners hasAuth={hasAuth} allDone={allDone} allFailed={allFailed} />
      <StatsBar
        total={total} done={done} errCount={errCount} unsupported={unsupported}
        pending={pending} processing={processing} running={running}
        allDone={allDone} progress={progress}
        onRun={onRun} onDownload={onDownload} onNewFile={onNewFile}
      />
      <InvoiceTable
        rows={rows}
        editing={editing}
        editValue={editValue}
        onEditValue={onEditValue}
        onStartEdit={onStartEdit}
        onCommitEdit={onCommitEdit}
        onCancelEdit={onCancelEdit}
        onRerun={onRerun}
      />
    </div>
  );
}
