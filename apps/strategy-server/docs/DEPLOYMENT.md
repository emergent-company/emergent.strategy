# Deploying strategy-server

Production runbook: infrastructure, configuration, deploy, rollback, and how a
token holder connects.

The service runs on **Cloud Run** in GCP project `outblocks`, region
`europe-west1`, against a dedicated **Cloud SQL** Postgres instance. It shares
that project and an Artifact Registry repo with epf-cli's `epf-strategy`
service and nothing else — distinct service, image, runtime service account,
secrets and concurrency group, so neither deploy can interfere with the other.

---

## 1. Infrastructure

Provisioned once, by hand. The workflows hard-code these names; matching them
exactly means no workflow edits.

| Thing | Name |
|---|---|
| GCP project | `outblocks` |
| Region | `europe-west1` |
| Cloud SQL instance | `outblocks:europe-west1:strategy-server` |
| Cloud Run service | `strategy-server` |
| Migration job | `strategy-server-migrate` |
| Runtime service account | `strategy-server-runtime@outblocks.iam.gserviceaccount.com` |
| Image | `europe-west1-docker.pkg.dev/outblocks/epf/strategy-server` |

### Cloud SQL

```bash
gcloud sql instances create strategy-server \
  --project=outblocks --region=europe-west1 \
  --database-version=POSTGRES_16 --tier=db-g1-small \
  --storage-size=10GB --storage-auto-increase \
  --backup --backup-start-time=02:00 --retained-backups-count=14 \
  --availability-type=zonal

gcloud sql databases create strategy --instance=strategy-server --project=outblocks

DB_PASSWORD="$(openssl rand -base64 32)"
gcloud sql users create strategy --instance=strategy-server \
  --project=outblocks --password="${DB_PASSWORD}"
```

`--backup` is not optional. This is the only copy of a customer's strategy
graph — that is why `STRATEGY_DB_MODE=standalone` was chosen over sharing
Memory's database.

`db-g1-small` is a starting guess, not a sizing decision; resize under real
load. `zonal` means a zone outage is an outage; `regional` roughly doubles cost
for an HA standby and is the right trade only once there are users to protect.

### Runtime service account

Separate identity from the one CI uses to push images.

```bash
gcloud iam service-accounts create strategy-server-runtime \
  --project=outblocks --display-name="strategy-server Cloud Run runtime"

for ROLE in roles/cloudsql.client roles/secretmanager.secretAccessor; do
  gcloud projects add-iam-policy-binding outblocks \
    --member="serviceAccount:strategy-server-runtime@outblocks.iam.gserviceaccount.com" \
    --role="${ROLE}"
done
```

Two roles, deliberately. If the container is compromised the blast radius
should be "reads its own secrets, talks to its own database".

The CI service account (the `GCP_SERVICE_ACCOUNT` repo secret) additionally
needs `roles/iam.serviceAccountUser` **on the runtime account**, or deploys
fail with a permissions error that does not name the missing grant:

```bash
gcloud iam service-accounts add-iam-policy-binding \
  strategy-server-runtime@outblocks.iam.gserviceaccount.com \
  --project=outblocks \
  --member="serviceAccount:<CI_SERVICE_ACCOUNT_EMAIL>" \
  --role=roles/iam.serviceAccountUser
```

---

## 2. Configuration

### Secrets — Secret Manager

```bash
printf '%s' "${DB_PASSWORD}" | gcloud secrets create strategy-server-db-password \
  --project=outblocks --replication-policy=automatic --data-file=-

gcloud secrets create strategy-server-zitadel-key \
  --project=outblocks --replication-policy=automatic \
  --data-file=/path/to/zitadel-service-account-key.json
```

Optional, and **absent is a valid state** rather than a failure — the
subsystem reports `disabled` in `/health` and the service stays up:

```bash
gcloud secrets create strategy-server-memory-token  --project=outblocks \
  --replication-policy=automatic --data-file=-
gcloud secrets create strategy-server-llm-api-key   --project=outblocks \
  --replication-policy=automatic --data-file=-
```

### GitHub repository variables

Not secrets:

```bash
gh variable set STRATEGY_ZITADEL_ISSUER    --body "https://<tenant>.zitadel.cloud"
gh variable set STRATEGY_ZITADEL_CLIENT_ID --body "<client-id>"
```

### Why the Zitadel key is a volume and the client id is not a secret

