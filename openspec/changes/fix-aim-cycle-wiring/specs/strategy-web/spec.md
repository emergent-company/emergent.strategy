## ADDED Requirements

### Requirement: Unified Post-Commit Pipeline

The web UI batch commit handler SHALL execute the same post-commit pipeline as
the MCP `commit_batch` tool. This pipeline includes ripple signal auto-resolution,
structural ripple analysis, semantic change classification, foundation draft
enqueuing, convergence loop execution, and schema validation warnings.

#### Scenario: Web UI commit triggers ripple analysis
- **WHEN** a user commits a batch via the web UI draft review page
- **THEN** the post-commit ripple analysis runs
- **AND** ripple signals targeting updated artifacts are auto-resolved
- **AND** new ripple signals are created for detected misalignments
- **AND** if execution-layer artifacts changed and gated signals target foundations, adapt-foundations is enqueued

#### Scenario: Web UI commit runs convergence loop
- **WHEN** a user commits a batch via the web UI
- **THEN** the convergence loop runs to check equilibrium
- **AND** schema validation warnings are generated for committed artifacts

### Requirement: Skill Executor for Web UI Apply

The web UI "Generate strategy rewrite" button SHALL use the skill executor with
the `adapt-strategy` skill when the executor is available, falling back to the
legacy `ApplyCalibration()` stub only when no executor is configured.

#### Scenario: Apply with executor available
- **WHEN** a user clicks "Generate strategy rewrite" on the Adapt step
- **AND** the skill executor is configured
- **THEN** the `adapt-strategy` skill runs with chunked LLM execution
- **AND** produces schema-validated rewrites of strategy_formula and roadmap_recipe
- **AND** stages a batch for human review

#### Scenario: Apply without executor (fallback)
- **WHEN** a user clicks "Generate strategy rewrite"
- **AND** no skill executor is configured
- **THEN** the legacy `ApplyCalibration()` method runs
- **AND** produces deterministic field patches

### Requirement: LRA AI Draft Writer

The system SHALL provide an AI writer for creating an initial Living Reality
Assessment from existing strategy context. The writer SHALL be accessible from
the web UI Observe step and from MCP tools.

#### Scenario: Draft LRA from web UI
- **WHEN** no LRA exists for the instance
- **AND** the user clicks "Draft LRA" on the Observe step
- **THEN** the `draft-lra` skill runs using existing artifacts as context
- **AND** produces a schema-valid LRA with metadata, adoption_context, and track_baselines
- **AND** stages the LRA as a batch for human review

#### Scenario: Draft LRA prerequisites
- **WHEN** the user requests an LRA draft
- **AND** no north_star or strategy_foundations artifacts exist
- **THEN** the system indicates that foundation artifacts are needed first

### Requirement: Pending Batch Visibility on READY Dashboard

The READY phase dashboard SHALL display pending staged batches that affect
READY-phase artifacts (north_star, strategy_foundations, insight_analyses,
insight_opportunity, strategy_formula, roadmap_recipe).

#### Scenario: Pending foundation rewrite
- **WHEN** adapt-foundations has staged a batch updating north_star
- **AND** the user views the READY dashboard
- **THEN** a banner shows indicating pending foundation drafts
- **AND** the banner links to the draft review page for the batch

#### Scenario: No pending batches
- **WHEN** no staged batches affect READY artifacts
- **THEN** no pending batch banner is shown

### Requirement: Multi-Artifact Draft Preview

The draft review page SHALL render previews for all previewable artifacts in a
batch, not only the first one.

#### Scenario: Batch with multiple artifacts
- **WHEN** a batch contains mutations for strategy_formula and roadmap_recipe
- **AND** the user views the draft review page
- **THEN** both artifacts have rendered previews
- **AND** each preview is identifiable by artifact type and key

## MODIFIED Requirements

### Requirement: AIM Orchestrated Cycle Steps

The orchestrated AIM cycle SHALL execute five steps in sequence:

1. `draft_assessment` (human gate) — produces assessment_report
2. `draft_calibration` (human gate) — produces calibration_memo
3. `adapt_strategy` (human gate) — produces strategy_formula, roadmap_recipe rewrites
4. `adapt_foundations` (human gate) — produces north_star, strategy_foundations, insight_analyses, insight_opportunity rewrites
5. `snapshot_cycle` (no gate) — publishes a version capturing all artifact updates

The version snapshot SHALL only execute after all adaptation batches (both
strategy and foundations) have been committed, ensuring the published version
reflects the complete strategy update.

#### Scenario: Full cycle with foundation changes
- **WHEN** an orchestrated AIM cycle runs all 5 steps
- **AND** the user commits all 4 gated batches
- **THEN** the version snapshot captures updates to all 8 READY artifacts
- **AND** the published version label includes the calibration decision

#### Scenario: Full cycle with no foundation changes needed
- **WHEN** the adapt_foundations step runs
- **AND** the executor determines no foundation changes are needed
- **THEN** the step completes with an empty result
- **AND** the snapshot proceeds immediately

#### Scenario: User discards at any step
- **WHEN** the user discards a batch at any gated step
- **THEN** the cycle is aborted
- **AND** no version snapshot is published

### Requirement: AIM Cycle Stepper UI

The AIM cycle stepper SHALL display the domain-correct lifecycle steps with
artifact links and AI draft actions. The stepper SHALL show:

1. **Observe** — links to LRA. Shows "Draft LRA" button when no LRA exists.
2. **Assess** — links to Assessment Report. Shows "AI draft" button when LRA exists but no assessment.
3. **Decide** — links to Calibration Memo. Shows "AI draft" button when assessment exists but no calibration.
4. **Adapt** — links to Versions. Shows "Generate strategy rewrite" button when calibration decided.

Each step SHALL enforce prerequisites: a step is disabled (greyed, "waiting")
when its prerequisite artifact does not exist.

#### Scenario: No LRA exists
- **WHEN** no LRA artifact exists for the instance
- **THEN** Observe shows "Draft LRA" as the primary action
- **AND** Assess shows "Needs LRA first" and is disabled
- **AND** Decide and Adapt are also disabled

#### Scenario: All artifacts exist
- **WHEN** LRA, assessment report, calibration memo all exist with a real decision
- **AND** versions have been published
- **THEN** all four steps show as completed (green)
- **AND** the stepper shows the current calibration decision
