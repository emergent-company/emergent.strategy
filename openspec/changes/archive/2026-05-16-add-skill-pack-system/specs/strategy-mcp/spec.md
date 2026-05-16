## ADDED Requirements

### Requirement: Skill Pack Installation

The system SHALL allow skill packs to be installed into a strategy instance via MCP.
A pack is a validated bundle containing a `pack.yaml` manifest and one or more skills
and/or apps. Installation is atomic — all skills in a pack are written to
`installed_skills` and all apps to `strategy_apps` in a single transaction, or none
are if any validation fails.

#### Scenario: Install a valid skill pack
- **WHEN** `install_pack` is called with a valid `pack_yaml` and `skills` array for an instance
- **THEN** all skills are written to `installed_skills` and `{installed: true, skill_count: N, app_count: 0}` is returned

#### Scenario: Install a valid app pack
- **WHEN** `install_pack` is called with a valid `pack_yaml` and `apps` array for an instance
- **THEN** all apps are written to `strategy_apps` and `{installed: true, skill_count: 0, app_count: N}` is returned

#### Scenario: Install fails if any skill.yaml is invalid
- **WHEN** `install_pack` is called and one skill has a missing required `name` field
- **THEN** the entire install is rolled back and an error is returned; no skills or apps are written

#### Scenario: Install refuses to overwrite without force flag
- **WHEN** `install_pack` is called for a pack that is already installed at any version
- **THEN** the call returns an error unless `force: true` is set

#### Scenario: Force-upgrade replaces existing pack
- **WHEN** `install_pack` is called with `force: true` for an already-installed pack
- **THEN** all skills and apps for the pack are replaced atomically with the new version

---

### Requirement: Pack Management

The system SHALL allow listing, inspecting, and uninstalling packs per instance.
Uninstalling removes all skills and apps belonging to the pack.

#### Scenario: List packs shows installed packs
- **WHEN** `list_packs` is called for an instance with two packs installed
- **THEN** two pack summaries are returned each with `pack_name`, `pack_version`, `skill_count`, `app_count`

#### Scenario: Get pack returns full detail
- **WHEN** `get_pack` is called for an installed pack
- **THEN** the full pack manifest, list of skill names, and list of app names with status are returned

#### Scenario: Uninstall removes all pack skills and apps
- **WHEN** `uninstall_pack` is called with a valid pack name
- **THEN** all skills from `installed_skills` and all apps from `strategy_apps` for that
  pack are removed; `{skills_removed, apps_removed}` counts are returned

#### Scenario: Uninstall of unknown pack returns error
- **WHEN** `uninstall_pack` is called for a pack name not installed in the instance
- **THEN** an error is returned

---

### Requirement: Skill Resolution with Installed Precedence

The system SHALL resolve skills in a defined priority order: instance-installed skills
override canonical embedded skills of the same name. Generators (legacy `outputs/` content)
resolve as canonical skills of `type: generation` and are the lowest-priority fallback.

#### Scenario: Installed skill shadows canonical
- **WHEN** `get_installed_skill` is called for a skill name that exists both in `installed_skills` and in the canonical embedded skills
- **THEN** the installed version is returned with `source: "installed"`

#### Scenario: Canonical skill returned when not installed
- **WHEN** `get_installed_skill` is called for a skill name that exists only in canonical embedded skills
- **THEN** the canonical version is returned with `source: "canonical"`

#### Scenario: Generator alias resolves as skill
- **WHEN** `get_installed_skill` is called for a generator name (e.g. `context-sheet`) that exists in `outputs/` but not in `skills/` or `installed_skills`
- **THEN** a `ResolvedSkill` is returned with `source: "generator-alias"` and `type: "generation"`

---

### Requirement: Skill Listing (Installed + Canonical)

The system SHALL expose a unified skill listing for an instance that combines installed
and canonical skills, deduplicating by name (installed takes precedence).

