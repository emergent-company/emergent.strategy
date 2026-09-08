# Tasks: Add Strategy Bootstrap Flow

## 1. Unified evidence collection (web UI)

- [x] 1.1 Create `internal/handler/handler_evidence.go` with `handleIngestEvidence`
      handler: accepts text content, source_type, tags via POST form. Calls
      `evidence.Service.Ingest()`. Returns HTMX fragment showing the ingested item.
- [x] 1.2 Register route: POST `/strategies/:id/evidence/ingest`
- [x] 1.3 Create evidence collection page/section on the AIM tab with:
      - Text paste area (textarea for content)
      - Source type selector dropdown (pitch_deck, market_research,
        competitive_analysis, product_doc, strategy_notes, user_research,
        interview_notes, other)
      - Tags input (comma-separated, with suggested tags per source_type)
      - Submit button that posts to the ingest handler
      - List of already-loaded evidence items below the form
- [x] 1.4 Create `handleListEvidence` handler: GET `/strategies/:id/evidence`
      renders the evidence list with counts by tag
- [x] 1.5 Add guided interview mode: a structured questionnaire that covers
      vision, market, competition, value proposition, team context. Each
      submitted answer creates an evidence item with source_type `interview`
      and appropriate tags. The interview adapts — skips questions where
      evidence with matching tags already exists.
