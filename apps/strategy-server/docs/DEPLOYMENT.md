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

---

## 7. Upgrading to the fenced Memory graph (#99, fence slice 2)

Applies to the first deploy of a build that contains the Memory fence (OpenSpec
change `fence-memory-graph-per-instance`). Tracks A (ingest) and B (reads) ship
together; do not deploy a build that has one without the other.

What changes: every object strategy-server writes to Memory is owned by one
instance (key prefix, `instance_id` property, `instance:<uuid>` label) and listed
in a per-instance manifest in Postgres. Every read returns only objects that are
owned by the instance asked for **and** in its manifest. Anything else in the
Memory project, whoever wrote it, is invisible. The graph is a projection of
Postgres, so it can always be rebuilt by re-ingesting.

### 7.1 Before you deploy

1. **Memory version at least v0.85.0.** The server logs the Memory version at
   startup and warns below the minimum. Tested against v0.87.4. Write the version
   you deploy against into the release notes: the log line is the only record, and
   a later Memory upgrade has to be compared with it.
2. **Point `EPF_MEMORY_URL` at Memory itself, or at a proxy that forwards the
   `X-Project-ID` header.** A proxy that drops the header answers every request
   from its default project; the fence cannot detect that, because it keys on the
   instance and not on the project. In development this sent an import to the
   wrong project. Check, with the service's own URL, token and project id:

   ```bash
   curl -s -H "X-API-Key: $EPF_MEMORY_TOKEN" \
     -H "X-Project-ID: 00000000-1111-2222-3333-444444444444" \
     "$EPF_MEMORY_URL/api/graph/objects/count"
   ```

   Expected: `{"error":{"code":"not_found","message":"project '…' not found"}}`.
   If you get a `count`, the header is ignored. **Stop and fix the URL first.**
3. **The Memory project must be dedicated to strategy-server.** The sweep (7.3)
   treats every object that no instance accounts for as an orphan. `epf-cli`
   `ingest` and `sync`, including the `epf-strategy` service, must never target
   this project. Look at what is in it before you sweep.
4. **Memory capacity.** Ingest writes objects 8 at a time (fixed in code), and
   two instances can ingest at once. In development, bulk ingests on a Docker VM
   with 4 GiB shared by several containers got Memory's database OOM-killed. A
   failed ingest is safe (see 7.5): the previous state stays in force and a retry
   converges. Give Memory headroom, and do not run the sweep while a large ingest
   is running. In the rehearsal, a sweep started minutes after a bulk ingest on a
   4 GiB VM was cut off when Memory's server restarted and its database logged
   `too many clients`; it had deleted nothing and completed when re-run.

### 7.2 Deploy and verify

Deploy as in section 3. This build adds **no migration**: 045 (the manifest
table, the instance columns and the unique index on the instance key prefix,
shipped with slice 1) and 046 are already on `main`, and the migration job
applies them if the database does not have them yet.

After the new revision is up:

1. The startup sweep queues an ingest for every active instance whose
   `memory_generation` is 0. Slice 1 never writes the generation or the manifest,
   so after slice 1 every instance is at 0 and all of them are re-ingested. The
   log line is `ingest: startup sweep: queuing work`. Two ingest workers run at a
   time. Measured: the first ingest of a 2,250-object instance took about 43
   seconds. Rehearsed end to end on scratch resources with three real instances
   (5,328 objects) and the old build's graph in place: all three were at
   generation 1, clean and synced 2 minutes 14 seconds after the new build
   started, with Memory's peak container memory at 2.7 GiB of a 4 GiB VM. Two of
   the three first attempts failed under Memory `502` responses (32 of 2,261
   object upserts, and 32 of 3,199 relationship upserts); the instances stayed
   dirty and the heartbeat retried them. The rehearsal ran the heartbeat every 30
   seconds; at the default 5 minutes a failed first ingest waits up to that long.
