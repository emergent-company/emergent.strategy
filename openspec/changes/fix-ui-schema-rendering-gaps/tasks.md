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
- [x] 3.2 `handler_formula.go` / `strategyFormulaContent`: fix gaps found. Before
      this, a payload built from the schema lost 80 of its 127 strings and the
      canonical template 20 of 27. Causes: every list item that was a plain string
      was skipped (the template writes advantages, capabilities, drivers, constraints
      and growth engines that way, and the schema allows both); key capabilities,
      constraints, growth engines and barriers to entry were read and never rendered;
      sections were gated on one field (value creation on the journey, the ecosystem on
      its components, the moat on advantages or competitors); and the schema's own
      fields (`pricing_strategy`, leading and lagging indicators, `over`, the
      positioning summary, expansion vectors, `vs_point_solutions`, `category`,
      `confidence_rationale`, `next_validation_needed`, the change log, the
      references) had no reader. Readers are tolerant (`tolerant.go`), the card
      sections are table-driven (`records.go`, shared with the insights page), and
      what is left goes to the fallback: `key_differences` and unit economics nested
      deeper than one level are free-form in the schema. A wrapped payload is checked
      block by block, so the notice names real sections and not the wrapper. Pinned by
      `TestStrategyFormulaViewShowsEveryFieldOfTheSchema` (both shapes of every
      string-or-object field) and the template, unwrapped, unknown-key, free-form,
      legacy-name and gate tests.
- [x] 3.3 `handler_foundations.go` / `strategyFoundationsContent`: fix gaps found.
      Before this, a payload built from the schema lost 77 of its 112 strings and the
      canonical template 77 of 105. Causes: the jobs to be done, key benefits, pains
      and feelings were read from directly under `value_proposition`, where neither the
      schema nor the template puts them (both nest them under `functional_value` and
      `emotional_value`), so they never showed; the vision alignment, the sequencing
      constraints, the whole information architecture except its design principles,
      the consistency validation and the change log had no reader; a phase's number
      was read as text from a number and came back empty; the sequencing phases lost
      their target problem and success criteria. The schema and the template also
      disagree in several places (plain strings against objects in success indicators,
      proof points, design principles, success criteria and dependencies; objects
      against strings in jobs, feelings and pains; `information_discovery` a string or
      an object; the validation and change log fields), so every reader takes both and
      the template-only fields are read as well. The older flat paths are still read
      (specs of one kind are merged into one section). `consistency_validation` and
      `change_log` sit beside the root block in a wrapped payload and inside it in an
      unwrapped one; `unshownInRoot` checks each block, so the notice names real
      sections. Pinned by `TestStrategyFoundationsViewShowsEveryFieldOfTheSchema`, the
      template, unwrapped, unknown-key (inside a known section, inside the root and
      beside it), older-names and gate tests; mutation-checked (15).
- [x] 3.4 `handler_roadmap.go` / `roadmapRecipeContent`: fix gaps found. Already
      done in `fix-real-instance-findings` 4.4: every `future_okrs_*` group is read
      (through `strategyread.OKRGroups`, with a "Planned" label) and parked Key
      Results are shown apart with their reason. A payload built from the schema
      lost 263 of its 464 strings (the canonical template 68 of 131). Causes: the
      handler read `objective` where the schema has `track_objective`, `milestones`
      where it has `key_milestones`, `roadmap_id` and `target_completion` where it
      has `id` and `target_completion_date`, and a number (`cycle`) as nothing; and
      it had no view for a track's solution scaffold, the Key Result detail fields
      (status, how it is measured, TRL progression, hypothesis, experiment, success
      criteria, uncertainty, value model target), an assumption's type, evidence and
      linked Key Results, the sequencing rationale, parallel tracks, a milestone's
      Key Results, the roadmap's ids and approval, or tracks beyond the four named
      ones. The track badge counted objectives under the label "KRs"; it now says
      "N objectives, M key results" (parked and future ones included), which is the
      Key Result total of 2.5. The shown paths are built from the payload, because a
      track names its own future groups. Pinned by
      `TestRoadmapViewShowsEveryFieldOfTheSchema` (wrapped and unwrapped), the
      canonical template, the header, Key Result detail, badge, extra tracks,
      milestones in both layouts, parallel tracks and unknown keys at every level;
      mutation-checked (21). The sampler in `schema_sample_test.go` now follows
      `$ref` and `patternProperties`. The readers that still saw only `okrs` now walk
      every `future_okrs_*` list too (`roadmap_okrs.go`): the execution page, the FIRE
      page's objectives, the per-track counts and the roadmap gap check. A later
      list's objective is marked "Planned · <name>" on the two pages that list them.
      On the reporter's instance the execution page read 9 objectives and 26 key
      results before the change.