`ZITADEL_KEY_PATH` is a **path**, not key material, so the key is mounted as a
Secret Manager volume at `/etc/zitadel/key.json`. Binding the JSON to that
variable as an env var would fail at `open(2)` with an unhelpful error.

`ZITADEL_CLIENT_ID` is a **public identifier** — it appears in browser-visible
OIDC requests. Storing it in Secret Manager would imply a confidentiality it
does not have and add rotation ceremony for nothing.

### Environment variables

Set by the deploy workflow. Mandatory ones are mandatory because
`ValidateProduction()` (`config/config.go:261`) refuses to boot without them.

| Variable | Value | Mandatory | Notes |
|---|---|---|---|
| `ENV` | `production` | **yes** | Any unrecognised value is refused, not treated as dev |
| `AUTH_ENABLED` | `true` | **yes** | `false` under production aborts before binding a listener |
| `STRATEGY_DB_MODE` | `standalone` | **yes** | Default is `dev`; must be set deliberately |
| `ZITADEL_ISSUER` | from repo variable | **yes** | |
| `ZITADEL_CLIENT_ID` | from repo variable | **yes** | |
| `ZITADEL_KEY_PATH` | `/etc/zitadel/key.json` | yes | Path to the mounted volume |
| `PGHOST` | `/cloudsql/<instance>` | yes | Unix socket, not TCP |
| `PGUSER`, `PGDATABASE` | `strategy` | yes | |
| `PGPASSWORD` | from Secret Manager | yes | |
| `PORT` | injected by Cloud Run | — | See below |
| `ZITADEL_DEBUG_TOKEN` | **never set** | — | Total auth bypass; refused under production |
| `EPF_MEMORY_*` | optional | no | Unset ⇒ semantic features disabled |
| `LLM_*` | optional | no | Unset ⇒ formula/agent-orchestrated mode |

**Do not pass `--port`.** The Dockerfile `EXPOSE`s 8090, but `config.go:95`
reads `env:PORT`, and Cloud Run injects `PORT`. Verified against the built
image: `PORT=8080` produces `listening addr=:8080`. 8090 is a local-dev
convention only.

---

## 3. Deploy

Two workflows:

| Workflow | Trigger | Does |
|---|---|---|
| `strategy-server-image.yaml` | push to `main` touching `apps/strategy-server/**`, or manual | Builds and pushes the image, prints the digest |
| `strategy-server-deploy.yaml` | manual only | Migrates, deploys, health-checks |

```bash
gh workflow run strategy-server-deploy.yaml \
  -f image_ref="europe-west1-docker.pkg.dev/outblocks/epf/strategy-server@sha256:<digest>" \
  -f run_migrations=true

gh run watch "$(gh run list --workflow=strategy-server-deploy.yaml --limit 1 \
  --json databaseId -q '.[0].databaseId')"
```

Always deploy **by digest**. A tag can be repointed between a deploy and a
later rollback, so a tag is not a reproducible reference; the workflow resolves
any tag it is given to a digest before deploying.

### Migrations

Run as a **pre-deploy Cloud Run job**, never on container start. Cloud Run
scales to N instances, so migrating at boot races N containers against one
schema. The job runs the *same image* the service will run, keeping migration
and dependent code in lockstep, and `gcloud run jobs execute --wait` makes a
migration failure fail the deploy before the new revision takes traffic.

`db --migrate` does not call `ValidateProduction()` (only `cmd_serve.go` does),
so the job needs no Zitadel configuration.

Skip with `-f run_migrations=false` only when redeploying an image whose
migrations have already been applied.

### Health gate

The final step fails the deploy unless `/health` returns 200, and dumps the
JSON body plus the last 50 log lines when it does not.

`/health` is a real database-connectivity check, not a liveness formality —
verified by stopping Postgres under a live container:

| Condition | HTTP |
|---|---|
| Healthy | **200** |
| Postgres unreachable | **503** |
| Memory / LLM unconfigured | **200**, subsystem reports `disabled` |

It does **not** probe Zitadel. See the known issue below.

---

## 4. Rollback

Cloud Run keeps previous revisions; rolling back is a traffic switch, not a
rebuild.

