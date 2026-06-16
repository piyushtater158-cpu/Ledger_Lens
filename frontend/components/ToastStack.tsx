import { C } from '@/lib/colors';
import type { Toast } from '@/lib/types';

const ACCENT: Record<string, string> = {
  success: C.green,
  info: C.blue,
  error: C.red,
};

export default function ToastStack({ toasts }: { toasts: Toast[] }) {
  if (toasts.length === 0) return null;
  return (
    <div
      style={{
        position: 'fixed',
        right: 22,
        bottom: 22,
        zIndex: 80,
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        alignItems: 'flex-end',
        pointerEvents: 'none',
      }}
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          className="toast-in"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            background: '#fff',
            border: `1px solid ${C.line}`,
            borderLeft: `3px solid ${ACCENT[t.kind] ?? C.blue}`,
            borderRadius: 10,
            padding: '11px 15px',
            boxShadow: '0 10px 30px -8px rgba(16,33,60,.22)',
            font: `500 13px "IBM Plex Sans"`,
            color: C.ink,
            minWidth: 210,
            pointerEvents: 'auto',
          }}
        >
          <span
            style={{
              width: 7,
              height: 7,
              borderRadius: '50%',
              background: ACCENT[t.kind] ?? C.blue,
              flexShrink: 0,
            }}
          />
          {t.text}
        </div>
      ))}
    </div>
  );
}
