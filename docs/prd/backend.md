# Backend PRD: n8n Workflows

**n8n instance:** `https://n8n.piyushtater.com`  
**Gemini credential:** `Google Gemini(PaLM) Api account` (id: `HjzKcNOEvlelKDp2`)  
**Auth credential:** `Admin Token` (id: `REIlq9U7MYnIUAey`)  
**Version:** 1.0

## Overview

Two workflows. Workflow A is the main extraction job (whole file). Workflow B re-runs a single row for the dashboard's per-row Re-run button.

No Google Sheets / Google Drive credential is stored in n8n. All Drive access happens
via HTTP Request nodes using the **user's Google bearer token** forwarded from the dashboard.

---

## Workflow A: `Invoice Extraction`

**Trigger:** `POST /webhook/extract`  
**Auth:** Header `X-Admin-Token` (bound to Admin Token credential)  
**Body:** multipart/form-data: `file` (binary), `googleAccessToken` (string)

### Node sequence

| # | Node type | Key config |
|---|---|---|
| 1 | Webhook | Method POST, path `extract`, Header Auth = Admin Token credential |
| 2 | Extract From File | Operation: `Read`, Format: `xlsx` (auto-detect from input) |
| 3 | Code (runOnceForAllItems) | Column auto-detection: regex headers → map to `driveLink`, `payee`, `accountNumber`, `ifsc`, `rowIndex` fields |
| 4 | Filter | Keep rows where `driveLink` is non-empty AND (`payee` OR `accountNumber` OR `ifsc`) is empty |
| 5 | Loop Over Items | Batch size 1 |
| 6 | Code (runOnceForEachItem) | Parse Drive link → `fileId` via regex `/\/d\/([a-zA-Z0-9_-]+)/` or `[?&]id=([a-zA-Z0-9_-]+)` |
| 7 | HTTP Request | `GET https://www.googleapis.com/drive/v3/files/{{fileId}}?fields=mimeType,name` · header `Authorization: Bearer {{googleAccessToken}}` |
| 8 | HTTP Request | `GET https://www.googleapis.com/drive/v3/files/{{fileId}}?alt=media` · header `Authorization: Bearer {{googleAccessToken}}` · response format: file |
| 9 | Switch | On `mimeType`: `application/pdf` → branch A; `image/*` → branch B; else → branch C |
| 10a | Google Gemini (`document: analyze`) | Credential: `HjzKcNOEvlelKDp2`, model `gemini-2.5-flash`, input: binary from node 8, prompt: see below |
| 10b | Google Gemini (`image: analyze`) | Same credential + model + prompt; binary = node 8 output |
| 10c | Set | `status = Unsupported - manual`, `payee = ""`, `accountNumber = ""`, `ifsc = ""` |
| 11 | Code (runOnceForEachItem) | Parse Gemini JSON: `JSON.parse(output.replace(/```json?\n?|```/g, '').trim())` → extract `payee`, `account_number`, `ifsc`, `confidence`; normalize (`ifsc.toUpperCase()`, `account_number.replace(/\D/g, '')`) |
| 12 | Code (runOnceForEachItem) | Merge extracted fields back into original row object; set `status = Done` |
| 13 | Aggregate | Collect all processed rows into a single list |
| 14 | Convert to File | Operation: `Write`, Format: `xlsx`, input: aggregated rows |
| 15 | Set | Build summary: `{ processed, done, failed, unsupported }` + attach file binary |
| 16 | Respond to Webhook | Response body: the `.xlsx` binary (Content-Type `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`), CORS header `Access-Control-Allow-Origin: https://your.vercel.app` |

**Error handling per row:**  
- Wrap nodes 7–12 in a try/catch (Code node) or use n8n's per-item error branch.
- On any error: set `status = Error: <message>` for that row, continue to next.

### Gemini extraction prompt

```
You are reading an invoice document. Extract ONLY these fields and return valid JSON with no prose, no markdown, no code fences:

{"payee":"string","account_number":"string","ifsc":"string","confidence":0.0}

Rules:
- payee: the account payee or beneficiary name exactly as printed
- account_number: digits only, no spaces or dashes
- ifsc: exactly 11 characters, uppercase (e.g. HDFC0001234)
- confidence: 0.0 to 1.0 — your confidence all three fields are correct
- If a field is missing or unreadable, use "" and lower confidence
```

---

## Workflow B: `Invoice Extract Row`

**Trigger:** `POST /webhook/extract-row`  
**Auth:** Header `X-Admin-Token`  
**Body:** JSON `{ "driveLink": "string", "googleAccessToken": "string" }`

Nodes: 6 → 7 → 8 → 9 → 10a/10b/10c → 11 → Respond to Webhook with JSON `{ payee, accountNumber, ifsc, confidence, status }`

This is a subset of Workflow A with no file reading/writing — just a single Drive link → Gemini → JSON response.

---

## Cross-cutting concerns

### Auth
- Webhooks use `X-Admin-Token` header verified against the `Admin Token` credential.
- Drive access: user's Google bearer token is passed in the request body and used only in HTTP Request headers. It is never logged or stored.

### CORS
- Respond to Webhook nodes include `Access-Control-Allow-Origin: https://your.vercel.app` (replace with actual Vercel URL before deploy).
- Dashboard calls n8n via its own server-side route handlers, so the browser never sees the Admin Token or the n8n URL directly.

### Rate limits
- Batch size 1 avoids Gemini concurrent request limits.
- Add a `Wait` node (1–2 s) between items if you hit 429 responses.

### Idempotency
- Filter node skips rows where all three target fields are already filled.
- Retrying a half-done file is safe.

### File size
- Gemini has a per-file limit (approximately 20 MB for inline; larger files need the Files API). Most invoices are well within range. Large PDFs (>20 MB) should be flagged in the Switch node.

---

## n8n credential reference

| Credential name | Type | Used in |
|---|---|---|
| Google Gemini(PaLM) Api account | `googlePalmApi` | Nodes 10a, 10b |
| Admin Token | `httpHeaderAuth` | Webhook trigger (both workflows) |

No Google Sheets or Google Drive credential is configured. Drive is accessed via user token only.
