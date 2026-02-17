## Phase 1: AIM Foundation

### 1.1 Fix Emergent Instance LRA

- [x] 1.1.1 Rename `AIM/_living_reality_assessment.yaml` to `AIM/living_reality_assessment.yaml` (match expected pattern)
- [x] 1.1.2 Update LRA metadata: set `update_count`, refresh `last_updated_cycle`, add evolution trigger
- [x] 1.1.3 Update track baselines: refresh signal dates to reflect current reality (product accelerating, Memory shipped, EPF CLI at v0.13)
- [x] 1.1.4 Update existing_assets: add Diane, EPF CLI, EPF Cloud Server (planned)
- [x] 1.1.5 Update capability_gaps: Strategy Foundations was enriched (resolve the Grade D gap), add new gaps
- [x] 1.1.6 Update current_focus: reflect current cycle priorities (AIM assessment, cloud server, AI strategy)
- [x] 1.1.7 Append evolution_log entry for this update
- [x] 1.1.8 Validate updated LRA with `epf_validate_file`

### 1.2 Instantiate AIM Artifacts

- [x] 1.2.1 Create `AIM/aim_trigger_config.yaml` from template, configured for emergent (adoption level 2, small team costs)
- [x] 1.2.2 Run `aim assess` to generate assessment report template for current roadmap cycle
- [x] 1.2.3 Validate all new AIM artifacts

### 1.3 CLI Write-Back Commands

- [x] 1.3.1 Create `internal/aim/` package with AIM artifact read/write helpers
- [x] 1.3.2 Add `aim update-lra` command — accepts field updates (track baselines, focus, gaps) and appends evolution log
- [x] 1.3.3 Add `aim write-assessment` command — writes/updates assessment report from structured input
- [x] 1.3.4 Add `aim write-calibration` command — writes calibration memo with decision, learnings, next-cycle inputs
- [x] 1.3.5 Add `aim init-cycle` command — bootstraps new cycle by archiving previous and creating fresh templates
- [x] 1.3.6 Add `aim archive-cycle` command — saves current cycle artifacts to `cycles/cycle-N/` directory
- [x] 1.3.7 Write unit tests for all new commands
- [x] 1.3.8 Verify existing AIM commands still work unchanged

### 1.4 MCP Write-Back Tools

- [x] 1.4.1 Add `epf_aim_update_lra` MCP tool — mirrors CLI `aim update-lra`
- [x] 1.4.2 Add `epf_aim_write_assessment` MCP tool — write assessment report data
- [x] 1.4.3 Add `epf_aim_write_calibration` MCP tool — write calibration memo
- [x] 1.4.4 Add `epf_aim_init_cycle` MCP tool — bootstrap new cycle
- [x] 1.4.5 Add `epf_aim_archive_cycle` MCP tool — archive completed cycle
- [x] 1.4.6 Register all new tools in MCP server
- [x] 1.4.7 Write integration tests for MCP tools

### 1.5 Canonical Sync (cross-cutting)

- [x] 1.5.1 Audit Phase 1 for schema gaps: verify existing AIM schemas fully support write-back fields (e.g., cycle archival metadata, evolution log entries)
- [x] 1.5.2 Fix 6 schema mismatches in Go types: AssumptionCheck.ID (was AssumptionID), CrossFunctionalInsights as flat []string (was struct), CalibrationMemo rewritten to match schema (structured learnings, start/stop/continue focus, structured next_ready_inputs, added next_steps)

## Phase 1B: AIM Canonical Alignment

### 1B.1 Schema Remediation (in canonical-epf)

- [x] 1B.1.1 LRA schema: add `"cycle_transition"` to `evolution_log[].trigger` enum
- [x] 1B.1.2 Assessment report schema: change assumption ID pattern from `^asmp-[a-z0-9-]+$` to `^asm-[a-z0-9-]+$` (matches roadmap convention `asm-p-001`)
- [x] 1B.1.3 Assessment report schema: add optional `meta` object with `epf_version` (string) and `last_updated` (string)
- [x] 1B.1.4 Calibration memo schema: add optional `meta` object (same structure)
- [x] 1B.1.5 Validate all 5 AIM schemas still pass JSON Schema Draft-07 meta-validation

### 1B.2 Template Remediation (in canonical-epf)