- [x] 3.5 `handler_opportunity.go` / `insightOpportunityContent`: fix gaps found. A
      payload built from the schema lost 2 of its 25 strings: the text of every
      success indicator, because the page read `indicator` while the schema, the
      template and the Emergent instance use `metric` (`indicator` is still read).
      Also dropped: the opportunity's stored status (identified, validated, ...), the
      three links to the analyses it was drawn from (`analyses_source`,
      `based_on_analyses`, `analyses_last_updated`, which the template and the Emergent
      instance carry beside the opportunity block) and any key the schema does not
      define. The readers are the tolerant ones; the page ends with the notice.
      Tests: `handler_opportunity_test.go` (schema coverage, canonical template,
      enums and dates, both indicator keys, the analyses links, unknown keys, an
      unwrapped payload); mutation-checked (19). Emergent's own opportunity file
      shows in full.
- [x] 3.6 `handler_feature.go` / `featureViewContent`: fix gaps found. A payload
      built from the schema lost 92 of its 177 strings; seven top-level sections had
      no complete view. Causes: the feature maturity (overall stage, capability
      maturity), the architecture patterns, the design guidance, the implementation
      references (specs, coverage summary) and the tools ecosystem had no view; a
      persona's demographics and psychographics, a scenario's JTBD category, the
      feature id and the stored lifecycle status were dropped; the persona and context
      ids were declared shown and never rendered; and the stored name was hidden
      whenever it differed from the artifact's. A bug that predates this work: scenarios
      under both `implementation.scenarios` and the older `definition.scenarios` showed
      only the first list (37 strings of one Emergent feature were lost); both are read
      now. The readers are the tolerant ones, so a plain string item or a lone string
      is shown. `data.Unshown` carries the rest. Checked on the 25 feature definitions
      of the Emergent instance (6,987 strings): 0 missing, where one file lost 37; 24 of
      them show the notice for fields the schema does not define, among others (capability `maturity`,
      `acceptance_criteria` and `dependencies`, `feature_maturity.capabilities`,
      `implementation.technical_approach`, `technology_stack`,
      `architecture_considerations`, `risk_mitigation`, `codebase_reference`,
      `definition.external_integrations`, `dependencies.integrates_with`). Pinned by
      `TestFeatureViewShowsEveryFieldOfTheSchema`, the numbers and enums that carry no
      marker, unknown keys at several levels, the persona profile alone and scenarios
      in both locations; mutation-checked (26). There is no canonical feature template
      in the embedded set, so no template test.
