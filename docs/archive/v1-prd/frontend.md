> **Archived — v1 spec.** Written before the Gmail-scan flow existed. See
> [docs/prd/v2-gmail-frontend.md](../../prd/v2-gmail-frontend.md) for the Gmail addendum
> and [frontend/README.md](../../../frontend/README.md) for the current app structure.

# Frontend PRD: Invoice Extractor Dashboard

**Stack:** Next.js (App Router) · Tailwind CSS · NextAuth.js · Vercel  
**Version:** 1.0

## User flow

```
[Land on dashboard]
        │
        ▼
[Sign in with Google]  ── (scope: openid email profile drive.readonly)
        │
        ▼
[Upload spreadsheet]   ── accepts .xlsx / .csv
        │
        ▼
[Status table appears] ── row-by-row: file | payee | acct | ifsc | status
        │
        ├──  [Run extraction] button  ──► POST /api/extract  ──► n8n
        │
        ├──  [Re-run] per error row   ──► POST /api/extract-row
        │
        ├──  [Inline edit] payee/acct/ifsc  (held in memory)
        │
        └──  [Download filled file]   ──► POST /api/download (client-side blob)
```

## Screens / components

### 1. Auth gate (sign-in page)
- Google "Sign in" button via NextAuth
- Shows product tagline: "Extract invoice payee details in seconds"
- Redirect to upload after success

### 2. Upload screen
- Drag-and-drop or click-to-browse for `.xlsx` / `.csv`
- Shows file name + row count preview after client-side parse (optional, for UX)
- "Start extraction" button (disabled until file selected)

### 3. Status table (main view)
Columns: `#` | `File` | `Payee Name` | `Account No` | `IFSC` | `Status` | `Actions`

Status badges:
- `Pending` — grey
- `Processing` — blue spinner
- `Done` — green
- `Error` — red + tooltip showing error message
- `Unsupported` — amber (`.doc`/`.docx` rows)

Actions per row:
- `Re-run` (on Error/Pending rows) — calls `/api/extract-row`
- Inline edit of Payee / Acct No / IFSC (click-to-edit cells)

Header bar:
- Summary: "12 / 40 done · 2 errors · 1 unsupported"
- `Run extraction` button (re-runs all non-Done rows)
- `Download filled file` button (always visible once upload done)

### 4. Download
- Client triggers `POST /api/download` sending the current in-memory row state
- Server re-applies edits to the original file binary (or n8n returns the already-filled binary)
- Browser receives the `.xlsx` blob — browser's native save dialog handles the rest

## Server-side route handlers (secrets never reach the browser)

| Route | Action |
|---|---|
| `POST /api/extract` | Forwards file (as FormData) + Google token to n8n `/webhook/extract`; adds `X-Admin-Token` header |
| `POST /api/extract-row` | Forwards `{ driveLink, googleAccessToken }` to n8n `/webhook/extract-row` |
| `GET /api/session` | NextAuth session endpoint (standard) |

## Environment variables (set in Vercel + local `.env.local`)

```
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
NEXTAUTH_SECRET=...          # openssl rand -base64 32
NEXTAUTH_URL=https://your.vercel.app
N8N_BASE_URL=https://n8n.piyushtater.com
N8N_ADMIN_TOKEN=...          # matches Admin Token credential in n8n
```

## Auth notes

- Strategy: **JWT** (no DB needed for session)
- Scopes requested at sign-in: `openid email profile https://www.googleapis.com/auth/drive.readonly`
- `access_token` stored in the JWT session (`callbacks.jwt` → include `account.access_token`)
- If token expired mid-run: n8n returns 401 on Drive fetch → row status `Error: auth expired` → dashboard shows "Re-authenticate" banner

## State to handle

| State | UI |
|---|---|
| File not uploaded | Upload screen; extraction button disabled |
| Zero rows with Drive links | Warning: "No Drive links found" |
| All done | Green banner + Download button highlighted |
| All failed | Red banner; suggestion to check Drive permissions |
| Token expired | Amber banner: "Session expired — sign in again to re-run errors" |
| n8n unreachable | Red toast: "Extraction service unavailable — try again" |
| Long file name | Truncate to 40 chars + tooltip |

## File format notes

- Input: `.xlsx` (primary), `.csv` (secondary)
- Output: `.xlsx` — n8n returns a binary blob
- Column auto-detection: header-keyword regex (see backend PRD). If headers don't match, dashboard shows a column-mapping step (one dropdown per expected field)

## Google OAuth app setup (one-time, by developer)

1. Google Cloud Console → APIs & Services → Credentials → Create OAuth 2.0 Client ID
2. Application type: Web application
3. Authorized redirect URIs: `https://your.vercel.app/api/auth/callback/google` (+ localhost for dev)
4. Enable APIs: Google Drive API
5. Scopes: `drive.readonly` (no Sheets API needed — we parse the file locally)
6. For dev/testing: add test users on the OAuth consent screen (unverified app shows warning for non-test users)