- [x] 1B.2.1 Assessment report template: rewrite `okr_assessments` from track-nested object to flat array of `{okr_id, assessment, key_result_outcomes, ...}`
- [x] 1B.2.2 Assessment report template: rewrite `assumption_validations` from track-nested to flat array of `{id, status, evidence, confidence_change}`
- [x] 1B.2.3 Assessment report template: fix assumption ID prefix from `asm-` to match updated schema pattern
- [x] 1B.2.4 Assessment report template: add `meta` section, add `strategic_insights` and `next_cycle_recommendations` sections
- [x] 1B.2.5 Calibration memo template: remove non-schema fields from `next_ready_inputs` (`north_star_review`, `analyses_updates`, `foundations_updates`), keep only `opportunity_update`, `strategy_update`, `new_assumptions`
- [x] 1B.2.6 LRA template: fix `bootstrap_type` from `fresh_start` to `initial_adoption`
- [x] 1B.2.7 LRA template: fix `adoption_context` — rename `org_type` → `organization_type`, fix enum values; remove `product_stage` (not in schema); fix `ai_capability_level` enum (`basic` → `ai_assisted`); move `adoption_level` to `metadata`; fix `primary_bottleneck` to use schema enum value
- [x] 1B.2.8 LRA template: fix `existing_assets` structure to match schema (current template uses non-schema sub-sections)
- [x] 1B.2.9 LRA template: fix `constraints` structure — schema uses `constraints_and_assumptions` with `hard_constraints`, `operating_assumptions`, `capability_gaps`; template uses different layout
- [x] 1B.2.10 Validate all 5 AIM templates parse as valid YAML

### 1B.3 Bootstrap Tool Alignment

- [x] 1B.3.1 Fix `aim bootstrap` CLI/MCP: map `organization_type` input values to schema enum values (`early_team` → closest schema match, etc.) or update schema to include the tool's values
- [x] 1B.3.2 Fix `aim bootstrap` CLI/MCP: map `ai_capability_level` input values (`none`/`basic`/`intermediate`/`advanced`) to schema enum values (`manual_only`/`ai_assisted`/`ai_first`/`agentic`)
- [x] 1B.3.3 Fix `aim bootstrap` CLI/MCP: map `primary_bottleneck` input values to schema enum values
- [x] 1B.3.4 Test: run `aim bootstrap` with test inputs → `epf_validate_file` on output → zero errors

### 1B.4 Wizard Updates (in canonical-epf)

- [x] 1B.4.1 Synthesizer wizard: add section referencing write-back MCP tools (`epf_aim_write_assessment`, `epf_aim_write_calibration`, `epf_aim_init_cycle`, `epf_aim_archive_cycle`, `epf_aim_update_lra`)
- [x] 1B.4.2 Synthesizer wizard: update Step 5/6 to mention using write-back tools instead of manually creating YAML
- [x] 1B.4.3 AIM trigger assessment wizard: review for consistency with updated trigger config schema (likely no changes needed)

### 1B.5 Sync, Build, and Validate

- [x] 1B.5.1 Commit and push all canonical-epf changes
- [x] 1B.5.2 Run `sync-embedded.sh` to update `epf-cli/internal/embedded/`
- [x] 1B.5.3 Rebuild epf-cli
- [x] 1B.5.4 Validate emergent instance: `epf_health_check` returns no AIM-related errors
- [x] 1B.5.5 Run `go test ./...` — all tests pass
- [x] 1B.5.6 Tag release (v0.16.0 or appropriate version)

## Phase 1C: Strategic Reality Check (SRC) Artifact

### 1C.1 SRC Schema (in canonical-epf)

- [x] 1C.1.1 Create `strategic_reality_check_schema.json` with 5 top-level sections: `belief_validity`, `market_currency`, `strategic_alignment`, `execution_reality`, `recalibration_plan`
- [x] 1C.1.2 Define `belief_validity` schema: array of findings with `source_artifact`, `field_path`, `original_belief`, `current_evidence`, `signal` (enum: strengthening/holding/weakening/invalidated), `confidence_delta`
- [x] 1C.1.3 Define `market_currency` schema: array of findings with `source_artifact`, `field_path`, `staleness_level` (enum: low/medium/high/critical), `days_since_review`, `market_changes_detected`, `recommended_action`
- [x] 1C.1.4 Define `strategic_alignment` schema: array of findings covering cross-reference integrity checks (`check_type` enum: value_model_path/kr_link/feature_dependency/maturity_vocabulary), `status` (enum: valid/broken/stale), `details`
- [x] 1C.1.5 Define `execution_reality` schema: array of findings with `source_artifact`, `field_path`, `expected_state`, `actual_state`, `gap_description`, `severity` (enum: info/warning/critical)
- [x] 1C.1.6 Define `recalibration_plan` schema: array of prioritized actions with `target_artifact`, `target_section`, `action` (enum: review/update/rewrite/archive), `priority` (enum: critical/high/medium/low), `effort_estimate`, `rationale`, `linked_findings` (refs back to findings in other sections)
- [x] 1C.1.7 Add standard `meta` object (epf_version, last_updated, cycle_id) and `summary` (overall_health enum: healthy/attention_needed/at_risk/critical, finding_counts by section)
- [x] 1C.1.8 Validate schema passes JSON Schema Draft-07 meta-validation

