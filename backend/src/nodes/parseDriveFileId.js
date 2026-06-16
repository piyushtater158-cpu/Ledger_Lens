/**
 * Node: "Parse Drive File ID"
 * Workflow: A (Invoice Payee Extraction — vqSkkv9egxmIVpdv)
 * Mode: runOnceForEachItem
 *
 * Purpose: Extract the Google Drive file ID from the drive link stored in `_driveLink`.
 * Handles both the `/d/<id>` URL pattern (shared file links) and `?id=<id>` query-string
 * pattern (older export links). Sets `_status` to an error string if no ID can be parsed.
 */

const link = $json._driveLink || '';
const m1 = link.match(/\/d\/([a-zA-Z0-9_-]+)/);
const m2 = link.match(/[?&]id=([a-zA-Z0-9_-]+)/);
const fileId = (m1 && m1[1]) || (m2 && m2[1]) || '';
if (!fileId) return { json: { ...$json, _status: 'Error: could not parse Drive file ID', _fileId: '' } };
return { json: { ...$json, _fileId: fileId } };
