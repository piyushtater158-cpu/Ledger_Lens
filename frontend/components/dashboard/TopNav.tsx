import { signOut } from 'next-auth/react';
import type { Session } from 'next-auth';
import { C } from '@/lib/colors';
import Logo from '@/components/Logo';
import StepBar from '@/components/StepBar';
import type { Screen } from '@/lib/types';

interface Props {
  session: Session | null;
  screen: Screen;
  userName: string;
  userInitials: string;
}

export default function TopNav({ session, screen, userName, userInitials }: Props) {
  return (
    <nav style={{
      position: 'sticky',
      top: 0,
      zIndex: 40,
      background: 'rgba(255,255,255,0.92)',
      backdropFilter: 'blur(12px)',
      borderBottom: `1px solid ${C.lineSoft}`,
      display: 'flex',
      alignItems: 'center',
      padding: '0 32px',
      height: 56,
      gap: 16,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
        <Logo size={28} />
        <span style={{ font: '700 15px "IBM Plex Sans"', color: C.ink }}>LedgerLens</span>
      </div>

      <div style={{ flex: 1, display: 'flex', justifyContent: 'center' }}>
        <StepBar screen={screen} />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ font: '500 13px "IBM Plex Sans"', color: C.inkFaint }}>{userName}</span>
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: '50%',
            background: 'linear-gradient(135deg, #3b78f0, #2356c8)',
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            font: '700 12px "IBM Plex Sans"',
            cursor: 'pointer',
            flexShrink: 0,
          }}
          title="Sign out"
          onClick={() => signOut({ callbackUrl: '/' })}
        >
          {session?.user?.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={session.user.image} alt={userName} style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} />
          ) : (userInitials || '?')}
        </div>
      </div>
    </nav>
  );
}
