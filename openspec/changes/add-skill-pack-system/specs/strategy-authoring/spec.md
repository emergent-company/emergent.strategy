## ADDED Requirements

### Requirement: Installed Skills Storage

The system SHALL persist installed skill packs in the database, scoped to a strategy
instance. Installed skills are stored in an `installed_skills` table and are available
immediately after installation without a server restart.

#### Scenario: Installed skill persists across restarts
- **WHEN** a skill pack is installed into an instance and the server restarts
- **THEN** `list_installed_skills` still returns the installed skill with correct metadata

#### Scenario: Uninstalling a pack is reflected immediately
- **WHEN** `uninstall_pack` is called for an installed pack
- **THEN** subsequent calls to `list_installed_skills` no longer include skills from that pack

---

### Requirement: Strategy Apps Storage

The system SHALL persist installed strategy apps in a `strategy_apps` table, scoped to
a strategy instance. Each row carries the full app manifest, the app URL, health status,
provenance metadata, a per-app HMAC signing secret (generated at install, never exposed
via MCP), and a consecutive-failure counter used for the 3-strike degraded rule.

#### Scenario: Installed app persists across restarts
- **WHEN** an app pack is installed into an instance and the server restarts
- **THEN** `list_apps` still returns the installed app with correct display metadata

#### Scenario: signing_secret is generated at install and never returned
- **WHEN** an app pack is installed
- **THEN** a cryptographically random 32-byte hex `signing_secret` is stored in the
  `strategy_apps` row; no MCP tool ever returns this value in its response

#### Scenario: App status updated to degraded after three consecutive failures
- **WHEN** `run_app` or health check fails three consecutive times for the same app
- **THEN** the `status` column is set to `degraded` and `health_fail_count` equals 3

#### Scenario: App status restored to active after successful health check
- **WHEN** a health check to `{app_url}/health` succeeds for a degraded app
- **THEN** `status` is set to `active` and `health_fail_count` is reset to 0

#### Scenario: Uninstalling a pack removes its apps
- **WHEN** `uninstall_pack` is called for a pack that includes apps
- **THEN** all rows for that pack are removed from `strategy_apps`

---

### Requirement: App Invocation Write Path

When an app invocation response includes `staged_mutations`, the system SHALL stage
those mutations for human review using the existing staged-batch pattern. Apps cannot
write to strategy artifacts directly — all proposed changes go through the batch review
flow. Every invocation is bounded by a payload size cap (2 MB default) and an HTTP call
timeout (30s default); both are enforced before any external call is made or accepted.

#### Scenario: App-proposed mutations create a pending batch
- **WHEN** `run_app` is called and the app's `/run` response contains `staged_mutations`
- **THEN** strategy-server calls `Stage()` for each mutation, groups them under a single
  `batch_id` with `agent_id` set to the app name, and the batch appears in
  `list_pending_batches` awaiting human review

#### Scenario: App-proposed mutations require explicit commit
- **WHEN** a pending batch created by `run_app` exists
- **THEN** the mutations are not applied to strategy artifacts until `commit_batch` is
  called explicitly — the same flow as any agent-staged batch

#### Scenario: App run with no mutations returns no batch_id
- **WHEN** `run_app` is called and the app response does not include `staged_mutations`
- **THEN** `run_app` returns `{document}` with no `batch_id` field

#### Scenario: Push payload size is enforced before HTTP call
- **WHEN** the serialised artifact set for a `run_app` call exceeds APP_PUSH_MAX_BYTES
- **THEN** `run_app` returns an error with the actual byte count and upgrade guidance
  before any HTTP request is sent to the app URL

#### Scenario: HMAC signature is computed over the raw request body
- **WHEN** strategy-server sends a `/run` POST to an app
- **THEN** the `X-Strategy-Signature: sha256=<hex>` header is always present, computed as
  HMAC-SHA256 over the raw request body using the app's stored `signing_secret`

---

### Requirement: Script Skill Execution Contract

The system SHALL execute script-mode skills as isolated subprocesses. The script receives
read-only artifact context as JSON on stdin and must return a JSON result on stdout.
No direct database access is granted to the script — all write operations must go through
the staged batch pattern via MCP tool calls from the orchestrating agent.

