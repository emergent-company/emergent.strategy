## Context

The strategy-server currently embeds EPF JSON schemas at build time from canonical-epf. All
175+ artifacts in an instance are validated against these schemas, but there is no runtime
schema management, no versioning of strategy state, no way to push mutated artifacts back
to GitHub, and no verification that the decomposer's field extractions match the schemas.

### Stakeholders

- Strategy authors (need atomic publish, version comparison, and GitHub sync)
- Platform operators (need schema updates without redeployment)
- EPF framework maintainers (need dialect support for different org types)
- Decomposer maintainers (need drift detection against canonical schemas)
- Teams using GitHub as source of truth for EPF YAML (need write-back)

## Goals / Non-Goals

### Goals

- Schema validation uses DB-stored schemas when available, embedded schemas as fallback
- Strategy instances track which schema version they were created with
- Authors can publish named versions of their strategy as atomic snapshots
- Version history enables diff and restore operations
- Mutated artifacts can be synced back to GitHub as a pull request
- Publishing a version can optionally trigger a GitHub PR
- Build-time check catches decomposer field drift against JSON schemas
- Foundation for future EPF dialects (not implementing dialects themselves)

### Non-Goals

- Implementing EPF dialects (only the infrastructure to support them later)
- Schema editor UI (schemas are imported, not authored in the platform)
- Real-time collaborative editing (versions are published, not live-synced)
- Bidirectional live sync (GitHub is not a real-time data source; sync is explicit)
- Multi-instance network tables (separate change, Phase 4)
- Decomposer reconciliation against Memory project types (covered by
  `enhance-decomposer-and-schema-management` change)

## Decisions

### Decision 1: Schema registry is a simple key-value store, not a schema compiler

The `schema_registry` table stores raw JSON schema content keyed by `(version, dialect,
schema_name)`. It does not parse, compile, or interpret schemas -- that remains the job
of `jsonschema.Compiler` at validation time. The registry is just a storage layer that
replaces the embedded filesystem as the schema source.

**Rationale:** Keeping the registry dumb and the compiler smart means we don't duplicate
the jsonschema library's logic. The registry is easy to populate (bulk import from
canonical-epf) and easy to query (single row lookup).

**Schema:**
```sql
CREATE TABLE schema_registry (
    id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    version      TEXT        NOT NULL,  -- e.g. "2.26.0"
    dialect      TEXT        NOT NULL DEFAULT 'standard',
    schema_name  TEXT        NOT NULL,  -- e.g. "feature_definition_schema.json"
    content      JSONB       NOT NULL,  -- raw JSON Schema document
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (version, dialect, schema_name)
);
```

### Decision 2: Embedded schemas bootstrap the registry on first migration

When the `schema_registry` table is created (migration), it is empty. On server startup,
if the registry has no rows for the current embedded version, the server auto-imports all
embedded schemas into the registry with `dialect = 'standard'`. This means:

- Fresh installs work immediately (embedded schemas populate the registry)
- Schema updates can be pushed to the DB without redeploying
- The embedded schemas are always the fallback (if a schema is not in the registry,
  fall back to embedded)

**Lookup order:**
1. `schema_registry WHERE version = instance.schema_version AND dialect = instance.dialect`
2. `schema_registry WHERE version = (latest) AND dialect = 'standard'`
3. Embedded filesystem (go:embed fallback)

### Decision 3: Strategy versions store full JSONB snapshots

Each published version stores the complete artifact set as a JSONB object:
```json
{
  "artifacts": {
    "north_star": { ... payload ... },
    "fd-001_knowledge_graph_engine": { ... payload ... },
    ...
  },
  "relationships": [
    {"source_key": "fd-001", "target_key": "vm-product", "relationship": "contributes_to"},
    ...
  ],
  "metadata": {
    "artifact_count": 175,
    "schema_version": "2.26.0",
    "dialect": "standard",
    "published_by": "user-uuid"
  }
}
```

