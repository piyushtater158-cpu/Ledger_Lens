# PRD V2 — Backend: Gmail Invoice Extraction

LedgerLens V2 adds Gmail-sourced invoice extraction alongside the existing spreadsheet
upload path. This document covers the two new n8n workflows, the auth/scope change, and
the mapping of new vs. reused code.

**Stack context:** n8n self-hosted at `https://n8n.piyushtater.com`. All Google API calls
use the **forwarded user Bearer token** (never stored in n8n) — identical pattern to the
existing Drive HTTP Request nodes.

---

## Auth / scope change

**File to edit:** `frontend/lib/auth.ts` line 52 (the `scope` string in `GoogleProvider`).

Add `https://www.googleapis.com/auth/gmail.readonly` alongside the existing scopes.

After the edit:
```
scope: 'openid email profile https://www.googleapis.com/auth/drive.readonly https://www.googleapis.com/auth/gmail.readonly'
```

(Also implements the pre-deploy trim: `drive` → `drive.readonly`.)

**No new n8n credentials.** Gmail API is called via `n8n-nodes-base.httpRequest` nodes
with `Authorization: Bearer {{ $json.googleAccessToken }}` — the same technique used by
"Get Drive Metadata" and "Download Invoice File" in Workflows A and B.

**Google verification note:** `gmail.readonly` is a restricted scope. It adds to the CASA
security assessment surface. Proceed under Testing mode + test users until the updated
verification is approved. Submit the verification update early — the process takes days to
weeks.

**GCP console (same OAuth client as V1):**
- Authorised JavaScript origins: unchanged.
- Authorised redirect URIs: unchanged.
- Add `gmail.readonly` scope to the OAuth consent screen's published scopes list.

---

## Workflow C — Gmail Invoice Discovery

**Webhook endpoint:** `POST /webhook/gmail-discover`
**Auth:** header `X-Admin-Token` (value = `N8N_ADMIN_TOKEN` env var, credential ID
`REIlq9U7MYnIUAey`)
**Response mode:** `responseNode` (synchronous — metadata only, no downloads, fast)

### Input JSON

```json
{
  "googleAccessToken": "<forwarded Bearer token>",
  "query": "invoice OR bill OR receipt",
  "after": 1740787200,
  "before": 1743465600,
  "maxMessages": 200
}
```

| Field | Type | Notes |
|---|---|---|
| `googleAccessToken` | string | Required. Forwarded from the user's session. |
| `query` | string | Optional. Appended to the Gmail `q` parameter. Workflow always adds `has:attachment`. |
| `after` | number | Required. Unix epoch seconds. Gmail `after:` clause. |
| `before` | number | Required. Unix epoch seconds. Gmail `before:` clause. |
| `maxMessages` | number | Optional. Default 200. Hard cap on attachments returned. |

### Workflow logic

```
Receive Gmail Discover (webhook)
  → Parse Discover Body          [Code node — NEW]
  → Search Gmail Messages        [HTTP GET gmail.googleapis.com/gmail/v1/users/me/messages]
  → Page Through Results         [Loop / Code node — NEW]
  → Fetch Message Metadata       [HTTP GET .../messages/{id}?format=full, per message]
  → Parse Attachments            [Code node — NEW]
  → Respond With Invoices        [respondToWebhook — JSON]
```

**Parse Discover Body** (Code node, `runOnceForEachItem`):
- Read `body.googleAccessToken`, `body.query`, `body.after`, `body.before`,
  `body.maxMessages` (default 200).
- Throw if token, after, or before are missing.
- Build Gmail `q`:
  ```
  has:attachment after:{after} before:{before} {query}
  ```
- Emit `{ token, q, maxMessages }`.

**Search Gmail Messages** (HTTP GET, `continueRegularOutput`):
```
https://gmail.googleapis.com/gmail/v1/users/me/messages?q={{q}}&maxResults={{maxMessages}}
Authorization: Bearer {{token}}
```
- Returns `{ messages: [{id, threadId}], nextPageToken?, resultSizeEstimate }`.
- Pagination: if `nextPageToken` is present AND the total retrieved is below `maxMessages`,
  loop with `pageToken={{nextPageToken}}`. Stop when no token or cap reached. Set
  `truncated = true` if cap was hit.
- `continueRegularOutput` so an empty result (no messages) doesn't halt the workflow.

**Fetch Message Metadata** (HTTP GET, per message, `runOnceForEachItem`):
```
https://gmail.googleapis.com/gmail/v1/users/me/messages/{id}?format=full
Authorization: Bearer {{token}}
```
- Returns the full message including `payload.parts`.

**Parse Attachments** (Code node, `runOnceForAllItems`):
- For each message, walk `payload.parts` (and nested `parts.parts`).
- Keep parts where:
  - `filename` is non-empty, AND
  - `mimeType` is `application/pdf` OR starts with `image/`.
