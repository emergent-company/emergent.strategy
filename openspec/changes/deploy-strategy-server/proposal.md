# Deploy strategy-server

## Why

**strategy-server has no deployment. Anywhere.**

This was discovered while implementing `add-scoped-readonly-mcp-access`, which
added production safety guards (`ENV=production` refuses to boot with auth
disabled, with a debug token set, or with Zitadel unconfigured). Writing those
guards required knowing what production looks like — and the answer was that it
does not exist:

- `.github/workflows/deploy.yaml` is titled *"EPF Cloud Run Manual Deploy"* and
  ships `apps/epf-cli` to the `epf-strategy` Cloud Run service.
- `.github/workflows/strategy-server.yaml` is **CI only** — test and build, no
  deploy step.
- `.github/workflows/release.yaml` releases `epf-cli` binaries.

So the app being actively developed as epf-cli's replacement has never run
anywhere but developer laptops, while the app in maintenance mode is the one
with a production service and a domain.

This matters now for three reasons:

1. **The scoped read-only access token feature is unusable without it.** The
   entire point of `add-scoped-readonly-mcp-access` is to give an external
   party a read-only MCP connection. An external party cannot connect to
   `localhost:8090`. The feature is merged, tested, and currently unreachable.
2. **The production guards are untested against a real environment.** They are
   verified by unit tests and by running the binary locally, which is good but
   is not the same as a misconfigured deploy actually failing to start.
3. **epf-cli cannot be retired until strategy-server reaches parity**
   (`retire-epf-cli`, 0/35). "Deployed" is a precondition for parity that no
   existing change owns.

## What We're Building

A Cloud Run deployment for `apps/strategy-server`, modelled on the existing
`deploy.yaml` but **not** a copy of it — the two apps have materially different
runtime requirements (see Scope).

## Scope

### In scope

- A `strategy-server-deploy.yaml` workflow deploying to Cloud Run
- Cloud SQL (or equivalent managed Postgres) provisioning and connection
- Database migration execution as part of deploy
- Production configuration: `ENV=production`, `AUTH_ENABLED=true`, Zitadel vars
- A dedicated runtime service account with least-privilege IAM
- Secret management for DB credentials, Zitadel client secret, and LLM credentials
- A staging service to verify the production guards actually abort
- MCP client configuration documentation for access token holders

### Out of scope

- Changing any application code. If a guard or config default turns out to be
  wrong, that is a bug fix in its own change.
- Migrating `epf-strategy` (the epf-cli service) or its domain. epf-cli stays
  deployed and maintained until `retire-epf-cli` says otherwise.
- Zitadel tenant setup, if one does not already exist for production.

## Why This Is Not a Copy of `deploy.yaml`

The existing workflow is a useful template for the GCP plumbing — Workload
Identity auth, Artifact Registry digest resolution, secret version resolution,
post-deploy health verification. Reuse that. But four things genuinely differ,
and each is a way to get this wrong by copying:

| Concern | epf-cli (`deploy.yaml`) | strategy-server |
|---|---|---|
| **Port** | `--port=8080` | Dockerfile exposes **8090** |
| **Database** | None — stateless, reads embedded artifacts | **Requires Postgres**; 44 migrations |
| **Auth** | `--allow-unauthenticated`, no app-level auth | `--allow-unauthenticated` at the *platform* layer, but app-level Zitadel auth **must** be on |
| **Build context** | Single module | Monorepo with `go.work`; the Dockerfile `COPY . .` from `apps/strategy-server/` |

The port mismatch is the quiet one: Cloud Run routes to `--port`, so copying
`--port=8080` against a container listening on 8090 yields a service that
deploys "successfully" and fails every request.

### `--allow-unauthenticated` is not an app-auth decision

`deploy.yaml` passes `--allow-unauthenticated`, which disables *Cloud Run's*
IAM check and makes the service publicly reachable. strategy-server needs that
too — MCP clients and token holders authenticate with a Bearer token the app
validates itself, not with a Google identity.

What must not happen is treating that flag as license to relax app auth.
`AUTH_ENABLED=true` and a configured Zitadel are mandatory, and
`ValidateProduction()` already refuses to boot without them. The platform is
open; the application is not.

## Database Mode

`STRATEGY_DB_MODE` defaults to `dev`, which is explicitly "no auth, no Memory
required". Production must set `shared` or `standalone` deliberately:

- `shared` — one Postgres shared with emergent.memory
- `standalone` — a separate instance for strategy-server

This choice is not obvious and should be made explicitly as part of this
change, not defaulted into.

Note that `ValidateProduction()` currently does **not** check `STRATEGY_DB_MODE`.
Whether booting in production with `dev` mode should be refused is a question
this change should answer — and if the answer is yes, that is a code change
belonging to its own proposal, not a silent edit here.

## Verification This Unblocks

`add-scoped-readonly-mcp-access` has six end-to-end tasks (10.1–10.4, 10.6)
that require a live server and a real MCP client. They have equivalent
automated coverage — the CLI mint/list/revoke cycle was exercised against a
real database, and the grant/deny matrix is covered by
`register_token_tools_test.go` and the write-gate tests — but "a unit test
covers this" is not what those tasks ask for, and they were deliberately left
unticked rather than marked done on the strength of something weaker.

Once a staging service exists, that verification can be completed honestly.

## Open Questions

1. **Which GCP project?** `deploy.yaml` uses `outblocks`. Same project, or a
   separate one for blast-radius isolation?
2. **Which domain?** epf-cli holds `strategy.emergent-company.ai`. A new
   subdomain, or does strategy-server eventually take that one over as part of
   `retire-epf-cli`?
3. **Does a production Zitadel tenant exist?** If not, that is a prerequisite
   with its own lead time.
4. **Cloud SQL sizing and backup policy** — unknown load, so start small, but
   backups are not optional for the only copy of a customer's strategy graph.
5. **Memory server** — semantic features need emergent.memory reachable.
   Deploy alongside, point at an existing instance, or run degraded initially?
   The server is designed to degrade gracefully, so degraded-first is viable.
