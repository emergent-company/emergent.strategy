# Change: Ripple-Driven Foundation Drafts

## Why

The `adapt-strategy` skill, wired to the AIM cycle, now automatically rewrites
`strategy_formula`, `roadmap_recipe`, and the LRA when a calibration decision is
committed. These are the fast-moving execution artifacts.

But strategy is a stack. A pivot in the formula eventually propagates up to the
foundation: the north star may need sharpening, the competitive analysis may be
stale, personas may have shifted, the opportunity definition may need reframing.
These are more permanent, more consequential artifacts — but they are not immune
to change. They evolve slowly, but they do evolve.

Today, the ripple engine correctly fires `propagation` signals when `strategy_formula`
or `roadmap_recipe` commit — it walks the relationship graph and marks connected
READY-layer artifacts as stale. But those signals just sit in `list_signals`. Nothing
produces a draft. The human strategy manager sees a warning but has no AI-generated
starting point for the review.

The result is an asymmetric experience: the execution layer (formula, roadmap) gets
AI-drafted rewrites for every AIM cycle, while the foundation layer (north star,
insight analyses, foundations, opportunity) demands fully manual authoring every time
it needs updating — even when the change is just tightening a formulation that the
formula already made obsolete.

## What Changes

### New skill: `adapt-foundations`

A chunked prompt-mode skill, same architecture as `adapt-strategy`, targeting the
READY-layer artifacts. Four chunks, executed sequentially with prior outputs
propagated:

| Chunk | Output key | Artifact | Staleness threshold |
|-------|-----------|----------|---------------------|
| 1 | `north_star` | `north_star` | `gated` / `escalated` signal exists |
| 2 | `strategy_foundations` | `strategy_foundations` | `gated` signal exists |
| 3 | `insight_analyses` | `insight_analyses` | `gated` signal exists |
| 4 | `insight_opportunity` | `insight_opportunity` | `gated` signal exists |

Each chunk receives:
- The updated `strategy_formula` (just committed by adapt-strategy)
- The updated `roadmap_recipe` (just committed)
- The current payload of the artifact being rewritten
- The ripple signal(s) that triggered this draft — including severity and description
- Prior chunk outputs (same `PriorOutputs` mechanism as adapt-strategy)

Each chunk prompt is calibration-aware: it distinguishes between minor wording
tightening (when the signal is `warning`/`gated`) and directional reframing (when
the signal is `critical`/`escalated`). The LLM is explicitly instructed to make
the smallest change that achieves coherence — not to rewrite for the sake of it.

### Ripple post-commit trigger

After the adapt-strategy batch is committed (via `commit_batch`), the post-commit
ripple analysis already fires and creates signals. This change adds a second step:
if any active `gated` or `escalated` signal targets a foundation artifact
(`north_star`, `strategy_foundations`, `insight_analyses`, `insight_opportunity`),
the server enqueues an async `adapt-foundations` skill run on that instance.

The skill run produces a staged batch in the human review inbox — same as any other
skill run. The batch description includes:
- Which signals triggered it
- The authority tier (gated vs escalated)
- A plain-English summary of what changed in the execution layer that prompted this

This is NOT automatic commit. The human sees the draft in their inbox, reviews it,
and commits or discards it. The AI drafts, the human decides.

### Signal-to-batch linkage

The staged batch metadata includes a `triggered_by_signals` field listing the signal
IDs that caused the draft. When the human commits the batch, those signals are
automatically resolved (same as the existing `ResolveByTarget` mechanism).

### Authority tier surface in batch description

The batch description distinguishes:
- **`gated`** (semantic similarity still high — minor wording tightening): described
  as "Formulation alignment — review for consistency with updated strategy"
- **`escalated`** (semantic similarity low — significant directional change): described
  as "Strategic realignment required — significant change detected, review carefully"

This gives the human a calibrated sense of urgency without burying them in raw signal
metadata.

## What Does NOT Change

- The human is always in the loop. No foundation artifact is ever auto-committed.
- The adapt-strategy batch commit remains the trigger — foundation drafts are produced
  after human review and commit of execution changes, not before.
- The chunked executor, validation loop, schema constraints, and activity stream are
  unchanged — `adapt-foundations` reuses them all.
- The `adapt-strategy` skill is unchanged — it still runs as part of the AIM cycle
  and produces the same 3 mutations.
- Ripple signal detection and classification are unchanged — this change adds a
  consumer of signals, not a change to signal generation.

## Architecture

```
AIM cycle completes
    └─ human commits adapt-strategy batch (strategy_formula + roadmap_recipe + LRA)
           └─ postCommitRippleAnalysis() fires
                  └─ signals created for stale READY-layer artifacts
                  └─ [NEW] if gated/escalated signals target foundation artifacts:
                         └─ enqueue adapt-foundations RunChunked()
                                └─ 4 chunks, ~3 min total
                                └─ staged batch in human inbox
                                └─ batch description: triggered signals + authority tier
                                └─ on commit: signals auto-resolved
```

## Scope

- `apps/strategy-server/internal/embedded/skills/adapt-foundations/` — new skill directory
  - `skill.yaml`
  - `prompt.md` (interactive fallback)
  - `output_schema.json`
  - `chunks/01_north_star.md`
  - `chunks/02_strategy_foundations.md`
  - `chunks/03_insight_analyses.md`
  - `chunks/04_insight_opportunity.md`
- `apps/strategy-server/domain/skillexec/executor.go` — add `adaptFoundationsChunks` var
- `apps/strategy-server/domain/skillexec/executor.go` — add `knownArtifactOutputKeys` entries
  for `north_star`, `strategy_foundations`, `insight_analyses`, `insight_opportunity`
- `apps/strategy-server/internal/mcpserver/register_ripple_tools.go` —
  `postCommitRippleAnalysis()` extended to enqueue foundation drafts when gated/escalated
  signals target foundation artifacts
- `apps/strategy-server/domain/skillexec/context.go` — ensure `buildContextBundle` loads
  all four foundation artifacts alongside formula/roadmap for the executor
- Tests for the new chunks and the ripple trigger logic

## Not in scope

- Auto-commit of any foundation artifact
- Changes to signal generation or classification
- Changes to the AIM workflow steps
- UI changes (foundation drafts appear in the existing pending batches UI)
- New MCP tools (the existing `run_skill` and `commit_batch` tools are sufficient)
