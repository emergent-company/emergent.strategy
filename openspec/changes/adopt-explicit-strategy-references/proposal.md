# Change: Read stored references instead of guessing links

Move strategy-server to EPF 3.0.0: build every structural edge from fields
authors write, validate references when they are written, migrate 2.x
instances on the way in, and turn today's keyword heuristics into suggestions
an author accepts or rejects.

Depends on: `adopt-canonical-ontology`; epf-canonical
`unify-reference-identity` (EPF 3.0.0, ontology 2.0.0). Released together with
that canonical version. Gate for the canonical release: this change is ready.
Related: `retire-epf-cli` (epf-cli stays on EPF 2.x until removed),
`fence-memory-graph-per-instance` (re-ingest after migration).

## Why

EPF 3.0.0 gives every referenceable entity an ID, uses one value-model
reference form, and adds fields for the relations that were guessed. If
strategy-server keeps its current behaviour it will:

- reject or mis-resolve 3.0.0 value-model references (`product:layer.comp`),
  because `normalizeVMCPath` and `internal/epfvaluemodel` resolve the 2.x
  conventions;
- keep producing `competes_with`, `mitigates`, `leverages`, `targets_segment`,
  `validates_hypothesis` and `addresses_white_space` from keyword overlap
  (`decompose_crossrefs.go`, weights 0.7-0.9), ignoring what the author stored;
- accept references to IDs that do not exist, because write-time validation is
  schema-only (`Artifact Validation` in `strategy-authoring`);
- fail to import every existing instance, which is 2.x.

## What Changes

- **Decomposer reads stored references** for the six relations and
  Trend→KeyInsight `informs`, using the registry's `carried_by` fields. The
  keyword functions no longer create edges.
- **Suggestions instead of guesses.** The keyword matching moves to a
  suggestion service. Suggestions are exposed via an MCP tool and the web UI;
  accepting one stages a normal mutation that writes the ID into the field.
- **Reference validation on write.** Staging a mutation fails when a reference
  does not resolve in the instance, and the error lists valid IDs of the target
  type.
- **ID assignment on write.** When a new list entity is staged without an `id`,
  the server assigns the next free ID for its prefix and returns it.
- **Exact value-model resolution.** References resolve by exact ID path.
  `normalizeVMCPath` and the cross-convention matching in
  `internal/epfvaluemodel` are used only by the 2.x import migration.
- **2.x import migration.** GitHub import, instance import and the local repo
  source (from `retire-epf-cli`) detect EPF 2.x and migrate in Go, following
  the canonical migration spec and verified against the canonical fixtures. The
  migration report is stored with the instance and suggestions are pre-loaded.
- **Graph types.** `SwotOpportunity` is split from `Opportunity`; a full
  re-ingest per instance runs after migration.

## Non-Goals

- Changing epf-cli.
- Changing propagation weights. Fewer edges will exist after migration until
  suggestions are accepted; weights for the remaining edges are unchanged.
- New strategy concepts.

## Impact

- **Affected specs:** `strategy-semantic`, `strategy-authoring`,
  `strategy-core` (added requirements).
- **Code:** `internal/decompose` (crossrefs, VMC resolution, Opportunity split),
  `internal/epfvaluemodel`, `domain/strategy` (write-time reference validation,
  ID assignment), import paths in `domain/instance` / `domain/sync`, new
  suggestion service and MCP tool, web UI reference pickers, embedded content
  sync to canonical 3.0.0.
- **Behaviour:** after migration, the six relations contain only accepted links,
  so ripple and impact results change for migrated instances. Write tools reject
  dangling references (new error code). MCP responses for suggestions are new.
- **Breaking for clients** that write 2.x reference forms through the write
  tools: they receive a validation error naming the 3.0.0 form.
