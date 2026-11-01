# Tasks: Decide where strategy truth lives

This change records a decision and aligns other changes to it. It ships no
code. The requirements it adds are implemented by the changes in §2 and §3;
archive this change once `adopt-git-release-model` is archived, or earlier if
the team prefers to archive decisions on acceptance.

## 1. Decision and alignment

- [x] 1.1 Write `decision.md` (D1–D7, alignment map, sequence, revisit
      triggers).
- [x] 1.2 Amend `adopt-memory-source-authority` (#126): schema pack generated
      from the ontology, `source_schema` as ontology version, provenance-based
      classification of synthesis, shared origin shape.
- [x] 1.3 Amend `adopt-canonical-ontology` and
      `adopt-explicit-strategy-references` (#111): layer from the registry;
      origin on accepted suggestions; early validation framed under D3.
- [x] 1.4 Amend epf-canonical `add-strategy-ontology` (`layer` field) and
      `unify-reference-identity` (stable IDs as merge prerequisite) (#27).
- [ ] 1.5 Team review of D1–D7. Record the outcome (accepted / accepted with
      changes / rejected) at the top of `decision.md`.

## 2. Follow-up changes to write

- [ ] 2.1 `adopt-git-release-model` (emergent.strategy): workspace / release
      split; release gate (D3); release as a server-made commit; server-held
      releases for unlinked instances; runtime pinned to a release (D4);
      runtime state keyed to release; structural three-way merge by entity ID
      replacing the safety-PR flow in `add-github-sync-lifecycle`; renaming
      the overloaded "committed" status in UI and docs.
- [ ] 2.2 Release gate support in epf-canonical: a single validation entry
      point that runs schema, ontology and reference checks for an instance,
      usable from CI and embeddable in strategy-server.
- [ ] 2.3 Project per organisation and namespace per source in Memory (#99,
      D1b), before Memory-only synthesis accumulates.
- [ ] 2.4 Unify origin recording across ripple, suggestions, Memory synthesis
      and AIM into one shared type, if the amended changes have not already
      converged on it.

## 3. Verification

- [x] 3.1 `openspec validate decide-strategy-source-of-truth --strict` passes
      on the latest openspec CLI.
- [x] 3.2 Every change in the alignment map validates strictly after its
      amendment.
