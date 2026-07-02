# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project: LedgerLens

Invoice payee extractor — two entry points, one extraction pipeline:
1. User uploads an `.xlsx` with Google Drive invoice links.
2. User picks a Gmail date range/keyword and the app finds invoice attachments directly.

Either way, OpenRouter `google/gemini-2.5-flash` extracts payee name / bank account / IFSC / amount, and results come back as a filled spreadsheet (path 1) or a live results table (path 2).

**Stack:** n8n workflows (backend) · Next.js 15 App Router + NextAuth.js v4 (frontend) · OpenRouter vision (`google/gemini-2.5-flash`) · Vercel (deploy) · Google Drive + Gmail APIs (user bearer token, never stored in n8n)

## Frontend commands

Run from `frontend/`:

```bash
bun dev          # dev server on localhost:3000
bun build        # production build
bun lint         # next lint
```

No test suite yet. Use `bun` — not npm/yarn/pnpm.

## n8n workflows

Hosted at `https://n8n.piyushtater.com`. Four webhooks, all active:

| Workflow | ID | Endpoint | Input | Output |
|---|---|---|---|---|
| Workflow A — Invoice Payee Extraction | `vqSkkv9egxmIVpdv` | `POST /webhook/extract` | `multipart/form-data`: `file` (xlsx) + `googleAccessToken` | Filled `.xlsx` binary |
| Workflow B — Invoice Extract Row | `LmdFhorOYBoJgXGl` | `POST /webhook/extract-row` | JSON `{ driveLink, googleAccessToken }` | JSON `{ payee, accountNumber, ifsc, confidence, status }` |
| Workflow C — Gmail Invoice Discovery | `DKeKAKn620xgkpQZ` | `POST /webhook/gmail-discover` | JSON `{ googleAccessToken, query?, after, before, maxMessages? }` | JSON `{ invoices[], truncated, scanned }` |
| Workflow D — Gmail Attachment Extract | `njpNl9MZDkFvu7eF` | `POST /webhook/gmail-extract` | JSON `{ googleAccessToken, messageId, attachmentId, mimeType, filename }` | JSON `{ payee, accountNumber, ifsc, amount, confidence, status }` |

All four require header `X-Admin-Token` (value = `N8N_ADMIN_TOKEN` env var).  
All four must be **manually activated** in the n8n UI before `/webhook/*` paths respond (inactive → `/webhook-test/*` only).

**Credential IDs in n8n:**
- Gemini: `HjzKcNOEvlelKDp2` (type: `googlePalmApi`) — **deprecated; replaced by OpenRouter**
- OpenRouter: `openRouterApi` credential `bDCaYQ5pU52IShxl` (name: **OpenRouter account**)
- Admin Token: `REIlq9U7MYnIUAey` (type: `httpHeaderAuth`)
- HTTP Request nodes: **no stored credential** — Drive access uses the user's forwarded Bearer token.

## Backend source layout

```
backend/
├── src/
│   ├── workflow-a-extraction.ts      ← n8n SDK source for Workflow A
│   ├── workflow-b-extract-row.ts     ← n8n SDK source for Workflow B
│   ├── workflow-c-gmail-discover.ts  ← n8n SDK source for Workflow C
│   ├── workflow-d-gmail-extract.ts   ← n8n SDK source for Workflow D
│   └── nodes/*.js                    ← jsCode verbatim for each Code node
├── workflows/*.workflow.json         ← importable JSON exports (4 files, A/B/C/D)
├── prompts/gemini-extraction.txt     ← extraction prompt text (used by all OpenRouter analyze branches)
├── scripts/sync-and-deploy-workflows.mjs ← rebuilds workflow JSON from src/nodes/*.js and pushes to live n8n
└── config/
    ├── credentials.md            ← credential/workflow IDs (no secret values)
    └── v2-gmail-contracts.md     ← request/response contracts for workflows C/D
```

To re-create or validate a workflow via MCP: `get_sdk_reference` → `validate_workflow` (pass TS source) → `create_workflow_from_code`.

## Architecture: how data flows

