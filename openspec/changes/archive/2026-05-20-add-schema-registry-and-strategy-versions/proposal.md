# Change: Add schema registry, strategy versions, GitHub sync, and decomposer reconciliation

## Why

Four architectural gaps limit the strategy-server's robustness and extensibility:

1. **Schema fragility.** EPF artifact schemas are embedded at build time from canonical-epf.
   A schema update requires a code release. There is no way to know which schema version an
   instance was created with, no dialect support for different organisation types, and no
   runtime schema override path. As EPF evolves and potentially forks into dialects (startup,
   enterprise, R&D), the current approach becomes a bottleneck.

2. **No strategy versioning.** The mutation ledger records every change, but there is no
   concept of a "published version" of the strategy. Users cannot atomically publish a
   coherent set of interdependent artifacts, compare two points in time, or roll back to a
   previous state. In practice, strategy work requires editing many artifacts together (a new
   OKR touches the formula, features, and roadmap) and publishing them as a coordinated release.

3. **No GitHub write-back.** The data flow is one-directional: GitHub -> import -> database.
   After mutating strategy artifacts via MCP tools, there is no way to push changes back to
   the source repository. The export tools return YAML in-memory but don't write to GitHub.
   For EPF to function as a living strategy system, mutations must be syncable back to the
   canonical YAML files in the source repo — ideally as a PR for review.

4. **Silent decomposer drift.** The decomposer extracts fields from YAML artifacts and maps
   them to graph objects, but nothing verifies that the fields it reads still exist in the
   canonical JSON schemas. A schema rename or removal silently produces empty graph nodes.

## What Changes

### 1. Schema registry (DB-stored with embedded fallback)

- New `schema_registry` table stores versioned schema sets
- New `schema_version` and `dialect` columns on `strategy_instances`
- Validation checks the DB registry first, falls back to embedded schemas
- Schemas can be imported from canonical-epf at runtime (not just build time)
- Foundation for future dialect support

### 2. Strategy versions (atomic publish with JSONB snapshot)

- New `strategy_versions` table with full artifact snapshot per version
- Publish workflow: working draft -> commit batches -> publish version
- Version history chain via `parent_version_id`
- Diff between versions
- Restore from a previous version

### 3. GitHub sync (write-back via PR)

- GitHub App integration for repository access (read + write)
- New `sync_to_github` MCP tool: exports current (or versioned) artifact state as
  YAML files and creates a pull request on the source repository
- Ties into versioning: publishing a version can optionally trigger a GitHub PR
- Uses the existing `github_repo` and `github_base_path` columns on `strategy_instances`
  as the sync target
- Branch-based: creates a feature branch with the changes, opens a PR against main

### 4. Decomposer reconciliation check (build-time)

- A test-time check that reads all JSON schemas from embedded FS and verifies that
  every field path the decomposer extracts exists in the corresponding schema
- Runs as part of `go test ./pkg/decompose/...` so CI catches drift
- Produces a clear error message: "decomposer reads field X from artifact type Y, but
  schema Z does not define that field"

## Impact

- Affected specs: `strategy-core`, `strategy-semantic`
- Affected code:
  - `apps/strategy-server/internal/database/migrations/` -- 3 new migrations
  - `apps/strategy-server/internal/embedded/` -- schema loading with DB fallback
  - `apps/strategy-server/domain/strategy/` -- publish/version service methods
  - `apps/strategy-server/internal/github/` -- new GitHub App client for repo operations
  - `apps/strategy-server/domain/sync/` -- sync service with `RepoWriter` interface (domain-pure)
  - `apps/strategy-server/internal/mcpserver/` -- 7+ new MCP tools
  - `apps/strategy-server/config/` -- GitHub App config fields
  - `apps/epf-cli/pkg/decompose/` -- reconciliation test
- Database: 3 new tables (`schema_registry`, `strategy_versions`, `github_sync_log`),
  new columns on `strategy_instances` (`schema_version`, `dialect`)
- Dependencies: `google/go-github/v68` (GitHub API client)
- **Not breaking:** All changes are additive. Existing instances continue to work with
  embedded schemas. Versions and GitHub sync are optional features.
