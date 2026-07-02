# Ledger Lens

**Automated invoice payee extraction — from a spreadsheet of Google Drive links, or directly from Gmail.**

Ledger Lens has two entry points into the same extraction pipeline:

1. **Spreadsheet upload** — upload an `.xlsx` with Google Drive invoice links, get the same file back with payee / bank account / IFSC filled in.
2. **Gmail scan** — pick a date range (and optional keyword), Ledger Lens finds invoice attachments in your Gmail and extracts the same fields per attachment, live.

Either path routes each invoice through OpenRouter vision AI and returns confidence-scored results.

---

## Features

- **Google Sign-In** — OAuth with `drive.readonly` + `gmail.readonly`; your token is forwarded per request and never stored in n8n
- **Bulk extraction** — Upload `.xlsx`, process all rows, download the completed file
- **Gmail scan** — Discover invoice attachments by date range/keyword without touching a spreadsheet
- **Live dashboard** — Row-by-row status, confidence scores, and error messages
- **Re-run single rows** — Fix a bad link or retry without re-processing the whole file
- **Idempotent runs** — Rows with all three fields already filled are skipped on re-upload
- **Smart column detection** — Auto-matches Drive link, payee, account number, and IFSC columns by header name
- **Amount + currency extraction** — Invoice amount and currency are extracted and exportable alongside payee details

---

## Architecture

```
┌───────────────────────────────────────┐
│  Browser (Next.js on Vercel)          │
│  · Google OAuth                       │
│  · Upload spreadsheet  OR  scan Gmail │
│  · Status table + download            │
└──────────────────┬─────────────────────┘
                    │ /api/extract, /api/extract-row
                    │ /api/gmail-discover, /api/gmail-extract
                    │ (forwards file/query + user access token)
                    ▼
┌───────────────────────────────────────┐
│  n8n workflows (4, all active)        │
│  A  POST /webhook/extract             │
│  B  POST /webhook/extract-row         │
│  C  POST /webhook/gmail-discover      │
│  D  POST /webhook/gmail-extract       │
└──────────────────┬─────────────────────┘
                    │
        ┌───────────┼───────────────┐
        ▼           ▼               ▼
  Google Drive   Gmail API      OpenRouter
  API (Bearer)   (Bearer)   (google/gemini-2.5-flash,
                              vision extraction)
```

The browser never sees the n8n URL or admin token — those stay server-side in Next.js API routes. Neither Drive nor Gmail credentials are stored in n8n; every request forwards the signed-in user's own Google access token.

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | Next.js 15 (App Router), React 19, NextAuth.js v4, Tailwind CSS |
| Backend | n8n workflows (webhook-triggered) |
| AI | OpenRouter — `google/gemini-2.5-flash` (vision) |
| Auth | Google OAuth (`drive.readonly` + `gmail.readonly`) |
| Deploy | Vercel (frontend root: `frontend/`) |

---

## Project Structure

```
├── frontend/                     # Next.js app (Vercel deploy root)
│   ├── app/
│   │   ├── api/                  # Proxy routes to n8n (extract, extract-row, gmail-discover, gmail-extract, auth, config/status)
│   │   ├── dashboard/            # Dashboard route entry
│   │   └── page.tsx              # Sign-in landing page
│   ├── screens/                  # UploadScreen, MappingScreen, DashboardScreen, GmailScreen
│   ├── components/                # Table, dashboard, and shared UI components
│   ├── hooks/                    # Extraction state management
│   └── lib/                      # Auth, Drive/Excel helpers, formatting, n8n config
├── backend/
│   ├── src/
│   │   ├── workflow-a-extraction.ts      # n8n SDK source — Workflow A
│   │   ├── workflow-b-extract-row.ts     # n8n SDK source — Workflow B
│   │   ├── workflow-c-gmail-discover.ts  # n8n SDK source — Workflow C
│   │   ├── workflow-d-gmail-extract.ts   # n8n SDK source — Workflow D
│   │   └── nodes/                        # jsCode verbatim for each Code node
│   ├── workflows/                # Importable n8n JSON exports (A/B/C/D)
│   ├── prompts/                  # Extraction prompt text
│   ├── scripts/                  # Deploy/sync/debug scripts for the n8n workflows
│   └── config/                   # Credential & workflow IDs, Gmail contracts (no secrets)
├── docs/
│   ├── prd/                      # Current design docs (v2 Gmail addendum)
│   └── archive/v1-prd/           # Superseded v1 docs, kept for history
└── shared/                       # Shared types/constants
```

---

## Prerequisites

