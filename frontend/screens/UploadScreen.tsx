import { C } from '@/lib/colors';
import UploadDropzone from '@/components/UploadDropzone';

interface Props {
  onFile: (file: File) => void;
  loading: boolean;
  onGmailMode: () => void;
}

export default function UploadScreen({ onFile, loading, onGmailMode }: Props) {
  return (
    <div className="fade-in" style={{ maxWidth: 560, margin: '0 auto' }}>
      <div style={{ display: 'flex', gap: 12, marginBottom: 28 }}>
        <div
          style={{
            flex: 1, padding: '16px 20px',
            border: `2px solid ${C.blue}`,
            borderRadius: 12,
            background: C.blueSoft,
            cursor: 'default',
          }}
        >
          <div style={{ font: '600 14px "IBM Plex Sans"', color: C.blue, marginBottom: 4 }}>
            Upload a spreadsheet
          </div>
          <div style={{ font: '400 12px "IBM Plex Sans"', color: C.inkFaint }}>
            .xlsx or .csv with Google Drive links
          </div>
        </div>

        <button
          onClick={onGmailMode}
          style={{
            flex: 1, padding: '16px 20px',
            border: `1.5px solid ${C.line}`,
            borderRadius: 12,
            background: C.white,
            cursor: 'pointer',
            textAlign: 'left',
            transition: 'border-color .15s, background .15s',
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.borderColor = C.blue;
            (e.currentTarget as HTMLButtonElement).style.background = C.blueSoft;
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.borderColor = C.line;
            (e.currentTarget as HTMLButtonElement).style.background = C.white;
          }}
        >
          <div style={{ font: '600 14px "IBM Plex Sans"', color: C.ink, marginBottom: 4 }}>
            Scan Gmail
          </div>
          <div style={{ font: '400 12px "IBM Plex Sans"', color: C.inkFaint }}>
            Find invoice attachments in your email
          </div>
        </button>
      </div>

      <h2 style={{ font: '700 24px "IBM Plex Sans"', color: C.ink, marginBottom: 8 }}>
        Upload your spreadsheet
      </h2>
      <p style={{ font: '400 14px "IBM Plex Sans"', color: C.inkFaint, marginBottom: 28 }}>
        The spreadsheet should have a column with Google Drive invoice links.
      </p>
      <UploadDropzone onFile={onFile} loading={loading} />
    </div>
  );
}
