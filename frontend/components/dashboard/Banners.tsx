import { signOut } from 'next-auth/react';
import { C } from '@/lib/colors';

interface Props {
  hasAuth: boolean;
  allDone: boolean;
  allFailed: boolean;
}

export default function Banners({ hasAuth, allDone, allFailed }: Props) {
  return (
    <>
      {hasAuth && (
        <div style={{ background: C.amberSoft, border: `1px solid ${C.amberLine}`, borderRadius: 10, padding: '12px 18px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12, font: '500 13.5px "IBM Plex Sans"', color: C.amberInk }}>
          <span>⚠</span>
          <span>Session expired — some rows could not be extracted.</span>
          <button
            onClick={() => signOut({ callbackUrl: '/' })}
            style={{ marginLeft: 'auto', background: C.amber, color: '#fff', border: 'none', borderRadius: 7, padding: '7px 16px', font: '600 12.5px "IBM Plex Sans"', cursor: 'pointer' }}
          >
            Re-authenticate
          </button>
        </div>
      )}
      {allDone && (
        <div style={{ background: C.greenSoft, border: `1px solid ${C.greenLine}`, borderRadius: 10, padding: '12px 18px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10, font: '600 13.5px "IBM Plex Sans"', color: C.greenInk }}>
          <span>✓</span> All rows extracted successfully. Download the filled file below.
        </div>
      )}
      {allFailed && (
        <div style={{ background: C.redSoft, border: `1px solid ${C.redLine}`, borderRadius: 10, padding: '12px 18px', marginBottom: 16, font: '500 13.5px "IBM Plex Sans"', color: C.redInk }}>
          ✕ All rows failed. Check Drive permissions and try again.
        </div>
      )}
    </>
  );
}
