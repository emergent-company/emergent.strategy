# Decision record: where strategy truth lives

> Read `proposal.md` first for why this question exists. This record sets the
> frame; the changes listed in §6 carry it out. Line references:
> emergent.strategy `main` @ `fd922a7`, epf-canonical `main` @ `8a3af76`,
> emergent.memory `main` as of 2026-11-01.

## 1. The organising model

Running a strategy is closer to running software than to editing a document.
A strategy is *loaded into a runtime* — ripple propagation, the AIM loop,
agents acting on it, serving it to other systems — the way code is built and
deployed. Tools that make strategy easier to author are like an IDE: they
matter, but they are about maintenance, not about what runs.

Software settled this decades ago, and the reasons carry over:

- **Text files are the universal interface.** Editors, compilers, CI and AI
  agents all operate on the same files; no single tool owns the format.
- **A commit identifies exactly what runs.** Production runs a build pinned to
  an immutable version; rollback and audit are trivial.
- **IDEs keep databases, but derived and disposable ones.** Symbol indexes and
  language-server caches rebuild from the files.

Database-first code (Smalltalk images, Lotus Notes, most low-code platforms)
has repeatedly hit collaboration, diffing, interoperability and lock-in
limits.

| Software | Strategy |
|---|---|
| Source files in git | EPF YAML in git |
| Language: type system, linker | Canonical EPF: JSON Schemas, ontology, reference identity |
| Compiler / build | Validation + decomposition into the strategy graph |
| IDE | strategy-server authoring (web UI, MCP write tools, agents) |
| IDE workspace (unsaved, uncommitted) | strategy-server workspace: staged and unreleased edits |
| Deployed build | A released strategy version loaded into the runtime |
| Runtime | Ripple, AIM loop, agents, serving |
| Application data, telemetry | Signals, evidence, assessments, measurements |
| Language-server index | emergent.memory projection |
| Static analysis suggestions, code review bots | Heuristic link suggestions, ripple fixes, Memory synthesis |

The analogy has limits, and each limit becomes a design obligation (§4).

## 2. Decisions

### D1. The strategy definition's source of truth is EPF YAML in git

A strategy *definition* — the artifacts an author writes — is authoritative
when it is committed to the instance's git repository. strategy-server's
database is the **workspace**: edits that have not been released yet, plus the
fine-grained history of how they were made.

- Authors who do not use git never see it. Releasing from the workspace is a
  commit made by the server on the author's behalf, through the existing
  GitHub write path.
- An instance without a linked repository still has a definition history: the
  server keeps released versions itself, in the same form it would commit
  (YAML set + version identifier), so linking a repository later is an export,
  not a conversion.
- The mutation ledger stays. It is the workspace journal and audit trail
  between releases, not a second definition history.

### D2. Canonical EPF defines the language; strategy-server implements it

epf-canonical defines what a valid strategy is: per-artifact JSON Schemas, the
ontology registry (entity types, relation types, identity, how each relation
is established), and the reference rules. strategy-server is the **reference
implementation**, not the definition. `internal/decompose/schema.go`'s claim to
be the schema source of truth is retired by `adopt-canonical-ontology`.

### D3. Validation is a build gate

An edit in the workspace may be invalid, the way unsaved code may not compile.
A **release** — and therefore anything loaded into the runtime or committed to
the default branch — must pass the full gate:

1. every artifact validates against its JSON Schema;
2. every reference resolves under the ontology's identity rules;
3. decomposition produces only types and relations declared in the ontology.

Tools may validate earlier (for example, `adopt-explicit-strategy-references`
rejects unresolved references at staging); that is a convenience, not a
replacement for the gate. Post-commit warnings
(`internal/pipeline/postcommit.go:219`) stay as authoring feedback.

### D4. The runtime runs a pinned, released version; runtime state is separate

