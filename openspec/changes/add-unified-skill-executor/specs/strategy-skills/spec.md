# Capability: strategy-skills

Unified skill model for strategy-server. Skills are named, versioned units of
authoring capability defined by a `skill.yaml` manifest and an optional `prompt.md`.
They are resolved per-instance (installed pack takes precedence over canonical
embedded) and can execute in three contexts: interactive, autonomous, or as a
workflow step.

---

## ADDED Requirements

### Requirement: Skill Resolution Priority

The system SHALL resolve skills using a priority-ordered lookup:

1. `installed_skills` table rows for the instance (installed via `install_pack`)
2. Canonical embedded skills bundled with the server binary
3. Not found — return error

#### Scenario: Installed skill overrides canonical
- **WHEN** a skill named `adapt-strategy` is installed for instance A via `install_pack`
- **AND** a canonical embedded `adapt-strategy` skill also exists
- **THEN** `ResolveSkill(ctx, instanceA, "adapt-strategy")` returns the installed version
- **AND** the canonical version is not used for instance A

#### Scenario: Canonical fallback when not installed
- **WHEN** no `adapt-strategy` skill is installed for instance B
- **AND** a canonical embedded `adapt-strategy` skill exists
- **THEN** `ResolveSkill(ctx, instanceB, "adapt-strategy")` returns the canonical version

#### Scenario: Unknown skill returns error
- **WHEN** no skill named `nonexistent-skill` is installed or embedded
- **THEN** `ResolveSkill` returns a not-found error
- **AND** no partial result is returned

---

### Requirement: Skill Execution Modes

Every prompt-mode skill SHALL support three execution contexts driven by the caller,
not the skill definition. The `execution: prompt` field in `skill.yaml` applies to
all three contexts.

| Context | Trigger | Who executes the prompt | Result |
|---|---|---|---|
| Interactive | `run_skill` (default) | External agent (caller) | `prompt_md` returned |
| Autonomous | `run_skill` with `mode=autonomous` | Internal `LLMClient` | `batch_id` returned |
| Workflow step | `SkillExecutor.Run` called from a step `StepFunc` | Internal `LLMClient` | `batch_id` in `StepResult` |

Script-mode skills (`execution: script`) run as subprocesses in both interactive and
autonomous contexts. Inline-mode skills (`execution: inline`) are reserved for core
embedded computational skills and are not callable via `run_skill`.

#### Scenario: Interactive execution returns prompt
- **WHEN** `run_skill` is called with `skill_name=adapt-strategy` and no `mode` parameter
- **THEN** the response contains `mode: "interactive"` and `prompt_md` with the full prompt
- **AND** no LLM call is made server-side
- **AND** no mutations are staged

#### Scenario: Autonomous execution stages mutations
- **WHEN** `run_skill` is called with `skill_name=adapt-strategy` and `mode=autonomous`
- **AND** the server has an LLM configured
- **THEN** the server calls the LLM with the rendered prompt and artifact context
- **AND** the response contains `mode: "autonomous"`, `batch_id`, `artifact_types`, and `llm_used: true`
- **AND** staged mutations are visible via `list_pending_batches`

#### Scenario: Autonomous mode without LLM returns error
- **WHEN** `run_skill` is called with `mode=autonomous`
- **AND** no LLM provider is configured on the server
- **THEN** the tool returns a structured error: "autonomous mode requires LLM configuration"
- **AND** no mutations are staged

#### Scenario: Workflow step execution stages mutations
- **WHEN** a workflow step calls `SkillExecutor.Run(ctx, instanceID, "adapt-strategy", params)`
- **THEN** the executor resolves the skill, renders the prompt with artifact context,
  calls the LLM, validates output, and stages mutations
- **AND** returns a `SkillResult` containing the `batch_id` for the `StepResult`

---

### Requirement: Autonomous Skill Output Schema Validation

The `SkillExecutor` SHALL support optional output schema validation for autonomous
skill execution. Skills MAY declare an `output.schema` field in `skill.yaml`.
When present, the executor SHALL validate the LLM's JSON response against this schema
before staging any mutations. If validation fails, the executor SHALL return an error
and stage nothing.

#### Scenario: Valid LLM output is staged
- **WHEN** the LLM returns JSON that passes the skill's output schema validation
- **THEN** the executor stages mutations for each artifact type in the output
- **AND** returns `SkillResult{ValidationPassed: true}`

