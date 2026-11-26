# Change: Decide where strategy truth lives across EPF, strategy-server and Memory

> **A decision change.** `decision.md` is the architecture decision record.
> It sets the frame that the open changes in this repo and in epf-canonical
> are aligned to; the alignment map is in `decision.md` §6. Code follows in
> the changes listed there, not here.

## Why

The estate grew in three steps, and each step added a place where strategy
data lives without deciding which place is authoritative:

1. **Strategy as code.** EPF artifacts are YAML files validated by JSON
   Schemas (epf-canonical, epf-cli).
2. **strategy-server.** Artifacts are imported into PostgreSQL, edited through
   MCP tools and the web UI, and exported back to GitHub.
3. **emergent.memory.** The database is projected into a semantic graph for
   search, propagation and synthesis.

The code today answers "where is the truth?" differently in different places:

- **Two writable masters.** GitHub and the server's database are both edited.
  On divergence the server pushes a safety PR and then lets the GitHub import
  overwrite its own state (`domain/sync/import.go:392`). Nothing merges.
- **Schemas are advisory inside the server.** Validation after commit only
  logs warnings (`internal/pipeline/postcommit.go:219`), so the database can
  hold strategy that would not export as valid EPF.
- **Memory is treated as current truth.** Ripple's change classification
  trusts Memory's indexed copy to hold the pre-change content without checking
  (`domain/ripple/semantic.go:89`), and that score selects the authority tier.
- **Guesses are published as structure.** The decomposer infers six relation
  types from text and labels them `structural`, the same as links an author
  wrote (`internal/decompose/decompose_crossrefs.go`).
- **The meaning of EPF lives in Go.** `internal/decompose/schema.go` states
  that the decomposer code is the schema source of truth; canonical EPF
  defines documents but not what they mean together.

Several open changes each fix part of this (`fence-memory-graph-per-instance`,
`adopt-memory-source-authority`, `adopt-canonical-ontology`,
`adopt-explicit-strategy-references`; in epf-canonical `add-strategy-ontology`
and `unify-reference-identity`). Without a shared frame they make locally
sensible but inconsistent choices — for example, whether strategy-server
installs a Memory schema pack (one change says yes, another said no).

## What Changes

- **Records seven decisions** in `decision.md`, using the software analogy as
  the organising model: EPF YAML in git is the source code, canonical EPF is
  the language, strategy-server is the IDE and the runtime, its database holds
  the workspace and runtime state, and Memory is the index and synthesis
  engine.
- **Adds four requirements to `strategy-core`** that make the decisions
  testable: definition source of truth, validated versions only in the
  runtime, layer classification of persisted data, and one adoption path for
  proposed changes.
- **Maps every affected change** in both repos to the decisions, with the
  amendment each one needs (`decision.md` §6). Amendments to open changes are
  made in their own PRs alongside this one.
- **Lists follow-up changes** that do not exist yet (`tasks.md` §2).

## Impact

- Affected specs: `strategy-core` (four added requirements).
- Partly supersedes the divergence handling in `add-github-sync-lifecycle`
  (safety PR, then GitHub overwrites the server). The replacement is a
  follow-up change.
- Related, amended to match: `adopt-memory-source-authority` (#126),
  `adopt-canonical-ontology` and `adopt-explicit-strategy-references` (#111),
  epf-canonical `add-strategy-ontology` and `unify-reference-identity`
  (epf-canonical #27). Upstream: emergent.memory#2376.
- No code, no migration.
