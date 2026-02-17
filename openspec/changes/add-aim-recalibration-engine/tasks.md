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

## Phase 2: Recalibration Propagation

### 2.1 Recalibration Protocol

- [ ] 2.1.1 Define recalibration protocol mapping: calibration memo fields -> READY artifact fields
- [ ] 2.1.2 Document protocol as canonical EPF doc (e.g., `docs/protocols/recalibration_protocol.md`)
- [ ] 2.1.3 Define changeset format for READY artifact updates (structured diff representation)

### 2.2 Recalibration Command

- [ ] 2.2.1 Add `aim recalibrate` command — reads calibration memo, generates READY artifact changeset
- [ ] 2.2.2 Implement changeset generation for each READY artifact type (north_star, analyses, foundations, opportunity, formula, roadmap)
- [ ] 2.2.3 Add `--dry-run` mode that previews changes without writing
- [ ] 2.2.4 Add `--apply` mode that writes changes and logs them in LRA evolution log
- [ ] 2.2.5 Add `epf_aim_recalibrate` MCP tool
- [ ] 2.2.6 Write tests for recalibration propagation logic

### 2.3 Drift Detection

- [ ] 2.3.1 Add `aim health` subcommand — AIM-specific diagnostics (LRA staleness, missing assessments, unfilled KRs)
- [ ] 2.3.2 Add staleness checks: LRA signal dates > 90 days, missing assessment for completed cycle, overdue trigger evaluation
- [ ] 2.3.3 Add relationship drift: FDs marked "delivered" without capability maturity updates, KRs completed without assessment evidence
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
