# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project: LedgerLens

Invoice payee extractor — user uploads an `.xlsx` with Google Drive invoice links, OpenRouter `google/gemma-4-31b-it:free` extracts payee name / bank account / IFSC for each row, and the filled spreadsheet is returned for download.

**Stack:** n8n workflows (backend) · Next.js 15 App Router + NextAuth.js (frontend) · OpenRouter (Nemotron VL) · Vercel (deploy) · Google Drive API (user bearer token, never stored in n8n)

## Frontend commands

Run from `frontend/`:

```bash
bun dev          # dev server on localhost:3000
bun build        # production build
bun lint         # next lint
```

No test suite yet. Use `bun` — not npm/yarn/pnpm.

## n8n workflows

Hosted at `https://n8n.piyushtater.com`. Two webhooks:

| Workflow | ID | Endpoint | Input | Output |
|---|---|---|---|---|
| Workflow A — Invoice Payee Extraction | `vqSkkv9egxmIVpdv` | `POST /webhook/extract` | `multipart/form-data`: `file` (xlsx) + `googleAccessToken` | Filled `.xlsx` binary |
| Workflow B — Invoice Extract Row | `LmdFhorOYBoJgXGl` | `POST /webhook/extract-row` | JSON `{ driveLink, googleAccessToken }` | JSON `{ payee, accountNumber, ifsc, confidence, status }` |

Both require header `X-Admin-Token` (value = `N8N_ADMIN_TOKEN` env var).  
Both must be **manually activated** in the n8n UI before `/webhook/*` paths respond (inactive → `/webhook-test/*` only).

**Credential IDs in n8n:**
- Gemini: `HjzKcNOEvlelKDp2` (type: `googlePalmApi`) — **deprecated; replaced by OpenRouter**
- OpenRouter: `openRouterApi` credential `bDCaYQ5pU52IShxl` (name: **OpenRouter account**)
- Admin Token: `REIlq9U7MYnIUAey` (type: `httpHeaderAuth`)
- HTTP Request nodes: **no stored credential** — Drive access uses the user's forwarded Bearer token.

## Backend source layout

```
backend/
├── src/
│   ├── workflow-a-extraction.ts   ← n8n SDK source for Workflow A
│   ├── workflow-b-extract-row.ts  ← n8n SDK source for Workflow B
│   └── nodes/*.js                 ← jsCode verbatim for each Code node
├── workflows/*.workflow.json      ← importable JSON exports
├── prompts/gemini-extraction.txt  ← exact Gemini prompt used in all branches
└── config/credentials.md          ← credential/workflow IDs (no secret values)
```

To re-create or validate a workflow via MCP: `get_sdk_reference` → `validate_workflow` (pass TS source) → `create_workflow_from_code`.

## Architecture: how data flows

1. **Browser** → Next.js API route (`/api/extract` or `/api/extract-row`)
2. **API route** reads `session.accessToken` (Google OAuth, JWT strategy) and forwards it + the file to n8n with `X-Admin-Token` header
3. **n8n Workflow A** parses the spreadsheet, auto-detects columns by regex, loops row-by-row, fetches each Drive file using the forwarded user token, routes image vs document branches to OpenRouter vision extraction, parses model JSON, rebuilds the original row structure, returns filled `.xlsx` binary
4. **n8n Workflow B** is the same per-row subset used by the dashboard's Re-run button

The browser never sees the n8n URL or Admin Token — those stay server-side.

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
| `frontend/app/dashboard/page.tsx` | Main dashboard: upload → status table → download |

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

**Production domain:** custom domain (subdomain of `piyushtater.com`).  
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

### Pre-deploy code changes (not yet done)
1. **`frontend/lib/auth.ts:52`** — trim Drive scope. Remove `https://www.googleapis.com/auth/drive` (write). Keep only `drive.readonly`. Full `drive` is restricted and not needed (app only reads files).
2. **`frontend/next.config.ts:4`** — add production domain to `allowedOrigins`:
   ```ts
   serverActions: { allowedOrigins: ['localhost:3000', '<custom-domain>'] }
   ```
3. **Debug telemetry** — delete `// #region agent log` blocks in `frontend/app/api/extract/route.ts`, `extract-row/route.ts`, and `frontend/hooks/useInvoiceExtraction.ts`. These `fetch('http://127.0.0.1:7278/...')` calls are no-ops in prod (`.catch(()=>{})`), but dead weight.

### Google OAuth (GCP console — same client ID as local)
- **Authorized JavaScript origins:** add `https://<custom-domain>` (keep `http://localhost:3000`).
- **Authorized redirect URIs:** add `https://<custom-domain>/api/auth/callback/google` (keep local one). Path is fixed by NextAuth — must match exactly, `https`, no trailing slash.
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

## v1 scope limits (do not build)

- Yellow cell highlight is not preserved on round-trip
- No Supabase / audit trail
- Multi-sheet `.xlsx` — only first sheet is processed
