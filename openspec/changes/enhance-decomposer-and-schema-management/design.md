## Context

The EPF semantic engine decomposes EPF YAML artifacts into a Memory graph. The decomposer needs certain object types and relationship types to exist in the Memory project. Currently, this is managed via a separate `epf-engine` template pack JSON file that must be manually installed and version-tracked. This creates schema drift — the decomposer and the schema can get out of sync.

This change inverts the dependency: **epf-cli owns the schema contract**. The decomposer code is the source of truth for what types exist. At ingest/sync time, epf-cli reconciles the Memory project to ensure all needed types are present. No separate schema file. No version tracking. No drift.

### Stakeholders

- EPF instance authors (richer graph, better propagation cascades)
- AI agents (more complete graph for quality audit, impact analysis)
- EPF CLI maintainers (zero schema maintenance overhead)

## Goals / Non-Goals

### Goals

- The decomposer code is the single source of truth for EPF graph types
- `epf-cli ingest` and `epf-cli sync` declaratively reconcile the Memory project schema before upserting objects
- Reconciliation is idempotent: creates missing types, leaves existing ones unchanged
- No separate schema file to maintain, version, or install
- The decomposer extracts all structurally-inferable object types and relationships from EPF YAML
- Beliefs connect to Features through the `informs` chain, enabling full cascade depth

### Non-Goals

- Removing types from Memory that epf-cli no longer uses (additive only — don't break other consumers)
- Semantic-only relationships (`supports`, `contradicts`, `parallels`, `invalidates`) — remain in `semantic-edges`
- Managing non-EPF schemas in Memory projects (only reconcile epf-cli's own types)
- Template pack management as a general Memory client feature (reconciliation is epf-cli specific)

## Decisions

### Decision 1: Decomposer code defines the schema, not a JSON file

**Rationale:** The fundamental problem with #11 (schema drift) is that the schema and the decomposer are two independent artifacts that must stay in sync manually. By making the decomposer code the source of truth, there is exactly one place to update when adding a type. The `Reconcile()` function reads the type definitions from the same Go package that produces the objects, making drift impossible.

**What this replaces:**
- `.memory/blueprints/epf-engine/packs/epf-engine.json` — no longer needed as a hand-maintained file
- `memory schemas install` / `memory schemas uninstall` — replaced by automatic reconciliation
- Schema version strings (`v2.0.0`, `v2.1.0`) — no longer meaningful; the code IS the version

**How it works:**
```go
// internal/decompose/schema.go
var ObjectTypes = []TypeDefinition{
    {Name: "Feature", Description: "...", Properties: [...]},
    {Name: "Capability", Description: "...", Properties: [...]},
    // ... all types the decomposer produces
}

var RelationshipTypes = []RelTypeDefinition{
    {Name: "contains", Description: "..."},
    {Name: "contributes_to", Description: "..."},
    // ... all relationship types
}
```

At ingest/sync:
```go
// Reconcile ensures Memory project has all types the decomposer needs
func Reconcile(ctx context.Context, client *memory.Client) error {
    // List existing types in the project
    // For each ObjectType not present → create it
    // For each RelationshipType not present → create it
    // Leave extras alone (other tools may use them)
}
```

**Alternative considered:** Embedding the schema JSON in the binary via `//go:embed` and managing template pack install/uninstall via Memory API. Rejected — this still treats the schema as a separate artifact that happens to travel with the binary. The drift problem is reduced but not eliminated (what if someone edits the JSON without updating the decomposer?).

### Decision 2: Reconciliation is additive-only

**Rationale:** Other tools (Memory UI, custom agents, external integrations) may create their own types in the same project. Epf-cli should only ensure its own types exist, never remove types it doesn't recognize. This makes reconciliation safe to run on any project.

**Alternative considered:** Full schema replacement (delete all types, recreate from decomposer). Rejected — destructive, would break non-EPF consumers of the same project.

### Decision 3: Reconciliation happens inside the Ingester, not in the CLI command

**Rationale:** The ingester already owns the Memory client and the pipeline lifecycle. Adding reconciliation as the first step of `Ingest()` and `Sync()` ensures it works regardless of how the ingester is invoked (CLI, MCP tool, tests).

### Decision 4: `constrains` is the reverse of `tests_assumption`, created bidirectionally

**Rationale:** When a Feature tests an Assumption (`tests_assumption` edge), the Assumption also constrains the Feature. Creating both directions during decomposition enables traversal in either direction without requiring the propagation circuit to infer reverse edges.

### Decision 5: `shared_technology` computed from overlapping `contributes_to` paths

**Rationale:** Features sharing `contributes_to` paths to the same ValueModelComponent have a shared technology relationship. This is distinct from `depends_on` — they don't depend on each other, but a change in the shared component affects all of them.

### Decision 6: `delivers` inferred from cross-track dependencies and KR-to-feature references

**Rationale:** The roadmap has `cross_track_dependencies` with `from_kr` and `to_kr` fields, and assumptions have `linked_to_kr`. The decomposer can create `delivers` edges by matching KR IDs to feature IDs where the roadmap explicitly references features.

## Risks / Trade-offs

- **Memory API for type management:** The reconciliation requires Memory to support listing and creating object/relationship types. If these APIs don't exist or have different semantics, the reconciliation may need to fall back to template pack APIs.
  - Mitigation: Check API availability first. If type-level APIs exist, use them. If only template pack APIs exist, generate a pack from the Go type definitions and use that.

- **Decomposer complexity:** Adding 4 object types and 8 relationship types increases `decompose.go` significantly.
  - Mitigation: Extract new types into separate functions following existing patterns. Run existing tests first to ensure no regressions.

## Open Questions

- What Memory API endpoints support type-level operations? Need to verify: `GET /api/types`, `POST /api/types`, etc. vs template pack APIs.
- Should reconciliation log which types were created, or stay silent unless something changed?
