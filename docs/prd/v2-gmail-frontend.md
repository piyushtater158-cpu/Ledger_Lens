> **Status: implemented and live.** The Gmail scan flow, the auth scope change below, and
> workflows C/D are already shipped and active in n8n. This doc is kept as the design
> record; for current behavior see the root [README.md](../../README.md),
> [backend/README.md](../../backend/README.md), and
> [backend/config/v2-gmail-contracts.md](../../backend/config/v2-gmail-contracts.md).

# PRD V2 — Frontend: Gmail Invoice Extraction

LedgerLens V2 adds a second entry mode — "Scan Gmail" — to the existing dashboard. Users
pick a date range and optional keyword, the app discovers invoice attachments from their
Gmail, then extracts payee / account / IFSC / amount per attachment with live progressive
results. The spreadsheet upload path is unchanged.

**Stack context:** Next.js 15 App Router, NextAuth.js v4, client-side xlsx generation
(`frontend/lib/excel.ts`), n8n proxy pattern (no client-to-n8n direct calls).

---

## Auth / scope change

**File:** `frontend/lib/auth.ts` line 52

Change the `scope` string from:
```
openid email profile https://www.googleapis.com/auth/drive
```
to:
```
openid email profile https://www.googleapis.com/auth/drive.readonly https://www.googleapis.com/auth/gmail.readonly
```

This is a combined change: the V1 pre-deploy `drive` → `drive.readonly` trim, plus the
new `gmail.readonly` scope for V2.

Because `prompt: 'consent'` is already set, existing signed-in users will be re-prompted
on next sign-in to grant the broader scope.

**GCP console:** Add `gmail.readonly` to the OAuth consent screen's published scopes. No
redirect URI changes needed.

---

## New API routes

Both follow the proxy pattern in `frontend/app/api/extract/route.ts` exactly: read
session, 401/503 guards, forward to n8n with `X-Admin-Token`, return n8n's response.

### `frontend/app/api/gmail-discover/route.ts`

`POST` only.

Request body (from the browser):
```json
{
  "query": "invoice OR bill",
  "after": 1740787200,
  "before": 1743465600,
  "maxMessages": 200
}
```

Handler steps:
1. `getServerSession(authOptions)` — 401 if no session or `RefreshAccessTokenError`.
2. `getN8nAdminToken()` — 503 if missing.
3. Merge `googleAccessToken: session.accessToken` into the body.
4. `fetch(`${N8N_BASE_URL}/webhook/gmail-discover`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Admin-Token': adminToken }, body: JSON.stringify({...body, googleAccessToken}) })`.
5. Return `NextResponse.json(await n8nRes.json())` on success.
6. On n8n error: return `NextResponse.json({ error: text }, { status: n8nRes.status })`.

### `frontend/app/api/gmail-extract/route.ts`

`POST` only.

Request body:
```json
{
  "messageId": "18f3c...",
  "attachmentId": "ANGjdJ...",
  "mimeType": "application/pdf",
  "filename": "invoice-march.pdf"
}
```

Same guard + proxy pattern as `gmail-discover`. Forwards to `/webhook/gmail-extract`.
Returns the per-attachment result JSON directly.

---

## `frontend/lib/api.ts` additions

Add two wrappers alongside the existing `extractFile` / `extractRow`:

```ts
export interface GmailDiscoverParams {
  query?: string;
  after: number;    // epoch seconds
  before: number;   // epoch seconds
  maxMessages?: number;
}

export interface GmailInvoice {
  id: string;
  messageId: string;
  attachmentId: string;
  mimeType: string;
  filename: string;
  sender: string;
  subject: string;
  emailDate: string;  // ISO 8601
}

export interface DiscoverResponse {
  invoices: GmailInvoice[];
  truncated: boolean;
  scanned: number;
}

export async function discoverGmail(params: GmailDiscoverParams): Promise<DiscoverResponse> {
  const res = await fetch('/api/gmail-discover', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({ error: 'Failed' }));
    throw makeFetchError(errBody.error ?? res.statusText, res.status, errBody);
  }
  return res.json();
}

export interface ExtractGmailAttachmentParams {
  messageId: string;
  attachmentId: string;
  mimeType: string;
  filename: string;
}

export async function extractGmailAttachment(params: ExtractGmailAttachmentParams): Promise<ExtractRowResult> {
  const res = await fetch('/api/gmail-extract', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({ error: 'Failed' }));
    throw makeFetchError(errBody.error ?? res.statusText, res.status, errBody);
  }
  return res.json();
}
```

