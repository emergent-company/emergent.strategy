# Tasks: Fix UI schema rendering gaps

Baseline: `cd apps/strategy-server && go test ./...` with Postgres up via
`task dev-deps`. Record what passes. `task lint` clean.

Order: Section 1 (insight analyses) is the user-facing fix and can land first.
Sections 2 (fallback) and 3 (audit) are independent. Section 4 (tests) should
be written alongside sections 1–3 — write the test first, see it fail, then fix
the handler. Section 5 (CI gate) comes last.

## 1. Insight analyses — render all schema fields

- [ ] 1.1 `handler_insights.go`: add extractors for `market_dynamics`,
      `strategic_implications`, `product_problem_fit_analysis`,
      `validation_status`, `problem_solution_hypotheses`, `confidence_gaps`,
      `next_analytical_steps`, `next_review_date`.
- [ ] 1.2 `handler_insights.go`: add extractors for missing sub-sections:
      `competitive_landscape.substitutes`,
      `competitive_landscape.barriers_to_entry`,
      `competitive_landscape.emerging_competitors`,
      `market_structure.value_chain`.
- [ ] 1.3 `handler_insights.go`: add extractors for missing sub-fields within
      read sections: `trends[].implications_for_us`,
      `target_users[].jobs_to_be_done`, `target_users[].problems[].current_solution`,
      `target_users[].problems[].workarounds`,
      `target_users[].problems[].cost_of_problem`,
      `target_users[].problems[].willingness_to_solve`,
      `target_users[].problems[].evidence`,
      `direct_competitors[].market_share`,
      `direct_competitors[].target_segment`,
      `direct_competitors[].business_model`.
- [ ] 1.4 `insight_analyses.templ`: add Go structs for each new section and
      sub-section. Add templ rendering components. Run `templ generate`.
- [ ] 1.5 `queries_phases.go`: align `checkInsightGaps` with the renderer.
      Decide on legacy keys (`market_landscape`, `swot_analysis`,
      `trend_analysis`, `customer_insights`, `key_insights_summary`): either
      read them as aliases in the handler (gap checker already accepts them) or
      stop treating them as present in the gap checker. Document the decision.
- [ ] 1.6 Test: render the canonical insight analyses template through the
      handler and assert every non-empty field appears in the output.
- [ ] 1.7 Test: render the Huma instance fixture (legacy layout) and assert the
      legacy keys produce content, not blank sections.

## 2. Generic fallback for unrecognised content

- [ ] 2.1 Add a fallback mechanism to the bespoke handler pattern: after the
      per-field extractors run, diff the payload's top-level keys against the
      set of keys the handler read. Collect unrecognised keys.
- [ ] 2.2 For each unrecognised key, render its content as a generic key/value
      section (recursively for nested maps and arrays).
- [ ] 2.3 When unrecognised keys exist, show a visible notice on the page:
      "N sections are stored but have no dedicated view" (or similar).
- [ ] 2.4 Test: a payload with an unknown top-level key `foo_analysis` produces
      a rendered section and the notice. A payload with no unknown keys produces
      no notice.

## 3. Audit and fix other bespoke handlers

- [ ] 3.1 For each bespoke handler, compare the schema's property list against
      the handler's extracted fields. Record the delta in a table (handler,
      schema property, status: read / missing / sub-field missing).
- [ ] 3.2 `handler_formula.go` / `strategyFormulaContent`: fix gaps found.
- [ ] 3.3 `handler_foundations.go` / `strategyFoundationsContent`: fix gaps found.
- [ ] 3.4 `handler_roadmap.go` / `roadmapRecipeContent`: fix gaps found.
- [ ] 3.5 `handler_opportunity.go` / `insightOpportunityContent`: fix gaps found.
- [ ] 3.6 `handler_feature.go` / `featureViewContent`: fix gaps found.
- [ ] 3.7 `handler_valuemodel.go` / `valueModelContent`: fix gaps found.
- [ ] 3.8 `handler_lra.go` / `lraContent`: fix gaps found.
- [ ] 3.9 `handler_assessment.go` / `assessmentContent`: fix gaps found.
- [ ] 3.10 `handler_calibration.go` / `calibrationContent`: fix gaps found.
- [ ] 3.11 `handler_artifact.go` / `northStarContent`: fix gaps found.
- [ ] 3.12 Wire the generic fallback (section 2) into every bespoke handler so
      future schema additions are never silently dropped.

## 4. Render coverage tests

- [ ] 4.1 Per-artifact render test: for each artifact type, render the
      canonical template through its bespoke handler and assert every non-empty
      field appears in the output. Canonical templates live in
      `internal/embedded/templates/READY/*.yaml` and `templates/AIM/*.yaml`.
- [ ] 4.2 Schema coverage test: for every property in every embedded schema,
      assert that a handler reads it or it is on an explicit `ignoreList`. An
      unhandled, non-ignored property fails the test. Similar pattern to
      `TestDecomposerFieldsMatchSchemas`.
- [ ] 4.3 Fallback test: an unknown top-level key in any artifact type produces
      the generic fallback section and the notice.
- [ ] 4.4 Real-instance fixture tests: include at least two fixtures with
      layouts that validate but differ from the canonical template (e.g. the
      legacy insight analyses layout, a roadmap with `future_okrs_*` and
      `timeline`).

## 5. Canonical bump CI gate

- [ ] 5.1 `scripts/sync-embedded.sh`: after syncing schemas and templates, run
      the schema coverage test (4.2) so a new or changed property with no
      handler or ignore-list entry fails the sync.
- [ ] 5.2 Document in the sync checklist (and `AGENTS.md` if appropriate) that
      a canonical bump must cover UI handlers alongside schemas, decomposer,
      MCP readers, export and import.

## 6. Verification

- [ ] 6.1 `cd apps/strategy-server && go test ./...` green, no regressions.
- [ ] 6.2 `cd apps/strategy-server && task lint` clean.
- [ ] 6.3 `openspec validate fix-ui-schema-rendering-gaps --strict` passes.
- [ ] 6.4 Verify on the Huma instance: insight analyses page renders all 7
      stored sections, not just direct competitors.
- [ ] 6.5 Verify: a payload with an unknown top-level key shows the generic
      fallback, not a blank section.
