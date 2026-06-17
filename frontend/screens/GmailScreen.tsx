'use client';
import { useState } from 'react';
import { C } from '@/lib/colors';
import type { GmailDiscoverParams } from '@/lib/api';

type Preset = 'thisMonth' | 'lastMonth' | '3months' | 'custom';

function getRange(preset: Preset, customFrom: string, customTo: string): { after: number; before: number } | null {
  const now = new Date();
  if (preset === 'thisMonth') {
    const after = Math.floor(new Date(now.getFullYear(), now.getMonth(), 1).getTime() / 1000);
    const before = Math.floor(Date.now() / 1000) + 86400;
    return { after, before };
  }
  if (preset === 'lastMonth') {
    const after = Math.floor(new Date(now.getFullYear(), now.getMonth() - 1, 1).getTime() / 1000);
    const before = Math.floor(new Date(now.getFullYear(), now.getMonth(), 1).getTime() / 1000);
    return { after, before };
  }
  if (preset === '3months') {
    const after = Math.floor(new Date(now.getFullYear(), now.getMonth() - 3, now.getDate()).getTime() / 1000);
    const before = Math.floor(Date.now() / 1000) + 86400;
    return { after, before };
  }
  if (preset === 'custom') {
    if (!customFrom || !customTo) return null;
    const after = Math.floor(new Date(customFrom).getTime() / 1000);
    const before = Math.floor(new Date(customTo).getTime() / 1000) + 86400;
    return { after, before };
  }
  return null;
}

interface Props {
  onScan: (params: GmailDiscoverParams) => void;
  loading: boolean;
  onBack: () => void;
}

const PRESETS: { value: Preset; label: string }[] = [
  { value: 'thisMonth', label: 'This month' },
  { value: 'lastMonth', label: 'Last month' },
  { value: '3months', label: 'Last 3 months' },
  { value: 'custom', label: 'Custom' },
];

export default function GmailScreen({ onScan, loading, onBack }: Props) {
  const [preset, setPreset] = useState<Preset>('lastMonth');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [keyword, setKeyword] = useState('');

  const range = getRange(preset, customFrom, customTo);
  const canScan = !loading && range !== null;

  const handleScan = () => {
    if (!range) return;
    onScan({
      query: keyword.trim() || undefined,
      after: range.after,
      before: range.before,
      maxMessages: 200,
    });
  };

  return (
    <div className="fade-in" style={{ maxWidth: 520, margin: '0 auto' }}>
      <button
        onClick={onBack}
        style={{
          background: 'none', border: 'none', cursor: 'pointer',
          font: '400 13px "IBM Plex Sans"', color: C.blue,
          padding: '0 0 20px 0', display: 'block',
        }}
      >
        ← Upload a spreadsheet instead
      </button>

      <h2 style={{ font: '700 24px "IBM Plex Sans"', color: C.ink, marginBottom: 8 }}>
        Scan Gmail for invoices
      </h2>
      <p style={{ font: '400 14px "IBM Plex Sans"', color: C.inkFaint, marginBottom: 28 }}>
        Finds invoice PDF attachments from your emails. Decorative images and non-payment receipts are skipped automatically.
      </p>

      <div style={{ marginBottom: 24 }}>
        <label style={{ display: 'block', font: '600 12px "IBM Plex Sans"', color: C.inkFaint, marginBottom: 10, letterSpacing: '0.3px', textTransform: 'uppercase' }}>
          Date range
        </label>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {PRESETS.map(({ value, label }) => (
            <button
              key={value}
              onClick={() => setPreset(value)}
              style={{
                padding: '7px 14px',
                borderRadius: 8,
                border: `1.5px solid ${preset === value ? C.blue : C.line}`,
                background: preset === value ? C.blueSoft : C.white,
                color: preset === value ? C.blue : C.inkSoft,
                font: `${preset === value ? '600' : '400'} 13px "IBM Plex Sans"`,
                cursor: 'pointer',
                transition: 'all .15s',
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {preset === 'custom' && (
          <div style={{ display: 'flex', gap: 12, marginTop: 14, alignItems: 'center' }}>
            <div style={{ flex: 1 }}>
              <label style={{ display: 'block', font: '500 12px "IBM Plex Sans"', color: C.inkFaint, marginBottom: 4 }}>From</label>
              <input
                type="date"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
                style={{
                  width: '100%', padding: '8px 10px',
                  border: `1px solid ${C.line}`, borderRadius: 8,
                  font: '400 13px "IBM Plex Sans"', color: C.ink, background: C.white,
                  outline: 'none',
                }}
              />
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ display: 'block', font: '500 12px "IBM Plex Sans"', color: C.inkFaint, marginBottom: 4 }}>To</label>
              <input
                type="date"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
                style={{
                  width: '100%', padding: '8px 10px',
                  border: `1px solid ${C.line}`, borderRadius: 8,
                  font: '400 13px "IBM Plex Sans"', color: C.ink, background: C.white,
                  outline: 'none',
                }}
              />
            </div>
          </div>
        )}
      </div>

      <div style={{ marginBottom: 24 }}>
        <label style={{ display: 'block', font: '600 12px "IBM Plex Sans"', color: C.inkFaint, marginBottom: 6, letterSpacing: '0.3px', textTransform: 'uppercase' }}>
          Gmail search keywords (optional)
        </label>
        <input
          type="text"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          placeholder="invoice OR bill OR receipt OR tax"
          style={{
            width: '100%', padding: '10px 12px',
            border: `1px solid ${C.line}`, borderRadius: 8,
            font: '400 13px "IBM Plex Sans"', color: C.ink, background: C.white,
            outline: 'none', boxSizing: 'border-box',
          }}
        />
        <p style={{ font: '400 12px "IBM Plex Sans"', color: C.faint, marginTop: 5 }}>
          Searches email subjects, senders, and body text. Attachments only.
        </p>
      </div>

      <p style={{ font: '400 12px "IBM Plex Sans"', color: C.faint, marginBottom: 20 }}>
        Scanning up to 200 invoice attachments. Narrow the date range or keywords if you need fewer.
      </p>

      <button
        onClick={handleScan}
        disabled={!canScan}
        style={{
          width: '100%', padding: '12px 0',
          background: canScan ? C.blue : C.greySoft,
          color: canScan ? C.white : C.faint,
          border: 'none', borderRadius: 10,
          font: '600 14px "IBM Plex Sans"', cursor: canScan ? 'pointer' : 'not-allowed',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          transition: 'background .15s',
        }}
      >
        {loading && (
          <span
            style={{
              width: 14, height: 14,
              border: `2px solid rgba(255,255,255,.4)`,
              borderTopColor: C.white,
              borderRadius: '50%',
              display: 'inline-block',
              animation: 'spin 0.6s linear infinite',
            }}
          />
        )}
        {loading ? 'Scanning…' : 'Scan Gmail for invoices'}
      </button>
    </div>
  );
}
