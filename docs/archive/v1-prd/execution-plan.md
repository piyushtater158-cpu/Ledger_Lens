> **Archived — historical build log.** Step-by-step record of how v1 was originally built.
> Not maintained; the system has since moved past several of these steps (OpenRouter instead
> of direct Gemini, Gmail workflows added). Kept for reference only.

# Execution Plan: Invoice Payee Extractor

**Reference doc for how to approach and solve the problem.**  
Consult this before each step. Each step has an acceptance check — don't move to the next until it passes.

---

## Step 0: Verify environment

**What:** Confirm n8n is reachable and credentials exist.  
**How:**
```bash
# Test n8n connectivity
curl -s -H "X-N8N-API-KEY: <N8N_API_KEY>" https://n8n.piyushtater.com/api/v1/workflows | head -c 200

# Confirm Google Gemini credential exists in n8n (via MCP: list_credentials)
```
**Acceptance:** n8n returns a workflow list (even if empty). Gemini credential `HjzKcNOEvlelKDp2` is present.

---

## Step 1: Create docs folder structure

**What:** All PRD files + `.env.example`.  
**Status:** ✅ Done (these files were created on plan approval).

Files created:
- `docs/prd/00-overview.md`
- `docs/prd/frontend.md`
- `docs/prd/backend.md`
- `docs/execution-plan.md` (this file)
- `.env.example`

---

## Step 2: Build n8n Workflow A — Invoice Extraction

This is the critical path. Build and validate per node before wiring the full graph.

### 2.1 Scaffold Workflow A via n8n MCP

Use `get_sdk_reference` → `get_suggested_nodes` → `search_nodes` → `get_node_types` in order.
Write code → `validate_workflow` → `create_workflow_from_code`.

Node build order (validate_node_config per node before wiring):
1. Webhook trigger
2. Extract From File (read spreadsheet)
3. Code — column detection
4. Filter — skip filled rows
5. Loop Over Items (split by 1)
6. Code — parse Drive fileId
7. HTTP Request — Drive metadata (mimeType)
8. HTTP Request — Drive download (binary)
9. Switch — PDF vs image vs other
10a. Google Gemini document:analyze
10b. Google Gemini image:analyze
10c. Set (Unsupported)
11. Code — parse Gemini JSON
12. Code — merge into row, set status
13. Aggregate
14. Convert to File (write .xlsx)
15. Set — summary object
16. Respond to Webhook

### 2.2 Acceptance check
- No `validate_workflow` errors.
- Manual test with one PDF row: webhook returns a `.xlsx` blob; open it; target cells filled; Status = `Done`.
- Run again on same file: the already-filled row is skipped (Filter node).
- Image invoice row: Status = `Done` with correct fields.
- `.docx` row: Status = `Unsupported - manual`.
- Broken Drive link: row Status = `Error: <message>`; rest of file still processes.

### 2.3 GOTCHAS

**Column detection order:** check headers case-insensitively. The user's sheet may have
`Invoice Link`, `Doc URL`, `File`, `Drive`, etc. Regex: `/drive|link|invoice|url|file/i`.
For payee: `/payee|beneficiary|account.name|acc.name/i`. For account: `/account.?no|acct|a\/c|bank.acct/i`. For IFSC: `/ifsc/i`.
If two columns match the same regex, prefer the one with more matching keywords.

**fileId regex:** covers both sharing formats:
- `https://drive.google.com/file/d/{id}/view`
- `https://drive.google.com/open?id={id}`
- `https://docs.google.com/document/d/{id}/`