#### Scenario: Invalid LLM output is rejected
- **WHEN** the LLM returns JSON that fails the skill's output schema validation
- **THEN** the executor returns an error describing the validation failure
- **AND** no mutations are staged
- **AND** `SkillResult` is not returned (error path)

#### Scenario: Skill without output schema skips validation
- **WHEN** a skill's `skill.yaml` does not declare `output.schema`
- **AND** the skill is executed autonomously
- **THEN** the executor stages the raw LLM output without schema validation
- **AND** returns `SkillResult{ValidationPassed: false}` (validation was skipped)

---

### Requirement: Skeleton Mode Degradation

When no LLM is configured, `SkillExecutor.Run` SHALL operate in skeleton mode:
stage the current committed artifact payloads unchanged (with a `_skeleton: true`
marker), pause the workflow at the `HumanGate` so the human can manually edit the
batch content, and return `SkillResult{LLMUsed: false}`.

This preserves the human-gate pause in all environments, including those without LLM
configuration, and allows manual authoring through the draft-review UI.

#### Scenario: Skeleton mode preserves human gate
- **WHEN** no LLM is configured
- **AND** the AIM workflow reaches the `adapt_strategy` step
- **THEN** the executor stages the current `strategy_formula` and `roadmap_recipe` unchanged
- **AND** the workflow pauses at the HumanGate for human review
- **AND** the draft-review UI shows the current content with a "skeleton mode" notice

#### Scenario: Skeleton mode batch is committable
- **WHEN** the human edits the skeleton batch content in the draft-review UI
- **AND** commits the batch
- **THEN** the committed mutations become the new visible state normally
- **AND** the workflow continues to `snapshot_cycle`

---

### Requirement: Context Bundle for Prompt Rendering

The `SkillExecutor` SHALL build a `ContextBundle` from the instance's committed
artifacts and make it available to the skill's `prompt.md` via Go `text/template`
substitution before calling the LLM.

The following template variables SHALL be available in every skill prompt:

| Variable | Type | Description |
|---|---|---|
| `{{.InstanceID}}` | string | Instance UUID |
| `{{.Decision}}` | string | Calibration decision (persevere/pivot/pull_the_plug) or empty |
| `{{.AssessmentSummary}}` | string | JSON-encoded assessment report summary or empty |
| `{{.Artifacts}}` | map[string]any | All committed artifacts keyed by artifact_type |
| `{{.Params}}` | map[string]any | Caller-supplied params (from step input or MCP call) |

Skills that do not reference a variable are unaffected by its presence.

#### Scenario: Prompt receives full artifact context
- **WHEN** the executor builds the context bundle for an instance
- **THEN** `{{.Artifacts.strategy_formula}}` resolves to the full committed strategy_formula payload
- **AND** `{{.Artifacts.roadmap_recipe}}` resolves to the full committed roadmap_recipe payload
- **AND** all other committed artifact types are accessible by their artifact_type key

#### Scenario: Decision-aware prompt branching
- **WHEN** the calibration decision is `pivot`
- **AND** the adapt-strategy prompt contains `{{if eq .Decision "pivot"}}...{{end}}`
- **THEN** the rendered prompt includes the pivot-specific instructions
- **AND** the persevere and pull_the_plug sections are omitted from the rendered prompt

---

### Requirement: `adapt-strategy` Canonical Embedded Skill

