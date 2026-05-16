# Design: Expand strategy-server MCP tools

## Context

strategy-server has a working MCP server with 26 tools, staged batch authoring, and 13
passing integration tests. epf-cli has 83+ tools. The gap is primarily in embedded protocol
content (schemas, templates, agents, skills), expanded artifact type coverage, validation,
export, and AIM lifecycle.

Two architectural constraints shape this design:

1. Go's `internal/` visibility rule prevents cross-module imports: strategy-server cannot
   import `apps/epf-cli/internal/*` even within the same `go.work` workspace. strategy-server
   must own its embedded content and validator independently.

2. The current document-level JSONB storage works for audit/export but creates O(n) queries
   for cross-cutting views. The web UI needs indexed access to strategic relationships
   (feature -> persona, feature -> value model, feature -> assumption, etc.).

## Goals / Non-Goals

**Goals:**
- Full EPF authoring parity via MCP tools (~73 tools total)
- Strategic Index data model for efficient cross-cutting queries
- Own embedded content synced from canonical-epf independently
- Own artifact validation using the same JSON schemas
- All new tools follow the established staged batch pattern for writes
- AIM lifecycle tools for assessment and iteration

**Non-Goals:**
- Modifying epf-cli (frozen)
- Web UI for new tools (Phase 3 concern)
- Semantic/Memory tool implementation (separate concern, stubs exist)
- Replacing epf-cli's stdio MCP server
- Full normalization of EPF artifacts into relational tables

## Decisions

### Decision 1: Strategic Index — not full normalization

**What:** Two new tables (`strategy_artifacts`, `strategy_relationships`) alongside the
existing mutation ledger. Full document JSONB stays as the payload.

```sql
-- Current state cache: one row per artifact (latest committed snapshot)
strategy_artifacts (
  id            UUID PRIMARY KEY,
  instance_id   UUID REFERENCES strategy_instances,
  artifact_type TEXT NOT NULL,
  artifact_key  TEXT NOT NULL,
  track         TEXT,
  name          TEXT,
  status        TEXT,
  payload       JSONB NOT NULL,
  mutation_id   UUID REFERENCES strategy_mutations,
  created_at    TIMESTAMPTZ,
  updated_at    TIMESTAMPTZ,
  UNIQUE (instance_id, artifact_key)
)

-- Cross-artifact relationship index
strategy_relationships (
  id            UUID PRIMARY KEY,
  instance_id   UUID REFERENCES strategy_instances,
  source_key    TEXT NOT NULL,
  source_type   TEXT NOT NULL,
  target_key    TEXT NOT NULL,
  target_type   TEXT NOT NULL,
  relationship  TEXT NOT NULL,
  metadata      JSONB,
  UNIQUE (instance_id, source_key, target_key, relationship)
)
```

On `CommitBatch`:
1. Mutations transition to `committed` (existing)
2. Upsert into `strategy_artifacts` (latest snapshot wins)
3. Re-extract relationships from payload, replace in `strategy_relationships`

**Why:** Full normalization would require 40-60 tables tightly coupled to the EPF schema.
Every new EPF field = a column migration. The Strategic Index gives indexed cross-cutting
queries without schema coupling. The JSONB payload absorbs EPF evolution automatically.

**Alternatives considered:**
- Full normalization — rejected: 40-60 tables, breaks on EPF schema changes, massive
  migration cost
- Document-only (status quo) — rejected: every cross-cutting view requires JSONB parsing
  at read time, no relationship indexing, O(n) DISTINCT ON queries for current state
- Materialized views — rejected: additional complexity for similar benefit; explicit
  tables are simpler to reason about and index

### Decision 2: Relationship extraction as a pure function

**What:** An `ExtractRelationships(artifactType, artifactKey string, payload []byte) []Relationship`
function extracts all cross-artifact references from a payload. It is a switch on artifact
type with JSON path reads — no side effects.

| Source Type    | Relationship      | Target Type       | Source Field                                              |
|----------------|-------------------|-------------------|-----------------------------------------------------------|
| feature        | contributes_to    | value_model_path  | `strategic_context.contributes_to[]`                      |
| feature        | tests_assumption  | assumption        | `strategic_context.assumptions_tested[]`                  |
| feature        | in_track          | track             | `strategic_context.tracks[]`                              |
| feature        | depends_on        | feature           | `dependencies.requires[].id`                              |
| feature        | enables           | feature           | `dependencies.enables[].id`                               |
| feature        | delivered_by_kr   | key_result        | `feature_maturity.capability_maturity[].delivered_by_kr`  |
| org_ops_def    | contributes_to    | value_model_path  | `contributes_to[]`                                        |
| commercial_def | contributes_to    | value_model_path  | `contributes_to[]`                                        |
| assumption     | linked_to_kr      | key_result        | `linked_to_kr[]`                                          |
| mapping        | maps_to           | value_model_path  | `sub_component_id`                                        |
| product_line   | uses_value_model  | value_model       | `value_model_ref`                                         |