**Gemini JSON parsing:** Gemini sometimes wraps JSON in code fences (```json ... ```).
Strip before parsing: `content.replace(/```json?\n?/g, '').replace(/```/g, '').trim()`

**Drive download for Google Docs:** If mimeType is `application/vnd.google-apps.document`,
use the export endpoint instead: `GET drive/v3/files/{id}/export?mimeType=application/pdf`
(to be added in v2 — for v1, flag as Unsupported).

**Large binary response:** n8n HTTP Request may need `Response Format: File` (not `JSON`) for Drive download.

**CORS for OPTIONS preflight:** Add a second Webhook path `OPTIONS /extract` that returns 204 with CORS headers (or handle OPTIONS in Next.js API route, which is preferred since n8n is called server-side only — no browser CORS needed).

---

## Step 3: Build n8n Workflow B — Extract Row

Reuse nodes 6–12 from Workflow A. Trigger: `POST /webhook/extract-row`.
Body: `{ driveLink, googleAccessToken }`. Response: JSON `{ payee, accountNumber, ifsc, confidence, status }`.

**Acceptance:** POST to webhook with a real Drive link + valid token → JSON with filled fields.

---

## Step 4: Google OAuth App (one-time developer setup)

1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Create or select a project
3. Enable **Google Drive API**
4. APIs & Services → Credentials → Create OAuth 2.0 Client ID (Web application)
5. Authorized redirect URIs:
   - `http://localhost:3000/api/auth/callback/google` (dev)
   - `https://your.vercel.app/api/auth/callback/google` (prod)
6. OAuth consent screen → add test users (dev) or submit for verification (prod)
7. Note `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` → add to `.env.local`

**Minimum scopes:** `openid email profile https://www.googleapis.com/auth/drive.readonly`  
**No Sheets API needed** — the sheet is parsed locally from the uploaded file.

---

## Step 5: Scaffold Next.js Frontend

```bash
bun create next-app frontend --typescript --tailwind --app --no-src-dir
cd frontend
bun add next-auth
```

Build order:
1. `app/api/auth/[...nextauth]/route.ts` — NextAuth Google provider, include `access_token` in JWT
2. `app/api/extract/route.ts` — proxy to n8n `/webhook/extract`
3. `app/api/extract-row/route.ts` — proxy to n8n `/webhook/extract-row`
4. `app/page.tsx` — sign-in gate
5. `app/dashboard/page.tsx` — upload → table → download
6. Components: `StatusBadge`, `InvoiceTable`, `UploadDropzone`, `EditableCell`

### Key implementation notes

**NextAuth JWT callback** (to expose the access token to server-side routes):
```ts
// callbacks in [...nextauth]/route.ts
callbacks: {
  async jwt({ token, account }) {
    if (account) token.accessToken = account.access_token
    return token
  },
  async session({ session, token }) {
    session.accessToken = token.accessToken as string
    return session
  }
}
```

**Proxy route (`/api/extract/route.ts`):**
- Gets `session` via `getServerSession()`
- Reads `session.accessToken`
- Forwards file + token to n8n as `multipart/form-data`
- Pipes binary response back to client

**Dashboard state machine:**
- `idle` → `uploading` → `parsing` → `running` (per-row processing) → `done`
- Row states live in `useState<Row[]>`; updated as n8n responds per row (or all at once in batch)
- Inline edits update the local state array; Download re-applies edits to the returned binary

**Download button:**
- n8n's `/webhook/extract` already returns the filled `.xlsx` binary
- Store the blob in state after extraction; Download button triggers `URL.createObjectURL(blob)` + click

### State to handle (see frontend PRD for full list)

---

## Step 6: Deploy to Vercel

```bash
bun run build          # verify no build errors
vercel --prod          # or push to main branch with Vercel GitHub integration
```

Set env vars in Vercel dashboard:
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`
- `NEXTAUTH_SECRET` (generate with `openssl rand -base64 32`)
- `NEXTAUTH_URL` = your Vercel URL
- `N8N_BASE_URL` = `https://n8n.piyushtater.com`
- `N8N_ADMIN_TOKEN` = value of your Admin Token credential in n8n

Update in n8n Workflow A/B:
- CORS `Access-Control-Allow-Origin` header → your Vercel URL

---

## Step 7: End-to-end verification

Run through this checklist on the deployed app:

- [ ] Sign in with Google works; redirect to dashboard
- [ ] Upload a sample `.xlsx` with one PDF row → extraction returns filled cells
- [ ] Status = `Done` for that row; download the file; open it; verify cells
- [ ] Upload same filled file → row is skipped (idempotency)
- [ ] Image invoice row → `Done` with correct fields
- [ ] `.docx` row → `Unsupported - manual`
- [ ] Broken Drive link → `Error` with message; other rows still process
- [ ] Re-run on Error row → re-calls `/extract-row` → row fills in
- [ ] Inline edit → changes reflected in downloaded file
- [ ] Expired Google token → `Error: auth expired`; re-sign-in resolves it
- [ ] n8n unreachable → red toast in dashboard

---

## v2 backlog (do not build in v1)

- `.doc`/`.docx` support via Drive export-to-PDF endpoint
- Preserve yellow cell formatting (requires `exceljs` in a Code node on self-hosted n8n)
- Supabase audit trail (extraction history, analytics)
- Batch progress via SSE/websocket (real-time per-row updates)
- Confidence threshold: auto-flag low-confidence rows for manual review
- Multi-sheet `.xlsx` support (currently processes first sheet only)