- [Bun](https://bun.sh) (frontend package manager)
- Google Cloud project with OAuth 2.0 credentials (Drive + Gmail readonly scopes enabled)
- n8n instance with all four workflows imported and activated
- OpenRouter API credential configured in n8n
- `N8N_ADMIN_TOKEN` shared between n8n and the frontend

---

## Getting Started

### 1. Clone the repository

```bash
git clone https://github.com/piyushtater158-cpu/Ledger_Lens.git
cd Ledger_Lens
```

### 2. Configure environment variables

```bash
cp frontend/.env.local.example frontend/.env.local
```

Edit `frontend/.env.local`:

```env
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
NEXTAUTH_SECRET=...          # openssl rand -base64 32
NEXTAUTH_URL=http://localhost:3000
N8N_BASE_URL=https://your-n8n-host.com
N8N_ADMIN_TOKEN=...
```

### 3. Install dependencies and run

```bash
cd frontend
bun install
bun dev
```

Open [http://localhost:3000](http://localhost:3000), sign in with Google, and either upload a spreadsheet or scan Gmail.

### 4. Import n8n workflows (if self-hosting)

1. Open your n8n UI → **Workflows → Import from file**
2. Import all four: `invoice-extraction.workflow.json`, `invoice-extract-row.workflow.json`, `gmail-discover.workflow.json`, `gmail-extract.workflow.json` (in `backend/workflows/`)
3. Re-assign credentials on each (Admin Token, OpenRouter API — see [backend/config/credentials.md](backend/config/credentials.md))
4. **Activate** all four workflows (inactive workflows only respond on `/webhook-test/*`)

See [backend/README.md](backend/README.md) for full workflow details.

---

## Spreadsheet Format

Upload an `.xlsx` file with at least a **Google Drive link** column. Ledger Lens auto-detects columns by header name:

| Field | Header patterns (regex) |
|-------|-------------------------|
| Drive link | `drive link`, `invoice url`, `link`, `url`, … |
| Payee | `payee`, `beneficiary`, `account name`, … |
| Account No | `account no`, `acct`, `a/c`, `bank acc`, … |
| IFSC | `ifsc` |

Only the **first sheet** is processed. Supported invoice types: **PDF and images**.

---

## Gmail Scan

Instead of a spreadsheet, pick a date range and optional keyword. Ledger Lens searches Gmail for invoice-looking attachments (Workflow C), then extracts fields from each one on demand as you review the results (Workflow D) — no spreadsheet round-trip required.

---

## API Routes (Next.js proxy)

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/extract` | POST | Full spreadsheet extraction → filled `.xlsx` |
| `/api/extract-row` | POST | Single-row re-run from dashboard |
| `/api/gmail-discover` | POST | Search Gmail for invoice attachments |
| `/api/gmail-extract` | POST | Extract fields from one Gmail attachment |
| `/api/config/status` | GET | Server-side health check (admin token/base URL presence) |

All extraction routes require an authenticated session with a valid Google `accessToken`.

---

## Deployment (Vercel)

1. Set **Root Directory** to `frontend` in the Vercel project settings
2. Install command: `bun install` · Build: `bun run build`
3. Add all `frontend/.env.local` variables to Vercel (Production)
4. Set `NEXTAUTH_URL` to your exact production origin (`https://…`)
5. Add the production domain to Google OAuth authorized origins and redirect URIs

See [CLAUDE.md](CLAUDE.md) for the full production checklist and common failure modes.

---

## Environment Variables Reference

| Variable | Where | Description |
|----------|-------|-------------|
| `GOOGLE_CLIENT_ID` | Frontend | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | Frontend | Google OAuth client secret |
| `NEXTAUTH_SECRET` | Frontend | JWT signing secret |
| `NEXTAUTH_URL` | Frontend | App origin (must match OAuth redirect) |
| `N8N_BASE_URL` | Frontend | n8n host URL |
| `N8N_ADMIN_TOKEN` | Frontend + n8n | Shared webhook auth header |
| `N8N_API_KEY` | Root `.env` | n8n MCP / API access (dev only) |

Copy `.env.example` at the repo root for a full template.

---

## Development Commands

Run from `frontend/`:

```bash
bun dev      # Dev server on localhost:3000
bun build    # Production build
bun lint     # ESLint
```

---

## Security Notes

- Google Drive and Gmail access use the **user's own** bearer token per request — no Google credentials are stored in n8n
- `N8N_ADMIN_TOKEN` and n8n URL are server-side only
- `drive.readonly` + `gmail.readonly` scopes are read-only by design
- Never commit `.env`, `.env.local`, or `.mcp.json`

---

## Scope Limits

- Yellow cell highlight is not preserved on round-trip
- No database / audit trail
- Multi-sheet `.xlsx` — only first sheet processed
- Legacy `.doc` (not `.docx`) invoices need Drive write access to convert — unsupported with the current read-only scope

---

## Further Reading

- [CLAUDE.md](CLAUDE.md) — full architecture, gotchas, and production checklist
- [backend/README.md](backend/README.md) — n8n workflow details, node layout, credential setup
- [frontend/README.md](frontend/README.md) — screens, hooks, and API routes
- [docs/README.md](docs/README.md) — index of design docs, current and archived

---

## License

Private project — all rights reserved unless otherwise specified.