`ExtractRowResult` is the existing interface — `{ payee, accountNumber, ifsc, amount, confidence, status }`.

---

## Data model changes (`frontend/lib/types.ts`)

### `Screen` type

```ts
export type Screen = 'upload' | 'mapping' | 'dashboard' | 'gmail';
```

### `InvoiceRow` — add optional provenance fields

```ts
export interface InvoiceRow {
  id: string;
  index: number;
  fileName: string;
  driveLink: string;         // empty string for Gmail rows
  payee: string;
  acct: string;
  ifsc: string;
  amount: string;
  status: RowStatus;
  error?: string;
  errorType?: 'auth' | 'drive' | 'gemini' | 'other';
  confidence?: number;
  // V2 additions
  source: 'sheet' | 'gmail';
  sender?: string;
  subject?: string;
  emailDate?: string;        // ISO 8601
  attachmentName?: string;
  messageId?: string;
  attachmentId?: string;
}
```

`source` defaults to `'sheet'` for all existing V1 rows (backward-compatible — add it
when constructing rows in `useFileUpload`).

### New `GmailInvoice` type

```ts
export interface GmailInvoice {
  id: string;
  messageId: string;
  attachmentId: string;
  mimeType: string;
  filename: string;
  sender: string;
  subject: string;
  emailDate: string;
}
```

---

## New screen: `frontend/screens/GmailScreen.tsx`

Shown when `screen === 'gmail'`. Collected before scanning; does not overlap with the
mapping screen (Gmail rows have no column mapping step).

### UI elements

**Date range presets** (radio/button group):
- This month (1st of current month → today)
- Last month (1st–last day of previous month)
- Last 3 months
- Custom (shows two date pickers: From / To)

Presets compute `after`/`before` epoch values on the client.

**Keyword field** (optional text input):
- Placeholder: `invoice OR bill OR receipt OR tax`
- Label: "Gmail search keywords (optional)"
- Helper text: "Searches email subjects, senders, and body text. Attachments only."

**Max results note** (static text, not a field):
"Scanning up to 200 invoice attachments. Narrow the date range or keywords if you need fewer."

**Scan button:** "Scan Gmail for invoices" — triggers `runGmail`. Shows a spinner while
Workflow C discovery is in progress (usually a few seconds). Disabled while running.

**Back link:** "← Upload a spreadsheet instead" — returns to `screen: 'upload'`.

### Props

```ts
interface GmailScreenProps {
  onScan: (params: GmailDiscoverParams) => void;
  loading: boolean;
}
```

---

## Upload screen changes (`frontend/screens/UploadScreen.tsx`)

Add a mode chooser above the existing dropzone:

```
[ Upload a spreadsheet ]   [ Scan Gmail ]
```

Two cards or tabs. Clicking "Scan Gmail" sets `screen: 'gmail'`. Clicking "Upload a
spreadsheet" keeps current behaviour. The existing dropzone is shown only when the
spreadsheet tab is active.

---

## `frontend/hooks/useInvoiceExtraction.ts` — new `runGmail`

Add alongside `runAll` and `rerun`:

