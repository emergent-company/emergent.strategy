# Dev Runbook

This project provides a minimal ingestion server aligned with the spec. It stores documents, chunks, and embeddings in Postgres with pgvector.

> **📚 Environment Setup:** For comprehensive environment configuration guides (local, dev, staging, production), including Infisical workflows and detailed variable reference, see the **[Environment Setup Guide](docs/guides/ENVIRONMENT_SETUP.md)**.

## Local Auth (Zitadel)

SPA/server integration

- Frontend issuer: set to `http://localhost:8100` (see `apps/admin/.env.example`).
- Server-side validation: set the same issuer and fetch JWKS from `http://localhost:8100` (see `apps/server/.env.example`).

Prereqs

- Node.js >= 20.19
- Docker

1. Start foundational services with the Workspace CLI

- From the repository root, launch Docker dependencies under PM2 supervision:

```bash
npm run workspace:deps:start
```

- Check dependency health and tail logs when needed:

```bash
npm run workspace:status -- --deps-only
npm run workspace:logs -- --deps-only --lines 200
```

- Prefer the workspace CLI for consistent preflight checks, health probes, and logrotate wiring. The manual docker-compose flow remains available for emergencies:

```bash
cd docker
docker compose up -d db zitadel login
```

2. Configure environment

- Copy `.env.example` to `.env` and fill `GOOGLE_API_KEY` (required).
- Default Postgres creds match docker-compose: spec/spec/spec.

3. Install and run

- In project root:

```bash
cp .env.example .env   # then edit GOOGLE_API_KEY
npm install
npm run db:init
npm run workspace:start
```

- Health check: http://localhost:3001/health
- Admin SPA: http://localhost:5175

- Useful lifecycle commands:

```bash
npm run workspace:status          # consolidated health
npm run workspace:logs            # tail logs for apps + deps
npm run workspace:restart         # restart API + Admin
npm run workspace:stop            # stop API + Admin
npm run workspace:deps:restart    # restart Docker dependencies
npm run workspace:deps:stop       # stop Docker dependencies
```

4. Ingest

- POST http://localhost:3001/ingest/url with JSON `{ "url": "https://example.com" }`
- POST http://localhost:3001/ingest/upload (multipart form field `file`)

5. Smoke test

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
open http://localhost:8100/.well-known/openid-configuration
# Open Login v2 UI:
open http://localhost:8101/ui/v2/login
```

Ports & endpoints

- OIDC issuer (API): http://localhost:8100
- Login v2 UI: http://localhost:8101/ui/v2/login

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
- Login v2 (dev): `ZITADEL_DEFAULTINSTANCE_FEATURES_LOGINV2_REQUIRED=true` and base URLs pointing to port 8101

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

- See [Zitadel Setup Guide](docs/setup/ZITADEL_SETUP_GUIDE.md) for the complete walkthrough, configuration, and troubleshooting.

## Schema Resilience & Dual Mode Behavior

The backend operates in two schema modes:

- Minimal (`E2E_MINIMAL_DB=true`): Fast bootstrap for CI and local smoke loops. Contains only the columns/indexes necessary for ingestion, listing, and basic search.
- Full (default): Adds full text + vector search optimizations, project‑scoped `content_hash` dedup, richer indexing, and triggers.

### Adaptive Logic

Services detect feature availability at runtime and degrade gracefully:

| Component             | Primary Behavior                                   | On Missing Column / Constraint              | Fallback                                                      |
| --------------------- | -------------------------------------------------- | ------------------------------------------- | ------------------------------------------------------------- |
| Ingestion (documents) | Hash-based dedup via `content_hash` + unique index | `42703` (column) or detection failure       | Raw content equality per project                              |
| Ingestion (chunks)    | Insert with `embedding` + ON CONFLICT(upsert)      | `42703` (embedding) or `42P10` (constraint) | Re-insert w/o embedding and/or without upsert                 |
| Chunks listing        | SELECT includes `embedding`, `created_at`          | `42703`                                     | Re-run query excluding absent columns, order by `chunk_index` |

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

| Use Case                             | Recommended Mode |
| ------------------------------------ | ---------------- |
| Fast unit/E2E loop, onboarding       | Minimal          |
| Performance & relevance benchmarking | Full             |
| Production parity verification       | Full             |
| Resilience regression tests          | Minimal          |

### Troubleshooting

1. Inspect logs for `42703` / `42P10` to confirm fallback path usage.
2. `\d kb.documents` / `\d kb.chunks` (psql) to verify expected columns.
3. Ensure `idx_documents_project_hash` exists for optimal dedup (full mode).
4. For test DB reset with minimal schema: set `FORCE_E2E_SCHEMA_RESET=true` and restart.

The system favors forward progress; absence of advanced columns never blocks ingestion.

---

## Coolify Deployment Operations

### Deployment

**Initial deployment:**

```bash
./scripts/deploy-coolify.sh
```

**Update environment variables:**

```bash
# Edit variables
vim .env.production