#### Scenario: Script receives artifact context on stdin
- **WHEN** `run_skill` executes a script-mode skill
- **THEN** the script subprocess receives a JSON object on stdin containing `instance_id`,
  `artifacts` (all non-archived artifacts for the instance with their payloads),
  `relationships` (all indexed relationships), and `params` (caller-supplied parameters)

#### Scenario: Script output is structured JSON
- **WHEN** a script-mode skill completes successfully
- **THEN** its stdout is parsed as `{"output": "...", "format": "markdown|yaml|html|json"}`
  and the `output` field is returned in the `run_skill` response

#### Scenario: Script cannot write to strategy_artifacts directly
- **WHEN** a script skill attempts to make a database write
- **THEN** the script has no DB credentials; any DB write attempt fails at the script level
  and the `run_skill` call returns whatever the script wrote to stdout before failing

---

### Requirement: Built-in Skill Authoring Primitives

The system SHALL ship two built-in skill authoring capabilities that enable agents and
users to create new skills without reading external documentation or manually authoring
schema-compliant YAML:

1. **`skill-importer` core skill** — an embedded prompt-delivery skill that guides an
   agent through importing a skill from an external source (raw YAML, URL, or canonical
   skill name), normalising it to strategy-server's schema, and installing it via
   `install_pack` after explicit user confirmation.

2. **`scaffold_skill` MCP tool** — a deterministic server-side generator that produces
   schema-valid `skill.yaml`, `prompt.md`, and `pack.yaml` files from structured inputs.

Together they form the foundation of a self-extension loop: the strategy platform can use
its own tooling to grow its own skill library.

#### Scenario: skill-importer is available as a core skill
- **WHEN** `get_skill` is called with `name: "skill-importer"`
- **THEN** the skill is returned with `execution: prompt` and `source: canonical`;
  it is available to all instances without any pack installation

#### Scenario: skill-importer normalises inline execution to prompt
- **WHEN** the `skill-importer` workflow is used to import a skill that declares
  `execution: inline`
- **THEN** the agent rewrites the skill to `execution: prompt` and includes an
  explanatory note in the prompt skeleton that the handler logic must be re-expressed
  as LLM instructions

#### Scenario: skill-importer gates install on user confirmation
- **WHEN** the import workflow has produced a normalised skill skeleton
- **THEN** the agent presents the skeleton for review and does not call `install_pack`
  until the user explicitly confirms

---

### Requirement: Generator Alias Compatibility

The system SHALL continue to resolve legacy generator names (from the `outputs/` embedded
directory) as skills, preserving backward compatibility without maintaining generators
as a distinct concept.

#### Scenario: Generator name resolves as skill
- **WHEN** a client requests skill `context-sheet` and no installed skill or canonical
  skill of that name exists
- **THEN** the generator from `outputs/context-sheet/` is returned as a `ResolvedSkill`
  with `source: "generator-alias"` and `type: "generation"`

#### Scenario: Installed skill takes precedence over generator alias
- **WHEN** a pack installs a skill named `context-sheet` into an instance
- **THEN** `get_installed_skill` returns the installed version, not the generator alias

---

### Requirement: Standard Pack Auto-Install

The system SHALL automatically install the `emergent-standard` pack into every new
strategy instance at creation time, as a post-commit best-effort step. The install is
idempotent. If it fails, a structured warning is logged and the instance remains usable
via core embedded skills — instance creation itself does not fail or roll back.

On successful install, the instance's `standard_pack_version` column is set to the
current embedded VERSION string, enabling skew detection in `health_check`.

#### Scenario: New instance has standard pack pre-installed
- **WHEN** a new strategy instance is created and `EnsureStandardPack` succeeds
- **THEN** `list_packs` returns `emergent-standard` at the server's current VERSION
  without any explicit `install_pack` call

#### Scenario: Instance creation succeeds even if standard pack install fails
- **WHEN** `EnsureStandardPack` encounters an error (e.g. transient DB issue)
- **THEN** the instance row is committed and the creation response succeeds; a
  `level=warn` log entry records the failure; `standard_pack_version` remains NULL

#### Scenario: Standard pack auto-install is idempotent
- **WHEN** the standard pack installation is triggered more than once for the same instance
- **THEN** no error occurs and the pack appears exactly once in `list_packs`

#### Scenario: Standard pack can be uninstalled
- **WHEN** `uninstall_pack` is called with `pack_name: "emergent-standard"`
- **THEN** all standard pack skills are removed from `installed_skills` for the instance
