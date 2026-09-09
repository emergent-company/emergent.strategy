# Change: Ripple's Autonomous Tier Stages Instead of Auto-Committing

## Why

`domain/ripple`'s convergence loop, when a `SignalResolver` is configured (the
documented, recommended production setup — any deployment with an LLM provider
configured), will generate a content fix for a downstream artifact and commit
it to live state with **no human review at any point**, provided the
triggering signal was classified `autonomous`. Traced in full:

`resolveAutonomousSignal` (`domain/ripple/convergence.go:223-299`):

```go
tier := classifySignalAuthority(sig, hasSemanticAnalyzer)
if tier != string(AuthorityAutonomous) { return }
result, resolveErr := svc.Resolver.Resolve(ctx, sig, targetArt.Payload)  // LLM writes new content
...
commitErr := svc.CommitAutoFn(ctx, instanceID, sig.TargetKey, ..., result.NewPayload, sig.ID)  // committed, live, immediately
```

This is not a corner case nobody exercises. `cmd_serve.go:266` wires the
resolver unconditionally whenever an LLM provider is configured
(`Resolver: rippledom.NewLLMResolver(llmClient, db)`), and `PostCommitPipeline.Run`
(`internal/mcpserver/server.go:1096`) invokes the convergence loop synchronously
inside every `commit_batch` call. There is no feature flag gating it — despite
`apps/strategy-server/AGENTS.md` describing this mode as "(future, web UI)",
which is stale; the code has no such gate.

**The `autonomous` tier is decided by a similarity score, which is provably
blind to meaning-inverting edits.** `ClassifyAuthority` (`domain/ripple/authority.go`)
thresholds a Memory search-relevance score (or a word-overlap ratio when Memory
is unavailable); `classifySignalAuthority` maps `Info`-severity semantic
signals — drift, cross-track tension, vertical misalignment — straight to
`autonomous` (`convergence.go:476-505`), and that severity is itself derived
from the same score (`tension.go:242`, `vertical.go:147`). Demonstrated live,
elsewhere in this cycle of work: "We will support enterprise SSO in Q3" →
"We will not support enterprise SSO in Q3" shares nearly every word and would
plausibly score as high-similarity — exactly the input this scoring approach
cannot distinguish from a typo fix.

**The one existing safety net is a magnitude cap, not a meaning check, and it
trusts the fix-generator's own self-report.** The convergence loop's "change
budget" damping layer compares against `result.Distance` — a field the
resolver's own LLM call fills in about its own output (`llm_resolver.go`: the
prompt asks the model to self-report `"distance":0.05`). Nothing independently
verifies it.

**This is a standing violation of an invariant the estate's own baseline
document asserts as already universally true.** `docs/UNIFIED_AGENT_ARCHITECTURE.md:250-252`
states, as a verified cross-repo fact: "Shared invariants, honoured everywhere
without coordination: the agent never commits." Ripple's autonomous tier is a
counterexample inside strategy-server itself — and a more severe one than the
invariant was written to describe, since here it isn't even an *agent*
committing; it's the server itself, unattended, writing LLM-generated content
to a live strategy artifact.

**This was a deliberate, previously-reasoned design choice, not an oversight**
(`openspec/changes/archive/2026-05-20-add-ripple-convergence-loop/proposal.md`):
the original motivation — humans should not have to review-and-commit a typo
fix with the same ceremony as a strategic pivot — is legitimate and this
proposal does not undo it. What was wrong was the specific mechanism chosen to
tell the two apart: a text-similarity score, applied not just to skip friction
but to skip the human entirely.

## What Changes

Replace the convergence loop's direct-commit path with the existing staging
primitive. Concretely:

1. `resolveAutonomousSignal` stages the resolver's fix (`strategy.Service.Stage`,
   which already exists and is used by every other write path in the system)
   instead of calling `CommitAuto`. All autonomous fixes produced within one
   convergence run share a single `batch_id`, so a human reviews one
   coordinated batch per triggering commit rather than N separate ones.
