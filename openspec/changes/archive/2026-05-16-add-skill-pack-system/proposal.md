# Change: Add Skill Pack System and Strategy App Platform

## Why

The current embedded skill/generator architecture has three problems:

1. **Generators are a redundant primitive.** Output generators (`context-sheet`,
   `value-model-preview`, `investor-memo`, etc.) are replicated as skills in `skills/`.
   Two representations of the same concept creates drift. Generators are skills with
   `type: generation` — nothing more.

2. **Skills are baked into the binary.** Canonical skills are embedded via `go:embed`
   at compile time. There is no way for an instance owner or the community to install
   new skills without a server release. This blocks a marketplace model.

3. **There is no app layer.** More specialised, independent uses of strategy content
   — investor memos, board updates, compliance filings, development briefs — need a
   richer execution model than "LLM follows prompt instructions". They need their own
   process boundary, a stable data interface, and a UI surface where users can discover
   and run them as first-class tools.

The fix is a two-track architecture:

**Track 1 — Core skills (built-in, unchanged):** `balance-checker`, `trend-scout`,
`feature-definition`, and similar agent-internal capabilities remain embedded in the
binary. They are the standard library — always available, never shown in the UI as
apps, not managed through the pack system. Agents use them internally.

**Track 2 — Strategy Apps (HTTP microservices, installed per-instance):** Specialised,
independently compiled apps that consume strategy artifacts and produce documents and/or
staged mutation batches. They run as HTTP microservices; strategy-server discovers them
by URL, POSTs artifact context on invocation, and receives structured output. The web UI
renders them as an "AI-powered strategy apps" grid — each with an auto-generated form
from the app's declared inputs.

The **Skill Pack System** is the distribution and installation mechanism for both
skill packs (YAML + prompts for LLM-driven capabilities) and app packs (manifest + URL
for HTTP microservice apps). Packs are installed per-instance; the same pack can be
installed into multiple instances independently.

The **Standard Pack** (`emergent-standard`) replaces the embedded canonical skills as
the default content layer. It ships with the binary (version-pinned) and is
auto-installed into every new instance at creation time. Users can uninstall it or pin
an older version. This makes the skill system fully consistent — all skills go through
the pack system; none are magically built-in except core skills.

## What Changes

### Track 1: Core Skills (no change to existing behaviour)

- Built-in, binary-embedded, agent-internal utilities. Not packs, not apps.
- Always resolved first in skill lookups from agents; never appear in the app UI.
- Existing `skills/` embedded FS and accessors remain the implementation.
- Generators (`outputs/`) become aliases: `type: generation` core skills, resolved via
  the same `GetSkill` path. `ListGenerators`/`GetGenerator` are soft-deprecated.

### Track 2: Strategy Apps

- **`strategy_apps` table** — stores registered app installations per instance:
  `instance_id`, `pack_name`, `pack_version`, `app_name`, `app_url`, `manifest_yaml`,
  `trusted`, `installed_at`, `installed_by`.
- **App manifest format** — `app.yaml` alongside optional `skill.yaml` in a pack:
  ```yaml
  name: investor-memo
  version: "2.0.0"
  display:
    name: "Investor Memo"
    description: "Generate an investor memo from your strategy"
    icon: "document-text"
    category: "investor-relations"
  url: "https://apps.emergent.company/investor-memo"
  inputs:
    - name: tone
      type: enum
      options: [formal, conversational]
      default: formal
    - name: focus_features
      type: feature-select
      multiple: true
      required: false
  output:
    format: markdown
    can_stage_mutations: false
  requires:
    artifacts: [north_star, strategy_formula, value_model, feature]
  ```
