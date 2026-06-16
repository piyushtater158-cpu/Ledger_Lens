/**
 * Node: "Normalize Upload"
 * Workflow: A (Invoice Payee Extraction — vqSkkv9egxmIVpdv)
 * Mode: runOnceForEachItem
 *
 * Purpose: Normalise the incoming multipart upload so that the spreadsheet binary is
 * always available as `$binary.data`, and the forwarded Google access token is stashed
 * as `_uploadToken` on the JSON payload for downstream nodes to read.
 */

const bin = $binary?.data || $binary?.file || Object.values($binary || {})[0] || null;
if (!bin) throw new Error('No file binary found. Send multipart/form-data with field "data".');
const token = $json.body?.googleAccessToken || $json.googleAccessToken || '';
return { json: { ...$json, _uploadToken: token }, binary: { data: bin } };