### 1C.2 SRC Template (in canonical-epf)

- [x] 1C.2.1 Create `templates/AIM/strategic_reality_check.yaml` with all 5 sections populated with placeholder findings
- [x] 1C.2.2 Ensure template passes schema validation (except placeholder content)
- [x] 1C.2.3 Add inline YAML comments explaining each section's purpose and when to use each signal/severity value

### 1C.3 SRC Wizard (in canonical-epf)

- [x] 1C.3.1 Create `wizards/strategic_reality_check.agent_prompt.md` — agent instructions for conducting an SRC
- [x] 1C.3.2 Wizard should reference which READY/FIRE artifacts to evaluate per section, and which EPF CLI/MCP tools to use
- [x] 1C.3.3 Wizard should reference `epf_aim_generate_src` for mechanical pre-population and `epf_aim_write_src` for writing results
- [x] 1C.3.4 Update Synthesizer wizard (`synthesizer.agent_prompt.md`) to reference SRC as input to calibration decisions

### 1C.4 SRC CLI Commands

- [x] 1C.4.1 Add `aim generate-src` command — auto-populates mechanical checks: freshness (review dates vs today), cross-reference integrity (value model paths, KR links), maturity mismatches (LRA vs value model vocabulary)
- [x] 1C.4.2 `aim generate-src` leaves subjective sections as TODOs: belief validity (needs evidence evaluation), market currency competitive changes (needs market research), confidence drift (needs human/AI judgment)
- [x] 1C.4.3 Add `aim write-src` command — writes/updates SRC from structured input (field-level, like other write-back commands)
- [x] 1C.4.4 Register SRC artifact type in schema registry and template registry within epf-cli
- [x] 1C.4.5 Write unit tests for `aim generate-src` (mechanical checks produce expected findings for test fixtures)
- [x] 1C.4.6 Write unit tests for `aim write-src`

### 1C.5 SRC MCP Tools

- [x] 1C.5.1 Add `epf_aim_generate_src` MCP tool — mirrors CLI `aim generate-src`
- [x] 1C.5.2 Add `epf_aim_write_src` MCP tool — mirrors CLI `aim write-src`
- [x] 1C.5.3 Register both tools in MCP server
- [x] 1C.5.4 Write integration tests for MCP tools

### 1C.6 Sync, Build, and Validate

- [x] 1C.6.1 Commit and push all canonical-epf changes (schema, template, wizard)
- [x] 1C.6.2 Run `sync-embedded.sh` to update `epf-cli/internal/embedded/`
- [x] 1C.6.3 Rebuild epf-cli
- [x] 1C.6.4 Generate SRC for emergent instance: `aim generate-src` produces valid artifact with mechanical findings
- [x] 1C.6.5 Validate emergent SRC with `epf_validate_file` — zero errors
- [x] 1C.6.6 Run `go test ./...` — all tests pass
- [x] 1C.6.7 Tag release (v0.17.0 or appropriate version)

## Phase 2: Recalibration Propagation

### 2.1 Recalibration Protocol

- [ ] 2.1.1 Define recalibration protocol mapping: calibration memo fields + SRC recalibration_plan -> READY/FIRE artifact fields
- [ ] 2.1.2 Document protocol as canonical EPF doc (e.g., `docs/protocols/recalibration_protocol.md`)
- [ ] 2.1.3 Define changeset format for READY/FIRE artifact updates (structured diff representation)

### 2.2 Recalibration Command

- [ ] 2.2.1 Add `aim recalibrate` command — reads calibration memo and SRC, generates READY/FIRE artifact changeset
- [ ] 2.2.2 Implement changeset generation for each READY artifact type (north_star, analyses, foundations, opportunity, formula, roadmap)
- [ ] 2.2.3 Implement changeset generation for FIRE artifact types (feature_definition maturity, value_model maturity)
- [ ] 2.2.4 Add `--dry-run` mode that previews changes without writing
- [ ] 2.2.5 Add `--apply` mode that writes changes and logs them in LRA evolution log
- [ ] 2.2.6 Add `epf_aim_recalibrate` MCP tool
- [ ] 2.2.7 Write tests for recalibration propagation logic

### 2.3 Drift Detection

- [ ] 2.3.1 Add `aim health` subcommand — AIM-specific diagnostics (LRA staleness, missing assessments, unfilled KRs, SRC findings summary)
- [ ] 2.3.2 Add staleness checks: LRA signal dates > 90 days, missing assessment for completed cycle, overdue trigger evaluation
- [ ] 2.3.3 Add relationship drift: FDs marked "delivered" without capability maturity updates, KRs completed without assessment evidence (overlaps with SRC `strategic_alignment` — reuse SRC findings when available)
- [ ] 2.3.4 Add `epf_aim_health` MCP tool
- [ ] 2.3.5 Integrate drift warnings into main `epf_health_check` output