```ts
const runGmail = useCallback(async (params: GmailDiscoverParams) => {
  if (running) return;
  setRunning(true);

  try {
    // Step 1: discover attachments (fast — metadata only)
    const { invoices, truncated, scanned } = await discoverGmail(params);

    if (!invoices.length) {
      toast(`No invoice attachments found in ${scanned} emails scanned`, 'info');
      setRunning(false);
      return;
    }

    if (truncated) {
      toast(`Showing first 200 attachments — narrow the date range or keywords to see all`, 'info');
    }

    // Step 2: populate rows immediately as 'pending' so the dashboard shows them
    const pendingRows: InvoiceRow[] = invoices.map((inv, i) => ({
      id: inv.id,
      index: i,
      fileName: inv.filename,
      driveLink: '',
      payee: '', acct: '', ifsc: '', amount: '',
      status: 'pending',
      source: 'gmail',
      sender: inv.sender,
      subject: inv.subject,
      emailDate: inv.emailDate,
      attachmentName: inv.filename,
      messageId: inv.messageId,
      attachmentId: inv.attachmentId,
    }));
    setRows(pendingRows);

    // Step 3: fan out per-attachment extraction with concurrency limit ~4
    const CONCURRENCY = 4;
    const queue = [...pendingRows];

    async function processOne(row: InvoiceRow) {
      setRows((prev) => prev.map((r) => r.id === row.id ? { ...r, status: 'processing' } : r));
      try {
        const data = await extractGmailAttachment({
          messageId: row.messageId!,
          attachmentId: row.attachmentId!,
          mimeType: invoices.find((inv) => inv.id === row.id)?.mimeType ?? 'application/pdf',
          filename: row.fileName,
        });
        const status = normalizeRowStatus(data.status);
        setRows((prev) =>
          prev.map((r) =>
            r.id === row.id
              ? {
                  ...r,
                  payee: data.payee ?? r.payee,
                  acct: data.accountNumber ?? r.acct,
                  ifsc: data.ifsc ?? r.ifsc,
                  amount: data.amount ?? r.amount,
                  status,
                  error: rowStatusErrorMessage(data.status),
                  confidence: data.confidence,
                }
              : r
          )
        );
      } catch (e: unknown) {
        const err = e as { message?: string };
        setRows((prev) =>
          prev.map((r) => r.id === row.id ? { ...r, status: 'error', error: err.message ?? 'Network error' } : r)
        );
      }
    }

    // Simple concurrency pool
    let i = 0;
    async function runPool() {
      while (i < queue.length) {
        const batch = queue.slice(i, i + CONCURRENCY);
        i += CONCURRENCY;
        await Promise.all(batch.map(processOne));
      }
    }
    await runPool();

    const finalRows = /* read from latest state via ref or pass snapshot */ [];
    const done = finalRows.filter((r: InvoiceRow) => r.status === 'done').length;
    toast(`Extraction complete — ${done} of ${pendingRows.length} done`, 'success');

  } catch (e: unknown) {
    const err = e as { status?: number; message?: string };
    if (err.status === 401) {
      toast('Session expired — please sign in again', 'error');
    } else {
      toast(`Gmail scan failed: ${err.message ?? 'Unknown error'}`, 'error');
    }
  } finally {
    setRunning(false);
  }
}, [running, toast]);
```

**Notes for implementation:**
- Use a `useRef` to hold the latest `rows` state snapshot for the final toast count (avoids
  stale closure).
- The concurrency pool above is illustrative; use `p-limit` or an equivalent if available,
  or implement with a counter and Promises directly.

### `rerun` changes for Gmail rows

Route by `row.source`:

