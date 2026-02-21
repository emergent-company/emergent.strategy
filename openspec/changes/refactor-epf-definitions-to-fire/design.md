# Design: Unify all track definitions in FIRE phase

## Context

The impact assessment identified ~30 Go files, 15+ test files, all embedded wizards/templates,
and all instance documentation that reference the old directory layout. This is a broad but
shallow change — almost all affected locations are simple string replacements of one path for
another. The conceptual complexity is low; the surface area is wide.

Key constraints:
- Existing instances (emergent, twentyfirst, lawmatics, huma) must be migrated
- The `fd-` prefix regex in `schema/loader.go` provides a safety net for product definitions
  (type detection still works even in wrong directory), but nothing equivalent exists for other tracks
- The canonical embedded definitions (strategy/org_ops/commercial) are distributed via
  `epf_sync_canonical` — the sync destination must change
- `READY/definitions/` may not exist in instances that never ran `epf_sync_canonical` (most)
- EPF instances are deployed in two fundamentally different modes: **embedded** (instance lives
  inside the product repo) and **shared submodule** (instance is a standalone git repo consumed
  by multiple consumer repos via git submodule). The migration story differs significantly
  between these two modes.

## Goals / Non-Goals

**Goals:**
- All four track definitions co-located symmetrically in `FIRE/definitions/{track}/`
- Clean migration path for existing instances with auto-detection and tooling
- Health check actively guides users through migration — no silent failures
- All tests pass after change
- Documentation (embedded + instance-level) accurately reflects new structure

**Non-Goals:**
- Dual-path compatibility period (old + new locations simultaneously). Clean break is correct.
- Renaming artifact types (`feature_definition` → `product_definition`). Artifact type names
  and ID prefixes (fd-/sd-/pd-/cd-) are unchanged — only directory layout changes.
- Renaming the `feature_definition` schema. The schema remains `feature_definition_schema.json`.

## Decisions

### Decision: Clean break, no dual-path fallback

**What:** Detection code reads from the new paths only. Old paths are not checked as fallbacks.

**Why:** Dual-path detection adds permanent complexity and masks migration failures. The health
check will detect the old structure and emit a blocking error pointing users to the migration
command. This makes the transition explicit and traceable.

**Alternative considered:** Add fallback detection (try new path, fall back to old). Rejected
because it would silently accept un-migrated instances, masking the problem for AI agents.

### Decision: New `epf migrate definitions` CLI command + `epf_migrate_definitions` MCP tool

**What:** A dedicated structural migration command that:
1. Detects files in old locations (`FIRE/feature_definitions/`, `READY/definitions/`)
2. Moves them to new locations (`FIRE/definitions/product/`, `FIRE/definitions/{track}/`)
3. Updates `FIRE/mappings.yaml` comment references
4. Supports `--dry-run` to preview changes
5. Emits a migration report listing every moved file

**Why:** File system migrations cannot be automated through the existing schema-version migration
system (which operates on YAML field-level changes). A separate structural migration command
follows the pattern of the existing `migrate-structure` command.

**Where it lives:** `internal/migration/structural.go` — new file alongside existing
`detector.go`, `guide.go`. Registered as both CLI subcommand and MCP tool.

### Decision: Health check emits blocking error for old structure (not a warning)

**What:** If `FIRE/feature_definitions/` exists in an instance, the health check emits a
CRITICAL error (not a warning) with the migration command as the fix.

**Why:** A warning would allow AI agents to proceed with a broken state, producing silent failures
in strategy queries, coverage analysis, and AIM drift detection. A hard error forces resolution.

**Alternative considered:** Emit warning, keep old path working. Rejected for same reason as
dual-path fallback.

### Decision: `epf_sync_canonical` syncs definitions to `FIRE/definitions/` (not `READY/definitions/`)

**What:** The embedded canonical definitions for strategy/org_ops/commercial are synced to
`FIRE/definitions/{track}/` when `epf_sync_canonical` is called.

**Why:** Consistent with the new structure. `READY/definitions/` ceases to exist as a concept.

**Impact:** Instances that previously synced canonical definitions will have old files in
`READY/definitions/`. The migration command must handle moving these, or `epf_sync_canonical`
can offer to move them. The migration command handles this explicitly.

### Decision: Embedded template directory moves from `templates/READY/definitions/` to `templates/FIRE/definitions/`

**What:** The physical embedded files in the Go binary move from:
- `templates/READY/definitions/{strategy,org_ops,commercial}/`
to:
- `templates/FIRE/definitions/{strategy,org_ops,commercial}/`

And the product definition template moves from:
- `templates/FIRE/feature_definitions/feature_definition_template.yaml`
to:
- `templates/FIRE/definitions/product/feature_definition_template.yaml`

**Why:** The embedded paths should mirror the instance structure so that `epf_sync_canonical`
and `epf_get_template` resolve consistently.

**Impact:** `embedded.go` fs.Sub calls and `MANIFEST.txt` regeneration required.

### Decision: `READY/definitions/` directory concept is retired

**What:** The `READY/definitions/` directory will not exist in new instances and will not be
created by any EPF tooling. Old instances with this directory should be migrated.

**Why:** READY is for strategic intent only. Definitions are execution-layer artifacts.

### Decision: Migration tooling is submodule-aware

**What:** The `epf_migrate_definitions` tool and `epf migrate definitions` CLI command detect
whether the target instance is a git submodule viewed from a consumer repo, and adjust their
behavior and messaging accordingly.

