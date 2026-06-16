// Mirrors backend/src/nodes/parseDriveFileId.js

export function parseDriveFileId(link: string): string {
  const m1 = link.match(/\/d\/([a-zA-Z0-9_-]+)/);
  const m2 = link.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  return (m1 && m1[1]) || (m2 && m2[1]) || '';
}

export function fileNameFromLink(link: string): string {
  return link.split('/').pop()?.split('?')[0] ?? '';
}