**Rationale:** A typical EPF instance has ~175 artifacts totaling 1-5 MB of YAML. Storing
the full snapshot makes reads instant (no replay), diffs straightforward (compare two JSONB
blobs), and restores trivial (replay the snapshot as mutations). The storage cost is
negligible -- even 100 versions at 5 MB each is 500 MB, well within Postgres comfort range.

**Alternative considered:** Store only the mutation range (start/end mutation IDs) and
replay on demand. Rejected because: (a) replay requires scanning potentially thousands of
mutations, (b) the mutation log can include discarded mutations that complicate replay,
(c) diffs become expensive.

### Decision 4: Versions form a linear chain, not a tree

Each version has a `parent_version_id` pointing to its predecessor. This forms a simple
linked list. Branching (multiple children from one parent) is allowed but not a primary
use case -- the main workflow is linear progression.

**Rationale:** Strategy evolution is fundamentally linear in practice. Even when you
"restore" a previous version, you create a new version (with a new number) that happens
to have the old content. The chain shows what happened chronologically.

### Decision 5: GitHub sync uses a GitHub App, not personal access tokens

GitHub write-back requires authenticated API access to create branches, commit files,
and open PRs. The options are:

1. **Personal access token (PAT)** — simple but scoped to a single user, expires, poor for
   multi-tenant
2. **GitHub App** — installed per-organisation, generates short-lived installation tokens,
   fine-grained permissions, audit trail
3. **GitHub OAuth App** — user-scoped, requires each user to authorize, poor for server-side

**Decision:** GitHub App. It is the right model for a multi-tenant platform:

- Installed once per GitHub organisation (maps to our `org` concept)
- The server generates installation tokens on demand (short-lived, no stored secrets per user)
- Permissions: `contents: write` (to create branches and push files), `pull_requests: write`
  (to create PRs), `metadata: read`
- The GitHub App ID and private key are server-level configuration (not per-user)
- Installation ID is stored per-workspace or per-instance (since `github_repo` is on the
  instance)

**Configuration:**
```go
// config/config.go additions
GithubAppID         int64  `arg:"env:GITHUB_APP_ID"`
GithubAppPrivateKey string `arg:"env:GITHUB_APP_PRIVATE_KEY_PATH"` // path to PEM file
```

**Alternative considered:** Personal access tokens. Rejected for multi-tenant use — each
user would need to provide and store their own token, and tokens expire.

### Decision 6: Sync creates a PR, never pushes directly to main

All GitHub write-back operations create a feature branch and open a pull request. The server
never pushes directly to the default branch. This ensures:

- Human review before changes land in the canonical YAML
- CI checks run on the PR (linting, validation)
- Audit trail of who approved the strategy change
- No risk of overwriting concurrent manual edits

**Branch naming:** `strategy-sync/<instance-name>/<version-or-timestamp>`
(e.g., `strategy-sync/emergent/v3` or `strategy-sync/emergent/2026-05-16`)

**PR body:** Includes a structured summary: which artifacts were added/modified/archived,
the version label if publishing, and a link back to the strategy-server instance.

### Decision 7: Sync uses the existing export format

The `export_instance_yaml` function already produces `[]ExportEntry{RelPath, Content}`
matching the EPF directory layout (`READY/`, `FIRE/definitions/features/`, `AIM/`). The
GitHub sync reuses this — it calls export, then pushes each entry as a file to the GitHub
repo at the `github_base_path` prefix.

**Rationale:** One export path, two consumers (in-memory return via MCP tool, or push to
GitHub). No duplication of the YAML serialization logic.

### Decision 8: Sync log tracks push history

A `github_sync_log` table records each sync attempt:

