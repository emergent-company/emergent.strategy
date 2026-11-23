# Tasks: Fix UI schema rendering gaps

Baseline: `cd apps/strategy-server && go test ./...` with Postgres up via
`task dev-deps`. Record what passes. `task lint` clean.

Order: Section 1 (insight analyses) is the user-facing fix and can land first.
Sections 2 (fallback) and 3 (audit) are independent. Section 4 (tests) should
be written alongside sections 1–3 — write the test first, see it fail, then fix
the handler. Section 5 (CI gate) comes last.

## 1. Insight analyses — render all schema fields

- [x] 1.1 `handler_insights.go`: add extractors for `market_dynamics`,
      `strategic_implications`, `product_problem_fit_analysis`,
      `validation_status`, `problem_solution_hypotheses`, `confidence_gaps`,
      `next_analytical_steps`, `next_review_date`. Done as table-driven record
      sections (`insightRecordSpecs`: one spec gives the reader, the card and the
      shown paths), which also took over `strategic_tensions`: the old reader built
      it and the page never rendered it.
- [x] 1.2 `handler_insights.go`: add extractors for missing sub-sections:
      `competitive_landscape.substitutes`,
      `competitive_landscape.barriers_to_entry`,
      `competitive_landscape.emerging_competitors`,
      `market_structure.value_chain`. Substitutes, barriers to entry and value chain
      are record sections. `emerging_competitors` is in neither the schema nor the
      template of 2.36.0, so it has no dedicated view: it is shown by the fallback
      if a payload holds it.
- [x] 1.3 `handler_insights.go`: add extractors for missing sub-fields within
      read sections: `trends[].implications_for_us`,
      `target_users[].jobs_to_be_done`, `target_users[].problems[].current_solution`,
      `target_users[].problems[].workarounds`,
      `target_users[].problems[].cost_of_problem`,
      `target_users[].problems[].willingness_to_solve`,
      `target_users[].problems[].evidence`,
      `direct_competitors[].market_share`,
      `direct_competitors[].target_segment`,
      `direct_competitors[].business_model`. Also read now: the trend evidence, the
      persona's context and frequency, the TAM, SAM and SOM detail, segment
      characteristics, strength evidence, weakness impact and a problem's severity as
      text (it was a coloured dot only). A trend category outside the five the schema
      names was skipped by the view; it is shown after the known ones.
      `market_share`, `target_segment`, `business_model` and `implications_for_us`
      are in the canonical template but not the schema; they are read all the same.
- [x] 1.4 `insight_analyses.templ`: add Go structs for each new section and
      sub-section. Add templ rendering components. Run `templ generate`.
- [x] 1.5 `queries_phases.go`: align `checkInsightGaps` with the renderer.
      Decide on legacy keys (`market_landscape`, `swot_analysis`,
      `trend_analysis`, `customer_insights`, `key_insights_summary`): either
      read them as aliases in the handler (gap checker already accepts them) or
      stop treating them as present in the gap checker. Document the decision.
      Decision: neither. The legacy layouts are not a shape any schema or template
      defines, so there is nothing to map them onto without guessing, and an alias
      would show a half-read card. The gap checker keeps counting them as present,
      and the page now shows them in full through the fallback (section 2), under a
      notice. The two agree: nothing counts as present that the page does not show.
      Pinned by `TestInsightAnalysesViewShowsALegacyLayout`.
- [x] 1.6 Test: render the canonical insight analyses template through the
      handler and assert every non-empty field appears in the output.
      `TestInsightAnalysesViewShowsEveryStringOfTheCanonicalTemplate` (case
      insensitive: the page may capitalise a value).
      `TestInsightAnalysesViewShowsEveryFieldOfTheSchema` does the same for a payload
      built from the embedded schema, with a marker in every string, and also
      fails for a property the view does not declare as shown.
- [x] 1.7 Test: render the Huma instance fixture (legacy layout) and assert the
      legacy keys produce content, not blank sections. The fixture is the
      synthetic reproducer from the issue, not the customer's file.

## 2. Generic fallback for unrecognised content

- [x] 2.1 Add a fallback mechanism to the bespoke handler pattern: after the
      per-field extractors run, diff the payload's top-level keys against the
      set of keys the handler read. Collect unrecognised keys. Done by path, not by
      top-level key: `unshownContent(payload, shown)` returns every leaf that no
      declared path covers, so a field the schema allows inside a known section is
      caught as well. A declared path covers a scalar, or a list of scalars, never a
      map: a text field stored as an object comes back through the fallback.
      Applied to insight analyses; the other handlers are 3.12.
