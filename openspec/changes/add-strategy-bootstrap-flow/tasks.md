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

## 8. Value model activation and definition alignment

- [ ] 8.1 Create `align-portfolio` skill: type=generation, phase=FIRE,
      execution=prompt. Reads strategy_formula, roadmap_recipe, features,
      canonical value model templates, canonical track definitions. Produces
      value model state updates and definition activation/tier changes.
- [ ] 8.2 Add chunk plan: 4 chunks (one per track: product, strategy, org_ops,
      commercial). Each chunk reads the track's OKRs from roadmap + canonical
      definitions + canonical value model template, outputs updated value model
      states and selected definitions with tiers.
- [ ] 8.3 Create web handler: POST `/strategies/:id/fire/align-portfolio`.
      Calls executor with the alignment skill. Redirects to draft review.
- [ ] 8.4 Add "Align portfolio" button on FIRE dashboard (or on each track
      page) — available after roadmap_recipe exists.
- [ ] 8.5 Wire into AIM cycle: after adapt-strategy produces a new roadmap,
      the alignment skill can optionally run to update value models. This
      could be a 6th step in the orchestrated cycle or triggered by ripple
      signals targeting value model artifacts.
- [ ] 8.6 Wire into bootstrap flow: after draft-roadmap completes, suggest
      running align-portfolio to set initial component activation.

## 9. Lifecycle mode completeness

- [ ] 9.1 Update `lifecycle.go` to check all 7 READY artifacts
- [ ] 9.2 When evidence exists but artifacts are placeholder-only,
      recommend the bootstrap flow
- [ ] 9.3 Update next_steps to reference bootstrap skills

## 10. Strategy completeness watchdog

- [ ] 10.1 Create `domain/watchdog/` package with `Service` that checks staleness,
      orphans, and cross-phase coherence for all artifact types
- [ ] 10.2 Staleness detection: for each artifact type, configurable threshold
      (READY: 90 days, FIRE definitions: 180 days, features: 60 days).
      Flag stale artifacts as informational signals.
- [ ] 10.3 Orphan detection: extend beyond value_model paths to all artifact types.
      An artifact with zero relationships (inbound + outbound) is an orphan.
- [ ] 10.4 Cross-phase coherence checks:
      - Features without delivered_by_kr edges → "unlinked feature"
      - Roadmap KRs without delivering features → "undelivered KR"
      - Value model components set active but no contributes_to → "unused component"
      - Definitions at tier > 1 without roadmap OKR support → "unsupported tier"
      - Unprocessed evidence items older than 30 days → "stale evidence"
- [ ] 10.5 Extend relationship extraction for currently-blind artifact types:
      - `north_star`: extract informed_by insight_analyses, grounds strategy_formula
      - `strategy_foundations`: extract derived_from north_star, informs strategy_formula
      - `strategy_formula`: extract derived_from strategy_foundations, operationalized_by roadmap
      - `insight_analyses`: extract informed_by evidence, synthesized_into insight_opportunity
      - `evidence`: extract linked_artifacts payload field into relationship edges
- [ ] 10.6 Wire watchdog to run alongside heartbeat ticker (every 24 hours,
      or configurable) and on-demand via health_check
- [ ] 10.7 Surface watchdog results on AIM dashboard as "Strategy health" card:
      stale artifacts, orphans, unlinked features, undelivered KRs
- [ ] 10.8 Audit ghost artifact types (`mappings`, `strategic_reality_check`,
      `track_health_assessment`): decide per type whether to integrate
      properly or remove from the phase registry

## 11. Tests

- [ ] 11.1 Test evidence ingestion from web UI
- [ ] 11.2 Test evidence sufficiency assessment (various tag combos)
- [ ] 11.3 Test each bootstrap skill with evidence context
- [ ] 11.4 Test each bootstrap skill without evidence (sparse fallback)
- [ ] 11.5 Test dependency enforcement
- [ ] 11.6 Test readiness scoring across states (empty, placeholder, partial, full)
- [ ] 11.7 Test inter-READY relationship extraction
- [ ] 11.8 Test guided interview → evidence item creation
- [ ] 11.9 Test align-portfolio: verify value model states and definition tiers
- [ ] 11.10 Test watchdog staleness detection
- [ ] 11.11 Test watchdog orphan detection
- [ ] 11.12 Test watchdog cross-phase coherence (unlinked features, undelivered KRs)
- [ ] 11.13 Test extended relationship extraction for north_star, strategy_foundations,
      strategy_formula, insight_analyses, evidence
