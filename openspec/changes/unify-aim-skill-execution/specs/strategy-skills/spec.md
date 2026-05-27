## ADDED Requirements

### Requirement: `draft-assessment` Canonical Embedded Skill

The system SHALL include a canonical embedded skill named `draft-assessment` that
produces a complete `assessment_report` artifact for the AIM Assess step. The skill
SHALL originate from `epf-canonical` and arrive in the server binary via
`task sync-embedded`.

The skill SHALL:
- Be of type `generation`, phase `AIM`, execution `prompt`
- Require artifacts: `roadmap_recipe` (mandatory), `living_reality_assessment`
  (optional), `assessment_report` (optional, prior cycle)
- Accept parameters: `okr_skeleton` (pre-extracted OKR structure with KR targets),
  `prior_actuals` (KR actuals from prior assessment), `assumption_validations`
  (assumption status from relationship index), `strategic_insights` (active
  critical ripple signal descriptions), `strategic_context` (north star and
  strategy foundations summary), `lra_context` (LRA evolution log summary)
- Produce a single `assessment_report` artifact with per-OKR assessments and
  per-KR status assignments
- Use `{{schemaConstraints "assessment_report"}}` to derive field requirements
  from the canonical JSON schema
- Declare an `output_schema.json` for executor validation and correction retries
- Be per-instance overridable via `install_pack`

The prompt template SHALL instruct the LLM to:
- Write 2-4 sentences per OKR grounded in evidence (prior actuals, LRA narrative,
  ripple signals)
- Set status per KR: `on_track`, `at_risk`, `missed`, `partially_met`, `pending`
- Reference specific KR IDs when assessing individual key results
- Not fabricate numbers -- state when evidence is missing
- Use the `{{range}}` template directive to iterate over OKRs in a single LLM call

#### Scenario: Assessment produces per-OKR assessments
- **WHEN** the skill executor runs `draft-assessment` for an instance with 4 OKRs
- **THEN** the staged batch contains one `assessment_report` mutation
- **AND** the report payload contains 4 `okr_assessments` entries, each with
  `okr_id`, `track`, `objective`, `status`, `assessment` text, and `kr_assessments`

#### Scenario: Prior actuals inform assessment
- **WHEN** the params include `prior_actuals` with KR actual values from the
  prior cycle
- **THEN** the LLM-generated assessment text references the prior actuals as
  primary evidence
- **AND** the KR status assignments reflect progress relative to targets

#### Scenario: Assessment without prior cycle
- **WHEN** no prior `assessment_report` exists (first cycle)
- **AND** the params include `prior_actuals` as empty
- **THEN** the LLM-generated assessment notes the absence of baseline data
- **AND** KR statuses default to `pending`

#### Scenario: Schema constraints are derived from canonical
- **WHEN** the `draft-assessment` prompt template is rendered
- **THEN** `{{schemaConstraints "assessment_report"}}` resolves to field
  requirements from the embedded `assessment_report` JSON schema
- **AND** the LLM output conforms to these constraints

---

### Requirement: `draft-calibration` Canonical Embedded Skill

The system SHALL include a canonical embedded skill named `draft-calibration` that
produces the narrative `reasoning` field for the `calibration_memo` artifact. The
skill SHALL originate from `epf-canonical` and arrive via `task sync-embedded`.

The calibration decision (`persevere` / `pivot` / `pull_the_plug`) is computed by
deterministic Go functions and passed to the skill as a parameter. The skill SHALL
NOT override or recompute the decision -- it only generates the strategic narrative.

The skill SHALL:
- Be of type `generation`, phase `AIM`, execution `prompt`
- Require artifacts: `assessment_report` (mandatory)
- Accept parameters: `decision` (the pre-computed calibration decision),
  `hit_rate_pct` (OKR hit rate as integer), `invalidated_count` (number of
  invalidated assumptions), `formula_reasoning` (template-based fallback
  reasoning from Go), `assessment_data` (full assessment report payload)
- Produce a JSON object with a single `reasoning` field containing 2-3 sentences
- Declare an `output_schema.json` for executor validation
- Be per-instance overridable via `install_pack`

The prompt template SHALL instruct the LLM to:
- Accept the pre-computed decision as authoritative (not override it)
- Write a concise 2-3 sentence strategic explanation of why the decision is
  appropriate given the assessment evidence
- Be direct and actionable, avoiding filler language
- Reference specific OKR outcomes and assumption validations as evidence

#### Scenario: Calibration narrative for pivot decision
- **WHEN** the skill executor runs `draft-calibration` with `decision=pivot`
- **AND** `hit_rate_pct=25` and `invalidated_count=3`
- **THEN** the staged output contains `{"reasoning": "..."}`
- **AND** the reasoning references the low hit rate and invalidated assumptions
- **AND** the reasoning does not contradict the pivot decision

