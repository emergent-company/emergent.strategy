# Tasks: Add Strategy Bootstrap Flow

## 1. Evidence-aware bootstrap skills

- [ ] 1.1 Create `internal/embedded/skills/draft-north-star/skill.yaml` and `prompt.md`:
      type=creation, phase=READY, execution=prompt. Reads evidence items tagged
      'vision', 'strategy', 'pitch'. Reads LRA if exists. Produces north_star.
      Falls back to interactive questions when no evidence loaded.
- [ ] 1.2 Create `draft-insights/skill.yaml` and `prompt.md`: type=creation,
      phase=READY. Reads evidence items tagged 'market', 'competitive', 'user',
      'trends'. Reads north_star for strategic context. Produces complete
      insight_analyses (all sections, not one-at-a-time like the 4 analysis skills).
- [ ] 1.3 Create `draft-foundations/skill.yaml` and `prompt.md`: type=creation,
      phase=READY. Requires north_star. Reads insight_analyses + evidence.
      Produces strategy_foundations.
- [ ] 1.4 Create `draft-opportunity/skill.yaml` and `prompt.md`: type=creation,
      phase=READY. Requires insight_analyses. Reads north_star. Produces
      insight_opportunity synthesized from analyses.
- [ ] 1.5 Create `draft-formula/skill.yaml` and `prompt.md`: type=creation,
      phase=READY. Requires north_star + strategy_foundations. Reads
      insight_opportunity + evidence. Produces strategy_formula.
- [ ] 1.6 Create `draft-roadmap/skill.yaml` and `prompt.md`: type=creation,
      phase=READY. Requires strategy_formula + strategy_foundations. Reads
      evidence. Produces roadmap_recipe with 4-track OKR structure.
- [ ] 1.7 Add chunk plan entries in `skillexec/executor.go` for each new skill:
      single-chunk producing the appropriate artifact type. The context bundle
      loader must include evidence items (query via `evidence.Service.List`
      filtered by tags).
- [ ] 1.8 Extend the executor's context bundle to include evidence items when
      available — load unprocessed evidence for the instance and inject as
      `ContextBundle.Evidence` for skill prompts
- [ ] 1.9 Verify each skill produces schema-valid output against its JSON schema

## 2. Web UI evidence loading

- [ ] 2.1 Add a simple evidence paste interface to the AIM tab (or a bootstrap
      sub-page): textarea + source_type dropdown + tags input. POST to
      `/strategies/:id/evidence/ingest` handler.
- [ ] 2.2 Create `handleIngestEvidence` web handler that calls
      `evidence.Service.Ingest()` with the form data, returns HTMX fragment
      showing the ingested item
- [ ] 2.3 Show a count of loaded evidence items on the READY dashboard header
      ("N source documents loaded") with a link to the evidence list
- [ ] 2.4 On the AIM stepper, when the instance has 0 artifacts and 0 evidence,
      show guidance: "Load your existing strategy material first — paste pitch
      decks, market research, strategy notes, or product documentation"

## 3. Web UI draft actions on READY dashboard

- [ ] 3.1 Create `internal/handler/handler_ready_draft.go` with handlers for each
      draft action (same pattern as AIM draft handlers: call executor, redirect
      to draft review)
- [ ] 3.2 Register routes: POST `/strategies/:id/ready/draft-north-star`,
      `/ready/draft-insights`, `/ready/draft-foundations`, etc.
- [ ] 3.3 Add "Draft with AI" buttons to READY dashboard cards. When evidence
      items exist, label becomes "Draft from evidence". When artifacts are
      placeholder-only, label becomes "Redraft with AI".
- [ ] 3.4 Enforce dependency order: disable buttons when prerequisites missing,
      show hint text ("Requires North Star")
- [ ] 3.5 Handle existing artifacts: when a real (non-placeholder) artifact exists,
      the draft button should be "Redraft" with a confirmation warning

## 4. READY phase readiness score

- [ ] 4.1 Add `ReadinessScore` (0-100), `ReadinessBlockers` (list of strings) to
      `ReadyPhaseData`
- [ ] 4.2 Implement `computeReadyReadiness()` in `queries_phases.go`:
      - Artifact presence: ~14 points per artifact (7 × 14 = 98, plus 2 for
        full relationship coverage)
      - Deduct for placeholder/template content (detect via known placeholder
        strings like "Your Organization Name", "YYYY-MM-DD")
      - Deduct for schema violations
- [ ] 4.3 Render readiness score as progress bar in READY dashboard header
- [ ] 4.4 Show blockers list when score < 80
- [ ] 4.5 Integrate into health_check MCP tool

## 5. Auto-derive inter-READY relationships

- [ ] 5.1 Extend `ExtractRelationships` in `internal/index/extract.go` for
      READY artifact types: derived_from, synthesized_from, operationalizes,
      constrained_by, informed_by edges
- [ ] 5.2 These are structural: created when both source and target exist
- [ ] 5.3 Update `BackfillIndex()` to re-derive for existing instances
- [ ] 5.4 Verify ripple engine processes these relationship types for signal
      propagation

## 6. First version publication prompt

- [ ] 6.1 Show "Publish first version" banner on READY dashboard when
      readiness >= 80 AND version count == 0
- [ ] 6.2 "Publish version" button POSTs to `/strategies/:id/aim/publish`
      with label "Initial strategy"

## 7. Lifecycle mode completeness

- [ ] 7.1 Update `lifecycle.go` foundation mode to check all 7 READY artifacts
- [ ] 7.2 Update next_steps to reference bootstrap skills
- [ ] 7.3 When evidence items exist but no READY artifacts are authored,
      suggest starting the bootstrap flow

## 8. Tests

- [ ] 8.1 Test each bootstrap skill produces schema-valid output (with and
      without evidence context)
- [ ] 8.2 Test dependency enforcement: draft-foundations fails gracefully
      without north_star
- [ ] 8.3 Test readiness scoring: empty = 0, placeholder = ~30, full = ~100
- [ ] 8.4 Test inter-READY relationship extraction
- [ ] 8.5 Test evidence loading from web UI
- [ ] 8.6 Test first-version publication flow