```sql
CREATE TABLE github_sync_log (
    id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    instance_id   UUID        NOT NULL REFERENCES strategy_instances(id),
    version_id    UUID        REFERENCES strategy_versions(id),  -- null for draft sync
    github_repo   TEXT        NOT NULL,
    branch_name   TEXT        NOT NULL,
    pr_number     INT,
    pr_url        TEXT,
    status        TEXT        NOT NULL DEFAULT 'pending'
                               CHECK (status IN ('pending', 'pushed', 'pr_created', 'merged', 'failed')),
    artifact_count INT        NOT NULL,
    error_message TEXT,
    created_by    UUID,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

This enables: "when was this instance last synced?", "is there an open PR?",
"did the last sync fail?"

### Decision 9: Decomposer reconciliation is a Go test, not a build step

The reconciliation check runs as `TestDecomposerFieldsMatchSchemas` inside
`pkg/decompose/`. It loads all embedded JSON schemas, walks the decomposer's field
extraction code (via a declarative field manifest), and verifies each field path exists
in the corresponding schema.

**Rationale:** A `go test` check is simpler than a `go generate` step, runs in CI
naturally, and doesn't require build tooling changes. The test fails with a clear message
when drift is detected.

**What the manifest looks like:**
```go
var fieldManifest = []FieldMapping{
    {ArtifactType: "feature_definition", JSONPath: "name", DecomposerFunc: "decomposeFeature"},
    {ArtifactType: "feature_definition", JSONPath: "capabilities[].name", DecomposerFunc: "decomposeFeature"},
    {ArtifactType: "feature_definition", JSONPath: "personas[].name", DecomposerFunc: "decomposeFeature"},
    // ...
}
```

The test loads `feature_definition_schema.json`, resolves each `JSONPath` against the
schema's `properties` tree, and fails if any path is missing or has changed type.

## Risks / Trade-offs

- **Schema registry adds DB dependency to validation.** Mitigated by the embedded fallback --
  if the DB is unavailable or the registry is empty, validation still works.

- **JSONB snapshots grow with instance size.** For the current 175-artifact instances, this
  is negligible. For hypothetical 1000+ artifact instances, consider compression. Not a
  concern now.

- **Field manifest maintenance.** The decomposer field manifest must be updated when new
  extraction logic is added. Mitigated by making the test fail loudly when the manifest
  is incomplete (count extracted fields vs manifest entries).

- **GitHub App private key management.** The private key PEM file must be available to the
  server at runtime. In production, this comes from a secret manager (GCP Secret Manager,
  Vault). In dev, it's a local file. The key is never stored in the database.

- **Concurrent edits.** If someone edits the YAML files on GitHub while also mutating via
  the strategy-server, the PR may have merge conflicts. Mitigated by: (a) the PR model
  surfaces conflicts before they land, (b) re-import from GitHub before syncing resolves
  drift.

- **Rate limits.** GitHub API has rate limits (5,000 requests/hour per installation).
  A typical sync creates ~175 files in a single commit via the Git tree API, which uses
  only 3-4 API calls regardless of file count. Not a concern.

## Migration Plan

1. Add migration `011_schema_registry.sql` -- creates `schema_registry` table
2. Add migration `012_strategy_versions.sql` -- creates `strategy_versions` table, adds
   `schema_version` and `dialect` columns to `strategy_instances`
3. Add migration `013_github_sync_log.sql` -- creates `github_sync_log` table
4. Implement schema registry service with DB + embedded fallback
5. Wire validation to use registry
6. Implement version service (publish, list, get, diff, restore)
7. Implement GitHub client (App auth, branch, commit, PR)
8. Implement sync service (export -> push -> PR)
9. Add MCP tools (version + sync)
10. Add decomposer reconciliation test
11. Auto-import embedded schemas on startup

## Open Questions

- Should `diff_versions` return a structured diff (added/removed/changed artifacts) or
  a raw JSON diff? Structured is more useful for agents; raw is simpler to implement.
  Recommendation: structured, with artifact-level granularity.
- Should version numbers be auto-incremented integers or user-supplied strings?
  Decision: service-level `SELECT COALESCE(MAX(version), 0) + 1` (not DB-generated identity),
  with optional user label (e.g., v3 "Q2 Strategy"). Service-level increment is correct
  because restoring a version creates a new version that must increment past the current max.
- Should `sync_to_github` be callable for the working draft, or only for published versions?
  Recommendation: both — draft sync is useful for quick iteration, version sync is the
  canonical workflow.