**Why:** Keeping extraction as a pure function means it is testable in isolation, can be
backfilled over existing data, and does not require coupling to the commit logic beyond a
single call site.

### Decision 3: Own embedded content from canonical-epf

**What:** Create `apps/strategy-server/internal/embedded/` with its own `go:embed`
directives and `scripts/sync-embedded.sh`, consuming canonical-epf content independently.

**Why:** Go's `internal/` rule is a language constraint, not a tooling issue. Both binaries
embed the same canonical-epf content but must do so independently.

**Alternatives considered:**
- Extract epf-cli's internal packages to shared `pkg/` — rejected: epf-cli is frozen
- Create a shared Go module — rejected: adds module management overhead for content that
  changes infrequently and is better synced at build time

### Decision 4: Own validator using same JSON schemas

**What:** Implement artifact validation in strategy-server using the JSON schemas from
embedded content. The validator is ~200 lines of schema loading plus
`santhosh-tekuri/jsonschema` calls and does not require importing epf-cli's validator.

**Why:** Reimplementing is cheaper than fighting the import constraint. Using the same JSON
schema files guarantees identical validation behaviour.

### Decision 5: Templates served as JSON

**What:** Template content is served as JSON (parsed from YAML) through MCP tools, not
as raw YAML strings.

**Why:** MCP tools return structured data. JSON is the native format. The agent can render
it however needed.

### Decision 6: Phased implementation

**What:** Seven phases in order:

| Phase | Focus |
|-------|-------|
| A | Strategic Index migration + commit-time derivation + agent identity |
| B | Embedded content sync + accessor package |
| C | Embedded knowledge MCP tools |
| D | Expanded write tools (all artifact types) |
| E | Derived read tools |
| F | Validation tools + export tools |
| G | AIM lifecycle tools |

**Why:** Each phase is independently testable and valuable. The Strategic Index (Phase A)
is the foundation that derived read tools and the web UI both depend on. Embedded content
(Phase B) is required before knowledge tools or validation tools.

### Decision 7: Agent identity and mutation event feed

**What:** Support autonomous background agents (not just human-triggered MCP calls) with
four targeted additions:

1. **Agent identity on mutations and batches** — `agent_id TEXT` and `batch_description TEXT`
   columns on `strategy_mutations`. Populated when source is `mcp` and the caller identifies
   itself. Allows the web UI to show "staged by coherence-check agent" and the audit log to
   distinguish agent writes from human writes.

2. **Batch metadata tool** — `describe_batch` MCP tool lets an agent attach a human-readable
   description and its own identifier to a staged batch before presenting it for review.

3. **Mutation event feed via polling** — `list_mutations` already exists and supports cursor
   pagination. Add `since_mutation_id` parameter so a running agent can efficiently poll for
   new committed mutations and react to human-made changes. No persistent connection required.

4. **`list_pending_batches` tool** — Returns all staged (uncommitted) batches for an instance,
   with agent_id and description. Powers the web UI review queue: "3 changes staged by agents,
   waiting for your review."

**Why polling over webhooks/SSE:** Polling with a cursor is stateless, requires no delivery
infrastructure, and is trivially reliable. The strategy graph does not change at high frequency
— a 5-second poll interval is indistinguishable from real-time for this use case. Webhooks
and SSE can be added later if evidence demands it.

**Why not give agents commit authority:** The staged batch pattern is a hard boundary. Agents
stage; humans commit. This is unconditional. A "trusted agent" that can self-commit is a
separate governance decision requiring a separate spec change.

```sql
-- Additions to strategy_mutations (migration 002 or 003)
ALTER TABLE strategy_mutations
  ADD COLUMN agent_id          TEXT,          -- identifies the agent (e.g. "coherence-checker-v1")
  ADD COLUMN batch_description TEXT;          -- human-readable summary of the staged batch
```

## Risks / Trade-offs

| Risk | Mitigation |
|------|------------|
| Relationship extraction misses a reference type | Extraction is additive; missing types can be added without migration |
| Embedded content drift between epf-cli and strategy-server | Both sync from same canonical-epf; version pinned via MANIFEST.txt |
| Validator behaviour divergence from epf-cli | Use identical JSON schemas; test against same fixtures |
| Tool count grows unwieldy for agents | Use `get_agent_for_task` routing pattern |
| AIM schema not yet mature | Start with minimal schema; iterate based on usage |
| strategy_artifacts table grows large | One row per artifact per instance; bounded by instance size (~200 max) |
| Agent floods staging table with uncommitted batches | `list_pending_batches` makes stale batches visible; operators can discard via `discard_batch` |

## Open Questions

None — all decisions (phase ordering, AIM priority, tool naming, data model, agent identity) resolved.