# Sync to Coolify
export COOLIFY_APP_UUID=your-app-uuid
export COOLIFY_TOKEN=your-api-token
./scripts/sync-coolify-env.sh .env.production preview

# Restart if needed
coolify app restart $COOLIFY_APP_UUID --preview
```

**Manual deployment via CLI:**

```bash
coolify app deploy <APP_UUID> --preview
coolify app logs <APP_UUID> --preview --follow
```

**Trigger from Git:**

- Push to main branch (if auto-deploy enabled in Coolify)
- Or manually trigger in Coolify UI: Application → Deployments → Deploy

### Monitoring

**View logs:**

```bash
# Follow all service logs
coolify app logs <APP_UUID> --preview --follow

# View specific service
docker compose logs -f server

# Search for errors
coolify app logs <APP_UUID> --preview | grep -E "(ERROR|FATAL|Exception)"

# View last 100 lines
coolify app logs <APP_UUID> --preview | tail -100
```

**Check service health:**

```bash
# Via health endpoints
curl https://api.yourdomain.com/health
curl https://app.yourdomain.com/health

# Via Coolify CLI
coolify app get <APP_UUID>

# Via Docker
docker compose ps
docker compose exec server curl http://localhost:3002/health
```

**Monitor resources:**

```bash
# In Coolify UI: Application → Metrics
# Or via Docker:
docker stats

# Check service resource usage
docker compose exec server ps aux
docker compose exec server df -h
```

### Scaling

**Horizontal scaling:**

1. In Coolify UI: Application → Resources → Replicas
2. Increase replicas for `server` and `admin` services
3. Load balancing handled automatically by Traefik
4. Database services should remain at 1 replica

**Vertical scaling:**

1. In Coolify UI: Application → Resources → Limits
2. Adjust CPU and memory limits per service
3. Recommended limits:
   - server: 1 CPU, 1GB RAM
   - admin: 0.5 CPU, 512MB RAM
   - db: 2 CPU, 2GB RAM
   - zitadel: 1 CPU, 1GB RAM

### Backup & Restore

**Database backup:**

```bash
# SSH into Coolify server
ssh your-coolify-server

# Create backup
docker compose exec db pg_dump -U spec spec > backup_$(date +%Y%m%d_%H%M%S).sql

# Or with compression
docker compose exec db pg_dump -U spec spec | gzip > backup_$(date +%Y%m%d_%H%M%S).sql.gz

# List backups
ls -lh backup_*.sql*
```

**Restore from backup:**

```bash
# Stop server to prevent writes
docker compose stop server

# Restore
docker compose exec -T db psql -U spec spec < backup_20251031_120000.sql

# Or from compressed
gunzip -c backup_20251031_120000.sql.gz | docker compose exec -T db psql -U spec spec

# Restart server
docker compose start server
```

**Zitadel backup:**

```bash
docker compose exec zitadel-db pg_dump -U postgres zitadel > zitadel_backup_$(date +%Y%m%d).sql
```

**Volume backup:**

```bash
# Backup volume to tar
docker run --rm -v spec-server-2_postgres-data:/data -v $(pwd):/backup \
  alpine tar czf /backup/postgres-data-$(date +%Y%m%d).tar.gz -C /data .

# Restore volume from tar
docker run --rm -v spec-server-2_postgres-data:/data -v $(pwd):/backup \
  alpine tar xzf /backup/postgres-data-20251031.tar.gz -C /data
```

### Maintenance

**Update application code:**

```bash
# 1. Push changes to Git
git push origin main

# 2. Deploy updates
./scripts/deploy-coolify.sh

# Or via Coolify CLI
coolify app deploy <APP_UUID> --preview
```

**Update dependencies:**

```bash
# 1. Update package.json locally
cd apps/server && npm update
cd ../admin && npm update

# 2. Commit and push
git add package*.json
git commit -m "Update dependencies"
git push

# 3. Trigger rebuild
./scripts/deploy-coolify.sh
```

**Database migrations:**

```bash
# Automatic on container start if DB_AUTOINIT=true

# Manual migration
docker compose exec server npm run migrate

# Check migration status
docker compose exec db psql -U spec -d spec -c \
  "SELECT * FROM migrations ORDER BY id DESC LIMIT 5"
```

**Clear Docker cache:**

```bash
# Rebuild without cache
coolify app deploy <APP_UUID> --preview --no-cache

# Or via Docker
docker compose build --no-cache
```

**Restart services:**

```bash
# Restart all services
coolify app restart <APP_UUID> --preview

# Restart specific service
docker compose restart server