- Extract from headers: `From` (→ `sender`), `Subject` (→ `subject`), `Date` (→
  `emailDate`, convert to ISO 8601).
- Dedup key: `messageId + ":" + attachmentId`. Drop any duplicate within a single scan.
- Build one item per qualifying attachment:
  ```json
  {
    "id": "{messageId}:{attachmentId}",
    "messageId": "...",
    "attachmentId": "...",
    "mimeType": "application/pdf",
    "filename": "invoice-march.pdf",
    "sender": "billing@vendor.com",
    "subject": "Invoice #1042",
    "emailDate": "2025-03-12T09:14:00Z"
  }
  ```
- Wrap all in `{ invoices: [...], truncated: boolean, scanned: <message count> }`.

**Respond With Invoices** (`respondToWebhook`, JSON):
```json
{
  "invoices": [...],
  "truncated": false,
  "scanned": 47
}
```

### Output contract

```ts
interface DiscoverResponse {
  invoices: GmailInvoice[];
  truncated: boolean;
  scanned: number;
}

interface GmailInvoice {
  id: string;             // "{messageId}:{attachmentId}"
  messageId: string;
  attachmentId: string;
  mimeType: string;       // "application/pdf" | "image/jpeg" | ...
  filename: string;
  sender: string;
  subject: string;
  emailDate: string;      // ISO 8601
}
```

### SDK source file
`backend/src/workflow-c-gmail-discover.ts`

New Code node JS files:
- `backend/src/nodes/parseDiscoverBody.js`
- `backend/src/nodes/parseAttachments.js`

JSON export: `backend/workflows/gmail-discover.workflow.json`

---

## Workflow D — Gmail Attachment Extract

**Webhook endpoint:** `POST /webhook/gmail-extract`
**Auth:** header `X-Admin-Token`
**Response mode:** `responseNode` (synchronous per attachment)

### Input JSON

```json
{
  "googleAccessToken": "<forwarded Bearer token>",
  "messageId": "18f3c...",
  "attachmentId": "ANGjdJ...",
  "mimeType": "application/pdf",
  "filename": "invoice-march.pdf"
}
```

All fields required.

### Workflow logic

```
Receive Gmail Extract (webhook)
  → Parse Extract Body           [Code node — NEW, mirrors parseRequestBody.js]
  → Fetch Attachment Bytes       [HTTP GET .../messages/{messageId}/attachments/{attachmentId}]
  → Restore Row After Download   [Code node — NEW adapter, aliased to THIS NAME]
  → Is Image File?               [IF — reused from Workflow B]
  ├─ true  → OpenRouter Analyze Image   → Parse Image Result   → Merge Results
  └─ false → OpenRouter Analyze Document → Parse Document Result → Merge Results
                                   ↓
  → Respond With Result          [respondToWebhook — JSON]
  (→ Respond Unsupported        [on false branch of Is Extractable? — reused])
```

**Parse Extract Body** (Code node, `runOnceForEachItem`):
- Mirror `backend/src/nodes/parseRequestBody.js` from Workflow B.
- Extract `body.googleAccessToken`, `body.messageId`, `body.attachmentId`,
  `body.mimeType`, `body.filename`.
- Throw if any field is missing.
- Emit `{ token, messageId, attachmentId, mimeType, filename, _idx: 0 }`.

**Fetch Attachment Bytes** (HTTP GET, `continueRegularOutput`):
```
https://gmail.googleapis.com/gmail/v1/users/me/messages/{messageId}/attachments/{attachmentId}
Authorization: Bearer {{token}}
```
- Returns `{ data: "<base64url-encoded bytes>", size: <bytes> }`.
- Gmail uses base64url (URL-safe: `-` instead of `+`, `_` instead of `/`). The adapter
  node must convert to standard base64 before creating a Buffer.

**Restore Row After Download** (Code node — **THIS IS THE KEY ADAPTER NODE**):

This node's name MUST be exactly `Restore Row After Download`. `prepareOpenRouterPayload.js`
references it as `$('Restore Row After Download').item.json`.

Logic:
1. Read `$json.data` (base64url string) from the HTTP response.
2. If absent → emit `{ ..., _downloadFailed: true, _status: 'Error: attachment fetch failed' }`.
3. Convert base64url → standard base64 → `Buffer.from(b64, 'base64')`.
4. Set as binary property `invoiceFile` (same property name read by `prepareOpenRouterPayload.js`).
5. Determine `_fileClass`:
   - `mimeType === 'application/pdf'` → `'document'`, `_geminiMimeType = 'application/pdf'`
   - `mimeType.startsWith('image/')` → `'image'`, `_geminiMimeType = mimeType`
6. Emit the `_`-prefixed row shape the downstream nodes expect:
   ```json
   {
     "_fileClass": "document",
     "_mimeType": "application/pdf",
     "_geminiMimeType": "application/pdf",
     "_fileName": "invoice-march.pdf",
     "_downloadFailed": false,
     "_idx": 0,
     "token": "...",
     "messageId": "...",
     "attachmentId": "..."
   }
   ```

