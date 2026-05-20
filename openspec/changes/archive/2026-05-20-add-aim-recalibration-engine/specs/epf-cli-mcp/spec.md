## ADDED Requirements

### Requirement: AIM LRA Update via MCP

AI agents SHALL be able to update specific fields of the Living Reality Assessment via the `epf_aim_update_lra` MCP tool.

The tool SHALL:

- Accept parameters: `instance_path` (required), plus optional field-level updates for `track_baselines`, `current_focus`, `capability_gaps`, `constraints_and_assumptions`, `existing_assets`
- Merge updates into the existing LRA without overwriting unchanged fields
- Automatically append an entry to `evolution_log` with the changed fields, trigger reason, and timestamp
- Increment `update_count` and update `last_updated` metadata
- Validate the result against the LRA schema before writing
- Return the updated LRA content

#### Scenario: Update track baselines after cycle completion

- **WHEN** AI agent calls `epf_aim_update_lra` with updated `track_baselines.product.velocity` and a trigger reason
- **THEN** the LRA file is updated with the new track baseline
- **AND** an evolution log entry is appended recording the change
- **AND** the `update_count` and `last_updated` fields are incremented

#### Scenario: Reject invalid update

- **WHEN** AI agent calls `epf_aim_update_lra` with an invalid field value (e.g., `velocity: "flying"`)
- **THEN** the tool returns a validation error
- **AND** the LRA file is not modified

---

### Requirement: AIM Assessment Write-Back via MCP

AI agents SHALL be able to write completed assessment report data via the `epf_aim_write_assessment` MCP tool.

The tool SHALL:

- Accept parameters: `instance_path` (required), `cycle` (required), `roadmap_id` (required), `okr_assessments` (required), `assumption_validations` (optional), `strategic_insights` (optional), `next_cycle_recommendations` (optional)
- Write or update the assessment report file at `AIM/assessment_report_cycle_N.yaml`
- Validate the content against the assessment report schema before writing
- Return the written file path and content

#### Scenario: Write assessment report for completed cycle

- **WHEN** AI agent calls `epf_aim_write_assessment` with cycle data including OKR outcomes and assumption validations
- **THEN** the assessment report is written to `AIM/assessment_report_cycle_1.yaml`
- **AND** the content passes schema validation

#### Scenario: Update existing assessment report

- **WHEN** AI agent calls `epf_aim_write_assessment` for a cycle that already has an assessment report
- **THEN** the existing report is updated with the new data
- **AND** the previous version is preserved in git history

---

### Requirement: AIM Calibration Memo Write-Back via MCP

AI agents SHALL be able to write calibration memos via the `epf_aim_write_calibration` MCP tool.

The tool SHALL:

- Accept parameters: `instance_path` (required), `cycle` (required), `roadmap_id` (required), `decision` (required: persevere/pivot/pull_the_plug), `confidence` (required), `reasoning` (required), `learnings` (optional), `next_cycle_focus` (optional), `next_ready_inputs` (optional)
- Write the calibration memo file at `AIM/calibration_memo_cycle_N.yaml`
- Validate against the calibration memo schema before writing
- Return the written file path and content

#### Scenario: Write calibration memo with persevere decision

- **WHEN** AI agent calls `epf_aim_write_calibration` with `decision="persevere"` and supporting evidence
- **THEN** the calibration memo is written with the decision and reasoning
- **AND** the `next_ready_inputs` section specifies which READY artifacts need review

---

### Requirement: AIM Cycle Initialization via MCP

AI agents SHALL be able to bootstrap a new AIM cycle via the `epf_aim_init_cycle` MCP tool.

The tool SHALL:

- Accept parameters: `instance_path` (required), `cycle_number` (required)
- Generate assessment report template from current roadmap (using existing `aim assess` logic)
- Create empty calibration memo template for the cycle
- Snapshot the current LRA state as the cycle's baseline
- Return the created file paths

#### Scenario: Initialize new cycle

- **WHEN** AI agent calls `epf_aim_init_cycle` with `cycle_number=2`
- **THEN** the tool creates `AIM/assessment_report_cycle_2.yaml` and `AIM/calibration_memo_cycle_2.yaml`
- **AND** records the cycle start in the LRA metadata

---

### Requirement: AIM Cycle Archival via MCP

AI agents SHALL be able to archive a completed AIM cycle via the `epf_aim_archive_cycle` MCP tool.

The tool SHALL:

- Accept parameters: `instance_path` (required), `cycle_number` (required)
- Copy the cycle's assessment report, calibration memo, and track health signals to `cycles/cycle-N/`
- Include an LRA snapshot at the time of archival
- Update the LRA `cycles_completed` count
- Return the archived file paths

#### Scenario: Archive completed cycle

- **WHEN** AI agent calls `epf_aim_archive_cycle` with `cycle_number=1` after calibration is complete
- **THEN** the cycle artifacts are copied to `cycles/cycle-1/`
- **AND** the LRA `metadata.cycles_completed` is incremented
- **AND** an evolution log entry records the archival

---

### Requirement: AIM Health Diagnostics via MCP

AI agents SHALL be able to run AIM-specific health diagnostics via the `epf_aim_health` MCP tool.

The tool SHALL:

- Accept parameters: `instance_path` (required)
- Check for: LRA staleness (signal dates > 90 days), missing assessment for current cycle, overdue trigger evaluation, unfilled KR outcomes, relationship drift (delivered FDs without maturity updates)
- Return categorized warnings with severity levels and recommended actions

#### Scenario: Detect stale LRA

- **WHEN** AI agent calls `epf_aim_health` on an instance where LRA signal dates are 6+ months old
- **THEN** the tool returns a WARNING about stale track baselines
- **AND** recommends running track health signal collection

#### Scenario: Detect missing assessment

- **WHEN** AI agent calls `epf_aim_health` on an instance where the roadmap shows completed KRs but no assessment report exists
- **THEN** the tool returns a WARNING about missing cycle assessment
- **AND** recommends running the Synthesizer wizard

---

### Requirement: AIM Trigger Evaluation via MCP

AI agents SHALL be able to evaluate AIM trigger conditions via the `epf_aim_check_triggers` MCP tool.

The tool SHALL:

- Accept parameters: `instance_path` (required)
- Load `AIM/aim_trigger_config.yaml` and evaluate all enabled triggers against current data
- Calculate ROI for immediate AIM vs waiting for scheduled cadence
- Check assumption invalidation triggers against assessment evidence
- Return trigger evaluation results with recommendations (trigger/wait/investigate)

#### Scenario: ROI threshold exceeded

- **WHEN** AI agent calls `epf_aim_check_triggers` and calculated waste exceeds the configured ROI threshold
- **THEN** the tool returns a TRIGGER recommendation with ROI calculation
- **AND** includes the waste signals that contributed to the calculation

#### Scenario: No triggers fired

- **WHEN** AI agent calls `epf_aim_check_triggers` and all metrics are within acceptable ranges
- **THEN** the tool returns a WAIT recommendation
- **AND** reports days until next scheduled AIM