#### Scenario: List shows all skills with source
- **WHEN** `list_installed_skills` is called with `source_filter: "all"` for an instance
- **THEN** all canonical embedded skills and all installed skills are returned, each with a `source` field

#### Scenario: List can be filtered to installed only
- **WHEN** `list_installed_skills` is called with `source_filter: "installed"`
- **THEN** only skills from `installed_skills` table are returned

---

### Requirement: Skill Execution via run_skill

The system SHALL execute skills on demand, with behaviour depending on the skill's
`execution` mode.

#### Scenario: Prompt-mode skill returns prompt content
- **WHEN** `run_skill` is called for a skill with `execution: prompt`
- **THEN** `{mode: "prompt", prompt_md: "..."}` is returned for the agent to follow

#### Scenario: Script-mode skill runs subprocess and returns output
- **WHEN** `run_skill` is called for a skill with `execution: script`
- **THEN** the script is executed as a subprocess with artifact JSON on stdin, and `{mode: "script", output: "...", format: "..."}` is returned

#### Scenario: Script-mode skill times out
- **WHEN** a script-mode skill runs for longer than 30 seconds
- **THEN** the subprocess is killed and `run_skill` returns a timeout error

#### Scenario: Script-mode skill with oversized output is capped
- **WHEN** a script-mode skill writes more than 64 MB to stdout
- **THEN** the subprocess is killed and `run_skill` returns an output size error

#### Scenario: Inline-mode skill from installed pack is rejected
- **WHEN** `run_skill` is called for an installed (non-canonical) skill declaring `execution: inline`
- **THEN** an error is returned explaining that inline execution is reserved for canonical skills

---

### Requirement: Strategy App Listing and Invocation

The system SHALL expose installed strategy apps per instance and allow agents to invoke
them. Apps are HTTP microservices; the system pushes artifact context to the app and
handles the response. The invocation enforces payload size and call timeout limits, signs
each request with HMAC-SHA256, and versions the push contract via Content-Type header.
App-proposed mutations are staged for human review following the existing batch pattern.

#### Scenario: List apps returns display metadata
- **WHEN** `list_apps` is called for an instance with two apps installed
- **THEN** both apps are returned, each with `app_name`, `pack_name`, `status`, and the
  parsed `display` block (name, description, icon, category, tags, inputs[])

#### Scenario: Run app returns document
- **WHEN** `run_app` is called for an active app whose payload is within the 2 MB limit
- **THEN** strategy-server fetches the declared artifacts, POSTs to `{app_url}/run` with
  an `X-Strategy-Signature` HMAC header and versioned Content-Type, and returns
  `{document: {format, content}}`

#### Scenario: Run app with staged mutations returns batch_id
- **WHEN** `run_app` is called and the app response includes `staged_mutations`
- **THEN** strategy-server stages each mutation via `Stage()`, groups them under one
  `batch_id`, and returns `{document, batch_id}` — the batch appears in `list_pending_batches`

#### Scenario: Run app rejected when payload exceeds size limit
- **WHEN** `run_app` is called and the serialised artifact payload exceeds 2 MB
- **THEN** an error is returned before any HTTP call is made, including the actual size
  and a hint to archive stale artifacts

#### Scenario: Run app times out after 30 seconds
- **WHEN** `run_app` is called and the app does not respond within 30 seconds
- **THEN** the HTTP call is cancelled and a timeout error is returned

#### Scenario: App marked degraded after three consecutive failures
- **WHEN** `run_app` or health check fails three times in a row for the same app
- **THEN** the app's `status` is set to `degraded` in `strategy_apps`

#### Scenario: Run app on degraded app returns error
- **WHEN** `run_app` is called for an app with `status: degraded`
- **THEN** an error is returned without calling the app URL

#### Scenario: App with incompatible contract version is rejected at install
- **WHEN** `install_pack` is called with an app manifest declaring `min_contract_version`
  higher than the server supports
- **THEN** installation is rejected with an error naming the required and supported versions

---