```bash
# What is deployed, and what came before
gcloud run revisions list --service=strategy-server \
  --region=europe-west1 --project=outblocks --limit=5

# Shift all traffic to a known-good revision
gcloud run services update-traffic strategy-server \
  --region=europe-west1 --project=outblocks \
  --to-revisions=<previous-revision>=100

curl -sS -o /dev/null -w '%{http_code}\n' "$(gcloud run services describe strategy-server \
  --region=europe-west1 --project=outblocks --format='value(status.url)')/health"
```

**Migrations do not roll back with the revision.** Goose has no down-migrations
here, so a rollback leaves the newer schema in place. That is safe for additive
migrations (new tables/columns the old code ignores) and unsafe for destructive
ones. Check what the deploy applied before rolling back across a migration
boundary; restoring a Cloud SQL backup is the escape hatch, and it loses data
written since the backup.

---

## 5. Connecting as a token holder

Scoped access tokens (`est_…`) are issued per organisation with per-instance
grants. They are **not** Zitadel tokens and never reach the IdP — the `est_`
branch in `internal/web/middleware.go:233` resolves them before introspection.

### Minting

The CLI needs a database connection, so in production it runs as a Cloud Run
job against the same image, not from a laptop:

```bash
strategy-server token --mint \
  --org-id <org-uuid> \
  --user-id <owner-user-uuid> \
  --name "acme-readonly" \
  --grant <instance-uuid>:read \
  [--expires 2026-12-31T23:59:59Z]
```

`--grant` repeats for multiple instances. The permission defaults to `read`
when omitted. Expiry defaults to 90 days and is capped at 365.

The plaintext token is printed to **stdout once** and never stored — the server
keeps only a hash. Losing it means revoking and minting again.

```bash
strategy-server token --list   --org-id <org-uuid> [--include-inactive]
strategy-server token --revoke --org-id <org-uuid> --token-id <token-uuid>
```

### Client configuration

```jsonc
{
  "mcp": {
    "strategy-server": {
      "type": "remote",
      "url": "https://<service-url>/mcp",
      "headers": {
        "Authorization": "Bearer est_..."
      }
    }
  }
}
```

The endpoint is streamable HTTP: a client must `initialize` and use the
returned `Mcp-Session-Id` on subsequent calls. Calling `tools/list` without one
returns `Invalid session ID`, which is a protocol error, not an auth error.

### What a read-only token can and cannot do

Verified end to end against a running server with auth enabled:

| Action | Result |
|---|---|
| `tools/list` | 14 core tools |
| Read a **granted** instance | succeeds |
| Read a **non-granted** instance in the same org | `isError`, *"Strategy instance not found"* |
| Write tool in an **active** category (`commit_batch`) | denied — *"This access token is read-only…"* |
| Write tool in an **inactive** category (`create_feature`) | denied — same message |
| No `Authorization` header | **401** |
| After `--revoke` | **401** |

Two behaviours worth knowing:

- A non-granted instance reports **not found** rather than forbidden, so a
  token holder cannot enumerate instances they lack access to.
- The write gate is independent of tool-category filtering. Activating a
  category does not widen what a read-only token may do.

### Revocation latency

Token resolution is cached in-process for **60 seconds**
(`accesstoken.CacheTTL`). `Revoke` purges the entry directly, so revocation is
immediate on the replica that handled it — but a revoke issued from a
*different* process (a CLI job, or another Cloud Run instance) is only
guaranteed within that window.

Observed exactly that: revoking via the CLI left the running server honouring
the token until the TTL lapsed, then 401. This is documented, intended
behaviour, not a defect — but if you revoke in response to a leak, assume up to
60 seconds of residual access, and restart the service if that is unacceptable.

---

## 6. Known issue — interactive login (#91)

**Human login via Zitadel does not work, and fails silently.**

`internal/auth/introspection.go:158` authenticates the introspection request
with `client_id` alone. Zitadel rejects that; it requires `client_secret_basic`
or `private_key_jwt`. The service-account key is loaded into `i.key`
(`introspection.go:86`) and never read again.

It presents badly because every signal says healthy:

- `ValidateProduction()` passes — it only checks the values are non-empty
- `/health` returns 200 — it probes Postgres, Memory and the LLM, not Zitadel
- `middleware.go:244` discards the error and returns a bare `401`

So a login failure caused by a broken IdP connection is indistinguishable from
a wrong password.

**Access tokens are unaffected**, so scoped MCP access works on a deploy with
this bug present. The key is already mounted, so fixing #91 is a code change
with no accompanying deploy change.