### Spreadsheet path (A/B)
1. **Browser** → Next.js API route (`/api/extract` or `/api/extract-row`)
2. **API route** reads `session.accessToken` (Google OAuth, JWT strategy) and forwards it + the file to n8n with `X-Admin-Token` header
3. **n8n Workflow A** parses the spreadsheet, auto-detects columns by regex, loops row-by-row, fetches each Drive file using the forwarded user token, routes image vs document branches to OpenRouter vision extraction, parses model JSON, rebuilds the original row structure, returns filled `.xlsx` binary
4. **n8n Workflow B** is the same per-row subset used by the dashboard's Re-run button

### Gmail path (C/D)
1. **Browser** → `/api/gmail-discover` with a date range/keyword → **n8n Workflow C** searches Gmail (`gmail.readonly` scope, forwarded user token), returns candidate invoice attachments (messageId/attachmentId/filename per hit)
2. Dashboard renders the hit list, then calls `/api/gmail-extract` per attachment → **n8n Workflow D** downloads the attachment via Gmail API and runs the same OpenRouter vision extraction as A/B, returning fields progressively per row

The browser never sees the n8n URL or Admin Token — those stay server-side in the Next.js API routes.

## Column auto-detection regexes (important for adding new column types)

| Field | Regex |
|---|---|
| Drive link | `/drive.*link\|invoice.*link\|invoice.*url\|link\|url\|drive\|invoice\|file/i` |
| Payee | `/payee\|beneficiary\|account[_\s-]?name\|acc[_\s-]?name/i` |
| Account No | `/account[_\s-]?no\|acct\|a\/c\|bank[_\s-]?acc\|acc.*no/i` |
| IFSC | `/ifsc/i` |

## Key gotchas