### Requirement: Standard Pack Version Skew Reporting

The system SHALL surface standard pack version skew in the `health_check` tool response
and in `list_packs`, so operators can detect when an instance is running an older standard
pack than the current server version. The `health_check` tool SHALL include a
`standard_pack_status` block; `list_packs` SHALL include `up_to_date` for any pack named
`emergent-standard`.

#### Scenario: health_check reports up-to-date standard pack
- **WHEN** `health_check` is called for an instance whose standard pack version matches
  the server binary version
- **THEN** `standard_pack_status.up_to_date` is `true` and no `upgrade_hint` is present

#### Scenario: health_check reports skew with upgrade hint
- **WHEN** `health_check` is called for an instance whose `standard_pack_version` differs
  from the current server version
- **THEN** `standard_pack_status.up_to_date` is `false` and `upgrade_hint` names the
  current server version and the `install_pack --force` path

#### Scenario: health_check reports null when pack not installed
- **WHEN** `health_check` is called for an instance that has never had the standard pack
  installed (e.g. `EnsureStandardPack` failed silently at creation)
- **THEN** `standard_pack_status.installed_version` is `null` and `up_to_date` is `false`

---

### Requirement: Deterministic Skill Scaffolding

The system SHALL expose a `scaffold_skill` MCP tool that deterministically generates a
schema-valid `skill.yaml`, `prompt.md`, and wrapping `pack.yaml` from structured inputs.
The output is generated server-side from a fixed template — not via LLM inference — so
the result is always schema-valid and immediately passable to `install_pack` without
modification.

#### Scenario: Scaffold generates valid prompt-mode skill files
- **WHEN** `scaffold_skill` is called with `name`, `type`, `execution: prompt`, and `description`
- **THEN** a response containing `skill_yaml`, `prompt_md`, and `pack_yaml` is returned;
  `skill_yaml` parses as valid YAML with all required fields present; `pack_yaml` wraps
  the skill and passes pack bundle validation

#### Scenario: Scaffold generates valid script-mode skill files
- **WHEN** `scaffold_skill` is called with `execution: script` and `script_lang: sh`
- **THEN** `skill_yaml` contains `execution: script` and `script_lang: sh`; `prompt_md`
  contains the stdin/stdout contract notes for script authors

#### Scenario: Scaffold output can be passed directly to install_pack
- **WHEN** the `pack_yaml`, `skill_yaml`, and `prompt_md` returned by `scaffold_skill`
  are passed to `install_pack` without modification
- **THEN** the pack installs successfully and the skill resolves via `get_installed_skill`

---

### Requirement: Pack Format Self-Description

The system SHALL expose the pack, skill, and app YAML schemas on demand so agents can
author new packs without reading external documentation.

#### Scenario: describe_pack_format returns all schemas
- **WHEN** `describe_pack_format` is called
- **THEN** a response containing `pack_yaml_schema`, `skill_yaml_schema`, `app_yaml_schema`,
  and `example_pack` is returned

## MODIFIED Requirements

### Requirement: Read Tools

The system SHALL expose read tools that are safe (no state mutation) and do not require
a staging batch. The tool inventory SHALL include the following tools at minimum:

