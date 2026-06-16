import { C } from '@/lib/colors';

interface Props {
  total: number;
  done: number;
  errCount: number;
  unsupported: number;
  pending: number;
  processing: number;
  running: boolean;
  allDone: boolean;
  progress: number;
  onRun: () => void;
  onDownload: () => void;
  onNewFile: () => void;
}

export default function StatsBar({ total, done, errCount, unsupported, pending, running, allDone, progress, onRun, onDownload, onNewFile }: Props) {
  const runDisabled = running || (pending === 0 && errCount === 0);

  return (
    <div style={{ background: C.white, border: `1px solid ${C.line}`, borderRadius: 12, padding: '16px 20px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
      <div style={{ flex: 1 }}>
        <div style={{ font: '500 13px "IBM Plex Sans"', color: C.inkFaint, marginBottom: 8 }}>
          {done} / {total} done
          {errCount > 0 && <span style={{ marginLeft: 12, color: C.redInk }}>{errCount} error{errCount !== 1 ? 's' : ''}</span>}
          {unsupported > 0 && <span style={{ marginLeft: 12, color: C.amberInk }}>{unsupported} unsupported</span>}
          {running && <span style={{ marginLeft: 12, color: C.blue }}>Processing…</span>}
        </div>
        <div style={{ height: 6, background: C.lineSoft, borderRadius: 3, overflow: 'hidden' }}>
          <div
            className={running ? 'progress-bar' : ''}
            style={{
              height: '100%',
              width: running ? '100%' : `${progress}%`,
              background: running ? undefined : (allDone ? C.green : C.blue),
              borderRadius: 3,
              transition: 'width .4s ease',
            }}
          />
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10, flexShrink: 0 }}>
        <button
          onClick={onRun}
          disabled={runDisabled}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 7,
            background: runDisabled ? C.greySoft : C.blue,
            color: runDisabled ? C.faint : '#fff',
            border: 'none',
            borderRadius: 9,
            padding: '10px 20px',
            font: '600 13.5px "IBM Plex Sans"',
            cursor: runDisabled ? 'not-allowed' : 'pointer',
            transition: 'background .15s',
          }}
        >
          {running ? (
            <>
              <span className="spin" style={{ display: 'inline-block', width: 13, height: 13, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%' }} />
              Running…
            </>
          ) : '▶ Run extraction'}
        </button>
        <button
          onClick={onDownload}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 7,
            background: C.white,
            color: C.inkSoft,
            border: `1px solid ${C.line}`,
            borderRadius: 9,
            padding: '10px 20px',
            font: '600 13.5px "IBM Plex Sans"',
            cursor: 'pointer',
            transition: 'border-color .15s',
          }}
        >
          ↓ Download
        </button>
        <button
          onClick={onNewFile}
          style={{ background: 'none', border: 'none', font: '500 13px "IBM Plex Sans"', color: C.faint, cursor: 'pointer', padding: '10px 8px' }}
        >
          New file
        </button>
      </div>
    </div>
  );
}