Detection: check whether `git -C <instance_path> rev-parse --show-superproject-working-tree`
returns a non-empty path. If it does, the instance is a submodule mounted in a consumer repo.

**Embedded instance behavior:** Run migration in place. User commits the file moves to the
product repo. No special handling needed.

**Submodule instance behavior (called from consumer repo):**
- `--dry-run`: Shows what would move but cannot apply — emits a warning that changes must be
  committed in the submodule source repo
- Without `--dry-run`: Refuses to apply, emits CRITICAL error with instructions:
  ```
  This EPF instance is a git submodule. File moves must be committed in the source repo.
  Source repo: <git remote URL from submodule config>
  Steps:
    1. Clone the source repo: git clone <url>
    2. Run migration there: epf migrate definitions . 
    3. Commit and push the source repo
    4. Update the submodule pointer in this repo: git submodule update --remote <path>
  ```

**Submodule instance behavior (called from inside the submodule repo itself):**
- Detects it is the root of a git repo (not a submodule consumer view)
- Runs migration normally — user commits in the submodule repo

**Why:** Running `git mv` or file moves inside a submodule from a consumer repo creates local
unstaged changes that will be overwritten on the next `git submodule update --remote`. The
migration must happen in the submodule's own git history to be durable. Silently applying the
migration from a consumer repo would create a false sense of completion and a confusing git state.

**Impact:** Adds a git submodule detection step at the start of `MigrateDefinitions()`. The
detection is a single `git` command call. No new dependencies.

### Decision: Health check emits context-aware error for old structure

**What:** The CRITICAL error message for old directory structure differs based on deployment mode:

- **Embedded instance:** `"Run: epf migrate definitions <instance_path>"`
- **Submodule (viewed from consumer):** `"This instance is a git submodule. Migration must be
  run in the source repo. See: epf migrate definitions --help"`

**Why:** An AI agent operating in a consumer repo that sees the health check CRITICAL must
understand they cannot fix it locally. The error message must be unambiguous about what action
to take and where.

## Migration Plan

### For embedded instances

```bash
# Check if migration needed
epf-cli health <instance_path>
# → CRITICAL: Found definitions in old locations. Run: epf-cli migrate definitions <instance_path>

# Preview migration
epf-cli migrate definitions <instance_path> --dry-run

# Apply migration (commits are the user's responsibility)
epf-cli migrate definitions <instance_path>
```

### For shared submodule instances

Migration must happen in the **submodule source repo**, not in any consumer repo.

```bash
# From inside the submodule repo (e.g., emergent-company/emergent-epf):
epf-cli migrate definitions . --dry-run   # preview
epf-cli migrate definitions .             # apply
git add -A && git commit -m "refactor: move definitions to FIRE/definitions/"
git push

# Then in each consumer repo:
git submodule update --remote docs/EPF/_instances/emergent
git add docs/EPF/_instances/emergent
git commit -m "chore: update EPF strategy instance (definitions restructure)"
```

From a consumer repo, the tool detects the submodule and prints the above instructions rather
than attempting to apply the migration.

Via MCP (from inside the submodule repo or an embedded instance):
```
epf_migrate_definitions { "instance_path": ".", "dry_run": true }
epf_migrate_definitions { "instance_path": ".", "dry_run": false }
```

### What the migration moves

| From | To |
|------|----|
| `FIRE/feature_definitions/*.yaml` | `FIRE/definitions/product/*.yaml` |
| `READY/definitions/strategy/*.yaml` | `FIRE/definitions/strategy/*.yaml` |
| `READY/definitions/org_ops/*.yaml` | `FIRE/definitions/org_ops/*.yaml` |
| `READY/definitions/commercial/*.yaml` | `FIRE/definitions/commercial/*.yaml` |

After moving files, removes empty source directories (but not `READY/` itself).

### Rollback

The migration command does not delete source files — it copies then deletes. A `--no-delete`
flag preserves the originals. Since this is version-controlled in git, rollback is always
available via `git revert`.

## Risks / Trade-offs

- **Surface area is wide:** ~30 Go files + 15 test files + all embedded content. Risk of missed
  reference is real. Mitigated by running full test suite and health check on the emergent
  instance after change.
- **Emergent instance is a git submodule:** Migration must happen in `emergent-company/emergent-epf`
  directly, not in this consumer repo. Plan:
  1. Implement and test CLI change in this repo
  2. Clone `emergent-company/emergent-epf` and run `epf migrate definitions . --dry-run`
  3. Apply migration, commit, push in emergent-epf repo
  4. Update submodule pointer in this repo: `git submodule update --remote docs/EPF/_instances/emergent`
- **Other instances (twentyfirst, lawmatics, huma):** Some are embedded (can migrate in their
  own repos), some may be submodules. All receive the migration tooling when they update epf-cli.
  The health check CRITICAL error forces migration before any other EPF operations proceed.
- **Submodule detection edge case:** If a consumer repo has the submodule checked out with local
  modifications (dirty submodule), the git detection is still reliable — the superproject check
  returns the consumer repo path regardless of dirty state.

## Open Questions

- Should `FIRE/feature_definitions/` be left as an empty directory with a README redirect, or
  fully removed? Recommendation: fully remove from new init, handle in migration by deleting
  after successful move.
- Should `epf_sync_canonical` automatically offer to move old `READY/definitions/` content
  during sync, or leave that entirely to `epf_migrate_definitions`? Recommendation: leave to
  the dedicated migration command for clarity.