| Tool | Description | Key Input | Key Output |
|---|---|---|---|
| `list_workspaces` | List accessible workspaces | pagination cursor | Workspace[] |
| `get_workspace` | Get workspace details | workspace_id | Workspace |
| `list_instances` | List instances in workspace | workspace_id | Instance[] |
| `get_instance` | Get instance details | instance_id | Instance |
| `health_check` | Instance health + artifact count | instance_id | HealthReport |
| `get_strategy_context` | Full strategic context | instance_id | StrategyContext |
| `get_product_vision` | North star artifact | instance_id | Artifact |
| `get_personas` | All persona artifacts | instance_id | Artifact[] |
| `get_competitive_position` | Competitive position artifact | instance_id | Artifact |
| `get_roadmap` | Roadmap artifact | instance_id | Artifact |
| `list_features` | All feature artifacts | instance_id | Feature[] |
| `get_feature` | Single feature artifact | instance_id, feature_key | Feature |
| `list_artifacts` | All artifacts, optionally filtered by type | instance_id, artifact_type? | Artifact[] |
| `list_relationships` | Cross-artifact edges for a key | instance_id, artifact_key | Relationship[] |
| `list_mutations` | Mutation history | instance_id, filters | Mutation[] |
| `get_mutation` | Single mutation | mutation_id | Mutation |
| `search_strategy` | Semantic search (stub) | instance_id, query | SearchResult[] |
| `detect_contradictions` | Contradiction detection (stub) | instance_id | Contradiction[] |
| `list_schemas` | Embedded schema filenames | — | string[] |
| `get_schema` | Embedded schema content | filename | JSON |
| `list_templates` | Embedded template paths | — | string[] |
| `get_template` | Embedded template content | path | YAML |
| `list_agents` | Embedded agent names | — | string[] |
| `get_agent` | Embedded agent definition | name | AgentDef |
| `list_skills` | Embedded canonical skill names | — | string[] |
| `get_skill` | Embedded canonical skill definition | name | SkillDef |
| `list_wizards` | Embedded wizard filenames | — | string[] |
| `get_wizard` | Embedded wizard markdown | filename | string |
| `list_pending_batches` | Staged uncommitted batches | instance_id | PendingBatch[] |
| `get_strategic_context_for_feature` | Feature + relationships grouped | instance_id, feature_key | FeatureContext |
| `explain_value_path` | Value paths a feature contributes to | instance_id, feature_key | string[] |
| `get_coverage_analysis` | Value path → features matrix | instance_id | CoverageEntry[] |
| `get_value_propositions` | Features with contributes_to | instance_id | ValueProp[] |
| `get_assumptions` | Assumptions with testing features | instance_id | AssumptionCoverage[] |
| `get_feature_dependencies` | depends_on + enables graph | instance_id | DepGraph |
| `validate_artifact` | Schema-validate a JSON payload | payload, artifact_type? | ValidationResult |
| `validate_instance` | Validate all instance artifacts | instance_id | InstanceValidation |
| `validate_relationships` | Relationship reference integrity | instance_id | RelValidation |
| `check_content_readiness` | Content quality score (0–100) | instance_id, artifact_key? | Readiness |
| `get_lra` | Read LRA artifact | instance_id, artifact_key | Artifact |
| `get_aim_summary` | AIM phase overview | instance_id | AIMSummary |
| `list_installed_skills` | All skills (installed + canonical) | instance_id, source_filter? | ResolvedSkill[] |
| `get_installed_skill` | Resolve a named skill | instance_id, skill_name | ResolvedSkill |
| `run_skill` | Execute an installed or canonical skill | instance_id, skill_name, params? | SkillRunResult |
| `scaffold_skill` | Generate schema-valid skill.yaml + prompt.md skeleton | name, type, execution, description, phase?, requires?, script_lang? | SkillScaffold |
| `install_pack` | Install a skill/app pack into an instance | instance_id, pack_yaml, skills?, apps?, force? | InstallResult |
| `list_packs` | List installed packs for an instance | instance_id | PackSummary[] |
| `get_pack` | Get full pack manifest and contents | instance_id, pack_name | PackDetail |
| `uninstall_pack` | Remove a pack and all its skills/apps | instance_id, pack_name | UninstallResult |
| `list_apps` | List installed strategy apps | instance_id | AppSummary[] |
| `run_app` | Invoke a strategy app by name | instance_id, app_name, params? | AppRunResult |
| `describe_pack_format` | Pack, skill, and app YAML schemas | — | PackFormatSpec |

#### Scenario: MCP tools discoverable
- **WHEN** an MCP client sends a `tools/list` request
- **THEN** all 76 registered tools are returned with their names, descriptions, and input schemas
