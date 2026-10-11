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
- [x] 1.5 **Migration strategy: a pre-deploy Cloud Run job, never on container start.** Cloud Run scales to N instances, so migrating at boot races N containers against one schema. The job runs the *same image* the service will run, so migration and dependent code stay in lockstep, and `gcloud run jobs execute --wait` makes a migration failure fail the deploy before the new revision takes traffic. Verified the invocation against the real container: `db --migrate` under `ENV=production` with no Zitadel configured exits 0 (`ValidateProduction()` is called only from `cmd_serve.go`, so the job does not need auth config). Implemented in `.github/workflows/strategy-server-deploy.yaml`

---

## 2. Container Build

- [x] 2.1 Verify `apps/strategy-server/Dockerfile` builds — **done**. It did not: the `replace` directive on `../epf-cli` could not resolve inside the build context, so `go mod download` failed and the image had never been built. Fixed by absorbing `pkg/decompose` into strategy-server (#86, closes #84). `docker build` now succeeds, and the resulting image was confirmed to enforce the §8 production guards (`ENV=production` + `AUTH_ENABLED=false` exits before binding a listener; unrecognised `ENV` is refused) — which also covers §4.2 and §4.6 below at the container level, though they still need re-checking against a real Cloud Run deploy
- [x] 2.2 Added `.github/workflows/strategy-server-image.yaml`, pushing `strategy-server` to the same Artifact Registry repo but as a distinct image from `epf-server`. Kept out of `release.yaml` deliberately: that workflow is driven by version tags for epf-cli, and the two apps have independent cadences — coupling them would force a release of one to ship the other. Builds `linux/amd64` only (Cloud Run is the sole consumer; arm64 would double build time for an artefact nothing pulls) and emits an immutable digest for the deploy workflow to consume
- [x] 2.3 **Resolved — the premise was wrong, and `--port` must *not* be overridden.** The Dockerfile `EXPOSE`s 8090, but `config.go:95` reads `env:PORT`, and Cloud Run injects `PORT`. Confirmed against the built image: `PORT=8080` produces `listening addr=:8080`. 8090 is a local-dev default only. Forcing `--port=8090` would have been harmless but misleading; leaving Cloud Run's 8080 default is correct

---

## 3. Deploy Workflow

- [x] 3.1 Added `.github/workflows/strategy-server-deploy.yaml`, reusing `deploy.yaml`'s WIF auth, digest resolution, optional-secret probing and health verification. Deploys by digest always, since a tag can be repointed between deploy and rollback
- [x] 3.2 Sets `ENV=production`, `AUTH_ENABLED=true`, `STRATEGY_DB_MODE=standalone` (per 0.4) and `ZITADEL_ISSUER`; `ZITADEL_CLIENT_ID` comes from Secret Manager
- [x] 3.3 Explicit pipeline assertion that no `ZITADEL_DEBUG_TOKEN` binding exists. `ValidateProduction()` already refuses to boot with one set; this fails the pipeline *before* a bad revision is created rather than after it crash-loops
- [x] 3.4 `concurrency.group: deploy-strategy-server`, distinct from `deploy-epf-strategy`
- [x] 3.5 Post-deploy `/health` gate that dumps the JSON body and the last 50 log lines on failure. Confirmed `/health` (`cmd_serve.go:383`) genuinely discriminates: stopping Postgres under a live container flipped it 200 -> 503, while Memory and the LLM report `disabled` without failing the check — matching the §0.5 degraded posture

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