- **OpenRouter model** must be `google/gemma-4-31b-it:free` (configured in `backend/src/nodes/prepareOpenRouterPayload.js`; reasoning disabled via `reasoning: { effort: 'none' }`)
- **Model may wrap JSON in code fences** — always strip before parsing: `raw.replace(/```json?\n?/g, '').replace(/```/g, '').trim()`
- **Drive HTTP Request nodes** use `continueRegularOutput` on error so the workflow doesn't halt on a bad link; the Code node downstream checks for the failure and sets `_status = Error: ...`
- **Binary data loss across nodes:** after an HTTP Request that downloads a file, the next Code node must read `$('previous-node').item.json` to restore `_` prefixed metadata (binary context is lost when Code node runs)
- **Row ordering:** rows get a `_idx` injected in `Detect Columns`, parallel branches scramble order; `Sort Rows By Index` restores it before `Convert to XLSX`
- **Idempotency:** Workflow A's Filter skips rows where all three target cells are already filled — re-running a partially-done file is safe

## Frontend: key files to know

| File | Purpose |
|---|---|
| `frontend/app/api/auth/[...nextauth]/route.ts` | NextAuth Google provider; JWT callback stores `account.access_token` in token |
| `frontend/app/api/extract/route.ts` | Proxy: reads session, forwards file + token to n8n as `multipart/form-data` |
| `frontend/app/api/extract-row/route.ts` | Proxy: forwards `{ driveLink, googleAccessToken }` to n8n |
| `frontend/app/api/gmail-discover/route.ts` | Proxy: forwards `{ query?, after, before, maxMessages? }` + token to Workflow C |
| `frontend/app/api/gmail-extract/route.ts` | Proxy: forwards `{ messageId, attachmentId, mimeType, filename }` + token to Workflow D |
| `frontend/app/api/config/status/route.ts` | Health check — confirms `N8N_ADMIN_TOKEN`/`N8N_BASE_URL` are set server-side |
| `frontend/app/dashboard/page.tsx` | Screen router: Upload → Mapping → Dashboard, or Gmail scan |
| `frontend/screens/UploadScreen.tsx` | Spreadsheet upload entry point |
| `frontend/screens/MappingScreen.tsx` | Column-mapping confirmation before extraction runs |
| `frontend/screens/DashboardScreen.tsx` | Live status table, per-row re-run, download |
| `frontend/screens/GmailScreen.tsx` | Gmail scan entry point (date range/keyword → attachment picker) |
| `frontend/lib/auth.ts` | OAuth scope config — currently `drive.readonly` + `gmail.readonly` |

## Environment variables

`frontend/.env.local` (also set in Vercel dashboard):
```
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
NEXTAUTH_SECRET=          # openssl rand -base64 32
NEXTAUTH_URL=             # https://your.vercel.app or http://localhost:3000
N8N_BASE_URL=https://n8n.piyushtater.com
N8N_ADMIN_TOKEN=
```

Root `.env` (for n8n MCP):
```
N8N_API_KEY=
N8N_ADMIN_TOKEN=
N8N_BASE_URL=https://n8n.piyushtater.com
```

## n8n MCP

Configured in `.mcp.json`. Tools follow the mandatory order: `get_sdk_reference` → `get_suggested_nodes` → `search_nodes` → `get_node_types` → write code → `validate_node_config` per node → `validate_workflow` → `create_workflow_from_code`.

## Production (Vercel)

**Vercel project root directory = `frontend`** (the app is not at repo root — this is critical).  
Framework preset: Next.js. Install command: `bun install`. Build command: `bun run build`.

**Production domain:** `ledgerlens.piyushtater.com`.  
Set `NEXTAUTH_URL` to the exact `https://` origin — wrong value → broken OAuth callbacks.

### Environment variables (Vercel dashboard → Production)
```
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
NEXTAUTH_SECRET=          # openssl rand -base64 32 — v4 name, NOT AUTH_SECRET
NEXTAUTH_URL=             # https://<custom-domain>  — v4 name, NOT AUTH_URL
N8N_BASE_URL=https://n8n.piyushtater.com
N8N_ADMIN_TOKEN=
```
NextAuth is **v4** (`next-auth@^4.24.11`) → env vars are `NEXTAUTH_*`, not `AUTH_*`. Session is JWT (no database).

### Pre-deploy code changes — status

These were the v1 pre-deploy blockers; all three are done in the committed codebase:
1. ✅ **`frontend/lib/auth.ts`** — Drive scope is trimmed to `drive.readonly` (plus `gmail.readonly` for the Gmail scan feature added in v2).
2. ✅ **`frontend/next.config.ts`** — `serverActions.allowedOrigins` includes `ledgerlens.piyushtater.com`.
3. ✅ **Debug telemetry** — no `// #region agent log` blocks remain in `frontend/`.

If you see any of these regress (e.g. a working-tree edit widens the Drive scope back to full `drive`, or reintroduces `fetch('http://127.0.0.1:7278/...')` debug hooks), treat it as unshipped WIP — verify against the live n8n workflows and `git show HEAD:<file>` before assuming it's the current published behavior. `backend/src/nodes/` can still carry leftover debug hooks from past sessions; check `git diff` before trusting a node's `.js` source over what's actually baked into `backend/workflows/*.workflow.json`.

### Google OAuth (GCP console — same client ID as local)
- **Authorized JavaScript origins:** `https://ledgerlens.piyushtater.com` (plus `http://localhost:3000`).
- **Authorized redirect URIs:** `https://ledgerlens.piyushtater.com/api/auth/callback/google` (plus the local one). Path is fixed by NextAuth — must match exactly, `https`, no trailing slash.
- **Drive.readonly** is still a Google *restricted* scope → publishing requires CASA security assessment (submit early, takes days–weeks). Use **Testing mode + test users** while verification is pending.
- Consent screen: app name, support email, privacy policy URL, ToS URL, authorized domain all required for verification submission.

### Common production failures
| Symptom | Cause |
|---|---|
| `redirect_uri_mismatch` | Redirect URI in GCP doesn't exactly match `NEXTAUTH_URL/api/auth/callback/google` |
| Callback loop / "configuration" error | `NEXTAUTH_SECRET` missing or `NEXTAUTH_URL` wrong in Vercel |
| 401 from `/api/extract` | `session.accessToken` absent (refresh failed) or `N8N_ADMIN_TOKEN` mismatch |
| 503 from `/api/extract` | `N8N_ADMIN_TOKEN` not set in Vercel env vars |
| 404 on n8n webhook | Workflow not **activated** in n8n UI (inactive → `/webhook-test/*` only) |

## Scope limits (do not build)

v1 (spreadsheet path) and v2 (Gmail scan, workflows C/D) are both shipped. Still out of scope:
- Yellow cell highlight is not preserved on round-trip
- No Supabase / audit trail
- Multi-sheet `.xlsx` — only first sheet is processed
- Legacy `.doc` (not `.docx`) invoices need Drive write access to convert — currently unsupported without it; see `docs/archive/v1-prd/` and in-progress work in `backend/src/nodes/restoreRowAfterDownload.js` (uncommitted at time of writing)
