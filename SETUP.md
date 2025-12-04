# Setup Guide

This guide gets you from zero to a locally running stack with secure OAuth/OIDC via Zitadel, the API server, and the Admin SPA.

> **📚 New:** For comprehensive multi-environment setup (local, dev, staging, production), see the **[Environment Setup Guide](docs/guides/ENVIRONMENT_SETUP.md)** which covers:
>
> - Environment comparison and architecture patterns
> - Infisical configuration and workflows
> - Environment variable reference (150+ variables)
> - Production-grade security and operations
> - Troubleshooting across all environments

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

## 3) Start Zitadel (Identity Provider)

**Important:** Zitadel is now deployed independently from the emergent-infra repository.

```bash
# Navigate to the Zitadel deployment directory
cd ../emergent-infra/zitadel

# Copy environment configuration
cp .env.example .env

# Start Zitadel and its PostgreSQL database
docker compose up -d

# Check status
docker compose ps
docker compose logs -f
```

Key endpoints once Zitadel is healthy:

- Zitadel Console: http://localhost:8080
- Login v2 UI: http://localhost:3000/ui/v2/login
- Zitadel PostgreSQL: localhost:5433

For detailed Zitadel setup, configuration, and troubleshooting, see:

- **[emergent-infra/zitadel/README.md](../emergent-infra/zitadel/README.md)** - Comprehensive setup guide
- **[docs/setup/ZITADEL_SETUP_GUIDE.md](docs/setup/ZITADEL_SETUP_GUIDE.md)** - Application integration

## 3b) Start local infrastructure (Postgres for spec-server-2)

```bash
# from spec-server-2 repo root
npm run workspace:deps:start
```

This starts the Docker dependencies (Postgres only - Zitadel is separate) under PM2 supervision with health checks and log capture. To inspect their status or tail logs:

```bash
npm run workspace:status
npm run workspace:logs -- --deps-only --lines 200
```

If you prefer to run Docker manually:

```bash
docker compose -f docker-compose.dev.yml up -d db
```

Key endpoints once healthy:

- spec-server-2 Postgres: 5432 (user/pass/db: spec/spec/spec)

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
npm run workspace:start
# server: http://localhost:3001
# admin:  http://localhost:5175
```

The workspace CLI handles preflight checks, dependency verification, and PM2 process management. Useful follow-up commands:

- Stop services: `npm run workspace:stop`
- Restart services: `npm run workspace:restart`
- Check status (apps + deps): `npm run workspace:status`
- Tail recent logs: `npm run workspace:logs`

To target just one service, pass `--service`:

```bash
npm run workspace:start -- --service server   # API only
npm run workspace:start -- --service admin    # Admin SPA only
```

If you need to stop dependencies when you're done:

```bash
npm run workspace:deps:stop
```

## 6) Log in and test

1. Open the Admin SPA: http://localhost:5175
2. Click Login and authenticate via Zitadel Login v2
3. After redirect back to `/admin`, navigate the app; API requests include the Bearer token
4. Check API health at http://localhost:3001/health

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
- Zitadel startup errors: master key length, SSL mode, or missing `zitadel` role/db → see [Zitadel Setup Guide](docs/setup/ZITADEL_SETUP_GUIDE.md)
- Node version warnings: ensure Node >= 20.19 for Vite and React 19

## 9) (Optional) LangFuse Observability

To enable LLM trace debugging:

1. Start LangFuse infrastructure:

   ```bash
   cd ../emergent-infra/langfuse
   cp .env.example .env
   # Generate secrets as instructed in .env
   docker compose up -d
   ```

2. Access UI at http://localhost:3010, create an account and project, and generate API keys.

3. Update server `.env`:
   ```env
   LANGFUSE_ENABLED=true
   LANGFUSE_HOST=http://localhost:3010
   LANGFUSE_PUBLIC_KEY=pk_...
   LANGFUSE_SECRET_KEY=sk_...
   ```

## References

- RUNBOOK: `RUNBOOK.md`
- Local Auth deep-dive: [Zitadel Setup Guide](docs/setup/ZITADEL_SETUP_GUIDE.md)
- Docker Compose: `docker/docker-compose.yml`
- Admin SPA quickstart: `apps/admin/README.md`
- Server quickstart: `apps/server-nest/README.md`

## Selected Environment Variables

| Variable                              | Default                                           | Scope                  | Description                                                                                                                                                                                                                                             |
| ------------------------------------- | ------------------------------------------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GRAPH_MERGE_ENUM_HARD_LIMIT`         | `500`                                             | Server (merge dry-run) | Hard cap on the number of divergent canonical objects enumerated during a branch merge dry-run. If more objects exist, the response sets `truncated=true` and only the first `limit` are returned. Lower this to reduce DB load on very large branches. |
| `EXTRACTION_DEFAULT_TEMPLATE_PACK_ID` | `1f6f6267-0d2c-4e2f-9fdb-7f0481219775` (fallback) | Server (extraction)    | Template pack that installs automatically on new projects and is used as a fallback when extraction jobs run without a configured prompt. Set this to the UUID of the template pack you want to auto-install in each environment.                       |

Notes:

- The branch merge feature is currently dry-run only; execution (writing merged versions) is not yet enabled.
- Increase the limit cautiously—each additional row requires diff classification work and path overlap checks.
