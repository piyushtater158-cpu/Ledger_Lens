'use client';

import { C } from '@/lib/colors';
import type { ColumnMapping } from '@/lib/types';

interface Props {
  headers: string[];
  mapping: ColumnMapping;
  onChange: (m: ColumnMapping) => void;
  previewRows: Record<string, unknown>[];
}

const FIELDS: { key: keyof ColumnMapping; label: string; required: boolean }[] = [
  { key: 'driveLink', label: 'Drive / Invoice Link', required: true },
  { key: 'payee', label: 'Payee Name', required: true },
  { key: 'acct', label: 'Account Number', required: true },
  { key: 'ifsc', label: 'IFSC Code', required: true },
  { key: 'amount', label: 'Amount (optional)', required: false },
];

export default function ColumnMapper({ headers, mapping, onChange, previewRows }: Props) {
  const unconfirmed = FIELDS.filter((f) => f.required && !mapping[f.key]).length > 0;

  const select = (key: keyof ColumnMapping, value: string) =>
    onChange({ ...mapping, [key]: value });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {unconfirmed && (
        <div style={{
          background: C.amberSoft,
          border: `1px solid ${C.amberLine}`,
          borderRadius: 10,
          padding: '12px 16px',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          font: '500 13px "IBM Plex Sans"',
          color: C.amberInk,
        }}>
          <span>⚠</span>
          Some required columns could not be auto-detected. Please select them below.
        </div>
      )}

      <div style={{
        background: C.white,
        border: `1px solid ${C.line}`,
        borderRadius: 12,
        overflow: 'hidden',
      }}>
        {FIELDS.map((f, i) => {
          const val = mapping[f.key];
          const detected = headers.includes(val);
          return (
            <div
              key={f.key}
              style={{
                display: 'flex',
                alignItems: 'center',
                padding: '14px 20px',
                gap: 16,
                borderTop: i > 0 ? `1px solid ${C.lineSoft}` : 'none',
                background: !val && f.required ? '#fffdf7' : C.white,
              }}
            >
              <div style={{ flex: 1 }}>
                <span style={{ font: '600 13px "IBM Plex Sans"', color: C.ink }}>
                  {f.label}
                </span>
                {f.required && !val && (
                  <span style={{ marginLeft: 6, font: '500 11px "IBM Plex Sans"', color: C.amber }}>
                    Required
                  </span>
                )}
              </div>
              <select
                value={val}
                onChange={(e) => select(f.key, e.target.value)}
                style={{
                  padding: '8px 12px',
                  borderRadius: 8,
                  border: `1px solid ${!val && f.required ? C.amberLine : C.line}`,
                  font: '500 13px "IBM Plex Mono"',
                  color: val ? C.inkSoft : C.faint,
                  background: C.white,
                  minWidth: 200,
                  outline: 'none',
                  cursor: 'pointer',
                }}
              >
                <option value="">— Not mapped —</option>
                {headers.map((h) => (
                  <option key={h} value={h}>{h}</option>
                ))}
              </select>
              {val && (
                <span style={{
                  padding: '4px 10px',
                  borderRadius: 99,
                  background: detected ? C.greenSoft : C.greySoft,
                  color: detected ? C.greenInk : C.grey,
                  border: `1px solid ${detected ? C.greenLine : C.line}`,
                  font: '600 11px "IBM Plex Sans"',
                  whiteSpace: 'nowrap',
                }}>
                  {detected ? '✓ Matched' : 'Custom'}
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* Sheet preview */}
      {previewRows.length > 0 && (
        <div>
          <p style={{ font: '600 12px "IBM Plex Sans"', color: C.inkFaint, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Data preview (first {previewRows.length} rows)
          </p>
          <div style={{ overflowX: 'auto', borderRadius: 10, border: `1px solid ${C.line}` }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', font: '500 12px "IBM Plex Mono"', color: C.inkSoft }}>
              <thead>
                <tr style={{ background: C.greySoft }}>
                  {Object.keys(previewRows[0]).slice(0, 6).map((h) => (
                    <th key={h} style={{
                      padding: '9px 14px',
                      textAlign: 'left',
                      font: '600 11px "IBM Plex Sans"',
                      color: C.inkFaint,
                      borderBottom: `1px solid ${C.line}`,
                      whiteSpace: 'nowrap',
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {previewRows.slice(0, 3).map((row, i) => (
                  <tr key={i} style={{ borderTop: `1px solid ${C.lineSoft}` }}>
                    {Object.values(row).slice(0, 6).map((v, j) => (
                      <td key={j} style={{
                        padding: '9px 14px',
                        maxWidth: 200,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        color: C.inkSoft,
                      }}>
                        {String(v ?? '')}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
