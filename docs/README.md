# Docs Index

Start here, then drill into whichever doc matches what you need.

## Current

| Doc | Covers |
|---|---|
| [Root README](../README.md) | Product overview, architecture, setup, deployment |
| [CLAUDE.md](../CLAUDE.md) | Full architecture reference, gotchas, production checklist — the most detailed and actively maintained doc |
| [backend/README.md](../backend/README.md) | n8n workflow layout, node source, scripts, credential setup |
| [backend/config/credentials.md](../backend/config/credentials.md) | Credential and workflow IDs (no secret values) |
| [backend/config/v2-gmail-contracts.md](../backend/config/v2-gmail-contracts.md) | Request/response contracts for Workflows C/D (Gmail) |
| [frontend/README.md](../frontend/README.md) | Screens, hooks, API routes |
| [docs/prd/v2-gmail-frontend.md](prd/v2-gmail-frontend.md) | Design doc for the Gmail scan feature (shipped; kept as the design record) |

## Archived (`docs/archive/v1-prd/`)

The original v1 design docs, written before the switch to OpenRouter and before the Gmail
workflows existed. Kept for historical context only — do not treat as current:

- `00-overview.md` — original problem statement and architecture
- `backend.md` — original 2-workflow, direct-Gemini-credential design
- `frontend.md` — original dashboard PRD (spreadsheet-only)
- `execution-plan.md` — step-by-step build log

## Notes

If a doc and the live system ever disagree, the live system wins — verify against
`backend/workflows/*.workflow.json` (or pull the live workflow via the n8n API) rather than
trusting a doc's claim about model names, scopes, or workflow counts. This repo has drifted
before (see the model-name and OAuth-scope corrections folded into CLAUDE.md and the root
README as part of this doc pass).
