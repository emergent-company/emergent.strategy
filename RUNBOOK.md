# Dev Runbook

This project provides a minimal ingestion server aligned with the spec. It stores documents and chunks in Postgres (pgvector + FTS) and uses Google Gemini for embeddings.

Prereqs
- Node.js >= 20.19
- Docker

1) Start Postgres with pgvector
- From the `docker/` directory, start the DB:

```bash
cd docker
docker compose up -d
```

2) Configure environment
- Copy `.env.example` to `.env` and fill `GOOGLE_API_KEY` (required).
- Default Postgres creds match docker-compose: spec/spec/spec.

3) Install and run
- In project root:

```bash
cp .env.example .env   # then edit GOOGLE_API_KEY
npm install
npm run db:init
npm run dev
```

- Health check: http://localhost:3001/health

4) Ingest
- POST http://localhost:3001/ingest/url with JSON `{ "url": "https://example.com" }`
- POST http://localhost:3001/ingest/upload (multipart form field `file`)

5) Smoke test
- In another terminal:

```bash
npm run test:smoke
```

Notes
- The DB schema defines: `kb.documents` and `kb.chunks` with `embedding vector(768)` and FTS `tsv`.
- Embeddings model: `text-embedding-004` (Google Gemini).
- Content types: basic HTML and text are supported inline; extend parsers for PDF/Docx later.

## Local Auth (Zitadel)

Run a local Zitadel v3 + Postgres stack to support OAuth/OIDC during development.

Quick start (from repo root):

```bash
docker compose -f docker/docker-compose.yml up -d db zitadel login
# Open issuer (OIDC):
open http://localhost:8080/.well-known/openid-configuration
# Open Login v2 UI:
open http://localhost:3000/ui/v2/login
```

Ports & endpoints
- OIDC issuer (API): http://localhost:8080
- Login v2 UI: http://localhost:3000/ui/v2/login

Admin account (dev)
- Email: admin@example.com
- Username: admin
- Password: value of `ZITADEL_ADMIN_PASSWORD` (default in dev: `admin12345`)
- Change these before exposing the stack beyond local dev.

Environment keys to verify (`docker/zitadel.env`)
- Master key: `ZITADEL_MASTERKEY` must be 32 chars; compose runs with `--masterkeyFromEnv`.
- DB user (runtime):
	- `ZITADEL_DATABASE_POSTGRES_HOST=db`, `PORT=5432`, `DATABASE=zitadel`
	- `ZITADEL_DATABASE_POSTGRES_USER_USERNAME=zitadel`, `..._PASSWORD=zitadel`, `..._SSL_MODE=disable`
- DB admin (init/migrations):
	- `ZITADEL_DATABASE_POSTGRES_ADMIN_USERNAME=spec`, `..._PASSWORD=spec`
	- `ZITADEL_DATABASE_POSTGRES_ADMIN_HOST=db`, `..._PORT=5432`, `..._SSL_MODE=disable`
- External/tls (dev): `ZITADEL_EXTERNALDOMAIN=localhost`, `ZITADEL_EXTERNALSECURE=false`, `ZITADEL_TLS_ENABLED=false`
- Login v2 (dev): `ZITADEL_DEFAULTINSTANCE_FEATURES_LOGINV2_REQUIRED=true` and base URLs pointing to port 3000

Reset/recover (stale volume or init failures)
- To fully reset dev data: `docker compose -f docker/docker-compose.yml down -v`
- If Postgres already exists and Zitadel can’t create its role/db, create them manually:

```bash
docker exec -it spec_pg psql -U spec -d postgres \
	-c "CREATE ROLE zitadel LOGIN PASSWORD 'zitadel';" \
	-c "CREATE DATABASE zitadel OWNER zitadel;" \
	-c "GRANT CONNECT ON DATABASE postgres TO zitadel;" \
	-c "GRANT CONNECT, CREATE, TEMP ON DATABASE zitadel TO zitadel;"
```

Common errors and fixes
- "No master key provided": ensure `ZITADEL_MASTERKEY` is present and Zitadel command includes `--masterkeyFromEnv`.
- "sslmode is invalid": set both user and admin `..._SSL_MODE=disable` in `docker/zitadel.env`.
- "password authentication failed for user \"zitadel\"": verify the role/password exists (create manually or reset volumes).
- "permission denied to create role": admin creds must be a Postgres superuser in dev (`spec/spec`).

SPA/server integration
- Frontend issuer: set to `http://localhost:8080` (see `apps/admin/.env.example`).
- Server-side validation: set the same issuer and fetch JWKS from `http://localhost:8080` (see `apps/server/.env.example`).

More details
- See `docker/README-zitadel.md` for the full walkthrough, roles, and troubleshooting.

## Schema Resilience & Dual Mode Behavior

The backend operates in two schema modes:

- Minimal (`E2E_MINIMAL_DB=true`): Fast bootstrap for CI and local smoke loops. Contains only the columns/indexes necessary for ingestion, listing, and basic search.
- Full (default): Adds full text + vector search optimizations, project‑scoped `content_hash` dedup, richer indexing, and triggers.

### Adaptive Logic

Services detect feature availability at runtime and degrade gracefully:

| Component | Primary Behavior | On Missing Column / Constraint | Fallback |
|-----------|------------------|--------------------------------|----------|
| Ingestion (documents) | Hash-based dedup via `content_hash` + unique index | `42703` (column) or detection failure | Raw content equality per project |
| Ingestion (chunks) | Insert with `embedding` + ON CONFLICT(upsert) | `42703` (embedding) or `42P10` (constraint) | Re-insert w/o embedding and/or without upsert |
| Chunks listing | SELECT includes `embedding`, `created_at` | `42703` | Re-run query excluding absent columns, order by `chunk_index` |

Flags like `hasEmbedding` are computed defensively so downstream features remain stable even without embeddings.

### Deduplication

When `content_hash` exists a project-scoped unique index (`idx_documents_project_hash`) prevents duplicates. If absent, equality comparison on raw `content` is used transparently.

### Operator Signals

One-time warnings:
```
kb.documents.content_hash missing; using raw content equality for dedup
kb.chunks.embedding column missing; continuing without embeddings
```
These are informational unless vector / semantic search relevance is a SLO driver.

### Migration Pattern
1. Deploy additive migration (new columns & indexes).
2. Instances auto-detect; no coordinated restart required.
3. Monitor ingest latency, dedup hit %, search relevance metrics.
4. After stable adoption, fallback branches can be retired.

### Choosing a Mode
| Use Case | Recommended Mode |
|----------|------------------|
| Fast unit/E2E loop, onboarding | Minimal |
| Performance & relevance benchmarking | Full |
| Production parity verification | Full |
| Resilience regression tests | Minimal |

### Troubleshooting
1. Inspect logs for `42703` / `42P10` to confirm fallback path usage.
2. `\d kb.documents` / `\d kb.chunks` (psql) to verify expected columns.
3. Ensure `idx_documents_project_hash` exists for optimal dedup (full mode).
4. For test DB reset with minimal schema: set `FORCE_E2E_SCHEMA_RESET=true` and restart.

The system favors forward progress; absence of advanced columns never blocks ingestion.
