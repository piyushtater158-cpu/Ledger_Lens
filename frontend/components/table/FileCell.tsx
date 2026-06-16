import { C } from '@/lib/colors';

interface Props {
  fileName: string;
}

export default function FileCell({ fileName }: Props) {
  const long = fileName.length > 40;
  const short = long ? fileName.slice(0, 40) + '…' : fileName;
  const ext = (fileName.split('.').pop() ?? '').toUpperCase().slice(0, 4) || 'FILE';
  const isDoc = ext === 'DOCX' || ext === 'DOC';

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
      <span style={{
        width: 24, height: 24, borderRadius: 6,
        background: isDoc ? '#fdf6e9' : C.greySoft,
        color: isDoc ? C.amberInk : C.inkFaint,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        font: '600 7.5px "IBM Plex Mono"', flexShrink: 0,
      }}>{ext}</span>
      <span title={long ? fileName : ''} style={{ font: '500 12.5px "IBM Plex Mono"', color: C.inkSoft, cursor: long ? 'help' : 'default' }}>
        {short}
      </span>
    </div>
  );
}