- [x] 3.7 `handler_valuemodel.go` / `valueModelContent`: fix gaps found. A payload
      built from the schema lost 76 of its 98 strings other than ids and path
      segments (the canonical templates only their ids, plus a handful of strings).
      Causes: a sub-component's `maturity` was read as a string though the schema makes
      it an object (stage, override, milestone, notes, evidence), so the badge was blank
      for schema-shaped data; a component with sub-components under both `subs` and
      `sub_components` showed one key (the shared parser reads both); the track
      maturity (stage, domain, milestone, next milestone criteria, the layers by stage),
      a layer's solution steps and maturity summary, a component's maturity summary, a
      sub-component's `uvp`, `premium` and description (read, never rendered), the
      activation notes and the packaged-default flag had no view; the ids and path
      segments that features name in `contributes_to` were not shown; and a main goal
      alone did not show the mission section. The free-form `high_level_model` is
      shown through the fallback for anything beyond mission, main goal and goals.
      `valueModelData` is now a pure builder (the definitions lookup stays in
      `valueModelContent`), so the page is testable without a database. Pinned by
      `TestValueModelViewShowsEveryFieldOfTheSchema`, the four canonical value model
      templates, both sub-component keys, maturity as a string and an object,
      unknown keys at every level, the track maturity alone, the main goal alone, and
      the enum, number and boolean fields that carry no marker; mutation-checked (15).
- [x] 3.8 `handler_lra.go` / `lraContent`: fix gaps found. A payload built from the
      schema lost 30 of its 61 strings; seven top-level sections had no complete view.
      Causes: the existing assets (code, documentation, customer, strategic and process),
      the operating assumptions and the capability gaps had no view; the evolution log
      showed only timestamp, trigger and summary, not the cycle, who updated, the recorded
      changes or the per-track signals; the track baselines dropped their key activities;
      the metadata dropped the creation date, who updated, and the bootstrap type and
      time; the runway was missing; the team size was read as a string though the schema
      makes it an integer; and the baselines were shown in map order, so the tracks moved
      between loads. They now show in the order of the four tracks. Layouts the schema
      does not define (`org_type`, `ai_capability`, `cycle_ref`, a top-level `constraints`)
      are no longer read as aliases; they show as stored under the notice. A list of
      baselines that name their track is still read. `data.Unshown` carries the rest.
      Pinned by `TestLRAViewShowsEveryFieldOfTheSchema`, the canonical template, the
      numbers, booleans and enums that carry no marker, an older layout, listed
      baselines, the track order and the runway alone; mutation-checked (24).