The system SHALL include a canonical embedded skill named `adapt-strategy` that
produces a complete replacement of `strategy_formula` and `roadmap_recipe` based on
a committed calibration decision and assessment report. The skill SHALL also produce
an `lra_evolution_entry` (appended to the LRA `evolution_log`) and
`new_assumptions` (replacement entries for the roadmap's `riskiest_assumptions`),
closing the AIM cycle's "Adapt" step completely.

The skill SHALL:
- Be of type `generation`, phase `AIM`, execution `prompt`
- Require artifacts: `calibration_memo`, `assessment_report`, `strategy_formula`, `roadmap_recipe`, `living_reality_assessment`
- Produce Option A output (full replacement payloads, not diffs) for `strategy_formula` and `roadmap_recipe`
- Produce append-only output for `lra_evolution_entry` (one object matching `evolution_log` items schema)
- Produce a replacement array for `new_assumptions` (array of `riskiest_assumptions` items)
- Declare an `output_schema.json` that the executor validates before staging
- Be per-instance overridable via `install_pack` with `force: true`

For a `pivot` decision, the skill SHALL instruct the LLM to:
- Identify strategic bets that are inconsistent with the assessment evidence
- Propose replacement bets aligned to the new direction
- Revise OKRs to reflect the updated bets, adjusting targets based on actual hit rates
- Update roadmap phases to reprioritise work consistent with the pivot
- Generate a `lra_evolution_entry` with `trigger: "aim_signals"` summarising what changed
- Propose `new_assumptions` for the tracks most affected by the pivot

For a `persevere` decision, the skill SHALL instruct the LLM to:
- Advance OKR targets incrementally based on achieved progress
- Mark the current roadmap cycle as completed and propose next cycle priorities
- Reinforce the strategic bets that showed positive evidence
- Generate a `lra_evolution_entry` with `trigger: "cycle_transition"` recording baseline updates
- Refine `new_assumptions` to retire validated ones and promote next-highest-risk ones

For a `pull_the_plug` decision, the skill SHALL instruct the LLM to:
- Flag the north star vision for major revision (add `review_flag: true`)
- Archive or deprioritise all roadmap phases
- Propose a minimal wind-down or pivot path in the strategy formula
- Generate a `lra_evolution_entry` with `trigger: "external_change"` noting the shutdown context
- Clear `new_assumptions` (empty array — no new bets to validate)

#### Scenario: Pivot produces revised bets and OKRs
- **WHEN** the AIM adapt step runs with decision=pivot
- **AND** the assessment shows OKR hit rate of 0%
- **THEN** the staged batch contains a `strategy_formula` mutation with revised strategic bets
- **AND** the OKRs are updated with revised targets and a calibration note
- **AND** the `roadmap_recipe` mutation reflects the new priorities

#### Scenario: Persevere advances the cycle
- **WHEN** the AIM adapt step runs with decision=persevere
- **THEN** the staged batch contains a `roadmap_recipe` mutation marking the current cycle complete
- **AND** the `strategy_formula` OKR targets are incremented based on achieved results

#### Scenario: LRA evolution entry is appended on adapt
- **WHEN** the adapt-strategy skill runs for any decision type
- **THEN** the LLM output includes an `lra_evolution_entry` object with `cycle_reference`, `timestamp`, `trigger`, `summary`, and at least one `changes` item
- **AND** the executor stages an `update_lra` mutation that appends the entry to the existing `evolution_log` array
- **AND** the existing `evolution_log` entries are preserved; only the new entry is added

#### Scenario: New assumptions replace riskiest_assumptions on adapt
- **WHEN** the adapt-strategy skill runs with decision=pivot or decision=persevere
- **THEN** the LLM output includes a `new_assumptions` array matching the `riskiest_assumptions` item schema
- **AND** the executor stages a `roadmap_recipe` mutation replacing the affected track's `riskiest_assumptions` with the new array
- **AND** each assumption has a valid `id` (pattern `asm-{p|s|o|c}-{NNN}`), `description`, `type`, `criticality`, and `confidence`

#### Scenario: Pull the plug clears assumptions
- **WHEN** the adapt-strategy skill runs with decision=pull_the_plug
- **THEN** the LLM output includes `new_assumptions: []`
- **AND** the executor stages a `roadmap_recipe` mutation with an empty `riskiest_assumptions` array

#### Scenario: Custom skill overrides canonical
- **WHEN** a custom `adapt-strategy` skill is installed for an instance
- **THEN** the AIM adapt step uses the custom prompt, not the canonical embedded one
- **AND** the custom output schema (if provided) is used for validation

---

### Requirement: Token Budget Guard

The `SkillExecutor` SHALL enforce a token budget of 28,000 tokens on the rendered
prompt context. When the context (artifacts + instructions) exceeds this limit, the
executor SHALL truncate by removing feature definitions first (most verbose, least
critical to strategy rewrite), log a warning with the count of dropped features, and
proceed with the truncated context.

#### Scenario: Large instance is handled gracefully
- **WHEN** an instance has 50+ feature definitions that would push context over 28K tokens
- **THEN** the executor removes feature definitions from the context until under budget
- **AND** logs `warn: adapt-strategy context truncated, dropped N feature definitions`
- **AND** the LLM call proceeds with core READY artifacts intact

#### Scenario: Instance within budget is not truncated
- **WHEN** an instance's full artifact context is under 28K tokens
- **THEN** no truncation occurs
- **AND** all artifact types are included in the rendered prompt
