/**
 * Node: "Parse Discover Body"
 * Workflow: C (Gmail Invoice Discovery)
 * Mode: runOnceForEachItem
 */

const body = $json.body || $json;
const token = body.googleAccessToken || '';
const query = String(body.query || '').trim();
const after = Number(body.after);
const before = Number(body.before);
const requestedMax = Number(body.maxMessages);
const maxMessages = Number.isFinite(requestedMax) && requestedMax > 0
  ? Math.min(Math.floor(requestedMax), 500)
  : 200;

if (!token) throw new Error('googleAccessToken is required');
if (!Number.isFinite(after)) throw new Error('after is required (unix epoch seconds)');
if (!Number.isFinite(before)) throw new Error('before is required (unix epoch seconds)');

const baseQuery = `has:attachment after:${Math.floor(after)} before:${Math.floor(before)}`;
const q = query ? `${baseQuery} ${query}` : baseQuery;

return { json: { token, q, maxMessages } };