# Graceful restart (wait for health)
docker compose restart server && docker compose ps
```

### Troubleshooting Production Issues

**Service won't start:**

```bash
# Check logs
coolify app logs <APP_UUID> --preview | tail -200

# Check service status
docker compose ps

# Check specific service logs
docker compose logs server --tail=100

# Inspect container
docker compose exec server sh
```

**Database connection issues:**

```bash
# Verify database is running
docker compose ps db

# Test connection from server
docker compose exec server psql -h db -U spec -d spec -c "SELECT 1"

# Check database logs
docker compose logs db --tail=50

# Verify environment variables
docker compose exec server env | grep -E "POSTGRES|PGHOST"
```

**High memory usage:**

```bash
# Check memory usage
docker stats --no-stream

# Identify memory hogs
docker compose exec server ps aux --sort=-rss | head

# Restart service to clear memory
docker compose restart server
```

**SSL/Certificate issues:**

```bash
# Check certificate status in Coolify UI
# Or test manually:
curl -vI https://api.yourdomain.com 2>&1 | grep -E "(SSL|certificate|CN=)"

# Force certificate renewal (if Coolify manages it)
# Check Coolify docs for certificate refresh commands
```

**Build failures:**

```bash
# Check build logs
coolify app logs <APP_UUID> --preview | grep -A 50 "Building"

# Test build locally
docker compose build server

# Check Docker BuildKit
docker buildx version

# Clear build cache
docker builder prune -af
```

**Authentication failures:**

```bash
# Check Zitadel is running
docker compose ps zitadel

# Test Zitadel endpoint
curl https://auth.yourdomain.com/.well-known/openid-configuration

# Check Zitadel logs
docker compose logs zitadel --tail=100

# Verify OAuth client configuration in Zitadel UI
```

### Performance Tuning

**Database optimization:**

```bash
# Analyze query performance
docker compose exec db psql -U spec -d spec -c "EXPLAIN ANALYZE SELECT ..."

# Check index usage
docker compose exec db psql -U spec -d spec -c \
  "SELECT schemaname, tablename, indexname, idx_scan FROM pg_stat_user_indexes"

# Vacuum database
docker compose exec db psql -U spec -d spec -c "VACUUM ANALYZE"
```

**Enable query logging (temporary):**

```bash
# Edit docker-compose.yml and add to db environment:
# POSTGRES_LOG_STATEMENT=all

# Restart database
docker compose restart db

# View query logs
docker compose logs db -f | grep "LOG:  statement:"
```

**Connection pooling:**

```bash
# Check active connections
docker compose exec db psql -U spec -d spec -c \
  "SELECT count(*) FROM pg_stat_activity WHERE datname='spec'"

# Check max connections
docker compose exec db psql -U spec -d spec -c "SHOW max_connections"
```

### Emergency Procedures

**Complete service restart:**

```bash
# Stop all services
docker compose down

# Start all services
docker compose up -d

# Verify health
docker compose ps
curl https://api.yourdomain.com/health
```

**Rollback deployment:**

```bash
# Via Coolify UI: Application → Deployments → Rollback to previous
# Or redeploy previous Git commit
git checkout <previous-commit>
./scripts/deploy-coolify.sh
```

**Database recovery:**

```bash
# 1. Stop server
docker compose stop server

# 2. Backup current state (just in case)
docker compose exec db pg_dump -U spec spec > emergency_backup.sql

# 3. Restore from known good backup
docker compose exec -T db psql -U spec spec < backup_known_good.sql

# 4. Restart server
docker compose start server
```

**Clean slate restart:**

```bash
# ⚠️  WARNING: This deletes all data!

# Stop and remove containers + volumes
docker compose down -v

# Restart from scratch
docker compose up -d

# Migrations will run automatically if DB_AUTOINIT=true
```

### Useful Coolify Commands

```bash
# Authentication
coolify auth

# List projects
coolify project list

# List applications
coolify app list

# Get app info
coolify app get <APP_UUID>

# Deploy
coolify app deploy <APP_UUID> --preview

# Restart
coolify app restart <APP_UUID> --preview

# Stop
coolify app stop <APP_UUID> --preview

# Start
coolify app start <APP_UUID> --preview

# View logs
coolify app logs <APP_UUID> --preview --follow

# List environment variables
coolify app env list <APP_UUID> -s --format json

# Execute command in container
coolify app exec <APP_UUID> <SERVICE> -- <COMMAND>
```

### References

- **Deployment Guide**: [Coolify Deployment](./docs/deployment/coolify/deployment-ready.md)
- **Deployment Plan**: [docs/plans/coolify-deployment.md](./docs/plans/coolify-deployment.md)
- **Environment Variables**: [.env.production.example](./.env.production.example)
- **Coolify Docs**: https://coolify.io/docs
- **Docker Compose**: https://docs.docker.com/compose/