Everything after this node is reused verbatim from Workflow B:
- `Is Image File?` (same IF node conditions)
- `OpenRouter Analyze Image` / `OpenRouter Analyze Document` (same `prepareOpenRouterPayload.js`)
- OpenRouter HTTP Request node (same credential, same URL)
- `Parse Image Result` / `Parse Document Result` (same `parseRowResult.js`)
- `Merge Results` (append)
- `Respond With Result` (same JSON response)
- `Respond Unsupported` (same, for mime types outside pdf/image)

### Output contract

Identical to Workflow B:
```json
{
  "payee": "Acme Corp",
  "accountNumber": "1234567890",
  "ifsc": "HDFC0001234",
  "amount": "12500.00",
  "confidence": 0.95,
  "status": "done"
}
```

Error cases:
- Attachment fetch fails → `status: "Error: attachment fetch failed"`
- Unsupported mime type → `status: "unsupported"`
- Model extracts nothing → `confidence: 0`, fields empty, `status: "done"` (let the user re-run)

### SDK source file
`backend/src/workflow-d-gmail-extract.ts`

New Code node JS files:
- `backend/src/nodes/parseExtractBody.js`
- `backend/src/nodes/gmailAttachmentToInvoiceFile.js` (implements the adapter; aliased as
  `Restore Row After Download` in the workflow node config)

JSON export: `backend/workflows/gmail-extract.workflow.json`

---

## Reuse map

| Component | Source | Status |
|---|---|---|
| `prepareOpenRouterPayload.js` | `backend/src/nodes/` | **Reused verbatim** |
| `parseRowResult.js` | `backend/src/nodes/` | **Reused verbatim** |
| OpenRouter HTTP Request node config | Workflow B | **Reused verbatim** |
| `Is Image File?` IF node | Workflow B | **Reused verbatim** |
| `Merge Results` merge node | Workflow B | **Reused verbatim** |
| `Respond With Result` / `Respond Unsupported` | Workflow B | **Reused verbatim** |
| `Build Gmail Query` → `Parse Attachments` | — | **NEW** (Workflow C) |
| `Parse Extract Body` | mirrors `parseRequestBody.js` | **NEW** (Workflow D) |
| `Restore Row After Download` Gmail adapter | — | **NEW** (Workflow D, critical seam) |

---

## n8n setup checklist (after import)

1. Import `gmail-discover.workflow.json` → note new workflow ID.
2. Import `gmail-extract.workflow.json` → note new workflow ID.
3. For both workflows, assign credentials in n8n UI:
   - Webhook node: Admin Token (httpHeaderAuth, ID `REIlq9U7MYnIUAey`)
   - OpenRouter nodes in Workflow D: OpenRouter API (`bDCaYQ5pU52IShxl`)
   - All HTTP Request nodes (Gmail + OpenRouter HTTP call): **no stored credential**
     (token forwarded at runtime).
4. **Activate** both workflows. Inactive → `/webhook-test/*` only.
5. Update `backend/config/credentials.md` with both new workflow IDs.

---

## V2 n8n webhook table (updated)

| Workflow | Endpoint | Input | Output |
|---|---|---|---|
| A — Invoice Payee Extraction | `POST /webhook/extract` | multipart: `file` + `googleAccessToken` | Filled `.xlsx` binary |
| B — Invoice Extract Row | `POST /webhook/extract-row` | JSON `{ driveLink, googleAccessToken }` | JSON `{ payee, accountNumber, ifsc, amount, confidence, status }` |
| C — Gmail Invoice Discovery | `POST /webhook/gmail-discover` | JSON `{ googleAccessToken, query, after, before, maxMessages }` | JSON `{ invoices[], truncated, scanned }` |
| D — Gmail Attachment Extract | `POST /webhook/gmail-extract` | JSON `{ googleAccessToken, messageId, attachmentId, mimeType, filename }` | JSON `{ payee, accountNumber, ifsc, amount, confidence, status }` |

All require header `X-Admin-Token`.

---

## Out of scope (V2 backend)

- Invoice links in email body (no link parsing)
- Drive/Sheets write (no new write scope)
- Persistent job store or audit trail
- Multi-account Gmail
- Non-PDF/image attachments (xlsx, zip, docx)
- Scheduled / recurring Gmail scans

---

## SDK build path

Same mandatory order as V1:

```
get_sdk_reference
  → get_suggested_nodes
  → search_nodes  (gmail, http request, webhook, code, if, merge)
  → get_node_types
  → write workflow-c-gmail-discover.ts
  → validate_node_config (per node)
  → validate_workflow
  → create_workflow_from_code

(repeat for workflow-d-gmail-extract.ts)
```
