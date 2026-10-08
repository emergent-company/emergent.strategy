# Tasks

## 0. Decisions (blocking — answer before writing any workflow)

- [ ] 0.1 Decide GCP project: reuse `outblocks` or provision a separate project
- [ ] 0.2 Decide domain: new subdomain, or inherit `strategy.emergent-company.ai` from epf-cli later
- [ ] 0.3 Confirm whether a production Zitadel tenant exists; if not, create it (has independent lead time)
- [ ] 0.4 Decide `STRATEGY_DB_MODE`: `shared` (one Postgres with Memory) or `standalone`
- [ ] 0.5 Decide Memory: deploy alongside, point at existing, or run degraded initially
- [ ] 0.6 Decide whether `ValidateProduction()` should also refuse `STRATEGY_DB_MODE=dev` in production — if yes, file it as a separate code change, do not edit it here

---

## 1. Infrastructure

- [ ] 1.1 Provision Cloud SQL Postgres (or chosen equivalent) with automated backups enabled
- [ ] 1.2 Create a dedicated runtime service account, least-privilege (Cloud SQL client, Secret Manager accessor)
- [ ] 1.3 Create secrets: DB password, Zitadel client secret, LLM credentials
- [ ] 1.4 Verify Workload Identity federation works for the new service account from GitHub Actions
- [ ] 1.5 Decide and document the migration strategy: run `strategy-server db --migrate` as a pre-deploy step or Cloud Run job — never automatically on every container start

---

## 2. Container Build

- [ ] 2.1 Verify `apps/strategy-server/Dockerfile` builds in the monorepo context — it does `COPY . .` and the repo uses `go.work`
- [ ] 2.2 Add an Artifact Registry push step for the strategy-server image, separate from epf-cli's `epf-server` image
- [ ] 2.3 Confirm the built image serves on **8090** and that the deploy passes `--port=8090`, not 8080

---

## 3. Deploy Workflow

- [ ] 3.1 Add `.github/workflows/strategy-server-deploy.yaml`, reusing `deploy.yaml`'s GCP plumbing (Workload Identity, digest resolution, secret resolution, health verification)
- [ ] 3.2 Set `ENV=production`, `AUTH_ENABLED=true`, `STRATEGY_DB_MODE` per 0.4, and all Zitadel vars
- [ ] 3.3 Assert `ZITADEL_DEBUG_TOKEN` is **not** set in any production configuration
- [ ] 3.4 Use a `concurrency` group distinct from `deploy-epf-strategy` so the two deployments cannot serialise against each other
- [ ] 3.5 Add a post-deploy health check against `/health`, matching `deploy.yaml`'s pattern

---

## 4. Staging and Guard Verification

- [ ] 4.1 Deploy to a staging Cloud Run service
- [ ] 4.2 Verify `ENV=production` + `AUTH_ENABLED=false` **fails to start** (exit 1, no listener)
- [ ] 4.3 Verify `ENV=production` + `ZITADEL_DEBUG_TOKEN` set **fails to start**
- [ ] 4.4 Verify `ENV=production` + Zitadel unconfigured **fails to start**
- [ ] 4.5 Verify a correctly configured production start boots and serves `/health` 200
- [ ] 4.6 Verify an unrecognised `ENV` value is refused rather than treated as non-production

---

## 5. Access Token End-to-End (completes `add-scoped-readonly-mcp-access` §10)

- [ ] 5.1 Mint a read-only token scoped to one instance against the staging server
- [ ] 5.2 Connect a real MCP client with that token; confirm `tools/list` responds
- [ ] 5.3 Confirm reads succeed on the granted instance
- [ ] 5.4 Confirm reads fail on a non-granted instance
- [ ] 5.5 Confirm a write tool is denied, including one whose category is inactive
- [ ] 5.6 Revoke the token and confirm the next call fails
- [ ] 5.7 Tick the corresponding tasks in `add-scoped-readonly-mcp-access/tasks.md` (10.1–10.4, 10.6)

---

## 6. Documentation

- [ ] 6.1 Document the MCP client config for a token holder (`type: "remote"`, `url`, `Authorization: Bearer est_...`)
- [ ] 6.2 Document the production environment variables and which are mandatory
- [ ] 6.3 Document the deploy and rollback procedure
- [ ] 6.4 Update `apps/strategy-server/AGENTS.md` to state where the service runs and how to deploy it