#### Scenario: Calibration narrative for persevere decision
- **WHEN** the skill executor runs `draft-calibration` with `decision=persevere`
- **AND** `hit_rate_pct=80` and `invalidated_count=0`
- **THEN** the reasoning references the strong OKR performance
- **AND** the decision is not overridden in the output

#### Scenario: Fallback when LLM fails
- **WHEN** the LLM call for `draft-calibration` fails (timeout, API error)
- **THEN** the orchestration step falls back to `formula_reasoning` (the
  template-based reasoning from `buildReasoningSummary()`)
- **AND** the calibration memo is still staged with the deterministic decision
  and fallback reasoning
- **AND** a warning is logged

---

### Requirement: Canonical Skill Provenance

All embedded skills used by the strategy-server for artifact generation SHALL
originate from `epf-canonical` and be synced into the binary via
`task sync-embedded`. Skills SHALL NOT be authored directly in
`internal/embedded/skills/` without a corresponding definition in `epf-canonical`.

The sync mechanism SHALL:
- Copy all skill directories from `epf-canonical/skills/` that contain a
  `skill.yaml` file
- Write `MANIFEST.txt` listing all synced skills with their source paths
- Write `VERSION` with the canonical-epf version tag
- Overwrite any existing files in `internal/embedded/skills/` that conflict
  with canonical versions

#### Scenario: Sync replaces native skill with canonical version
- **WHEN** a skill named `draft-lra` exists in both `internal/embedded/skills/`
  (native) and `epf-canonical/skills/` (canonical)
- **AND** `task sync-embedded` is run
- **THEN** the native version is replaced by the canonical version
- **AND** `MANIFEST.txt` lists `draft-lra` with the canonical source path

#### Scenario: All AIM skills are canonical after sync
- **WHEN** `task sync-embedded` is run against a canonical-epf version that
  includes `draft-assessment`, `draft-calibration`, `adapt-strategy`,
  `adapt-foundations`, and `draft-lra`
- **THEN** all five skills appear in `MANIFEST.txt`
- **AND** all five are available via `embedded.ListSkills()`
- **AND** `embedded.GetSkillYAML("draft-assessment")` returns valid YAML

#### Scenario: Build does not modify synced skills
- **WHEN** `go build` compiles the server binary
- **THEN** the `go:embed skills` directive includes the synced canonical skill
  files exactly as they were after `task sync-embedded`
- **AND** no Go code generation step modifies skill prompt templates

---

### Requirement: AIM Orchestration Skill Routing

All writing steps in the AIM cycle orchestration workflow SHALL route through the
`skillexec.Executor` using named canonical skills. The orchestration steps SHALL
pre-compute any deterministic data and pass it as skill parameters.

| Orchestration Step | Skill Name | Pre-computation (Go) |
|---|---|---|
| `draft_assessment` | `draft-assessment` | OKR skeleton, prior actuals, assumption validations, strategic insights, LRA context |
| `draft_calibration` | `draft-calibration` | Decision, hit rate, invalidated count, formula reasoning |
| `adapt_strategy` | `adapt-strategy` | Decision from calibration memo |
| `adapt_foundations` | `adapt-foundations` | Decision, triggered signals |

The `snapshot_cycle` step does not use a skill (it publishes a version snapshot).

#### Scenario: Assessment step uses skill executor
- **WHEN** the AIM orchestration reaches the `draft_assessment` step
- **THEN** the step calls `w.svc.AssembleAssessmentParams()` to compute
  deterministic data
- **AND** calls `w.executor.RunChunked(ctx, instanceID, "draft-assessment", params)`
- **AND** the `SkillResult` is mapped to an `orchestration.StepResult` with
  `BatchID` and metadata including `input_tokens`, `output_tokens`, and `llm_used`

#### Scenario: Calibration step uses skill executor with pre-computed decision
- **WHEN** the AIM orchestration reaches the `draft_calibration` step
- **THEN** the step calls `w.svc.AssembleCalibrationParams()` to compute the
  decision and evidence
- **AND** calls `w.executor.RunChunked(ctx, instanceID, "draft-calibration", params)`
- **AND** the step assembles the final `calibration_memo` by merging the
  Go-computed decision with the skill-generated reasoning narrative

#### Scenario: All writing steps have run tracking
- **WHEN** a full AIM cycle completes (all 5 orchestration steps)
- **THEN** the `skill_runs` table contains 4 rows (one per writing step:
  draft-assessment, draft-calibration, adapt-strategy, adapt-foundations)
- **AND** each row has `status='completed'`, non-zero `input_tokens` and
  `output_tokens`, and a `duration_ms` value
- **AND** the AIM run panel in the web UI displays all 4 runs with their
  metadata

#### Scenario: Skeleton mode for all steps
- **WHEN** no LLM is configured
- **AND** the AIM orchestration reaches any writing step
- **THEN** the skill executor stages skeleton batches for that step
- **AND** the workflow pauses at the human gate
- **AND** the run panel shows `llm_used: false` for the step
