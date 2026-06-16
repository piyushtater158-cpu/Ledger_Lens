'use client';

import { useRef, useState } from 'react';
import { C } from '@/lib/colors';

interface Props {
  onFile: (file: File) => void;
  loading?: boolean;
}

export default function UploadDropzone({ onFile, loading }: Props) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handle = (file: File) => {
    if (!file.name.match(/\.(xlsx|xls|csv)$/i)) {
      alert('Please upload a .xlsx, .xls, or .csv file.');
      return;
    }
    onFile(file);
  };

  return (
    <div
      onClick={() => !loading && inputRef.current?.click()}
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        const f = e.dataTransfer.files[0];
        if (f) handle(f);
      }}
      style={{
        border: `2px dashed ${dragging ? C.blue : C.line}`,
        borderRadius: 16,
        padding: '56px 40px',
        textAlign: 'center',
        background: dragging ? C.blueSoft : C.white,
        cursor: loading ? 'default' : 'pointer',
        transition: 'border-color .15s, background .15s',
        userSelect: 'none',
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".xlsx,.xls,.csv"
        style={{ display: 'none' }}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handle(f);
          e.target.value = '';
        }}
      />

      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
          <div className="spin" style={{ width: 32, height: 32, border: `3px solid ${C.line}`, borderTopColor: C.blue, borderRadius: '50%' }} />
          <span style={{ font: '500 14px "IBM Plex Sans"', color: C.inkFaint }}>Parsing file…</span>
        </div>
      ) : (
        <>
          {/* Upload arrow icon */}
          <div style={{ marginBottom: 16 }}>
            <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
              <rect width="40" height="40" rx="10" fill={C.blueSoft} />
              <path d="M20 26V18M20 18L16 22M20 18L24 22" stroke={C.blue} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M13 28h14" stroke={C.blue} strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </div>
          <p style={{ font: '600 15px "IBM Plex Sans"', color: C.ink, marginBottom: 6 }}>
            Drop your spreadsheet here
          </p>
          <p style={{ font: '400 13.5px "IBM Plex Sans"', color: C.inkFaint, marginBottom: 18 }}>
            or click to browse · .xlsx, .xls, .csv
          </p>
          <span style={{
            display: 'inline-block',
            background: C.blue,
            color: '#fff',
            borderRadius: 8,
            padding: '9px 22px',
            font: '600 13.5px "IBM Plex Sans"',
          }}>
            Choose file
          </span>
        </>
      )}
    </div>
  );
}
