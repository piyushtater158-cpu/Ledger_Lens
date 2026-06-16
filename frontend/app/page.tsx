'use client';

import { useSession, signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { C } from '@/lib/colors';
import Logo from '@/components/Logo';

const GoogleIcon = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
    <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4" />
    <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332C2.438 15.983 5.482 18 9 18z" fill="#34A853" />
    <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05" />
    <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0 5.482 0 2.438 2.017.957 4.958L3.964 6.29C4.672 4.163 6.656 3.58 9 3.58z" fill="#EA4335" />
  </svg>
);

export default function SignInPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === 'authenticated') router.replace('/dashboard');
  }, [status, router]);

  if (status === 'loading' || status === 'authenticated') {
    return (
      <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: C.bg }}>
        <div className="spin" style={{ width: 28, height: 28, border: `3px solid ${C.line}`, borderTopColor: C.blue, borderRadius: '50%' }} />
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      {/* Left panel */}
      <div style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        padding: '48px 56px',
        background: C.white,
        justifyContent: 'space-between',
      }}>
        {/* Logo + wordmark */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Logo size={36} />
          <span style={{ font: `700 17px "IBM Plex Sans"`, color: C.ink }}>LedgerLens</span>
        </div>

        {/* Headline + CTA */}
        <div style={{ maxWidth: 440 }}>
          <h1 style={{
            font: `700 36px/1.22 "IBM Plex Sans"`,
            color: C.ink,
            marginBottom: 14,
            letterSpacing: '-0.5px',
          }}>
            Extract invoice payee details in seconds.
          </h1>
          <p style={{ font: `400 15.5px/1.6 "IBM Plex Sans"`, color: C.inkFaint, marginBottom: 36 }}>
            Upload your spreadsheet, link to Google Drive invoices, and let AI fill in payee names, bank account numbers, and IFSC codes automatically.
          </p>

          <button
            onClick={() => signIn('google', { callbackUrl: '/dashboard' })}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 12,
              background: C.white,
              border: `1.5px solid ${C.line}`,
              borderRadius: 10,
              padding: '13px 22px',
              font: `600 14.5px "IBM Plex Sans"`,
              color: C.inkSoft,
              cursor: 'pointer',
              boxShadow: '0 2px 8px rgba(16,33,60,.06)',
              transition: 'box-shadow .15s, border-color .15s',
            }}
            onMouseEnter={(e) => {
              (e.target as HTMLElement).style.boxShadow = '0 4px 16px rgba(16,33,60,.12)';
              (e.target as HTMLElement).style.borderColor = C.blue;
            }}
            onMouseLeave={(e) => {
              (e.target as HTMLElement).style.boxShadow = '0 2px 8px rgba(16,33,60,.06)';
              (e.target as HTMLElement).style.borderColor = C.line;
            }}
          >
            <GoogleIcon />
            Sign in with Google
          </button>

          <p style={{ font: `400 12px "IBM Plex Sans"`, color: C.faint, marginTop: 14 }}>
            Requires Google Drive access to read invoices and convert DOC/DOCX files for extraction.
          </p>
        </div>

        <p style={{ font: `400 12.5px "IBM Plex Sans"`, color: C.faint }}>
          &copy; {new Date().getFullYear()} LedgerLens · Built with Gemini 2.5 Flash
        </p>
      </div>

      {/* Right panel — dark blue gradient */}
      <div style={{
        width: 480,
        flexShrink: 0,
        background: 'linear-gradient(152deg, #3a66d4 0%, #1f3f9c 50%, #152f74 100%)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 48,
        position: 'relative',
        overflow: 'hidden',
      }}>
        {/* Decorative glow */}
        <div style={{
          position: 'absolute',
          top: -80,
          right: -80,
          width: 260,
          height: 260,
          borderRadius: '50%',
          background: 'rgba(255,255,255,0.05)',
        }} />
        <div style={{
          position: 'absolute',
          bottom: -60,
          left: -60,
          width: 200,
          height: 200,
          borderRadius: '50%',
          background: 'rgba(255,255,255,0.04)',
        }} />

        {/* Preview card */}
        <div style={{
          width: '100%',
          background: 'rgba(255,255,255,0.1)',
          backdropFilter: 'blur(12px)',
          borderRadius: 16,
          border: '1px solid rgba(255,255,255,0.18)',
          padding: '24px 22px',
          boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
        }}>
          {/* Card header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
            <Logo size={28} />
            <span style={{ font: `600 13px "IBM Plex Sans"`, color: 'rgba(255,255,255,0.9)' }}>
              invoices-q4.xlsx
            </span>
            <span style={{
              marginLeft: 'auto',
              background: 'rgba(29,171,108,0.25)',
              border: '1px solid rgba(29,171,108,0.4)',
              color: '#7ef3be',
              borderRadius: 99,
              padding: '3px 10px',
              font: '600 11px "IBM Plex Sans"',
            }}>
              12 / 15 done
            </span>
          </div>

          {/* Mini table rows */}
          {[
            { file: 'invoice-001.pdf', status: 'done', payee: 'Acme Corp Ltd' },
            { file: 'invoice-002.pdf', status: 'done', payee: 'TechSupply Inc' },
            { file: 'invoice-003.pdf', status: 'processing', payee: '…' },
          ].map((r, i) => (
            <div key={i} style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '8px 0',
              borderTop: i > 0 ? '1px solid rgba(255,255,255,0.08)' : 'none',
            }}>
              <span style={{
                width: 28,
                height: 28,
                borderRadius: 6,
                background: 'rgba(255,255,255,0.1)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                font: '600 7.5px "IBM Plex Mono"',
                color: 'rgba(255,255,255,0.5)',
                flexShrink: 0,
              }}>PDF</span>
              <span style={{ font: '500 12px "IBM Plex Mono"', color: 'rgba(255,255,255,0.7)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {r.file}
              </span>
              <span style={{ font: '500 12px "IBM Plex Sans"', color: 'rgba(255,255,255,0.85)' }}>
                {r.payee}
              </span>
              <span style={{
                padding: '3px 8px',
                borderRadius: 99,
                font: '600 10.5px "IBM Plex Sans"',
                ...(r.status === 'done'
                  ? { background: 'rgba(29,171,108,0.2)', color: '#7ef3be', border: '1px solid rgba(29,171,108,0.3)' }
                  : { background: 'rgba(59,120,240,0.2)', color: '#8cb8ff', border: '1px solid rgba(59,120,240,0.3)' }),
              }}>
                {r.status === 'done' ? 'Done' : 'Running…'}
              </span>
            </div>
          ))}
        </div>

        <p style={{ marginTop: 22, font: '500 13px "IBM Plex Sans"', color: 'rgba(255,255,255,0.5)', textAlign: 'center' }}>
          AI-powered extraction · No manual data entry
        </p>
      </div>
    </div>
  );
}
