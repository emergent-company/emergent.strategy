# Tasks

## 0. Decisions (blocking — answer before writing any workflow)

Decided 2026-10-11. Recorded with reasoning so the workflow does not have to
re-litigate them, and so a later reversal is a deliberate act rather than a
quiet drift.

- [x] 0.1 **GCP project: reuse `outblocks`.** Workload Identity federation,
  Artifact Registry and the deploy pattern already work there, so the first
  deploy tests the application rather than the plumbing. strategy-server still
  gets its own service name, runtime service account and secrets, so IAM stays
  least-privilege; only the project-level blast radius is shared. Revisit if
  strategy-server and epf-cli ever need separate billing or quota boundaries.
- [ ] 0.2 Decide domain: new subdomain, or inherit `strategy.emergent-company.ai`
  from epf-cli later — **still open**, and not blocking: Cloud Run issues a
  `*.run.app` URL that staging verification (§4) and the first token-holder
  test (§5) can use unchanged.
- [x] 0.3 **A production Zitadel tenant exists.** No provisioning lead time, so
  §1 is not gated on it. `ZITADEL_ISSUER` and `ZITADEL_CLIENT_ID` must be set
  or `ValidateProduction()` refuses to boot — that is the intended behaviour,
  not an obstacle to work around.
- [x] 0.4 **`STRATEGY_DB_MODE=standalone`, on Cloud SQL.** A dedicated managed
  Postgres rather than one shared with Memory: independent sizing, upgrade
  windows and backup policy, and no coupling of strategy-server's availability
  to Memory's. This is the only copy of a customer's strategy graph, so
  automated backups (§1.1) are not optional. `shared` remains viable later if
  the two services are co-located and the operational coupling is accepted.
- [x] 0.5 **Memory: run degraded initially.** The server is explicitly designed
  to degrade when Memory is unreachable — semantic search, contradiction
  detection and scenarios switch off, everything else works. Shipping the core
  service first keeps the first deploy small and makes a Memory failure a
  feature gap rather than an outage. Memory is a follow-up, not a prerequisite.
- [ ] 0.6 Decide whether `ValidateProduction()` should also refuse
  `STRATEGY_DB_MODE=dev` in production — **still open**. Given 0.4, the deploy
  sets `standalone` explicitly, so this is defence in depth against a dropped
  environment variable rather than a live gap. If adopted it is a code change
  with its own tests; do not edit `ValidateProduction()` from this change.

---

## 1. Infrastructure

- [ ] 1.1 Provision Cloud SQL Postgres (or chosen equivalent) with automated backups enabled
- [ ] 1.2 Create a dedicated runtime service account, least-privilege (Cloud SQL client, Secret Manager accessor)
- [ ] 1.3 Create secrets: DB password, Zitadel client secret, LLM credentials
- [ ] 1.4 Verify Workload Identity federation works for the new service account from GitHub Actions
- [ ] 1.5 Decide and document the migration strategy: run `strategy-server db --migrate` as a pre-deploy step or Cloud Run job — never automatically on every container start

---

## 2. Container Build

- [x] 2.1 Verify `apps/strategy-server/Dockerfile` builds — **done**. It did not: the `replace` directive on `../epf-cli` could not resolve inside the build context, so `go mod download` failed and the image had never been built. Fixed by absorbing `pkg/decompose` into strategy-server (#86, closes #84). `docker build` now succeeds, and the resulting image was confirmed to enforce the §8 production guards (`ENV=production` + `AUTH_ENABLED=false` exits before binding a listener; unrecognised `ENV` is refused) — which also covers §4.2 and §4.6 below at the container level, though they still need re-checking against a real Cloud Run deploy
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
