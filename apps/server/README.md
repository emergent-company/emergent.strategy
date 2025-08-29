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
