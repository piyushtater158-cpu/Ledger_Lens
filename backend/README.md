# LedgerLens — Backend

Local source of truth for the two n8n workflows that power LedgerLens.

## Contents

```
backend/
├── workflows/          ← Cloud JSON exports (re-importable into n8n)
├── src/
│   ├── nodes/          ← One .js file per Code node (jsCode verbatim + header docs)
│   ├── workflow-a-extraction.ts   ← n8n SDK source for Workflow A
│   └── workflow-b-extract-row.ts  ← n8n SDK source for Workflow B
├── prompts/
│   └── gemini-extraction.txt  ← Extraction prompt text (used by OpenRouter analyze nodes)
└── config/
    └── credentials.md  ← Credential + workflow IDs (no secret values)
```

## Workflows

| | Workflow A | Workflow B |
|---|---|---|
| **Name** | Invoice Payee Extraction | Invoice Extract Row |
| **ID** | `vqSkkv9egxmIVpdv` | `LmdFhorOYBoJgXGl` |
| **Endpoint** | `POST /webhook/extract` | `POST /webhook/extract-row` |
| **Input** | `multipart/form-data`: `file` (xlsx) + `googleAccessToken` | `{ driveLink, googleAccessToken }` |
| **Output** | Filled xlsx binary | `{ payee, accountNumber, ifsc, confidence, status }` |
| **Auth** | `X-Admin-Token` header (value = `N8N_ADMIN_TOKEN` env var) | Same |

## Import / restore a workflow

1. Open n8n UI at `https://n8n.piyushtater.com/`
2. Go to **Workflows → Import from file**
3. Select `backend/workflows/invoice-extraction.workflow.json` or `invoice-extract-row.workflow.json`
4. After import, go to the workflow's **Credentials** section and re-assign:
   - Webhook node → **Admin Token** credential (`REIlq9U7MYnIUAey`)
   - OpenRouter Analyze nodes → **OpenRouter API** credential (`openRouterApi`)
   - HTTP Request nodes → **no credential** (they use the forwarded user Bearer token)
5. **Activate** the workflow via the toggle in the top-right corner. Until activated, only
   `/webhook-test/*` paths respond.

## Validate SDK source (re-create from code)

```bash
# Requires n8n MCP to be running (see .mcp.json at project root)
# 1. Load SDK reference:
#    call mcp__n8n-mcp__get_sdk_reference
# 2. Validate the source:
#    call mcp__n8n-mcp__validate_workflow with the TS source from backend/src/
# 3. Re-create if needed:
#    call mcp__n8n-mcp__create_workflow_from_code
```

## Notes on HTTP Request nodes

The **Get Drive Metadata** and **Download Invoice File** nodes in both workflows intentionally
carry no stored n8n credential. Authentication is the user's Google access token, forwarded
per-request from the Next.js API route (`frontend/app/api/extract/route.ts`). No Drive token
is ever persisted in n8n.

## Secrets

See `config/credentials.md` for IDs. Actual secret values live in:
- `frontend/.env.local` — `N8N_ADMIN_TOKEN`, `N8N_BASE_URL`, Google OAuth, `NEXTAUTH_SECRET`
- Root `.env` — `N8N_API_KEY` (for n8n MCP), `N8N_ADMIN_TOKEN`, `N8N_BASE_URL`
