/**
 * Workflow C — Gmail Invoice Discovery
 * Webhook: POST /webhook/gmail-discover
 * Input: { googleAccessToken, query?, after, before, maxMessages? }
 * Output: { invoices, truncated, scanned }
 */

import { workflow, trigger, node, expr } from '@n8n/workflow-sdk';

const receiveGmailDiscover = trigger({
  type: 'n8n-nodes-base.webhook',
  version: 2.1,
  config: {
    name: 'Receive Gmail Discover',
    parameters: {
      httpMethod: 'POST',
      path: 'gmail-discover',
      authentication: 'headerAuth',
      responseMode: 'responseNode',
      options: {},
    },
  },
});

const parseDiscoverBody = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Parse Discover Body',
    parameters: {
      mode: 'runOnceForEachItem',
      jsCode: `
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
const baseQuery = \`has:attachment after:\${Math.floor(after)} before:\${Math.floor(before)}\`;
const q = query ? \`\${baseQuery} \${query}\` : baseQuery;
return { json: { token, q, maxMessages } };
`,
    },
  },
});

const searchGmailMessages = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.4,
  config: {
    name: 'Search Gmail Messages',
    onError: 'continueRegularOutput',
    parameters: {
      method: 'GET',
      url: expr(`{{ "https://gmail.googleapis.com/gmail/v1/users/me/messages?q=" + encodeURIComponent($json.q) + "&maxResults=" + ($json.maxMessages || 200) }}`),
      sendHeaders: true,
      specifyHeaders: 'keypair',
      headerParameters: {
        parameters: [{ name: 'Authorization', value: expr(`{{ "Bearer " + $json.token }}`) }],
      },
      options: { response: { response: { neverError: true } } },
    },
  },
});

const expandMessageIds = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Expand Message IDs',
    parameters: {
      mode: 'runOnceForAllItems',
      jsCode: `
const seed = $('Parse Discover Body').first().json;
const first = $input.first()?.json || {};
const messages = Array.isArray(first.messages) ? first.messages : [];
if (!messages.length) return [{ json: { token: seed.token, maxMessages: seed.maxMessages, _empty: true } }];
return messages.slice(0, seed.maxMessages || 200).map((m) => ({
  json: { token: seed.token, maxMessages: seed.maxMessages, messageId: m.id, threadId: m.threadId || '' },
}));
`,
    },
  },
});

const fetchMessageMetadata = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.4,
  config: {
    name: 'Fetch Message Metadata',
    onError: 'continueRegularOutput',
    parameters: {
      method: 'GET',
      url: expr(`{{ "https://gmail.googleapis.com/gmail/v1/users/me/messages/" + $json.messageId + "?format=full" }}`),
      sendHeaders: true,
      specifyHeaders: 'keypair',
      headerParameters: {
        parameters: [{ name: 'Authorization', value: expr(`{{ "Bearer " + $json.token }}`) }],
      },
      options: { response: { response: { neverError: true } } },
    },
  },
});

const parseAttachments = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Parse Attachments',
    parameters: {
      mode: 'runOnceForAllItems',
      jsCode: `
function toIsoDate(headerDate) {
  if (!headerDate) return '';
  const parsed = new Date(headerDate);
  return Number.isNaN(parsed.getTime()) ? '' : parsed.toISOString();
}
function headerValue(headers, name) {
  const match = (headers || []).find((h) => String(h.name || '').toLowerCase() === name.toLowerCase());
  return String(match?.value || '').trim();
}
function collectParts(part, out) {
  if (!part) return;
  const filename = String(part.filename || '').trim();
  const mimeType = String(part.mimeType || '').trim();
  const attachmentId = String(part.body?.attachmentId || '').trim();
  if (filename && attachmentId && (mimeType === 'application/pdf' || mimeType.startsWith('image/'))) {
    out.push({ filename, mimeType, attachmentId });
  }
  for (const child of part.parts || []) collectParts(child, out);
}
const searchResult = $('Search Gmail Messages').first()?.json || {};
if (searchResult.error) {
  const err = searchResult.error;
  const code = err.code || err.status || 500;
  const details = Array.isArray(err.details) ? err.details : [];
  const scopeInsufficient =
    code === 403 ||
    details.some((d) => d.reason === 'ACCESS_TOKEN_SCOPE_INSUFFICIENT');
  const message = scopeInsufficient
    ? 'Gmail permission denied — sign out and sign in again to grant Gmail read access'
    : String(err.message || 'Gmail API error');
  return [{ json: { error: message, errorCode: code, invoices: [], truncated: false, scanned: 0 } }];
}
const input = $input.all();
const seed = $('Parse Discover Body').first().json || {};
const seen = new Set();
const invoices = [];
let scanned = 0;
for (const item of input) {
  const message = item.json || {};
  if (message.error || !message.id) continue;
  scanned += 1;
  const headers = message.payload?.headers || [];
  const sender = headerValue(headers, 'From');
  const subject = headerValue(headers, 'Subject');
  const emailDate = toIsoDate(headerValue(headers, 'Date'));
  const parts = [];
  collectParts(message.payload, parts);
  for (const part of parts) {
    const key = \`\${message.id}:\${part.attachmentId}\`;
    if (seen.has(key)) continue;
    seen.add(key);
    invoices.push({ id: key, messageId: message.id, attachmentId: part.attachmentId, mimeType: part.mimeType, filename: part.filename, sender, subject, emailDate });
  }
}
const maxMessages = seed.maxMessages || 200;
const truncated = invoices.length >= maxMessages;
return [{ json: { invoices: truncated ? invoices.slice(0, maxMessages) : invoices, truncated, scanned } }];
`,
    },
  },
});

const respondWithInvoices = node({
  type: 'n8n-nodes-base.respondToWebhook',
  version: 1.5,
  config: {
    name: 'Respond With Invoices',
    parameters: {
      respondWith: 'json',
      responseBody: expr(`{{ JSON.stringify($json) }}`),
      options: {
        responseCode: 200,
        responseHeaders: { entries: [{ name: 'Access-Control-Allow-Origin', value: '*' }] },
      },
    },
  },
});

export default workflow('gmail-discover-v2-local', 'Gmail Invoice Discovery')
  .add(receiveGmailDiscover)
  .to(parseDiscoverBody)
  .to(searchGmailMessages)
  .to(expandMessageIds)
  .to(fetchMessageMetadata)
  .to(parseAttachments)
  .to(respondWithInvoices);
