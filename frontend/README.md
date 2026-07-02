# Ledger Lens — Frontend

Next.js 15 App Router dashboard. This is the **Vercel deploy root** (see [CLAUDE.md](../CLAUDE.md) — the project root is not the repo root).

## Commands

```bash
bun install
bun dev      # http://localhost:3000
bun build
bun lint
```

Use `bun` — not npm/yarn/pnpm.

## Screen flow

`app/dashboard/page.tsx` is a single client component that switches between four screens
(`lib/types.ts` → `Screen = 'upload' | 'mapping' | 'dashboard' | 'gmail'`), driven by
`useFileUpload` (spreadsheet parsing/mapping state) and `useInvoiceExtraction` (run/poll/edit
state for both extraction paths):

```
upload ──(file selected)──► mapping ──(confirm columns)──► dashboard
  │                                                              ▲
  └──(Gmail mode)──► gmail ──(scan)───────────────────────────────┘
```

| Screen | File | Purpose |
|---|---|---|
| Upload | `screens/UploadScreen.tsx` | Drop/select an `.xlsx`, or switch to Gmail mode |
| Mapping | `screens/MappingScreen.tsx` | Confirm/correct auto-detected column mapping before running extraction |
| Dashboard | `screens/DashboardScreen.tsx` | Live per-row status table, run/re-run, inline edit, download |
| Gmail | `screens/GmailScreen.tsx` | Pick a date range/keyword to scan Gmail for invoice attachments |

Rows from either path share the same `InvoiceRow` shape (`lib/types.ts`) — `source: 'sheet' | 'gmail'` distinguishes them, so the dashboard table and download logic don't branch on origin.

## Hooks

| Hook | Purpose |
|---|---|
| `hooks/useFileUpload.ts` | Parses the uploaded `.xlsx`, auto-detects columns, builds initial `InvoiceRow[]` |
| `hooks/useInvoiceExtraction.ts` | Drives `/api/extract`, `/api/extract-row`, `/api/gmail-discover`, `/api/gmail-extract`; tracks run/processing/done/error counts, inline edit state, and file download |
| `hooks/useToasts.ts` | Toast notification state |

## API routes (`app/api/`)

All routes are thin server-side proxies: read the NextAuth session, attach `X-Admin-Token`, forward to n8n. The browser never talks to n8n directly.

| Route | Forwards to |
|---|---|
| `extract/route.ts` | Workflow A — full spreadsheet extraction |
| `extract-row/route.ts` | Workflow B — single-row re-run |
| `gmail-discover/route.ts` | Workflow C — Gmail attachment search |
| `gmail-extract/route.ts` | Workflow D — per-attachment extraction |
| `config/status/route.ts` | Health check — confirms `N8N_ADMIN_TOKEN`/`N8N_BASE_URL` are set (no n8n call) |
| `auth/[...nextauth]/route.ts` | NextAuth Google provider (JWT session, `access_token` stored in token) |

## lib/

| File | Purpose |
|---|---|
| `auth.ts` | NextAuth config — Google OAuth scopes (`drive.readonly` + `gmail.readonly`) |
| `api.ts` | Typed fetch wrappers for the API routes above |
| `drive.ts` | Google Drive link parsing helpers |
| `excel.ts` | Client-side `.xlsx` read/write (via `xlsx` package) |
| `formatAmount.ts` | Amount/currency display formatting |
| `n8n-config.ts` | Shared n8n-facing constants |
| `rowStatus.ts` | `RowStatus` derivation/formatting helpers |
| `colors.ts` | Design token constants (`C.*`) used inline instead of a CSS framework for most components |
| `types.ts` | Shared frontend types: `Screen`, `RowStatus`, `InvoiceRow`, `ColumnMapping`, `UploadedFile` |

## Environment variables

See the root [README.md](../README.md#environment-variables-reference) and [CLAUDE.md](../CLAUDE.md#environment-variables) for the full list and production values. Copy `.env.local.example` to `.env.local` to start.

## See also

- [Root README](../README.md) — product overview, both extraction paths
- [CLAUDE.md](../CLAUDE.md) — architecture, gotchas, production checklist
- [backend/README.md](../backend/README.md) — the n8n workflows these routes call