The runtime loads one released version per instance, identified by its git
commit (or the server's version identifier when no repository is linked).
Everything the runtime produces as it operates — ripple signals, evidence
links written by tools, measurements, work-package progress — is **runtime
state**: stored in the database, keyed to the version it was produced
against, and never written into the definition YAML. Runtime state can
*propose* definition changes (D6); it does not become definition by being
stored.

AIM artifacts (assessment reports, calibration memos) are not runtime state.
They record judgements made about a release, like a postmortem committed
with code, and are definitions that enter through D6. The runtime state that
informed them is linked from their origin.

### D5. emergent.memory is a subsystem: index and synthesis, never authority

Memory holds a projection of the loaded version plus selected runtime state,
and Memory's own synthesis. strategy-server pushes; Memory indexes, embeds and
synthesizes. The contract — source ownership, per-object source revision,
atomic visibility, labelled synthesis, adoption feedback — is proposed to the
memory team in emergent.memory#2376 and implemented on this side by
`fence-memory-graph-per-instance` and `adopt-memory-source-authority`.

- The schema strategy-server pushes to Memory is generated from the canonical
  ontology (`adopt-canonical-ontology`). A schema pack is data; installing it
  does not make Memory EPF-aware.
- Isolation: one Memory project per strategy-server today, fenced per
  instance. A project per organisation with a namespace per source is the
  intended end state. It is cheap to migrate to because the projection is
  rebuildable, as long as the move happens before Memory-only synthesis
  accumulates (tracked in #99, D1b).
- Once D4 lands, `source_revision` on projected objects becomes the release
  commit plus the artifact's content hash.

### D6. One adoption path for every proposed change

Everything that is not an author's own edit is a **proposal**, and every
proposal enters the definition the same way: as a staged batch in the
workspace, reviewed or auto-committed according to the authority tier, and
released through D3. Each adopted proposal records its **origin**.

| Proposal source | Today | Under D6 |
|---|---|---|
| Edits made directly in git | Import overwrites the server (safety PR first) | Structural three-way merge into a staged batch; conflicts shown per entity |
| Ripple fixes | Staged or auto-committed batch | Unchanged path; origin recorded (`adopt-memory-source-authority`) |
| Memory synthesis | Not consumable | Opt-in, labelled, adopted via a staged batch with origin |
| Keyword-matched links | Written as `structural` edges | Suggestions; accepting stages a mutation (`adopt-explicit-strategy-references`) |
| AIM recommendations | Per AIM tools | Same path, origin `aim` |

Origin uses one shape everywhere (kind, producer, the inputs and their
revisions). Recorded origin is what prevents a feedback loop from treating its
own earlier output as independent confirmation.

### D7. Every persisted type and relation is classified by layer

| Layer | Owned by | Stored in | Relation provenance |
|---|---|---|---|
| definition | Authors, via D6 | git (released), workspace (unreleased) | explicit, containment, derived |
| runtime | The runtime | strategy-server database | explicit (written by runtime tools) |
| synthesis | Memory or heuristics | Memory, suggestion stores | inferred, embedding |

The ontology registry records the layer of each entity and relation type.
Tools must not present synthesis as definition, and must not write runtime
state into definition artifacts.

## 3. Alternatives considered

- **The database as the single source of truth, YAML as export only.** This
  was the recommendation earlier in the discussion. It solves the two-master
  problem but makes strategy-server the definition of EPF in practice, loses
  git's review, history and tool interoperability as the primary workflow,
  and ties portability to an export feature. Rejected in favour of D1.
- **Memory as the source of truth.** Moves EPF invariants and the ledger into a
  generic graph without atomic multi-object writes, and makes Memory
  domain-aware. Rejected (D5).
- **Keep two masters, improve the safety PR.** Leaves "which copy is right"
  undefined and puts every merge on a human. Rejected.
- **Drop YAML.** Loses portability, review in git and the agent ergonomics of
  files. Rejected.

## 4. Where the analogy needs care

1. **Authors are not developers.** The server must hide git: release is a
   button, review is in the UI. Obligation for the follow-up sync change.
2. **Line-based merge is weak for structured YAML.** Structural three-way merge
   by entity ID is required to replace the safety-PR flow. It depends on every
   referenced entity having a stable ID — `unify-reference-identity` (EPF
   3.0.0) is therefore a prerequisite, not just a cleanup.
3. **Runtime state must not leak into definitions.** D4 and D7.
4. **Validation timing.** Strict at release, permissive while drafting (D3).
5. **Releases must be cheap.** If releasing feels heavy, authors will leave
   work in the workspace and the workspace becomes the de facto truth again.
   The release flow should be one action with a generated description.

## 5. Consequences

- **The divergence flow in `add-github-sync-lifecycle` is superseded** for
  future work: "GitHub ahead and server ahead" becomes a merge into a staged
  batch. The current flow stays until the follow-up change lands.
- **"Committed" is overloaded.** The ledger's `committed` batch status means
  "accepted into the workspace", not "released". The follow-up change should
  rename one of them in the UI and docs.
- **Graphs get sparser before they get better.** Removing text-guessed edges
  (EPF 3.0.0) reduces edges until authors accept suggestions. That is the
  honest state; the suggestion flow makes the gap visible.
- **Memory's role is narrower but safer.** It cannot be read as truth, so every
  decision path that uses it must check revisions (§6).

## 6. Alignment map

Status as of 2026-11-01. "Amended" means changed in its own PR alongside this
one.

| Change | Repo | Status | Implements | Alignment |
|---|---|---|---|---|
| `fence-memory-graph-per-instance` | strategy | In progress; slice 1 landed | D5 | Aligned. Ships first (pilot deadline). Namespace instead of key prefix considered and deferred to the project-per-org move. |
| `adopt-memory-source-authority` | strategy (#126) | Open | D5, D6, D7 | **Amended:** generated schema pack from the ontology replaces the "no schema install" decision; `source_schema` is the ontology version; synthesis classified by provenance; origin shape shared with D6. |
| `adopt-canonical-ontology` | strategy (#111) | Open | D2, D7 | **Amended:** reads the layer from the registry and stamps it on projected objects; references this record. |
| `adopt-explicit-strategy-references` | strategy (#111) | Open | D2, D3, D6 | **Amended:** accepting a suggestion records origin in the D6 shape; rejections are keyed on artifact revisions, so a suggestion returns when content changes; reference validation framed as early validation under D3. |
| `add-strategy-ontology` | canonical (#27) | Open | D2, D7 | **Amended:** adds `layer` (definition, runtime, synthesis) to entity and relation types; inferred and embedding relations must be `synthesis`; AIM artifacts are `definition` (matches D4). |
| `unify-reference-identity` | canonical (#27) | Open | D2, D3 | **Amended:** states stable IDs as the prerequisite for structural merge (§4.2). |
| `add-github-sync-lifecycle` | strategy | Implemented, not archived | — | Partly superseded (§5). Replaced by follow-up `adopt-git-release-model`. |
| `retire-epf-cli` | strategy | Open | — | Unaffected; gates EPF 3.0.0. |
| `add-instance-content-integrity` | strategy | Open | D3 | Related: content checks belong in the release gate. Not amended here. |

Sequence:

1. `fence-memory-graph-per-instance` slice 2 — closes the cross-instance leak.
2. `add-strategy-ontology` + `adopt-canonical-ontology` — additive.
3. `adopt-memory-source-authority`.
4. `unify-reference-identity` + `adopt-explicit-strategy-references` — EPF
   3.0.0, after `retire-epf-cli`.
5. `adopt-git-release-model` (follow-up) — D1, D3, D4: workspace/release
   split, release gate, pinned runtime version, structural merge.

## 7. Revisit triggers

- Authors routinely leave work unreleased for long periods (the workspace
  becomes the de facto truth) — revisit release ergonomics, not D1.
- The memory team rejects source-authoritative mode in emergent.memory#2376 —
  D5 still holds on this side, but the contract stays local to strategy-server.
- A customer needs strategy without any git hosting — D1's server-held release
  history covers it; revisit only if that becomes the common case.