2. **Until an instance's first ingest completes** (`memory_generation` is 0),
   semantic reads of it are empty on purpose:
   - `search_strategy` in the default mode falls back to keyword search;
   - `search_strategy` with `mode=semantic`, `get_neighbors` and
     `detect_contradictions` return an empty result with `graph_not_ready: true`;
   - `get_outline`, `get_section` and other reads of the stored strategy are not
     affected.
3. Check every active instance has completed an ingest and nothing is pending:

   ```sql
   SELECT name, memory_generation, memory_dirty_since
   FROM strategy_instances WHERE deleted_at IS NULL ORDER BY name;
   ```

   Done when every row has `memory_generation >= 1` and `memory_dirty_since` is
   null. The instance object returned by `get_instance` also carries
   `memory_generation`. (`get_sync_status` is the GitHub sync, not this.)
   An instance that is dirty, or still at `memory_generation` 0 and not dirty, is
   retried by the heartbeat (every 5 minutes by default; `HEARTBEAT_INTERVAL=0`
   disables it, and with it this retry); the log
   names the error (`ingest:` warnings). A failed first ingest marks nothing, so
   it is the generation-0 retry that covers it.

### 7.3 Remove what predates the fence: the sweep

A project that held data from before the fence contains objects without an owner,
with unprefixed keys, or left behind by instances that no longer exist. They are
invisible to every read, so they do no harm, but they take space. The sweep
finds and deletes them. It is a CLI command, not an MCP tool, because it reads
the whole project across every organisation:

```bash
strategy-server memory sweep            # dry run, the default: reports, deletes nothing
strategy-server memory sweep --apply    # deletes what the dry run reported
```

It needs the same environment as the service (`PG*`, `EPF_MEMORY_URL`,
`EPF_MEMORY_PROJECT`, `EPF_MEMORY_TOKEN`). On Cloud Run, run it as a job from the
same image, like the migration job in section 3, with `--args="memory,sweep"` and
then `--args="memory,sweep,--apply"`, and the service's Memory settings. The
command line is verified on real Memory; this job definition has not been run in
production.

1. Run it **after** 7.2 step 3. Instances that have no manifest yet, or whose
   ingest is running, are skipped and listed, so the sweep can never delete the
   only copy of an instance that has not been re-ingested.
2. Read the dry run. It reports counts and example keys for four classes:
   `no_owner`, `unknown_owner`, `legacy_key` and `not_in_manifest`. On a project
   with pre-fence data the first counts can be large. **Check that the example
   keys look like strategy-server data.** If they do not, the project is not
   dedicated to strategy-server: stop.
3. Run with `--apply`. A failed delete is counted and the sweep carries on;
   running it again retries. Then run the dry run again: all four classes should
   be 0.

On the six-instance development project (11,405 objects) the dry run reported 0
in every class. With one planted orphan per class it reported exactly those four,
and `--apply` deleted exactly those four and changed nothing else.

### 7.4 Deleting an instance

`delete_instance` and `delete_workspace` soft-delete in Postgres and purge the
graph in the background: the instance's objects, relationships and scenario
branches. `memory_purged_at` on the instance row records the outcome. Measured: 2
seconds for 44 objects, 19 seconds for 2,664 objects and 2,755 relationships. A
purge that fails is retried by the startup sweep and the heartbeat. Deleted
instances are never re-ingested.

### 7.5 Rollback across this upgrade

Rehearsed once on scratch resources (three real instances, the build before the
fence merge as the old build). What was observed:

- **The old build starts on the new state and its reads stay isolated.** It
  logged "all instances unchanged", returned no hit from another instance and no
  framework hit, and kept 48 of 48 other-instance phrases out. It has fewer
  features: fewer hits, and some without `read_with`. This held because the
  objects the new build writes carry the `instance_id` property the old build
  filters on; do not expect it of a state the old build has not seen.