- **Invocation protocol** — strategy-server POSTs to `{app_url}/run`:
  ```json
  {
    "instance_id": "uuid",
    "artifacts": [ { "artifact_key": "...", "artifact_type": "...", "payload": {} } ],
    "relationships": [ { "source_key": "...", "target_key": "...", "relationship": "..." } ],
    "params": { "tone": "formal", "focus_features": ["fd-001"] }
  }
  ```
  App responds with:
  ```json
  {
    "document": { "format": "markdown", "content": "..." },
    "staged_mutations": [ { "artifact_key": "...", "artifact_type": "...", "payload": {} } ]
  }
  ```
  `staged_mutations` is optional; if present, strategy-server stages them as a batch
  for human review following the existing staged-batch pattern.
- **Health check** — strategy-server pings `{app_url}/health` on install and
  periodically; an app that fails health checks is marked `status: degraded` in
  `strategy_apps`.

### Track 3: Standard Pack (canonical skills as a pack)

- `emergent-standard@{server_version}` is the canonical pack bundled with the binary.
- Auto-installed into every new instance at creation; the install is idempotent.
- Includes all current skill equivalents of generators and prompt-delivery skills.
- Appears in `list_packs` like any community pack; can be uninstalled or pinned.
- Version is pinned to the server binary version (read from embedded `VERSION` file).

### New MCP Tools (11)

**Pack management (skill packs):**
- `install_pack` — install a skill pack from a bundle into an instance
- `list_packs` — list installed packs (skill packs + app packs)
- `uninstall_pack` — remove a pack and all its skills/apps from an instance
- `get_pack` — get full pack manifest and skill/app list

**Skill resolution:**
- `list_installed_skills` — all skills available to an instance (from installed packs),
  with source tag and pack provenance; core skills are not listed here
- `get_installed_skill` — resolve a named skill from installed packs
- `run_skill` — execute an installed skill (prompt-mode: returns prompt; script-mode:
  runs subprocess)

**Skill authoring:**
- `scaffold_skill` — deterministically generate a schema-valid `skill.yaml` + `prompt.md`
  skeleton from structured inputs; output is ready to pass directly to `install_pack`

**App platform:**
- `list_apps` — list installed strategy apps for an instance with display metadata
- `run_app` — invoke an app by name; strategy-server fetches artifacts, POSTs to app
  URL, returns document and optional staged batch ID
- `describe_pack_format` — return `pack.yaml`, `skill.yaml`, and `app.yaml` schemas
  with examples, for pack authors

### New Core Skills (1)

**`skill-importer`** — a built-in prompt-delivery skill that guides an agent through
importing an external skill (from raw YAML, a URL, or an existing canonical skill name)
into the strategy-server pack system. The skill handles semantic normalisation from
foreign formats (including epf-cli's schema), rewrites `execution: inline` to
`execution: prompt` with an explanatory note, calls `scaffold_skill` for schema-correct
output, and gates `install_pack` on explicit user confirmation. It is the foundation of
the self-extension loop: the platform can use its own tooling to grow its own capabilities.

## Impact

- Affected specs: `strategy-mcp` (11 new tools), `strategy-authoring` (`strategy_apps`
  table, `installed_skills` table, app invocation write path), `strategy-web` (app grid
  UI surface, app card rendering from manifest)
- Affected code:
  - `apps/strategy-server/internal/database/migrations/` — two new migrations
    (`003_installed_skills`, `004_strategy_apps`)
  - `apps/strategy-server/domain/pack/` — new domain service for pack install/resolve
  - `apps/strategy-server/domain/app/` — new domain service for app install/invoke
  - `apps/strategy-server/internal/skillrunner/` — subprocess execution runtime
  - `apps/strategy-server/internal/mcpserver/server.go` — 11 new tools (65 → 76)
  - `apps/strategy-server/internal/embedded/` — generator alias in skill resolution +
    new `skills/skill-importer/` directory with `skill.yaml` and `prompt.md`
- No changes to `apps/epf-cli/` (frozen)
- No breaking changes to existing 65 MCP tools
- **`list_generators`/`get_generator`** will not be added to strategy-server; superseded
  by `list_installed_skills`/`get_installed_skill` via the generator alias path
