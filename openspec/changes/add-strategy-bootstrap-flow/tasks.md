# Tasks: Add Strategy Bootstrap Flow

## 1. Unified evidence collection (web UI)

- [ ] 1.1 Create `internal/handler/handler_evidence.go` with `handleIngestEvidence`
      handler: accepts text content, source_type, tags via POST form. Calls
      `evidence.Service.Ingest()`. Returns HTMX fragment showing the ingested item.
- [ ] 1.2 Register route: POST `/strategies/:id/evidence/ingest`
- [ ] 1.3 Create evidence collection page/section on the AIM tab with:
      - Text paste area (textarea for content)
      - Source type selector dropdown (pitch_deck, market_research,
        competitive_analysis, product_doc, strategy_notes, user_research,
        interview_notes, other)
      - Tags input (comma-separated, with suggested tags per source_type)
      - Submit button that posts to the ingest handler
      - List of already-loaded evidence items below the form
- [ ] 1.4 Create `handleListEvidence` handler: GET `/strategies/:id/evidence`
      renders the evidence list with counts by tag
- [ ] 1.5 Add guided interview mode: a structured questionnaire that covers
      vision, market, competition, value proposition, team context. Each
      submitted answer creates an evidence item with source_type `interview`
      and appropriate tags. The interview adapts — skips questions where
      evidence with matching tags already exists.
- [ ] 1.6 Show evidence count on the READY dashboard header ("N source items
      loaded") with a link to the evidence collection page

## 2. Evidence sufficiency assessment

- [ ] 2.1 Create `computeEvidenceSufficiency()` in `queries_phases.go`:
      for each READY artifact, check whether evidence items exist with
      the required tags. Return a map of artifact_type → sufficient (bool)
      + evidence_count + missing_tags.
- [ ] 2.2 Evidence sufficiency thresholds are deliberately low:
      north_star needs 1 item tagged vision/strategy/pitch/purpose;
      insight_analyses needs 2 items tagged market/competitive/trends/user_research;
      other artifacts need 1 item + prerequisite artifact existing.
- [ ] 2.3 Surface sufficiency status on each READY dashboard card:
      "N evidence items available" or "Add market research to improve draft"

## 3. Evidence-aware bootstrap skills

- [ ] 3.1 Create `draft-north-star` skill: reads evidence tagged
      vision/strategy/pitch. Reads LRA if exists. Falls back to minimal
      generation from sparse context. Produces north_star.
- [ ] 3.2 Create `draft-insights` skill: reads evidence tagged
      market/competitive/trends/user_research. Reads north_star for
      context. Produces complete insight_analyses.
- [ ] 3.3 Create `draft-foundations` skill: requires north_star. Reads
      insight_analyses + evidence. Produces strategy_foundations.
- [ ] 3.4 Create `draft-opportunity` skill: requires insight_analyses.
      Reads north_star + evidence. Produces insight_opportunity.
- [ ] 3.5 Create `draft-formula` skill: requires north_star +
      strategy_foundations. Reads insight_opportunity + evidence.
      Produces strategy_formula.
- [ ] 3.6 Create `draft-roadmap` skill: requires strategy_formula +
      strategy_foundations. Reads evidence. Produces roadmap_recipe.
- [ ] 3.7 Add chunk plan entries in `skillexec/executor.go` for each skill
- [ ] 3.8 Extend executor context bundle to include evidence items: query
      `evidence.Service.List()` filtered by tags, inject as
      `ContextBundle.Evidence` for skill prompts
- [ ] 3.9 Verify each skill produces schema-valid output

## 4. Web UI draft actions on READY dashboard

- [ ] 4.1 Create `internal/handler/handler_ready_draft.go` with handlers
      for each draft action
- [ ] 4.2 Register routes: POST `/strategies/:id/ready/draft-north-star`, etc.
- [ ] 4.3 Add draft buttons to READY dashboard cards. Button states:
      - Enabled + "Draft from evidence": sufficient evidence exists
      - Enabled + "Draft with AI": insufficient evidence but prereqs met
      - Disabled + hint: prerequisite artifact missing
      - "Redraft" with confirmation: artifact has substantive content
- [ ] 4.4 Enforce dependency order via prerequisite checks in handlers:
      return 400 with message when prerequisite missing

## 5. READY phase readiness score

- [ ] 5.1 Add `ReadinessScore`, `ReadinessBlockers`, `EvidenceCount` to
      `ReadyPhaseData`
- [ ] 5.2 Implement `computeReadyReadiness()`: artifact presence (~14 pts
      each), section completeness, placeholder deduction, schema validation
- [ ] 5.3 Render readiness progress bar in READY dashboard header
- [ ] 5.4 Show blockers when score < 80
- [ ] 5.5 Integrate into health_check MCP tool

## 6. Auto-derive inter-READY relationships

- [ ] 6.1 Extend `ExtractRelationships` for READY artifact types:
      derived_from, synthesized_from, operationalizes, constrained_by,
      informed_by edges
- [ ] 6.2 Structural edges: created when both artifacts exist
- [ ] 6.3 Update `BackfillIndex()` for existing instances
- [ ] 6.4 Verify ripple engine processes new relationship types

## 7. First version publication prompt

- [ ] 7.1 Show "Publish first version" banner when readiness >= 80 AND
      version count == 0
- [ ] 7.2 "Publish version" button with label "Initial strategy"

## 8. Lifecycle mode completeness

- [ ] 8.1 Update `lifecycle.go` to check all 7 READY artifacts
- [ ] 8.2 When evidence exists but artifacts are placeholder-only,
      recommend the bootstrap flow
- [ ] 8.3 Update next_steps to reference bootstrap skills

## 9. Tests

- [ ] 9.1 Test evidence ingestion from web UI
- [ ] 9.2 Test evidence sufficiency assessment (various tag combos)
- [ ] 9.3 Test each bootstrap skill with evidence context
- [ ] 9.4 Test each bootstrap skill without evidence (sparse fallback)
- [ ] 9.5 Test dependency enforcement
- [ ] 9.6 Test readiness scoring across states (empty, placeholder, partial, full)
- [ ] 9.7 Test inter-READY relationship extraction
- [ ] 9.8 Test guided interview → evidence item creation