- No migration is involved, so nothing to undo in Postgres.
- **If anything wrote while the old build was running** (an import, a sync, an
  ingest), the damage is not removed by rolling forward. In the rehearsal the old
  build's import re-created un-owned objects (the sweep removes those) **and
  deleted the instance's artifact-layer objects**, which the manifest still
  listed. The old build never marks an instance dirty, so the new build said "all
  instances unchanged", nothing healed, and `get_neighbors` and
  `detect_contradictions` returned empty results for the instance while it
  reported itself clean and synced (#146).
- **After rolling forward from a rollback in which anything was written,**
  re-ingest every instance the old build touched, then run the sweep (7.3).
  Verified: the new build's `import` on the instance re-ingested it in 22
  seconds, the graph and the manifest agreed again, and the sweep removed the
  un-owned objects. Not verified: that a re-sync from GitHub does the same; it
  should, if it changes the content.
- To check an instance by hand, compare the number of objects Memory holds under
  its `instance:<id>` label with its rows in `memory_projection` (`kind =
  'object'`); they must be equal, and no object may be owned and missing from the
  manifest.
- A failed ingest does not need a rollback. In development, Memory's database was
  killed during an ingest; the instance stayed at its previous state and
  invisible-until-complete, and a retry converged. The rehearsal showed the same
  with two failed first ingests (7.2).

### 7.6 Known limitations at this cutover

- **`restore_version` damages imported instances (#121).** It rebuilds each
  artifact from its key alone, so type, name, track and status are lost for any
  key it does not recognise. For an imported instance of 143 artifacts that is
  138 by the key rules. Do not use it on an imported instance until #121 is fixed.
- **The importer (#119, #120).** Two files that name the same artifact (for
  example `READY/05_roadmap_recipe.yaml` and a copy under `AIM/cycles/`) are
  resolved the same way on every import: the shallowest path wins and the other
  is logged. The `AIM/cycles/**` copies are skipped, not imported as their own
  artifacts. Nested instance directories are still imported into the parent
  (#120): import from a directory that holds exactly one instance, and check the
  instance name and artifact count afterwards.
- **Keyword hits carry no `instance_id`, layer or source artifact.** They come
  from the instance's own stored artifacts, never from the graph. Each says which
  query words it contains and which it does not (`matched_terms`,
  `missing_terms`); a hit that lacks the distinctive word is not an answer.
- **Search is discovery, not the answer.** By default `search_strategy` returns
  mostly keyword hits and keeps a fifth of the limit for semantic hits. On the
  pilot instance's question bank this reached the sections the bank names for 25
  of 49 key results in the top 10, which means a single search misses about half:
  the agent has to follow the hit with `get_section`, rephrase, or read
  `get_outline`. About half of an authored instance's text is not projected into
  the graph at all (confidence gaps, milestones, change logs, per-trend evidence),
  so semantic search cannot find it; keyword search and `get_section` can.
- **`read_with` on a decomposed search hit can name an artifact that does not
  exist** when the exporter drops a sub-folder (a fix is on
  `fix/export-preserve-artifact-paths`, not in this build). `get_section` then
  answers `defined: false`; search again or use `get_outline`. On the pilot-shaped
  instance, 211 of 211 semantic hits resolved.
- **Scenarios.** `evaluate_scenario` lists the instance's own nodes on the branch;
  it does not compare the branch with main, and nothing in the MCP can change a
  branch. `commit_scenario` is a dry run and returns a summary string where its
  field is called `batch_id` (#134).
- **Framework content is in the graph.** An instance scaffolded from the framework
  holds hundreds of canonical definitions and templates (46% of the decomposed
  objects of the pilot-shaped instance: 629 of 1,366). Reads exclude them; tools whose purpose is to list
  them (`list_definitions`, `list_templates`, `health_check`) show them, and
  `list_mutations` includes their import history without saying so (#135).
- **Ingest concurrency is fixed at 8** and not configurable.

### 7.7 Local development

`scripts/dev-setup.sh` rewrites `.env.local` and, as read (not run), takes its
Memory project from the proxy on port 3002, which ignores `X-Project-ID`. For the
fence use Memory directly (port 3012 in the local compose setup) with a project
dedicated to the dev database, and do not rerun the script over a working
`.env.local`.
