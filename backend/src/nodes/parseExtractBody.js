/**
 * Node: "Parse Extract Body"
 * Workflow: D (Gmail Attachment Extract)
 * Mode: runOnceForEachItem
 */

const body = $json.body || $json;
const token = String(body.googleAccessToken || '').trim();
const messageId = String(body.messageId || '').trim();
const attachmentId = String(body.attachmentId || '').trim();
const mimeType = String(body.mimeType || '').trim();
const filename = String(body.filename || '').trim();

if (!token) throw new Error('googleAccessToken is required');
if (!messageId) throw new Error('messageId is required');
if (!attachmentId) throw new Error('attachmentId is required');
if (!mimeType) throw new Error('mimeType is required');
if (!filename) throw new Error('filename is required');

return {
  json: {
    token,
    messageId,
    attachmentId,
    mimeType,
    filename,
    _idx: 0,
  },
};