- [x] 3.9 `handler_assessment.go` / `assessmentContent`: fix gaps found. The page was
      expected to need no change (100% on the reporter's instance), but a payload built
      from the schema dropped 49 of its strings: the results of an objective are
      `key_result_outcomes` in the schema and the page read only `key_results`, and it had
      no view for `data_summary` (quantitative table, qualitative findings),
      `cross_functional_insights` or `meta.epf_version`. All shown now; `key_results` is
      still read, and a key no view reads shows under the notice. The reporter's 100% was
      a measure of its own layout, not of the schema.
- [x] 3.10 `handler_calibration.go` / `calibrationContent`: fix gaps found. Two strings
      of the schema were dropped, `meta.epf_version` and `meta.last_updated`; the header
      shows them now. (Found by the test of 4.2, together with the north star's.)
- [x] 3.11 `handler_artifact.go` / `northStarContent`: fix gaps found. Done for
      emergent.strategy#179. The test of 4.2 later found three more schema properties
      with no view: `version`, `usage_guidance` and `informs_ready_phase` (the artifacts
      the north star informs, by READY phase); the page shows them now. The page read its rich fields as flat keys while the
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
      future schema additions are never silently dropped. Done: insight analyses,
      strategy formula, strategy foundations, value models, roadmap, LRA, features. `unshownContent`, `readRecords` and the tolerant readers are
      shared; a page needs its shown paths, its record specs and `StoredNotShown`.
      Assessment report added. Still without the notice: north star, calibration memo,
      the portfolio and the generic track definitions.

## 4. Render coverage tests

- [ ] 4.1 Per-artifact render test: for each artifact type, render the
      canonical template through its bespoke handler and assert every non-empty
      field appears in the output. Canonical templates live in
      `internal/embedded/templates/READY/*.yaml` and `templates/AIM/*.yaml`. Done for `insight_analyses`, `strategy_formula`, `strategy_foundations`, `value_model`, `roadmap_recipe`, `living_reality_assessment`, `insight_opportunity` and (without a template) `feature_definition` (1.6, 3.2, 3.3, 3.7, 3.4, 3.8, 3.5, 3.6);
      the other artifact types are not covered yet.
- [ ] 4.2 Schema coverage test: for every property in every embedded schema,
      assert that a handler reads it or it is on an explicit `ignoreList`. An
      unhandled, non-ignored property fails the test. Similar pattern to
      `TestDecomposerFieldsMatchSchemas`. Done for `insight_analyses`, `strategy_formula`, `strategy_foundations`, `value_model`, `roadmap_recipe`, `living_reality_assessment`, `insight_opportunity` and `feature_definition`, as a
      payload built from the schema and `unshownContent` (1.6). Now one test over every
      embedded schema (`internal/handler/schema_coverage_test.go`): every schema is
      classified (`schemaPages`, or `schemasWithoutAPage` with the reason, so a new schema
      fails until someone decides), a payload built from it is rendered through the page
      dispatcher in both variants of every `oneOf`, and each string must reach the page.
      The `ignoreList` is `markersNotShown`: empty, and an entry that is no longer needed
      fails. Result on `7bfe5819`: 20 schemas, 3 pages dropped strings (assessment 49,
      north star 12, calibration 2), all fixed (3.9, 3.10, 3.11), nothing ignored. The
      sampler follows `allOf` now (the three track definitions gave no strings before and
      would have passed without checking anything). 17 of 17 mutations caught.
- [ ] 4.3 Fallback test: an unknown top-level key in any artifact type produces
      the generic fallback section and the notice. Done for `insight_analyses`, `strategy_formula`, `strategy_foundations`, `value_model`, `roadmap_recipe`, `living_reality_assessment`, `insight_opportunity`, `feature_definition` and `assessment_report`.
- [ ] 4.4 Real-instance fixture tests: include at least two fixtures with
      layouts that validate but differ from the canonical template (e.g. the
      legacy insight analyses layout, a roadmap with `future_okrs_*` and
      `timeline`). Two so far: the legacy insight analyses layout, and the
      older flat value proposition and design principles paths of the foundations.

## 5. Canonical bump CI gate

- [x] 5.1 `scripts/sync-embedded.sh`: after syncing schemas and templates, run
      the schema coverage test (4.2) so a new or changed property with no
      handler or ignore-list entry fails the sync. It runs the 4.2 tests and the
      template-against-schema test, exits 1 with a pointer to `AGENTS.md` on failure,
      and takes `SKIP_UI_COVERAGE_CHECK=1` for a sync that only needs the files. Run
      against a clone at the pinned 2.37.0: passes, 12 s, no embedded file changes
      beyond the `MANIFEST.txt` timestamp.
- [x] 5.2 Document in the sync checklist (and `AGENTS.md` if appropriate) that
      a canonical bump must cover UI handlers alongside schemas, decomposer,
      MCP readers, export and import. There was no sync checklist; added "Bumping the
      canonical version" to `apps/strategy-server/AGENTS.md`.

## 6. Verification

- [ ] 6.1 `cd apps/strategy-server && go test ./...` green, no regressions.
- [ ] 6.2 `cd apps/strategy-server && task lint` clean.
- [ ] 6.3 `openspec validate fix-ui-schema-rendering-gaps --strict` passes.
- [x] 6.4 Verify on the Huma instance: insight analyses page renders all 7
      stored sections, not just direct competitors. Checked on the dev server
      built from `378e297e` against the reporter's instance, by reading the rendered
      HTML (not in a browser): the page went from the 13 direct competitors to all 8
      stored sections, under the notice "8 sections are stored but have no dedicated
      view".
- [x] 6.5 Verify: a payload with an unknown top-level key shows the generic
      fallback, not a blank section. The same check: every section the page has no
      view for (the legacy layout's keys) is shown by the fallback. Pinned in tests
      for both pages.
