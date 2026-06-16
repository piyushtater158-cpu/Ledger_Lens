import { C } from '@/lib/colors';
import type { UploadedFile, ColumnMapping } from '@/lib/types';
import ColumnMapper from '@/components/ColumnMapper';

interface Props {
  uploadedFile: UploadedFile;
  mapping: ColumnMapping;
  onMappingChange: (m: ColumnMapping) => void;
  onConfirm: () => void;
  onBack: () => void;
}

export default function MappingScreen({ uploadedFile, mapping, onMappingChange, onConfirm, onBack }: Props) {
  return (
    <div className="fade-in" style={{ maxWidth: 720, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 28 }}>
        <div>
          <h2 style={{ font: '700 22px "IBM Plex Sans"', color: C.ink, marginBottom: 4 }}>
            Map your columns
          </h2>
          <p style={{ font: '400 14px "IBM Plex Sans"', color: C.inkFaint }}>
            <span style={{ fontFamily: 'IBM Plex Mono', fontSize: 12, background: C.greySoft, borderRadius: 4, padding: '2px 6px' }}>{uploadedFile.name}</span>
            <span style={{ marginLeft: 8 }}>{uploadedFile.rowCount} rows detected</span>
          </p>
        </div>
        <button
          onClick={onBack}
          style={{ font: '500 13px "IBM Plex Sans"', color: C.inkFaint, background: 'none', border: 'none', cursor: 'pointer', padding: '6px 0' }}
        >
          ← Change file
        </button>
      </div>

      <ColumnMapper
        headers={uploadedFile.headers}
        mapping={mapping}
        onChange={onMappingChange}
        previewRows={uploadedFile.rawData.slice(0, 3)}
      />

      <div style={{ marginTop: 28, display: 'flex', gap: 12 }}>
        <button
          onClick={onConfirm}
          disabled={!mapping.driveLink}
          style={{
            background: mapping.driveLink ? C.blue : C.greySoft,
            color: mapping.driveLink ? '#fff' : C.faint,
            border: 'none',
            borderRadius: 10,
            padding: '12px 28px',
            font: '600 14px "IBM Plex Sans"',
            cursor: mapping.driveLink ? 'pointer' : 'not-allowed',
            transition: 'background .15s',
          }}
        >
          Confirm & continue →
        </button>
      </div>
    </div>
  );
}
