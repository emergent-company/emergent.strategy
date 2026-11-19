# Change: Fix UI schema rendering gaps

UI handlers silently drop schema-valid artifact content. The insight analyses
page on a real instance shows only the 13 direct competitors; every other
section — market dynamics, SWOT, trends, strategic implications, validation
status, and more — is blank with no warning, despite the data being stored,
schema-valid, and visible through MCP reads and export.

The root cause is systemic: 12 bespoke handlers each extract fields by name,
and no test verifies that the set of fields they read matches the canonical
schema. When canonical adds or renames a field, the handler silently ignores it.

Issue: https://github.com/emergent-company/emergent.strategy/issues/163

## Why

A real instance (`Huma Group`, 229 artifacts) has a fully populated insight
analyses file with 7 sections totalling ~49k characters. The UI page renders
only the 13 direct competitors. `validate_instance` reports 0 invalid,
`get_outline` shows all content is stored, and the gap checker reports the
sections as present. Every signal says the data is there; the page shows
nothing.

Against the canonical schema (26 top-level properties), the insight analyses
handler reads 15. Eleven are completely missing from the UI: `market_dynamics`,
`strategic_implications`, `product_problem_fit_analysis`, `validation_status`,
`problem_solution_hypotheses`, `confidence_gaps`, `next_analytical_steps`,
`next_review_date`, `competitive_landscape.substitutes`,
`competitive_landscape.barriers_to_entry`, `market_structure.value_chain`. Within
read properties, several sub-fields are also dropped (e.g. `implications_for_us`
on trends, `market_share` and `business_model` on competitors,
`jobs_to_be_done` on personas).

The issue also affects legacy layouts: the instance uses `market_landscape`,
`swot_analysis`, `trend_analysis`, `customer_insights`, `key_insights_summary` —
all schema-valid because the schema allows additional properties. The gap checker
accepts these names, but the renderer does not read them.

11 other bespoke handlers (`handler_formula.go`, `handler_foundations.go`,
`handler_roadmap.go`, `handler_opportunity.go`, `handler_feature.go`,
`handler_valuemodel.go`, `handler_lra.go`, `handler_assessment.go`,
`handler_calibration.go`, etc.) follow the same per-field extraction pattern and
could have the same drift. No test ties any handler to its canonical schema.

## What Changes

### 1. Insight analyses handler and template (`strategy-web`)

- **FIX** `handler_insights.go`: add extractors for all 11 missing top-level
  sections and the missing sub-fields within existing sections.
- **FIX** `insight_analyses.templ`: add data structs and rendering sections for
  the new fields.
- **FIX** `queries_phases.go`: align `checkInsightGaps` with the renderer — if
  the renderer now reads a field, the gap checker must check for it, and vice
  versa.
- **FIX** Legacy layout support: either read `market_landscape`,
  `swot_analysis`, `trend_analysis`, `customer_insights`,
  `key_insights_summary` as aliases, or stop treating them as present in the gap
  checker. Both sides must agree.

### 2. Generic fallback for unrecognised content (`strategy-web`)

- **ADD** a fallback in every bespoke handler: when the payload contains
  top-level or nested keys the handler does not map, render them as generic
  key/value sections and show a visible notice such as "N sections are stored
  but have no dedicated view".
- This ensures that future schema additions or non-canonical layouts never
  produce a blank page.

### 3. Audit and fix other bespoke handlers (`strategy-web`)

- **AUDIT** every bespoke handler against its canonical schema. For each
  handler, list the properties the schema defines versus what the handler reads.
  Fix the gaps found.
- Handlers to audit: `handler_formula.go`, `handler_foundations.go`,
  `handler_roadmap.go`, `handler_opportunity.go`, `handler_feature.go`,
  `handler_valuemodel.go`, `handler_lra.go`, `handler_assessment.go`,
  `handler_calibration.go`, `handler_artifact.go` (north star).

### 4. Render coverage tests tied to canonical (`strategy-web`)

- **ADD** per-artifact render tests: render each canonical template
  (`templates/READY/*.yaml`, `templates/AIM/*.yaml`, FIRE templates) through
  its bespoke handler and assert every non-empty field appears in the output.
- **ADD** a schema coverage test: for every property in every embedded schema,
  assert that a handler reads it or it is on an explicit ignore list. Fails on
  unknown fields.
- **ADD** a fallback test: an unknown top-level key produces the generic
  fallback and notice, not silence.
- **ADD** fixture tests from real instances with layouts that validate but
  differ from the template.

### 5. Canonical bump CI gate (`strategy-web`)

- **EXTEND** `scripts/sync-embedded.sh` and the sync checklist: when
  `.epf-canonical-version` is bumped, the CI run must cover UI handlers
  alongside the existing consumers (schemas, decomposer, MCP readers, export,
  import). A new or changed schema property with no handler, reader, or
  ignore-list entry fails the bump.

## Impact

- Affected specs: `strategy-web` (handlers, templates, gap checks, render
  tests).
- Affected code: `internal/handler/handler_insights.go` and all other
  `handler_*.go` files, `internal/ui/*.templ`, `internal/handler/queries_phases.go`,
  `scripts/sync-embedded.sh`.
- DB: none.
- Dependencies: none. Relies only on the existing embedded schemas and
  templates.

## Non-Goals

- Changing the canonical schemas or templates (those live in `canonical-epf`).
- MCP tool changes — the MCP section readers already serve all stored content
  correctly; this change is UI-only.
- Redesigning the bespoke handler pattern — the per-field extraction approach
  is established and works; it just needs tests to keep it in sync.