- [x] 2.2 For each unrecognised key, render its content as a generic key/value
      section (recursively for nested maps and arrays). `StoredNotShown` hands the
      residue to the existing `renderSection`.
- [x] 2.3 When unrecognised keys exist, show a visible notice on the page:
      "N sections are stored but have no dedicated view" (or similar).
- [x] 2.4 Test: a payload with an unknown top-level key `foo_analysis` produces
      a rendered section and the notice. A payload with no unknown keys produces
      no notice. `TestInsightAnalysesViewShowsAnUnknownTopLevelKey`, and the schema
      test asserts that a payload that follows the schema has no notice.

## 3. Audit and fix other bespoke handlers

- [ ] 3.1 For each bespoke handler, compare the schema's property list against
      the handler's extracted fields. Record the delta in a table (handler,
      schema property, status: read / missing / sub-field missing).
- [ ] 3.2 `handler_formula.go` / `strategyFormulaContent`: fix gaps found.
- [ ] 3.3 `handler_foundations.go` / `strategyFoundationsContent`: fix gaps found.
- [ ] 3.4 `handler_roadmap.go` / `roadmapRecipeContent`: fix gaps found.
      Already done in `fix-real-instance-findings` 4.4: `extractRoadmapTrack` reads
      every `future_okrs_*` group (through `strategyread.OKRGroups`, with a "Planned"
      label) and shows parked Key Results apart with their reason. Still open: the
      track badge counts objectives but is labelled "KRs", and there is no total of
      Key Results found per group (`fix-real-instance-findings` 2.5).
- [ ] 3.5 `handler_opportunity.go` / `insightOpportunityContent`: fix gaps found.
- [ ] 3.6 `handler_feature.go` / `featureViewContent`: fix gaps found.
- [ ] 3.7 `handler_valuemodel.go` / `valueModelContent`: fix gaps found.
- [ ] 3.8 `handler_lra.go` / `lraContent`: fix gaps found.
- [ ] 3.9 `handler_assessment.go` / `assessmentContent`: fix gaps found.
- [ ] 3.10 `handler_calibration.go` / `calibrationContent`: fix gaps found.
- [x] 3.11 `handler_artifact.go` / `northStarContent`: fix gaps found. Done for
      emergent.strategy#179. The page read its rich fields as flat keys while the
      schema and template wrap them in `north_star`, so the values, value conflicts,
      boundaries, success criteria, evolution history and the rest were all empty
      whenever the root key was present. `buildNorthStarData` removes the root once
      (a payload already unwrapped is accepted) before the decomposer and the direct
      reads. Added to the page: alignment checks, review triggers, strategic maturity
      context, and the boundaries' rationale (`why_not`), which the handler read and the
      template never showed. `TestNorthStarPageShowsEveryFieldOfTheCanonicalTemplate`
      renders the pinned canonical template, wrapped and unwrapped, and asserts the
      strings it collects from the template itself; it is mutation-checked. Not done
      here: the general "stored but not shown" notice (section 2).
- [ ] 3.12 Wire the generic fallback (section 2) into every bespoke handler so
      future schema additions are never silently dropped.

## 4. Render coverage tests

- [ ] 4.1 Per-artifact render test: for each artifact type, render the
      canonical template through its bespoke handler and assert every non-empty
      field appears in the output. Canonical templates live in
      `internal/embedded/templates/READY/*.yaml` and `templates/AIM/*.yaml`. Done for `insight_analyses` only (1.6);
      the other artifact types are not covered yet.
- [ ] 4.2 Schema coverage test: for every property in every embedded schema,
      assert that a handler reads it or it is on an explicit `ignoreList`. An
      unhandled, non-ignored property fails the test. Similar pattern to
      `TestDecomposerFieldsMatchSchemas`. Done for `insight_analyses` only, as a
      payload built from the schema and `unshownContent` (1.6); no `ignoreList` was
      needed there. Not yet a test over every embedded schema.
- [ ] 4.3 Fallback test: an unknown top-level key in any artifact type produces
      the generic fallback section and the notice. Done for `insight_analyses` only.
- [ ] 4.4 Real-instance fixture tests: include at least two fixtures with
      layouts that validate but differ from the canonical template (e.g. the
      legacy insight analyses layout, a roadmap with `future_okrs_*` and
      `timeline`). One so far: the legacy insight analyses layout.

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
