# PRD Overview: Invoice Payee Extractor

**Version:** 1.0  
**Date:** 2026-06-15  
**Status:** Approved

## Problem

A spreadsheet contains rows where each row has a Google Drive link to an invoice
(PDF or image). Three columns — **account payee name**, **bank account number**,
and **IFSC code** — must be filled manually today. This is slow and error-prone.

## Goal

An end-to-end automated system:
1. User uploads their spreadsheet (`.xlsx` / `.csv`)
2. System reads each Drive link, downloads the invoice, sends it to **Gemini 2.5 Flash**
3. AI extracts payee name, bank account number, and IFSC code
4. User downloads the **same spreadsheet, cells filled in**

A dashboard provides the upload UI, a live status table, row-level re-run, inline edit,
and the final download.

## Decisions

| Decision | Choice |
|---|---|
| Input/Output | Upload `.xlsx`/`.csv` → download filled `.xlsx` |
| Access model | Google Sign-In; user's `drive.readonly` token forwarded to n8n |
| No Google cred in n8n | Drive access happens via user bearer token over HTTP |
| Frontend | Next.js dashboard on Vercel |
| Backend | n8n workflows (two webhooks) |
| Database | None — uploaded file is the only store |
| Gemini model | `gemini-2.5-flash` |
| File types v1 | PDF + images; `.doc`/`.docx` → `Unsupported - manual` |

## Architecture

```
 ┌──────────────────────────────────┐
 │  Dashboard (Next.js on Vercel)   │
 │  1. Sign in with Google          │  OAuth (scope: drive.readonly, openid email)
 │  2. Upload invoices.xlsx         │
 │  3. Status table (row-by-row)    │
 │  4. Download filled file         │
 └───────────────┬──────────────────┘
                 │ Next.js API route (server-side)
                 │ adds n8n Admin Token
                 │ forwards { file, googleAccessToken }
                 ▼
 ┌──────────────────────────────────┐
 │  n8n (hosted at n8n.piyushtater.com) │
 │   POST /webhook/extract          │
 │   POST /webhook/extract-row      │
 └───────────────┬──────────────────┘
        ┌─────────┴───────────┐
        ▼                     ▼
  Google Drive API      Google Gemini API
  (Bearer = user token) (gemini-2.5-flash)
```

## Docs index

- [`prd/frontend.md`](frontend.md) — Dashboard PRD
- [`prd/backend.md`](backend.md) — n8n workflow PRD
- [`execution-plan.md`](../execution-plan.md) — Step-by-step build reference

## Known limitations (v1)

- Yellow cell highlight is **not preserved** on round-trip (all data is preserved)
- `.doc`/`.docx` files are not sent to Gemini — flagged for manual review
- Google OAuth app requires one-time setup (client id + consent screen)
