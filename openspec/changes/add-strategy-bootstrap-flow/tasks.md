# Tasks: Add Strategy Bootstrap Flow

## 1. READY artifact creation skills

- [ ] 1.1 Create `internal/embedded/skills/draft-north-star/skill.yaml` and `prompt.md`:
      type=creation, phase=READY, execution=prompt. Requires user input (company
      name, industry, product). Produces north_star artifact.
- [ ] 1.2 Create `internal/embedded/skills/draft-foundations/skill.yaml` and `prompt.md`:
      type=creation, phase=READY. Requires north_star. Produces strategy_foundations.
- [ ] 1.3 Create `internal/embedded/skills/draft-formula/skill.yaml` and `prompt.md`:
      type=creation, phase=READY. Requires north_star + strategy_foundations.
      Produces strategy_formula.
- [ ] 1.4 Create `internal/embedded/skills/draft-roadmap/skill.yaml` and `prompt.md`:
      type=creation, phase=READY. Requires strategy_formula + strategy_foundations.
      Produces roadmap_recipe.
- [ ] 1.5 Create `internal/embedded/skills/draft-opportunity/skill.yaml` and `prompt.md`:
      type=creation, phase=READY. Requires insight_analyses. Produces
      insight_opportunity synthesized from analyses.
- [ ] 1.6 Add chunk plan entries in `skillexec/executor.go` for each new skill:
      single-chunk producing the appropriate artifact type
- [ ] 1.7 Verify each skill produces schema-valid output against the corresponding
      JSON schema in `internal/embedded/schemas/`

## 2. Web UI creation actions

- [ ] 2.1 Create `internal/handler/handler_ready_draft.go` with handlers for each
      draft action: `handleDraftNorthStar`, `handleDraftFoundations`,
      `handleDraftFormula`, `handleDraftRoadmap`, `handleDraftOpportunity`
- [ ] 2.2 Each handler calls `executor.RunChunked(ctx, instanceID, "draft-{name}", params)`
      and redirects to the draft review page or activity page
- [ ] 2.3 Register routes: POST `/strategies/:id/ready/draft-north-star`, etc.
- [ ] 2.4 Add "Draft with AI" buttons to the READY dashboard cards for missing
      artifacts. Buttons are forms with POST to the corresponding draft route.
- [ ] 2.5 Enforce dependency order: disable buttons when prerequisites are missing.
      Show hint text ("Requires North Star") on disabled buttons.
- [ ] 2.6 Handle the case where the artifact already exists: the draft button
      should not appear (or should be labeled "Redraft") to avoid accidentally
      overwriting committed content

## 3. READY phase completeness check

- [ ] 3.1 Add `ReadinessScore` (0-100), `ReadinessBlockers` (list of strings) to
      `ReadyPhaseData` struct in `phase_ready.templ`
- [ ] 3.2 Implement `computeReadyReadiness()` in `queries_phases.go`:
      - Artifact presence: 10 points per artifact (7 × ~14 each)
      - Section completeness: aggregate gap ratio across all artifacts
      - Schema validation: deduct for schema violations
      - Placeholder detection: deduct for template placeholder text
- [ ] 3.3 Render readiness score as a progress bar in the READY dashboard header
- [ ] 3.4 Show blockers list when score < 80 ("Missing: Insight Opportunity",
      "North Star has 3 placeholder sections", etc.)
- [ ] 3.5 Integrate into the health_check MCP tool response: add `ready_readiness`
      field with score and blockers

## 4. Auto-derive inter-READY relationships

- [ ] 4.1 Extend `ExtractRelationships` in `internal/index/extract.go` to produce
      structural edges for READY artifacts:
      - strategy_foundations derived_from north_star
      - strategy_formula derived_from strategy_foundations
      - insight_opportunity synthesized_from insight_analyses
      - roadmap_recipe operationalizes strategy_formula
      - roadmap_recipe constrained_by strategy_foundations
      - north_star informed_by insight_analyses
- [ ] 4.2 These edges are created whenever both source and target artifacts exist
      (structural, not content-derived)
- [ ] 4.3 Update `BackfillIndex()` to re-derive these edges for existing instances
- [ ] 4.4 Verify the ripple engine correctly processes these new relationship types
      for signal propagation (existing signal generation should pick them up
      via the general relationship scan)

## 5. First version publication prompt

- [ ] 5.1 Add "Publish first version" banner to the READY dashboard when:
      readiness score >= 80 AND version count == 0
- [ ] 5.2 The banner has a "Publish version" button (POST to
      `/strategies/:id/aim/publish`) with a default label like "Initial strategy"
- [ ] 5.3 After publishing, the banner is replaced by a "Version published" 
      confirmation with a link to the versions page

## 6. Lifecycle mode completeness

- [ ] 6.1 Update `lifecycle.go` foundation mode detection to check all 7 READY
      artifact types (not just north_star, strategy_foundations, strategy_formula)
- [ ] 6.2 Add `insight_analyses`, `insight_opportunity`, `roadmap_recipe`, and
      `product_portfolio` to the MissingFoundation check
- [ ] 6.3 Update the lifecycle next_steps to reference the new bootstrap skills
      when artifacts are missing

## 7. Tests

- [ ] 7.1 Test each bootstrap skill produces schema-valid output
- [ ] 7.2 Test dependency enforcement: verify draft-foundations fails gracefully
      when north_star doesn't exist
- [ ] 7.3 Test readiness scoring: empty instance = 0, full instance = ~100,
      placeholder-filled = intermediate
- [ ] 7.4 Test inter-READY relationship extraction: verify edges are created
      when both artifacts exist and not created when one is missing
- [ ] 7.5 Test first-version publication flow: banner appears at readiness >= 80,
      version count 0
