# Design: Read stored references instead of guessing links

## Context

- After `adopt-canonical-ontology`, relation types and provenance come from the
  embedded registry and every edge carries `provenance`.
- EPF 3.0.0 (epf-canonical `unify-reference-identity`) defines the reference
  form, ID prefixes, the new reference fields (its design D3) and a migration
  with fixtures (its design D5).
- `internal/epfvaluemodel.Resolver` matches layer/component/sub-component by
  several conventions; `decompose.normalizeVMCPath` strips case and punctuation.
- Write tools stage mutations after JSON Schema validation only.

## Decisions

### D1. Edges come from `carried_by`

For each relation with `provenance: explicit`, the decomposer reads the field
named in `carried_by` and creates an edge per resolved ID. This is driven by the
registry, not by a function per relation: one generic reader handles ID lists
and single IDs. Relation-specific code remains only for `derived` relations
(`shared_technology`, `constrains`, `validates`).

An unresolved ID during decomposition is logged and skipped (write-time
validation should have prevented it; imported data may still contain it).

### D2. Suggestion service

The matching rules in `decompose_crossrefs.go` move to `domain/linksuggest`
unchanged, but return `{relation, from_id, to_id, score, reason}` instead of
edges. Suggestions already stored in a field, or rejected before, are filtered
out. Rejections are stored per instance so they are not offered again.

Exposed as:
- MCP `list_link_suggestions(instance, relation?, artifact?)` (read access) and
  `accept_link_suggestion` / `reject_link_suggestion` (write access; accept
  stages a normal mutation, so it goes through review like any other write).

Accepting records origin on the staged batch in the shared shape from
`decide-strategy-source-of-truth` D6: `kind: link_suggestion`, producer
`linksuggest` with its rule name, inputs (source and target IDs with the
`source_revision` of their artifacts) and the score and reason. Rejections
store the same inputs, so a suggestion is offered again only when either
artifact's content changes. The Go origin type is shared with
`adopt-memory-source-authority` (ripple origin).
- Web UI: suggestions shown beside the reference picker for the field.

### D3. Write-time reference validation

Under `decide-strategy-source-of-truth` D3 the mandatory check is the release
gate; this is earlier validation. References are rejected at staging rather
than only warned about because they are fully machine-checkable, authoring
tools offer pickers, and an unresolved reference is never useful as a draft.
The release gate still re-checks them.

After JSON Schema validation, the staged payload's reference fields (found via
the registry's `carried_by` and the identity patterns) are resolved against the
instance state including other mutations in the same batch. Failure returns 422
with a new error code and, per bad reference, the field path, the bad value and
up to 20 valid IDs of the target type.

### D4. ID assignment

When a staged payload contains a list entity of a type with
`identity.kind: id_field` and no `id`, the server assigns
`{prefix}{next number}` (three digits, scanning the instance) and returns the
assigned IDs in the stage response. Authors and agents never have to compute
IDs; they may still supply one.

### D5. Import migration in Go

The migration is ported from the canonical spec rather than shelling out to the
canonical script (the server has no bash dependency, and local mode must stay
single-binary). Correctness is defined by the canonical fixtures: a test runs
the Go migration on each canonical fixture and compares with the canonical
expected output, byte-for-byte after YAML normalisation.

Detection: the anchor's `epf_version`, else the presence of 2.x reference
forms. The original 2.x payload is kept as the first committed version, the
migrated payload as the second, so `restore_version` can show what changed.

### D6. Re-ingest

Migration triggers a full re-ingest of the instance, which removes the old
guessed edges and `Opportunity` objects that are now `SwotOpportunity`. With
`fence-memory-graph-per-instance`, the re-ingest is scoped to the instance.

## Risks

- **Sparser graph after migration** changes ripple and impact results. The
  import report states how many guessed links were dropped and how many
  suggestions are waiting, and the instance page shows the same number.
- **Agents writing 2.x forms** get errors. The error names the 3.0.0 form; the
  MCP tool descriptions are updated in the same change.

## Open Questions

1. Should high-score suggestions be auto-accepted for imported instances?
   Proposed: no. A stored link means an author meant it.
2. Keep 2.x read support for one release (decompose 2.x without migrating)?
   Proposed: no; import always migrates.
