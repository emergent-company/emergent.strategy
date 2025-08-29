# Setup Guide

This guide gets you from zero to a locally running stack with secure OAuth/OIDC via Zitadel, the API server, and the Admin SPA.

## Prerequisites
- Node.js >= 20.19 (LTS recommended)
- Docker Desktop (or Docker Engine + Compose)
- macOS, Linux, or Windows (this guide uses macOS-style commands)

## 1) Install dependencies

```bash
# from repo root
npm install
```

Optional: setup your preferred package manager (yarn/bun). The repo is npm-first.

## 2) Configure environment

Create a root `.env` for the server:

```bash
cp .env.example .env
# then edit .env and set at least:
# - GOOGLE_API_KEY=...         # for embeddings
# - DB connection (matches docker compose defaults)
# - ZITADEL_ISSUER_URL=http://localhost:8080
# - (optional) ZITADEL_AUDIENCE=spec-api
```

Create an Admin SPA `.env`:

```bash
cp apps/admin/.env.example apps/admin/.env
# then edit apps/admin/.env and set at least:
# - VITE_API_BASE=http://localhost:3001
# - VITE_ZITADEL_ISSUER=http://localhost:8080
# - VITE_ZITADEL_CLIENT_ID=... (see step 4 below)
# - VITE_ZITADEL_REDIRECT_URI=http://localhost:5175/auth/callback
# - VITE_ZITADEL_POST_LOGOUT_REDIRECT_URI=http://localhost:5175/
```

Note: If Vite picks a different port than 5175, update the redirect URIs accordingly.

## 3) Start local infrastructure (Postgres + Zitadel + Login v2)

```bash
# from repo root
cd docker
docker compose up -d db zitadel login
open http://localhost:8080/.well-known/openid-configuration
open http://localhost:3000/ui/v2/login
```

- Postgres: 5432 (user/pass/db: spec/spec/spec)
- Zitadel issuer (API): http://localhost:8080
- Login v2 UI: http://localhost:3000/ui/v2/login

Troubleshooting, role creation, and resets are in `docker/README-zitadel.md` and `RUNBOOK.md` → "Local Auth (Zitadel)".

## 4) Create a Public (PKCE) OIDC client in Zitadel

In the Zitadel Console, create a client for the Admin SPA:
- Type: Public client (PKCE)
- Redirect URIs:
  - http://localhost:5175/auth/callback
- Post-logout redirect URIs:
  - http://localhost:5175/
- Allowed origins: http://localhost:5175
- Scopes: openid, profile, email (plus any custom API audience if used)
- Copy the Client ID and set `VITE_ZITADEL_CLIENT_ID` in `apps/admin/.env`

If you add Google/GitHub as IdPs, configure their callbacks in Zitadel and enable them for this project/client.

## 5) Run the dev apps

```bash
# from repo root
npm run dev:all
# server: http://localhost:3001
# admin:  http://localhost:5175
```

If you run them separately:
- Server only: `npm run dev:server`
- Admin only:  `npm run dev:admin`

## 6) Log in and test

1) Open the Admin SPA: http://localhost:5175
2) Click Login and authenticate via Zitadel Login v2
3) After redirect back to `/admin`, navigate the app; API requests include the Bearer token
4) Check API health at http://localhost:3001/health

Protected endpoints (e.g., `/documents`, `/chunks`, `/search`, `/ingest/*`, `/chat/*`) require a valid JWT. Unauthenticated requests should return 401.

## 7) Ingest a page (smoke test)

```bash
npm run test:smoke
```

Or via HTTP:
- POST http://localhost:3001/ingest/url with `{ "url": "https://example.com" }`

## 8) Common pitfalls
- Tailwind/daisyUI classes not applying in Admin: restart the dev server and avoid dynamic class strings
- Vite port changed: update SPA redirect URIs and Allowed Origins in Zitadel
- Zitadel startup errors: master key length, SSL mode, or missing `zitadel` role/db → see `docker/README-zitadel.md`
- Node version warnings: ensure Node >= 20.19 for Vite and React 19

## References
- RUNBOOK: `RUNBOOK.md`
- Local Auth deep-dive: `docker/README-zitadel.md`
- Docker Compose: `docker/docker-compose.yml`
- Admin SPA quickstart: `apps/admin/README.md`
- Server quickstart: `apps/server/README.md`