- [x] 1.6 Show evidence count on the READY dashboard header ("N source items
      loaded") with a link to the evidence collection page

## 2. Evidence sufficiency assessment

- [x] 2.1 Create `computeEvidenceSufficiency()` in `queries_phases.go`:
      for each READY artifact, check whether evidence items exist with
      the required tags. Return a map of artifact_type → sufficient (bool)
      + evidence_count + missing_tags.
- [x] 2.2 Evidence sufficiency thresholds are deliberately low:
      north_star needs 1 item tagged vision/strategy/pitch/purpose;
      insight_analyses needs 2 items tagged market/competitive/trends/user_research;
      other artifacts need 1 item + prerequisite artifact existing.
- [x] 2.3 Surface sufficiency status on each READY dashboard card:
      "N evidence items available" or "Add market research to improve draft"

## 3. Evidence-aware bootstrap skills

- [x] 3.1 Create `draft-north-star` skill: reads evidence tagged
      vision/strategy/pitch. Reads LRA if exists. Falls back to minimal
      generation from sparse context. Produces north_star.
- [x] 3.2 Create `draft-insights` skill: reads evidence tagged
      market/competitive/trends/user_research. Reads north_star for
      context. Produces complete insight_analyses.
- [x] 3.3 Create `draft-foundations` skill: requires north_star. Reads
      insight_analyses + evidence. Produces strategy_foundations.
- [x] 3.4 Create `draft-opportunity` skill: requires insight_analyses.
      Reads north_star + evidence. Produces insight_opportunity.
- [x] 3.5 Create `draft-formula` skill: requires north_star +
      strategy_foundations. Reads insight_opportunity + evidence.
      Produces strategy_formula.
- [x] 3.6 Create `draft-roadmap` skill: requires strategy_formula +
      strategy_foundations. Reads evidence. Produces roadmap_recipe.
- [x] 3.7 Add chunk plan entries in `skillexec/executor.go` for each skill **[SUPERSEDED]**
- [x] 3.8 Extend executor context bundle to include evidence items: query
      `evidence.Service.List()` filtered by tags, inject as
      `ContextBundle.Evidence` for skill prompts
- [ ] 3.9 Verify each skill produces schema-valid output

## 4. Web UI draft actions on READY dashboard

- [x] 4.1 Create `internal/handler/handler_ready_draft.go` with handlers
      for each draft action
- [x] 4.2 Register routes: POST `/strategies/:id/ready/draft-north-star`, etc.
- [ ] 4.3 Add draft buttons to READY dashboard cards. Button states:
      - Enabled + "Draft from evidence": sufficient evidence exists
      - Enabled + "Draft with AI": insufficient evidence but prereqs met
      - Disabled + hint: prerequisite artifact missing
      - "Redraft" with confirmation: artifact has substantive content
- [x] 4.4 Enforce dependency order via prerequisite checks in handlers:
      return 400 with message when prerequisite missing

## 5. READY phase readiness score

- [x] 5.1 Add `ReadinessScore`, `ReadinessBlockers`, `EvidenceCount` to
      `ReadyPhaseData`
- [x] 5.2 Implement `computeReadyReadiness()`: artifact presence (~14 pts **[SUPERSEDED]**
      each), section completeness, placeholder deduction, schema validation
- [x] 5.3 Render readiness progress bar in READY dashboard header
- [x] 5.4 Show blockers when score < 80
- [ ] 5.5 Integrate into health_check MCP tool

## 6. Auto-derive inter-READY relationships

- [x] 6.1 Extend `ExtractRelationships` for READY artifact types: **[SUPERSEDED]**
      derived_from, synthesized_from, operationalizes, constrained_by,
      informed_by edges
- [ ] 6.2 Structural edges: created when both artifacts exist
- [x] 6.3 Update `BackfillIndex()` for existing instances
- [x] 6.4 Verify ripple engine processes new relationship types

## 7. First version publication prompt

- [x] 7.1 Show "Publish first version" banner when readiness >= 80 AND
      version count == 0
- [x] 7.2 "Publish version" button with label "Initial strategy"

## 8. Value model activation and definition alignment

- [x] 8.1 Create `align-portfolio` skill: type=generation, phase=FIRE,
      execution=prompt. Reads strategy_formula, roadmap_recipe, features,
      canonical value model templates, canonical track definitions. Produces
      value model state updates and definition activation/tier changes.
- [ ] 8.2 Add chunk plan: 4 chunks (one per track: product, strategy, org_ops,
      commercial). Each chunk reads the track's OKRs from roadmap + canonical
      definitions + canonical value model template, outputs updated value model
      states and selected definitions with tiers.
- [x] 8.3 Create web handler: POST `/strategies/:id/fire/align-portfolio`. **[SUPERSEDED]**
      Calls executor with the alignment skill. Redirects to draft review.
- [x] 8.4 Add "Align portfolio" button on FIRE dashboard (or on each track **[SUPERSEDED]**
      page) — available after roadmap_recipe exists.
- [x] 8.5 Wire into AIM cycle: after adapt-strategy produces a new roadmap,
      the alignment skill can optionally run to update value models. This
      could be a 6th step in the orchestrated cycle or triggered by ripple
      signals targeting value model artifacts.
- [x] 8.6 Wire into bootstrap flow: after draft-roadmap completes, suggest
      running align-portfolio to set initial component activation.

## 9. Lifecycle mode completeness

- [x] 9.1 Update `lifecycle.go` to check all 7 READY artifacts
- [x] 9.2 When evidence exists but artifacts are placeholder-only,
      recommend the bootstrap flow
- [x] 9.3 Update next_steps to reference bootstrap skills

## 10. Strategy completeness watchdog

- [x] 10.1 Create `domain/watchdog/` package with `Service` that checks staleness,
      orphans, and cross-phase coherence for all artifact types
- [x] 10.2 Staleness detection: for each artifact type, configurable threshold
      (READY: 90 days, FIRE definitions: 180 days, features: 60 days).
      Flag stale artifacts as informational signals.
- [x] 10.3 Orphan detection: extend beyond value_model paths to all artifact types.
      An artifact with zero relationships (inbound + outbound) is an orphan.
- [ ] 10.4 Cross-phase coherence checks:
      - Features without delivered_by_kr edges → "unlinked feature"
      - Roadmap KRs without delivering features → "undelivered KR"
      - Value model components set active but no contributes_to → "unused component"
      - Definitions at tier > 1 without roadmap OKR support → "unsupported tier"
      - Unprocessed evidence items older than 30 days → "stale evidence"
- [x] 10.5 Extend relationship extraction for currently-blind artifact types:
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
- [x] 11.6 Test readiness scoring across states (empty, placeholder, partial, full)
- [x] 11.7 Test inter-READY relationship extraction
- [ ] 11.8 Test guided interview → evidence item creation
- [x] 11.9 Test align-portfolio: verify value model states and definition tiers
- [x] 11.10 Test watchdog staleness detection
- [x] 11.11 Test watchdog orphan detection
- [ ] 11.12 Test watchdog cross-phase coherence (unlinked features, undelivered KRs)
- [x] 11.13 Test extended relationship extraction for north_star, strategy_foundations,
      strategy_formula, insight_analyses, evidence

---

## Status (recorded 2026-09-08)

**Implemented 2026-05-22 in commit `be2664f5`**, whose subject is literally
"add-strategy-bootstrap-flow: genesis-to-first-version bootstrap (groups 1-11)".
Follow-ups: `fc0e6c9f` (redirect on LLM failure), `a2d847c2` (i18n pass),
`90362e55` (lint). None touches this directory, so `git log -- <dir>` shows only the
five proposal commits and the change looked untouched.

Verified task by task against the code on 2026-09-08:
**47 done · 5 superseded · 15 not done · 1 unverifiable.** Baseline at time of
verification: `go test ./...` from `apps/strategy-server`, 40 packages, 0 failures;
`task lint` clean.

Reported as `0/63` for three and a half months. `add-artifact-assistant-bot` cited it
as a coordination dependency on that basis; the citation was wrong twice over — the
work had shipped, and the claimed relationship did not hold (see below).

### Superseded

- **3.7** — no chunk plans were added. The six `draft-*` skills are single-prompt: none
  has a `chunks/` directory, so `runChunkedInternal` falls back to `Run()`
  (`executor.go:402-404`). `chunkPlanFor` still knows only `adapt-foundations`.
- **5.2** — the readiness model differs from the spec. `computeReadyReadiness`
  (`queries_phases.go:1593-1675`) is 6 artifacts × 14 pts + evidence 8 + no-pending 8.
  No section-completeness term, no placeholder deduction, no schema validation.
- **6.1** — all five READY types plus evidence are dispatched to extractors
  (`internal/index/extract.go:164-175`, `:814-902`), but every edge is emitted as
  `contributes_to`. None of `derived_from`, `synthesized_from`, `operationalizes`,
  `constrained_by`, `informed_by` is used.
- **8.3, 8.4** — no manual align-portfolio button or route.
  `internal/ui/phase_fire.templ:476-478` states it directly: *"Portfolio alignment is
  now automatic (runs via AIM cycle + periodic consistency check). There is no manual
  align button."* Superseded by the archived `2026-09-06-refactor-portfolio-alignment`.

### Unverifiable

- **3.9** — `internal/embedded/embedded_test.go:521-561` checks `skill.yaml` shape and
  that prompts call `{{schemaConstraints}}`; runtime validation exists. But no evidence
  any of the six skills was executed against a live model and its output
  schema-validated. That requires a real run, not a static assertion.

### Genuine leftovers

**A — Watchdog unfinished (10.4, 10.6, 10.7, 10.8, 11.12).**
- 10.4: only 2 of 5 coherence checks exist (`unlinked_feature`, `stale_evidence`).
  `IssueUndeliveredKR`, `IssueUnusedComponent`, `IssueUnsupportedTier` are declared at
  `watchdog.go:66-69` and never emitted.
- 10.6: reachable from `health_check` only (`server.go:481-485`). No heartbeat ticker
  wiring — `domain/heartbeat` has no watchdog reference.
- 10.7: no "Strategy health" card. `phase_aim.templ` has no watchdog reference.
- 10.8: `checkGhostTypes` reports the three ghost types but no per-type decision was
  applied. All three remain registered (`register_phase2c_tools.go:71,78,79`) and
  `strategic_reality_check` is still actively consumed (`handler.go:419`).

**B — Relationship model (6.2, plus the 6.1 deviation above).** Edges are emitted
unconditionally with no existence check on `target_key`
(`domain/strategy/service.go:580-624`), so dangling edges to non-existent artifacts can
be created.

**C — Smaller gaps.** 4.3 "Redraft with confirmation" state absent — the draft block is
gated on `if !p.Exists` (`phase_ready.templ:411`), so the button disappears once an
artifact has content and there is no re-draft path at all. 5.5 readiness score never
reaches `health_check`. 8.2 `align-portfolio` is single-prompt, not four per-track
chunks; and the AIM cycle runs the deterministic `strategy.AlignPortfolio`
(`align.go:59`), not the LLM skill from 8.1.

**D — Test coverage debt (11.1–11.5, 11.8).** No test touches `handleIngestEvidence`,
`handleSubmitInterview`, or `handleReadyDraft`. `computeEvidenceSufficiency` is never
invoked in a test — `readiness_test.go:137-162` only asserts the shape of the static
spec table. No bootstrap skill is executed with an evidence-populated context bundle,
and there is no sparse-fallback test.

### Correction to a downstream claim

`add-artifact-assistant-bot` previously stated that this change's "Draft with AI"
buttons "can stage through" the sub-object patch primitive. They cannot, and should
not. The `draft-*` skills generate an artifact **from evidence where none exists** —
there is no committed payload to patch. Whole-payload staging is correct for genesis;
patching is correct for surgical edits. They are complementary primitives on the same
staging spine, not layers. What they genuinely share — `strategy_mutations`, `batch_id`
and the `/aim/draft-review/:batchID` gate — they already share, via
`handler_ready_draft.go:81`.

Leftovers A–D are recorded rather than fixed here, and are **not** prerequisites for
the authoring changes. A in particular is operational hygiene that should be scheduled
independently.