2. The signal is **not** marked resolved at staging time. It is left active.
   When a human later commits the staged batch, that commit's own post-commit
   pipeline run resolves it via the existing `ResolveByTarget` step — the same
   mechanism that already resolves any signal today. If the human discards the
   batch instead, the signal correctly remains active. No new
   resolution-tracking code is needed; this reuses what already runs on every
   commit.
3. Equilibrium auto-publish (`VersionPublisher`) no longer fires purely from
   autonomous-tier activity within a cycle, since nothing is actually committed
   by it anymore. This is a correction, not a regression: auto-publishing a
   version snapshot implying "coherence achieved automatically" was previously
   possible before a human had approved anything real.
4. The change budget, max-iteration, anchor-drift, and emergency-brake damping
   layers are unaffected — they still bound how much gets *proposed* per
   cycle, which remains meaningful regardless of whether the result commits or
   stages.
5. No new UI. Confirmed by reading the code: `GET
   /strategies/:id/aim/draft-review/:batchID` (`internal/handler/handler_aim_agent.go:149`)
   renders any batch by `batch_id`, not only AIM-cycle batches. The existing
   pending-review inbox (`loadPipelineReviewItems`, `cascade_tracker.templ`,
   the execution dashboard's pending-review count) already surfaces any
   staged batch regardless of source. A Ripple-staged batch is reviewable and
   discoverable today, with zero new surface area.

## Non-Goals

- **Not replacing the similarity score with a meaning-based (LLM) classifier.**
  That is a real, separate, worthwhile follow-up — reusing the `coherence`
  expert primitive being built in `add-artifact-assistant-bot` §4 as the
  severity classifier here too — but it is a distinct piece of work with its
  own cost/latency tradeoffs (an LLM call per signal instead of a free score,
  on every commit) that deserves its own scoped decision. This change fixes
  the sharper problem first: regardless of how severity gets classified,
  nothing should be allowed to skip human review entirely.
- **Not touching `gated`/`escalated` tier handling.** Those already require a
  human; unaffected.
- **Not moving Ripple's convergence loop onto DBOS.** Investigated and
  rejected as the mechanism for this fix: AIM's human-gate (`internal/aimdbos/workflow.go:166-190`,
  `dbos.Recv`) only works because the entire AIM cycle already runs as a
  durable DBOS workflow with a suspendable context. Ripple's convergence loop
  runs as a plain synchronous function call inside the `commit_batch` request
  handler (`internal/mcpserver/server.go:1096`) — there is no workflow to
  suspend, and building one is a materially larger, separate effort that the
  plain staging primitive makes unnecessary here.
- **Not changing `Change Classification`'s use for informational purposes**
  (the advisory logging in `postcommit.go` and the `propose_change` preview
  tool) — those never gated anything and remain as-is.

## Impact

- Affected spec: `strategy-ripple` (MODIFIED: Autonomous Commit Path,
  Convergence Loop).
- Affected code: `domain/ripple/convergence.go` (`resolveAutonomousSignal`,
  `ConvergenceServices.CommitAutoFn` → a staging equivalent),
  `internal/pipeline/postcommit.go` (wiring), `domain/strategy/service.go`
  (a staging counterpart to `CommitAuto`, reusing `Stage`).
- No migration needed — reuses the existing `strategy_mutations` staging
  columns and status values.
- No dependency on `add-artifact-patch-authoring` or `add-artifact-assistant-bot`.
  The staging primitive this reuses (`strategy.Service.Stage`) already exists
  and is independent of both in-flight changes. This can land immediately.
- Documentation corrections bundled with this change (not code, but the same
  root cause — an inaccurate claim about what's already safe):
  - `docs/UNIFIED_AGENT_ARCHITECTURE.md:250-252`'s "the agent never commits"
    claim gets a footnote noting this was a live counterexample until this
    change landed, per the project's drift-log discipline.
  - `apps/strategy-server/AGENTS.md`'s "Server-orchestrated (future, web UI)"
    label and the authority-tier table's "Auto-resolvable" description for
    `autonomous` are corrected to reflect that it runs today, and now stages
    rather than silently applying.
