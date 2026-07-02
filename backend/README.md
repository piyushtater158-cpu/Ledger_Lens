# LedgerLens — Backend

Local source of truth for the n8n workflows that power LedgerLens.

## Contents

```
backend/
├── workflows/          ← Cloud JSON exports (re-importable into n8n)
├── src/
│   ├── nodes/          ← One .js file per Code node (jsCode verbatim + header docs)
│   ├── workflow-a-extraction.ts      ← n8n SDK source for Workflow A
│   ├── workflow-b-extract-row.ts     ← n8n SDK source for Workflow B
│   ├── workflow-c-gmail-discover.ts  ← n8n SDK source for Workflow C
│   └── workflow-d-gmail-extract.ts   ← n8n SDK source for Workflow D
├── prompts/
│   └── gemini-extraction.txt  ← Extraction prompt text (used by OpenRouter analyze nodes)
├── scripts/             ← Deploy/sync/debug scripts (see below)
└── config/
    ├── credentials.md          ← Credential + workflow IDs (no secret values)
    └── v2-gmail-contracts.md   ← Request/response contracts for Workflows C/D
```

## Workflows

| Workflow | ID | Endpoint | Input | Output |
|---|---|---|---|---|
| Workflow A — Invoice Payee Extraction | `vqSkkv9egxmIVpdv` | `POST /webhook/extract` | `multipart/form-data`: `file` + `googleAccessToken` | Filled xlsx binary |
| Workflow B — Invoice Extract Row | `LmdFhorOYBoJgXGl` | `POST /webhook/extract-row` | `{ driveLink, googleAccessToken }` | `{ payee, accountNumber, ifsc, confidence, status }` |
| Workflow C — Gmail Invoice Discovery | `DKeKAKn620xgkpQZ` | `POST /webhook/gmail-discover` | `{ googleAccessToken, query?, after, before, maxMessages? }` | `{ invoices[], truncated, scanned }` |
| Workflow D — Gmail Attachment Extract | `njpNl9MZDkFvu7eF` | `POST /webhook/gmail-extract` | `{ googleAccessToken, messageId, attachmentId, mimeType, filename }` | `{ payee, accountNumber, ifsc, amount, confidence, status }` |

## Import / restore a workflow

1. Open n8n UI at `https://n8n.piyushtater.com/`
2. Go to **Workflows → Import from file**
3. Select one of:
   - `backend/workflows/invoice-extraction.workflow.json`
   - `backend/workflows/invoice-extract-row.workflow.json`
   - `backend/workflows/gmail-discover.workflow.json`
   - `backend/workflows/gmail-extract.workflow.json`
4. After import, go to the workflow's **Credentials** section and re-assign:
   - Webhook node → **Admin Token** credential (`REIlq9U7MYnIUAey`)
   - OpenRouter HTTP nodes (Workflow D) → **OpenRouter API** credential (`openRouterApi`)
   - Gmail/Drive HTTP Request nodes → **no credential** (forwarded user Bearer token)
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

## Scripts

| Script | Purpose |
|---|---|
| `sync-and-deploy-workflows.mjs` | Rebuilds `workflows/*.workflow.json` from `src/nodes/*.js` and pushes to live n8n. `--local-only` regenerates the JSON without deploying. See flags in the file header. |
| `sync-gmail-workflows.mjs` | Same idea, scoped to Workflows C/D. |
| `fetch-execution.mjs`, `analyze-execution.mjs`, `analyze-execution-rows.mjs` | Pull and inspect a past n8n execution by ID — useful for debugging a failed row. |
| `verify-deployed-model.mjs`, `verify-workflow-a-openrouter.mjs` | Confirm the live workflow is actually calling the expected OpenRouter model. |
| `discover-openrouter-credential.mjs` | Look up the OpenRouter credential ID/name registered in n8n. |

Before trusting a `src/nodes/*.js` file as "what's live," check `git diff` — Code node sources are sometimes edited locally ahead of being synced/deployed. The published truth is whatever `sync-and-deploy-workflows.mjs` last pushed to n8n; `workflows/*.workflow.json` in this repo should match that.

## See also

- [Root README](../README.md) — product overview, both extraction paths, deployment
- [CLAUDE.md](../CLAUDE.md) — architecture, gotchas, production checklist
- [frontend/README.md](../frontend/README.md) — how the frontend calls these workflows
