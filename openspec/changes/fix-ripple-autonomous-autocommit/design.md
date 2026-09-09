# Design: Stage instead of auto-commit

## Context

This is a narrow, surgical fix, not a rearchitecture. The convergence loop's
detection, classification, and damping logic are all unaffected — only the
final step, "what happens to a fix once the resolver produces one," changes.

Verified substrate:

| Piece | Where | Behavior kept |
|---|---|---|
| `strategy.Service.Stage` | `domain/strategy/service.go:298` | Unchanged — already the primitive every other write path uses |
| `strategy.Service.CommitAuto` | `domain/strategy/service.go:410` | Superseded by a staging equivalent for this caller; not deleted, since nothing else calls it today but removing it isn't necessary for this fix |
| `ResolveByTarget` | `domain/ripple/service.go:237` | Unchanged — already runs on every commit; now does the resolving work this fix needs, for free |
| Draft review page | `internal/handler/handler_aim_agent.go:149` | Unchanged — already keys on `batch_id`, not an AIM run |
| Pending-review inbox | `queries_phases.go:loadPipelineReviewItems`, `cascade_tracker.templ` | Unchanged — already lists any staged batch |
| Damping (max iterations, change budget, anchor drift, emergency brake) | `convergence.go` | Unchanged — still bounds what gets proposed per cycle |

## Goals

- Close the standing gap: no server-generated content becomes live without a
  human commit, with no carve-outs.
- Zero new UI, zero new resolution-tracking logic — reuse what exists.
- Preserve the legitimate original goal (humans shouldn't have to
  review-and-commit a typo fix with full ceremony) by making review *fast*,
  not by skipping it.

## Non-Goals

See `proposal.md`'s Non-Goals — in short: not replacing the score-based
classifier, not touching gated/escalated handling, not moving to DBOS.

## Decisions

### Decision 1 — Stage via the existing primitive, not a new one

`resolveAutonomousSignal` calls `strategy.Service.Stage` (or a thin wrapper
matching `CommitAuto`'s existing call shape, to minimize churn at the call
site) instead of `CommitAutoFn`/`CommitAuto`. This is the same primitive
`update_feature`, `propose_patch` (once it exists), and every human-initiated
edit already use.

**Rejected: build a dedicated "ripple staging" path.** Would duplicate
`Stage`'s behavior (batch grouping, audit entry, status) for no benefit — the
review UI and pending-review inbox already work generically on `batch_id` and
`source`, so a bespoke path buys nothing and adds a second thing to keep in
sync.

### Decision 2 — One batch per convergence run, not one batch per fix

All autonomous fixes generated within a single convergence loop invocation
(potentially several iterations, several signals) share one `batch_id`,
generated once at the top of the run.

**Why:** matches the review granularity a human actually wants — "here are
the downstream implications of the change you just committed," reviewed
together — rather than a scattering of single-item batches for one causally
related event. This mirrors the same call made for the coherence council in
`add-artifact-assistant-bot` design Decision 4, for the same reason.

### Decision 3 — Don't resolve the signal at staging time; let the next commit do it

`resolveAutonomousSignal` currently calls `ResolveSignal` immediately after a
successful auto-commit (`convergence.go:286`). This fix removes that call
entirely rather than replacing it with a "staged" intermediate status.

**Why this is correct, not merely simpler:** `ResolveByTarget`
(`domain/ripple/service.go:237`) already runs as step 2 of every
`PostCommitPipeline.Run` (`postcommit.go:93-100`), resolving any active signal
whose target artifact was just committed. When a human later commits the
staged ripple-fix batch, that commit triggers a fresh `PostCommitPipeline.Run`
which resolves the signal at exactly the moment the fix becomes real — free,
correct, and already tested by every other write path. Inventing a new
"staged, awaiting commit" signal status would require new transition logic to
handle the discard case (revert to active) and would duplicate what
`ResolveByTarget` already does correctly. Leaving the signal active until an
actual commit is not a workaround — it is the accurate state: the
misalignment is not resolved until a human approves the fix.

**Rejected: mark it resolved optimistically at staging time.** If a human then
discards the batch, the signal would incorrectly read as resolved while the
underlying misalignment still exists — silently reintroducing exactly the
"nobody knows this needs attention" failure mode this fix exists to close.

### Decision 4 — Auto-publish-on-equilibrium no longer triggers from staging alone

`VersionPublisher` fires when equilibrium is reached "with changes" within a
cycle. Since staging doesn't change committed state, `changedThisCycle` is no
longer set by an autonomous fix — only a real commit (of the originally
triggering batch, or later of a staged ripple-fix batch once a human approves
it) can produce it now.

**This is a correction, not a side effect to work around.** The auto-published
version snapshot is meant to mean "the graph reached a genuinely coherent,
real state." Under the old behavior, that snapshot could include content a
human never saw. Under this fix, it only ever reflects state a human actually
approved, which is what "auto-published" should have meant all along.

## Risks / Trade-offs

| Risk | Mitigation |
|---|---|
| Reviewers now see more staged batches (previously invisible, auto-committed work) | This is the point — surfacing them is the fix, not a cost to offset. If review volume proves high in practice, that's the argument for the deferred meaning-based-classifier follow-up (fewer false "needs review" cases), not for reverting this |
| A batch containing multiple unrelated downstream fixes is harder to review at a glance | Decision 2's shared `batch_id` still groups by *causal* origin (one convergence run); `batch_metadata` should retain per-signal attribution so the review UI can list "N fixes, here's why each was proposed" rather than one undifferentiated payload — verify the existing templ renders multi-mutation batches with enough per-item context (task list item) |
| `CommitAuto` becomes dead code | Leave it in place; it's a small, self-contained, already-tested function, and removing it is not necessary to close the actual risk. Note in code that it is currently unused, so a future reviewer doesn't wonder |

## Migration Plan

1. Add a staging counterpart to `CommitAuto` (or repoint `CommitAutoFn` to call
   `Stage` — implementation detail, pick whichever keeps `convergence.go`'s
   existing call shape and tests most intact).
2. Generate one `batch_id` per convergence run; thread it through
   `resolveAutonomousSignal`'s calls within that run.
3. Remove the premature `ResolveSignal` call (Decision 3).
4. Verify `changedThisCycle`/`VersionPublisher` behavior matches Decision 4
   with a test, not just inspection.
5. Verify the draft-review page and pending-review inbox render a
   `ripple_auto`-sourced batch sensibly, including the nil `CreatedBy` case
   (`CommitAuto` never set it; confirm `Stage`'s path — which does set it from
   `audit.ActorFromContext(ctx)` — doesn't misattribute the fix to whatever
   human/agent happened to be the actor on the original triggering commit's
   context, since that would mislabel a Ripple-generated fix as human-authored).
6. Update the two documentation corrections named in `proposal.md`'s Impact
   section.

## Open Questions

1. **Should `CreatedBy` be explicitly nulled for ripple-staged mutations**,
   rather than inheriting the triggering commit's actor from context? Leaning
   yes — attribution matters here for the same reason it matters in
   `add-artifact-assistant-bot` design Decision 4 (a reviewer needs to know
   this was Ripple's suggestion, not something the original committer typed).
   Resolve during implementation (migration step 5), not here — it's a
   one-line call-site decision, not an architectural one.
2. **Does `batch_metadata` need a new field to list per-signal attribution**
   within a shared batch, or does the existing `signal_id`-per-mutation
   metadata (already set by `CommitAuto` today) carry enough for the review UI
   to group by cause? Check during migration step 5's UI verification before
   adding anything new.