```ts
const rerun = useCallback(async (rowId: string) => {
  const row = rows.find((r) => r.id === rowId);
  if (!row) return;

  if (row.source === 'gmail') {
    // Gmail re-run
    setRows((prev) => prev.map((r) => r.id === rowId ? { ...r, status: 'processing' } : r));
    try {
      const data = await extractGmailAttachment({
        messageId: row.messageId!,
        attachmentId: row.attachmentId!,
        mimeType: 'application/pdf',  // or store mimeType on the row
        filename: row.fileName,
      });
      const status = normalizeRowStatus(data.status);
      setRows((prev) =>
        prev.map((r) =>
          r.id === rowId
            ? { ...r, payee: data.payee ?? r.payee, acct: data.accountNumber ?? r.acct,
                ifsc: data.ifsc ?? r.ifsc, amount: data.amount ?? r.amount,
                status, error: rowStatusErrorMessage(data.status), confidence: data.confidence }
            : r
        )
      );
      toast('Row re-extracted successfully', 'success');
    } catch (e: unknown) {
      const err = e as { message?: string };
      setRows((prev) =>
        prev.map((r) => r.id === rowId ? { ...r, status: 'error', error: err.message ?? 'Network error' } : r)
      );
      toast(`Re-run failed: ${err.message ?? 'Network error'}`, 'error');
    }
  } else {
    // Existing sheet row re-run (unchanged)
    // ... existing Drive extractRow logic
  }
}, [rows, toast]);
```

Store `mimeType` on `InvoiceRow` (add optional `mimeType?: string` field) so re-run can
pass the correct type.

---

## `frontend/app/dashboard/page.tsx` changes

Add the `gmail` screen branch:

```tsx
const { ..., runGmail } = useInvoiceExtraction(...);

const onGmailScan = async (params: GmailDiscoverParams) => {
  setScreen('dashboard');      // switch to dashboard immediately
  await runGmail(params);      // rows appear as pending, then fill live
};

// In JSX:
{screen === 'gmail' && (
  <GmailScreen onScan={onGmailScan} loading={extraction.running} />
)}
```

`onNewFile` (the "Start over" button) should also clear Gmail rows: `extraction.setRows([])`.

The upload screen's mode chooser:

```tsx
{screen === 'upload' && (
  <UploadScreen
    onFile={onFile}
    loading={parsingFile}
    onGmailMode={() => setScreen('gmail')}
  />
)}
```

---

## Table changes (`frontend/components/table/`)

### `InvoiceTable` / `InvoiceTableRow`

Detect `rows.some(r => r.source === 'gmail')` to switch column headers.

**Sheet mode columns (existing):**
File / Payee / Account No / IFSC / Amount / Status / Confidence / Actions

**Gmail mode columns (new):**
Sender | Date | Subject | Attachment | Payee | Account No | IFSC | Amount | Status | Confidence | Actions

Gmail mode replaces the "File" cell with four provenance cells. Everything from Payee
onward is identical.

Render helper for a Gmail row's provenance:
- **Sender:** `row.sender` (truncate with ellipsis at ~30 chars)
- **Date:** `new Date(row.emailDate).toLocaleDateString()` (locale short format)
- **Subject:** `row.subject` (truncate at ~40 chars, full text in `title` attribute)
- **Attachment:** `row.attachmentName` (the filename, e.g. `invoice-march.pdf`)

The Actions column (Re-run / Edit) works identically for both sources.

---

## Download changes (`frontend/lib/excel.ts`)

`buildDownloadBlob` currently merges results into the original `rawData`. For Gmail rows
there is no input sheet — build the sheet from scratch.

Add a branch:

```ts
export async function buildGmailDownloadBlob(rows: InvoiceRow[]): Promise<Blob> {
  // Build sheet rows from InvoiceRow fields directly
  const sheetRows = rows.map(r => ({
    'Sender':      r.sender ?? '',
    'Email Date':  r.emailDate ? new Date(r.emailDate).toLocaleDateString() : '',
    'Subject':     r.subject ?? '',
    'Attachment':  r.attachmentName ?? '',
    'Payee':       r.payee,
    'Account No':  r.acct,
    'IFSC':        r.ifsc,
    'Amount':      r.amount,
    'Status':      r.status,
    'Confidence':  r.confidence !== undefined ? Number(r.confidence).toFixed(2) : '',
  }));
  // ... same xlsx generation logic as existing buildDownloadBlob
  return blob;
}
```

