# Tasks: Ripple stages instead of auto-commits

Record the test baseline before starting: `go test ./...` from
`apps/strategy-server` with Postgres up. As of 2026-09-08: 40 packages, 0
failures.

No dependency on any other in-flight change. This can be implemented and
merged on its own.

## 1. Domain change

- [ ] 1.1 Add a staging counterpart to `CommitAuto` in
      `domain/strategy/service.go` — same shape (`ArtifactType`, `ArtifactKey`,
      `Action`, `Payload`, `SignalID`), but calls `Stage` (or reimplements its
      staged-insert directly if `Stage`'s signature doesn't fit cleanly) rather
      than inserting with `Status: MutationStatusCommitted`.
- [ ] 1.2 Preserve provenance: `Source: "ripple_auto"`, `batch_metadata`
      carrying `{authority_tier, signal_id}` exactly as `CommitAuto` does today.
- [ ] 1.3 Resolve design Open Question 1: decide and implement whether
      `CreatedBy` is explicitly nulled or inherits the request actor. Write
      down the reasoning at the call site as a comment either way.
- [ ] 1.4 Test: staging via this path produces a `MutationStatusStaged` row
      with the same provenance fields the old `CommitAuto` path produced,
      minus the committed status.

## 2. Convergence loop

- [ ] 2.1 Generate one `batch_id` per `RunConvergenceLoop` invocation.
- [ ] 2.2 Thread it through `resolveAutonomousSignal` → the new staging call
      (design Decision 2).
- [ ] 2.3 Remove the premature `ResolveSignal` call at `convergence.go:286`
      (design Decision 3) — do not replace it with a new status transition.
- [ ] 2.4 Update `ConvergenceServices.CommitAutoFn`'s doc comment and, if
      renamed, its call sites — reflect that it stages, not commits.
- [ ] 2.5 Test: a convergence run producing two autonomous-tier fixes for two
      different signals stages both mutations under the same `batch_id`.
- [ ] 2.6 Test: the signal targeted by a staged (not yet committed) fix
      remains `active`, not `resolved`.
- [ ] 2.7 Test: once the staged batch is committed via `CommitBatch`, the
      signal transitions to `resolved` (verifying `ResolveByTarget`'s existing
      behavior now closes the loop, per design Decision 3 — this is the test
      that proves no new resolution-tracking code was needed).
- [ ] 2.8 Test: if the staged batch is discarded instead, the signal remains
      `active`.

## 3. Damping and equilibrium

- [ ] 3.1 Confirm max-iterations, change-budget, anchor-drift, and
      emergency-brake damping still function unchanged (they gate proposing,
      not committing) — existing tests should mostly cover this; add any gap.
- [ ] 3.2 Test design Decision 4: a convergence run that only staged fixes
      (nothing committed) does not trigger `VersionPublisher`, even if the
      resulting hypothetical state would be at equilibrium.
- [ ] 3.3 Test: a human committing a staged ripple-fix batch, whose resulting
      post-commit run reaches equilibrium, *does* trigger auto-publish —
      confirming the mechanism still works, just at the correct moment.

## 4. Review surface verification (no new UI expected)

- [ ] 4.1 Manually verify `GET /strategies/:id/aim/draft-review/:batchID`
      renders a `ripple_auto`-sourced batch without error, including the
      `CreatedBy` case resolved in task 1.3.
- [ ] 4.2 Manually verify the batch appears in the pending-review inbox
      (`loadPipelineReviewItems`) and the execution dashboard's pending-review
      count.
- [ ] 4.3 If either rendering is degraded (e.g., a Ripple-sourced batch shows
      generic/unhelpful copy compared to an AIM-sourced one), fix the minimum
      needed for legibility — do not build new UI for this.
- [ ] 4.4 Resolve design Open Question 2 (per-signal attribution within a
      shared batch) based on what task 4.1 actually shows.

## 5. Documentation corrections

- [ ] 5.1 `docs/UNIFIED_AGENT_ARCHITECTURE.md:250-252` — add a note that
      Ripple's autonomous tier was a live counterexample to "the agent never
      commits" until this change landed, per the project's drift-log
      discipline (record the reversal, don't silently fix the claim).
- [ ] 5.2 `apps/strategy-server/AGENTS.md` — correct "Server-orchestrated
      (future, web UI)" to reflect that it runs today (behind an LLM provider
      being configured, not behind a phase gate), and correct the
      `autonomous` tier's "Auto-resolvable" description to reflect that it now
      auto-drafts and stages, not auto-applies.
- [ ] 5.3 `openspec/specs/strategy-ripple/spec.md` gets this change's delta
      applied on archive (standard OpenSpec flow — not a manual edit now).

## 6. Verify

- [ ] 6.1 `go test ./...` — no regressions against the 40-package baseline.
- [ ] 6.2 `task lint` clean.
- [ ] 6.3 End to end by hand: commit a direct edit that creates a downstream
      semantic-drift signal likely to classify as `autonomous`; confirm a
      staged batch appears in the review inbox instead of the target artifact
      changing immediately; commit it; confirm the signal resolves and (if
      applicable) a version auto-publishes at that point, not before.
