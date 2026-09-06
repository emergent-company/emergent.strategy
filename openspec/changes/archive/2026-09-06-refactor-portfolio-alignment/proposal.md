# Change: Refactor portfolio alignment from LLM generation to deterministic activation

## Why

The `align-portfolio` skill currently uses an LLM to generate wholesale replacement
payloads for all four value model tracks. This is wrong for three reasons:

1. **It destroys domain-specific content.** The Product value model is human-authored
   with deep domain knowledge (Assetfront: 4 layers, 14 L2 components, 45 L3
   sub-components). The skill replaced it with a 2-component skeleton. If committed
   and synced back to source, this content is permanently lost.

2. **It conflates three distinct operations.** Creating a Product value model (genesis),
   editing a Product value model (tweaking), and activating canonical track components
   based on roadmap KRs (alignment) are fundamentally different tasks with different
   trust models and automation levels.

3. **The answer is already in the data.** Roadmap KRs have explicit `value_model_target`
   fields pointing to specific L3 sub-components. Portfolio alignment is a deterministic
   graph walk from KRs to components, not a creative writing task.

## What Changes

- **REMOVE** the current `align-portfolio` LLM skill from strategy-server's FIRE
  phase button. The canonical skill remains in `epf-canonical` but the server should
  not invoke it for portfolio alignment.

- **ADD** a deterministic `AlignPortfolio` operation in `domain/strategy/` that:
  1. Reads all KRs from the committed `roadmap_recipe`
  2. Collects their `value_model_target` references
  3. For **all four tracks** (including Product), sets `active: true` on L3
     sub-components referenced by KRs, and `active: false` on unreferenced ones
  4. Propagates activation upward: an L2 is active if any child L3 is active;
     an L1 is active if any child L2 is active
  5. Writes `activation_notes` on each activated L3 citing the KR(s) that require it
  6. Stages the result as update mutations for human review
  7. **Never modifies structure** — only `active`, `activation_notes`, and
     parent-level `active` propagation. All layers, components, sub-components,
     IDs, names, descriptions, UVPs, maturity data, and other fields are
     preserved byte-for-byte

- **ADD** alignment as the final step of the AIM cycle, after `adapt_strategy`.
  When the AIM orchestrator runs, the sequence becomes:
  `draft_assessment → draft_calibration → adapt_strategy → align_portfolio → snapshot_cycle`.
  The alignment auto-commits (no human review) because it is deterministic and
  structure-safe — the same KRs always produce the same activation state.

- **ADD** a periodic instance consistency check (`domain/strategy/consistency.go`)
  triggered by the heartbeat ticker. The check runs deterministic repairs for
  drifted state, including:
  1. **Value model alignment** — sync `active` flags to current KR targets
  2. **Missing canonical definitions** — install definitions for tracks that have none
  3. **Stale skill runs** — mark runs stuck in `running` for >10 minutes as failed
  4. **Orphaned staged mutations** — warn on batches staged for >24 hours without review

  All repairs are auto-committed (deterministic, structure-safe). The check is
  idempotent — running it twice produces no additional mutations.

- **REMOVE** the FIRE phase "Generate/Re-align value models" button. Alignment
  happens automatically via the AIM cycle and periodic consistency check. The
  FIRE dashboard shows alignment status (read-only) instead of an action button.

- **File upstream issue** on `epf-canonical` for the prompt bugs in the
  `align-portfolio` skill (missing context injection, destructive replacement)

## Impact

- Affected specs: `strategy-web` (FIRE phase UI), `strategy-authoring` (new domain operation)
- Affected code:
  - `domain/strategy/` — new `AlignPortfolio` and `RunConsistencyCheck` methods
  - `domain/aim/` — add `align_portfolio` step to the orchestrated AIM cycle workflow
  - `domain/heartbeat/` — wire periodic consistency check to heartbeat ticker
  - `internal/handler/handler_fire_align.go` — remove (button deleted)
  - `internal/handler/handler.go` — remove align-portfolio route
  - `internal/handler/queries_phases.go` — alignment status in FIRE phase data (read-only)
  - `internal/ui/phase_fire.templ` — remove align banner, add alignment status display
  - `internal/embedded/skills/align-portfolio/` — local copy unchanged (synced from canonical),
    but no longer invoked by the server
- No database migration needed — uses existing `strategy_mutations` and `strategy_artifacts` tables
- No breaking changes to MCP tools

## Design Principles

1. **Structure is sacred, activation is operational.** The server never invents,
   removes, or renames value model components. It only flips `active` flags and
   writes `activation_notes`. This applies to all four tracks including Product.

2. **Deterministic over generative.** Like the calibration decision formula,
   portfolio alignment is a rule-based operation that produces the same output
   given the same inputs. No LLM variance.

3. **KRs are the activation signal.** A value model component is active when at
   least one current-cycle KR targets it via `value_model_target`. No KR = not active.

4. **Canonical EPF is the source of truth** for value model structure in the
   non-product tracks. Product track structure is human-authored but follows the
   same activation rules.
