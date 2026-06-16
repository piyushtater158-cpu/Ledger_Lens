# Ledger Lens

**Automated invoice payee extraction from Google Drive links in spreadsheets.**

Ledger Lens reads an Excel file with Google Drive invoice links, downloads each invoice, extracts payee name / bank account number / IFSC via vision AI, and returns the filled spreadsheet for download.

---

## Features

- **Google Sign-In** — OAuth with `drive.readonly`; your Drive token is forwarded per request and never stored in n8n
- **Bulk extraction** — Upload `.xlsx`, process all rows, download the completed file
- **Live dashboard** — Row-by-row status, confidence scores, and error messages
- **Re-run single rows** — Fix a bad link or retry without re-processing the whole file
- **Idempotent runs** — Rows with all three fields already filled are skipped on re-upload
- **Smart column detection** — Auto-matches Drive link, payee, account number, and IFSC columns by header name

---

## Architecture

```
┌─────────────────────────────────────┐
│  Browser (Next.js on Vercel)        │
│  · Google OAuth                     │
│  · Upload spreadsheet               │
│  · Status table + download          │
└──────────────┬──────────────────────┘
               │ /api/extract, /api/extract-row
               │ (forwards file + user access token)
               ▼
┌─────────────────────────────────────┐
│  n8n workflows                      │
│  POST /webhook/extract              │
│  POST /webhook/extract-row          │
└──────────────┬──────────────────────┘
               │
     ┌─────────┴──────────┐
     ▼                    ▼
 Google Drive API    OpenRouter (Nemotron VL)
 (user bearer token)  (vision extraction)
```

The browser never sees the n8n URL or admin token — those stay server-side in Next.js API routes.

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | Next.js 15 (App Router), React 19, NextAuth.js v4, Tailwind CSS |
| Backend | n8n workflows (webhook-triggered) |
| AI | OpenRouter — `nvidia/nemotron-nano-12b-v2-vl:free` |
| Auth | Google OAuth (`drive.readonly`) |
| Deploy | Vercel (frontend root: `frontend/`) |

---

## Project Structure

```
├── frontend/                 # Next.js app (Vercel deploy root)
│   ├── app/
│   │   ├── api/              # Proxy routes to n8n
│   │   ├── dashboard/        # Main upload + status UI
│   │   └── page.tsx          # Sign-in landing page
│   ├── hooks/                # Extraction state management
│   └── lib/                  # Auth, colors, utilities
├── backend/
│   ├── src/                  # n8n SDK workflow source + Code node scripts
│   ├── workflows/            # Importable n8n JSON exports
│   ├── prompts/              # Extraction prompt text
│   └── config/               # Credential & workflow IDs (no secrets)
├── docs/                     # PRD and execution plan
└── shared/                   # Shared types/constants
```

---

## Prerequisites

- [Bun](https://bun.sh) (frontend package manager)
- Google Cloud project with OAuth 2.0 credentials
- n8n instance with workflows activated
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

Open [http://localhost:3000](http://localhost:3000), sign in with Google, and upload a spreadsheet.

### 4. Import n8n workflows (if self-hosting)

1. Open your n8n UI → **Workflows → Import from file**
2. Import `backend/workflows/invoice-extraction.workflow.json` and `invoice-extract-row.workflow.json`
3. Re-assign credentials (Admin Token, OpenRouter API)
4. **Activate** both workflows (inactive workflows only respond on `/webhook-test/*`)

See [backend/README.md](backend/README.md) for workflow details.

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

## API Routes (Next.js proxy)

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/extract` | POST | Full spreadsheet extraction → filled `.xlsx` |
| `/api/extract-row` | POST | Single-row re-run from dashboard |

Both require an authenticated session with a valid Google `accessToken`.

---

## Deployment (Vercel)

1. Set **Root Directory** to `frontend` in the Vercel project settings
2. Install command: `bun install` · Build: `bun run build`
3. Add all `frontend/.env.local` variables to Vercel (Production)
4. Set `NEXTAUTH_URL` to your exact production origin (`https://…`)
5. Add the production domain to Google OAuth authorized origins and redirect URIs

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

- Google Drive access uses the **user's** bearer token per request — no Drive credentials are stored in n8n
- `N8N_ADMIN_TOKEN` and n8n URL are server-side only
- `drive.readonly` scope is sufficient (read-only access to linked files)
- Never commit `.env`, `.env.local`, or `.mcp.json`

---

## v1 Scope Limits

- Yellow cell highlight is not preserved on round-trip
- No database / audit trail
- Multi-sheet `.xlsx` — only first sheet processed
- `.doc`/`.docx` invoices → marked unsupported

---

## License

Private project — all rights reserved unless otherwise specified.