### 2.4 Canonical Sync

- [ ] 2.4.1 If changeset or probe report becomes a new artifact type: add schema + template to `epf-canonical`
- [ ] 2.4.2 Update `synthesizer.agent_prompt.md` wizard in `epf-canonical` with recalibration guidance
- [ ] 2.4.3 Run `sync-embedded.sh` and rebuild `epf-cli`

## Phase 3: AIM Monitoring (coordinates with `add-epf-cloud-server`)

### 3.1 Trigger Evaluation Engine

- [ ] 3.1.1 Create `internal/aim/triggers.go` — evaluate `aim_trigger_config.yaml` thresholds against current data
- [ ] 3.1.2 Implement ROI threshold evaluation (waste signal calculation)
- [ ] 3.1.3 Implement assumption invalidation trigger evaluation
- [ ] 3.1.4 Implement calendar trigger evaluation (days until scheduled AIM)
- [ ] 3.1.5 Add `aim check-triggers` command — one-shot trigger evaluation
- [ ] 3.1.6 Add `epf_aim_check_triggers` MCP tool

### 3.2 Data Ingestion

- [ ] 3.2.1 Add git commit velocity metric collector (commits/week, files changed, languages)
- [ ] 3.2.2 Add configurable external metric hooks (webhook endpoint or file-based input)
- [ ] 3.2.3 Add metric storage in `AIM/metrics/` as timestamped YAML files
- [ ] 3.2.4 Define metric schema for structured ingestion

### 3.3 Probe Reports

- [ ] 3.3.1 Add `aim probe` command — generates weekly probe report from collected metrics + trigger evaluation
- [ ] 3.3.2 Define probe report artifact type and schema
- [ ] 3.3.3 Add `epf_aim_probe` MCP tool
- [ ] 3.3.4 Add probe report to health check summary

### 3.4 Monitoring Integration

- [ ] 3.4.1 Add `aim monitor` command — scheduled evaluation (can run via cron or as background goroutine in MCP server)
- [ ] 3.4.2 Add MCP notification capability for trigger alerts
- [ ] 3.4.3 If cloud server available: add server-side monitoring endpoint with webhook delivery
- [ ] 3.4.4 Add monitoring configuration to trigger config (cadence, notification channels)

### 3.5 Canonical Sync

- [ ] 3.5.1 Add metric schema to `epf-canonical` (new artifact type: `aim_metric`)
- [ ] 3.5.2 Add metric template to `epf-canonical/templates/AIM/`
- [ ] 3.5.3 If probe report is canonical: add probe report schema + template to `epf-canonical`
- [ ] 3.5.4 Update `aim_trigger_config` schema in `epf-canonical` if monitoring config fields are added
- [ ] 3.5.5 Run `sync-embedded.sh` and rebuild `epf-cli`

## Phase 4: Autonomous Recalibration (depends on `add-emergent-ai-strategy`)

### 4.1 AI Synthesizer Integration

- [ ] 4.1.1 Define ACP task types for AIM operations (assess, calibrate, recalibrate)
- [ ] 4.1.2 Create AIM-specific agent instruction set based on Synthesizer wizard
- [ ] 4.1.3 Wire AI Strategy Agent to use AIM MCP tools for artifact operations
- [ ] 4.1.4 Implement autonomous track health signal collection via agent

### 4.2 Autonomous Assessment

- [ ] 4.2.1 Agent fills assessment report from available data (metrics, git history, assumption evidence)
- [ ] 4.2.2 Agent drafts calibration memo with persevere/pivot/pull-the-plug recommendation
- [ ] 4.2.3 Agent generates READY artifact changesets via `aim recalibrate`
- [ ] 4.2.4 Human approval gate: agent creates PR with proposed changes, waits for review

### 4.3 Closed-Loop Automation

- [ ] 4.3.1 Monitor triggers -> auto-invoke AI Synthesizer when ROI threshold exceeded
- [ ] 4.3.2 Scheduled cycle-end assessment: auto-trigger at end of cycle cadence
- [ ] 4.3.3 Evolution log automation: all AI-driven changes logged with agent attribution
- [ ] 4.3.4 End-to-end test: FIRE change -> metric collection -> trigger -> assessment -> calibration -> READY update PR

### 4.4 Canonical Sync

- [ ] 4.4.1 Add AIM-specific agent instruction set to `epf-canonical/wizards/`
- [ ] 4.4.2 Update `synthesizer.agent_prompt.md` with autonomous recalibration workflow
- [ ] 4.4.3 Run `sync-embedded.sh` and rebuild `epf-cli`
