# LedgerLens — n8n Credential & Workflow IDs

These are reference IDs only. No secret values are stored here.

## n8n instance
`https://n8n.piyushtater.com/`

## Credentials

| Name | Type | ID |
|---|---|---|
| Admin Token | `httpHeaderAuth` | `REIlq9U7MYnIUAey` |
| OpenRouter API | `openRouterApi` | `bDCaYQ5pU52IShxl` (name: **OpenRouter account**; also accepts **OpenRouterCredentialsSaved** if renamed) |

### OpenRouter credential setup

Create an **OpenAI API** credential in n8n with:

- **API Key:** your OpenRouter API key (stored only in n8n credentials — never in workflow JSON)
- **Base URL:** `https://openrouter.ai/api/v1`

The analyze Code nodes build the OpenRouter vision payload (`prepareOpenRouterPayload.js`). The following **OpenRouter HTTP Image/Document** HTTP Request nodes call the API using the `openRouterApi` credential (Code nodes cannot access `getCredentials` on this n8n instance).

## Workflows

| Name | ID | Webhook path |
|---|---|---|
| Invoice Payee Extraction (Workflow A) | `vqSkkv9egxmIVpdv` | `POST /webhook/extract` |
| Invoice Extract Row (Workflow B) | `LmdFhorOYBoJgXGl` | `POST /webhook/extract-row` |
| Gmail Invoice Discovery (Workflow C) | `DKeKAKn620xgkpQZ` | `POST /webhook/gmail-discover` |
| Gmail Attachment Extract (Workflow D) | `njpNl9MZDkFvu7eF` | `POST /webhook/gmail-extract` |

## Model

| Setting | Value |
|---|---|
| Provider | OpenRouter (OpenAI-compatible API) |
| Model | `google/gemini-2.5-flash` |
| Endpoint | `https://openrouter.ai/api/v1/chat/completions` |

## Secret locations (not here)

| Secret | Location |
|---|---|
| `N8N_ADMIN_TOKEN` (value of Admin Token credential) | `frontend/.env.local` and root `.env` |
| `N8N_API_KEY` (n8n API key for MCP) | root `.env` |
| OpenRouter API key | n8n **OpenRouter API** credential (`openRouterApi`) |
| Google OAuth client ID/secret | `frontend/.env.local` |
| `NEXTAUTH_SECRET` | `frontend/.env.local` |

## Notes on HTTP Request nodes

The "Get Drive Metadata" and "Download Invoice File" nodes in both workflows intentionally
carry **no stored n8n credential**. They authenticate using the user's Google access token
forwarded per-request from the frontend. This is by design — no Drive token is ever persisted
in n8n.

Both workflows must be **manually activated** in the n8n UI (toggle the Active switch) before
they will respond to production webhook calls at `/webhook/*`. Test calls use `/webhook-test/*`.

For V2 workflows C and D, use the same credentials model:
- Webhook nodes: `httpHeaderAuth` credential `REIlq9U7MYnIUAey` (Admin Token)
- OpenRouter HTTP nodes (Workflow D): `openRouterApi` credential `bDCaYQ5pU52IShxl`
- Gmail HTTP Request nodes: no stored credential; forward `Authorization: Bearer {{token}}`
