# Change: Complete i18n — Templ Prose, Field Labels, and Go Helper Strings

## Why

The strategy-server has a production-grade i18n infrastructure (`internal/langs/`)
that was set up in Phase 1 but left mostly unused as the UI grew. A full pass was
completed in June 2026 that translated all HTTP error responses, navigation labels,
MCP error messages, dashboard copy, settings page, and the three main phase pages
(READY, FIRE, AIM). The current state is ~85% coverage.

648 user-visible strings remain hardcoded in English across 29 templ files. These
fall into two groups:

**Group 1 — Mechanical (straightforward):** Section headings, field labels, status
badges, button labels, tooltip strings, and empty state messages. Examples:
"Job To Be Done", "Market Size", "Well tested", "View all", "Abort", "No versions
yet". These are standard find-and-replace once keys are added to `langs.go`.

**Group 2 — Architectural (requires ctx threading):** ~55 strings inside Go helper
functions defined in templ files that currently lack a `ctx context.Context`
parameter. Examples: `cascadeSkillLabel()`, `runStepLabel()`, `aimStepObserve()`,
`signalTypeHint()`. These functions return strings used in the template, but were
written as pure functions without access to the request context.

Neither group is blocked by any external dependency. The work is entirely internal
to `apps/strategy-server/internal/ui/`.

## What Changes

### 1. New translation keys in `internal/langs/langs.go`

Approximately 440 new keys added in both EN and NB locales, covering:

- **Artifact view field labels** (~200 keys): Section headings and field labels in
  the 10 artifact detail views (north_star, insight_analyses, insight_opportunity,
  strategy_formula, strategy_foundations, roadmap_recipe, lra, assessment, calibration,
  feature, value_model). Examples: `artifact.field.purpose`, `artifact.field.vision`,
  `artifact.field.swot`, `artifact.field.jtbd`.

- **Status and badge strings** (~50 keys): `signal.status.acknowledged`,
  `signal.status.resolved`, `maturity.scaled`, `maturity.proven`,
  `version.source.auto`, `version.source.aim_cycle`, `evidence.confidence.high`,
  `assumption.risk.well_tested`, etc.

- **Button and action labels** (~65 keys): `action.view_all`, `action.abort`,
  `action.retry`, `action.review_draft`, `action.acknowledge`, `action.resolve`,
  `action.approve`, `action.defer`, `action.reconnect`, etc.

- **Empty state messages** (~70 keys): `empty.no_versions`, `empty.no_signals`,
  `empty.no_assumptions`, `empty.no_cycle_runs`, `empty.no_evidence`, etc.

- **Go helper function strings** (~55 keys): Step labels for the AIM cycle stepper
  (`aim.step.observe`, `aim.step.assess`, `aim.step.decide`, `aim.step.adapt`),
  run step labels, skill labels for the cascade tracker, signal type hints, authority
  tier hints, proposal trigger labels, assumption risk labels.

- **Tooltip and placeholder strings** (~65 keys): `data-tip` attribute content,
  form placeholders, `aria-label` values.

### 2. Templ file updates (29 files)

Every remaining hardcoded string is replaced with `langs.T(ctx, "key")`. For Group 1
strings this is a direct substitution. For Group 2 (Go helper functions), each
function gains a `ctx context.Context` first parameter and uses `langs.T` for its
return values. Call sites within `{{ }}` template blocks pass `ctx` explicitly.

Files affected:
`north_star.templ`, `insight_analyses.templ`, `insight_opportunity.templ`,
`strategy_formula.templ`, `strategy_foundations.templ`, `roadmap_recipe.templ`,
`lra_view.templ`, `assessment_view.templ`, `calibration_view.templ`,
`feature_view.templ`, `value_model_view.templ`, `phase_fire_track.templ`,
`coherence_view.templ`, `aim_pipeline.templ`, `aim_run_panel.templ`,
`aim_proposals.templ`, `aim_draft_review.templ`, `aim_runs.templ`,
`versions_view.templ`, `execution_dashboard.templ`, `phase_aim.templ`,
`phase_evidence.templ`, `activity_page.templ`, `skill_runs_page.templ`,
`skill_run_detail_page.templ`, `cascade_tracker.templ`, `generating_indicators.templ`,
`assumptions_view.templ`, `github_connect.templ`.

### 3. Regenerated `_templ.go` files

All modified `.templ` files are regenerated via `templ generate`. The generated
`_templ.go` files are committed alongside the sources, as per existing convention.

## Non-Goals

- **JavaScript inline event handlers**: `onsubmit="..."` attributes in templ cannot
  use runtime `langs.T` — the string is emitted at server render time into a JS
  string literal. These remain hardcoded in English. Estimated impact: 2-3 strings.

- **MCP tool descriptions and parameter descriptions**: ~450 strings used by AI
  agents, not human users. Intentionally left in English. These do not benefit from
  i18n because MCP clients are AI systems that operate in English regardless of the
  user's locale.

- **New locale support**: This change completes coverage for the two existing locales
  (EN, NB). Adding a third locale (e.g. `fr`, `de`) is a separate change.

- **Translation quality review**: Norwegian prose in the new keys is machine-assisted.
  A native speaker review pass is recommended but is a separate concern.

## Impact

- **Affected packages:** `apps/strategy-server/internal/langs/`, `apps/strategy-server/internal/ui/`
- **No DB migrations**
- **No API changes**
- **No MCP tool changes**
- **Test suite:** No new tests required; existing templ rendering tests and e2e tests
  cover the affected components. Build verification (`go build ./...`) is the primary
  correctness gate alongside visual inspection.

## Estimated Effort

| Work item | Effort |
|---|---|
| New lang keys — EN strings | 1 day |
| New lang keys — NB translations | 2–3 days (prose quality matters) |
| Mechanical Group 1 replacements (cats A/B/C/D/E/G) | 2–3 days |
| Group 2 ctx threading (cat F, 7 files with helper functions) | 1 day |
| Templ regeneration + build verification | 0.5 day |
| **Total** | **~8–10 days** |

The bottleneck is Norwegian translation quality, not the implementation.