In `useInvoiceExtraction.download`, route by source:

```ts
const download = useCallback(async () => {
  const isGmail = rows.some(r => r.source === 'gmail');
  if (isGmail) {
    const blob = await buildGmailDownloadBlob(rows);
    const dateTag = new Date().toISOString().slice(0, 10);
    triggerDownload(blob, `gmail-invoices-${dateTag}-filled.xlsx`);
  } else {
    // existing sheet download
  }
}, [rows, uploadedFile, mapping]);
```

---

## Reuse summary

| Component | Status |
|---|---|
| Dashboard shell (`DashboardPage`, `DashboardScreen`) | Reused — minor additions |
| `StatsBar`, `Banners`, `ToastStack` | Reused verbatim |
| `InvoiceTable` structure + `RowActions` | Reused — new column set for Gmail mode |
| Session / 401 handling pattern | Reused verbatim in new routes |
| `useInvoiceExtraction` state + derived stats | Reused — add `runGmail`, extend `rerun` |
| `normalizeRowStatus`, `rowStatusErrorMessage` | Reused verbatim |
| `extractRow` path in `rerun` | Reused for `source === 'sheet'` rows |
| `GmailScreen` | New |
| `gmail-discover/route.ts`, `gmail-extract/route.ts` | New |
| `discoverGmail`, `extractGmailAttachment` in `api.ts` | New |
| `buildGmailDownloadBlob` in `excel.ts` | New |
| Provenance columns in `InvoiceTableRow` | New |

---

## Files to create or modify

| File | Change |
|---|---|
| `frontend/lib/auth.ts` | Edit scope string (drive + gmail.readonly) |
| `frontend/lib/types.ts` | Add `Screen: 'gmail'`, extend `InvoiceRow`, add `GmailInvoice` |
| `frontend/lib/api.ts` | Add `discoverGmail`, `extractGmailAttachment`, `GmailDiscoverParams`, `GmailInvoice`, `DiscoverResponse` |
| `frontend/lib/excel.ts` | Add `buildGmailDownloadBlob` |
| `frontend/app/api/gmail-discover/route.ts` | New |
| `frontend/app/api/gmail-extract/route.ts` | New |
| `frontend/screens/GmailScreen.tsx` | New |
| `frontend/screens/UploadScreen.tsx` | Add mode chooser, `onGmailMode` prop |
| `frontend/app/dashboard/page.tsx` | Wire `gmail` screen + `runGmail` |
| `frontend/hooks/useInvoiceExtraction.ts` | Add `runGmail`, extend `rerun`, extend `download` |
| `frontend/components/table/InvoiceTable.tsx` | Column header swap for Gmail mode |
| `frontend/components/table/InvoiceTableRow.tsx` | Provenance cell render for Gmail rows |

---

## Out of scope (V2 frontend)

- Saving to Drive as a live Google Sheet
- Full Gmail operator UI (labels, sender filter, size filter)
- Saved / scheduled Gmail scans
- Pagination UI beyond the 200-cap warning toast
- Multi-sheet `.xlsx` processing (V1 limit still applies to sheet upload path)

---

## Verification

1. `bun dev` in `frontend/`.
2. Sign in (Google will re-prompt for consent due to new scope).
3. On the upload page, click "Scan Gmail".
4. Pick "Last month" preset, leave keyword default, click "Scan Gmail for invoices".
5. Rows appear as `pending` in the dashboard within a few seconds (discovery).
6. Rows fill live with payee / acct / IFSC / amount as extraction completes.
7. Click "Download" → `gmail-invoices-{date}-filled.xlsx` downloads; open in Google Sheets to verify columns.
8. Re-run button on an errored Gmail row re-calls `gmail-extract` and patches the row.
9. Confirm no Drive write scope introduced: inspect the OAuth consent screen in the Google account's security page — should show only `Drive (read only)` and `Gmail (read email)`.
