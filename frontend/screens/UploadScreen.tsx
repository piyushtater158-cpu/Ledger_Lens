import { C } from '@/lib/colors';
import UploadDropzone from '@/components/UploadDropzone';

interface Props {
  onFile: (file: File) => void;
  loading: boolean;
}

export default function UploadScreen({ onFile, loading }: Props) {
  return (
    <div className="fade-in" style={{ maxWidth: 560, margin: '0 auto' }}>
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
