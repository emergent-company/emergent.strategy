# Server App

This folder contains the ingestion HTTP server.

- Entry: `src/server.ts`
- Build: `npm run build` (compiles to `apps/server/dist`)
- Dev: `npm run dev` (watches `apps/server/src`)

Env via project root `.env`.

## Local Auth (Zitadel) quickstart

Use the shared dev Zitadel stack for OAuth/OIDC during development.

1) Start Zitadel (from repo root):

```bash
docker compose -f docker/docker-compose.yml up -d db zitadel login
open http://localhost:8080/.well-known/openid-configuration
```

2) Configure server env (root `.env`)

- Set issuer to `http://localhost:8080`
- Ensure your OIDC/JWT validation fetches JWKS from the issuer

3) Run server

```bash
npm run dev:server
```

Notes
- Dev admin: admin@example.com / admin (password set in `docker/zitadel.env`). Change for anything beyond local.
- See `RUNBOOK.md` → "Local Auth (Zitadel)" and `docker/README-zitadel.md` for full docs and troubleshooting.

## API Documentation (Unified)

Unified OpenAPI spec: `openapi/openapi.yaml` (covers auth probe, orgs, projects, settings, ingestion, search, documents, chunks, chat).

Routes (dev server):
- Raw YAML: `GET /openapi/openapi.yaml`
- Interactive docs: `GET /docs`

Update workflow:
1. Modify endpoints or data shapes.
2. Edit `openapi/openapi.yaml` in the same PR.
3. (Optional) Lint:
	- `npx @redocly/cli lint apps/server/openapi/openapi.yaml`
4. Commit spec + code changes atomically.

SSE `/chat/stream` documented as `text/event-stream`; each frame is a line beginning with `data: ` containing a serialized `ChatChunk` JSON object followed by a blank line.
