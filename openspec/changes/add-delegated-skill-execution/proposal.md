# Change: Add Computational Skill Execution to EPF CLI

## Why

The epf-cli skill system currently operates in a single mode: **prompt-delivery**. Skills are bundles of metadata + prompt text returned to the LLM, which follows the instructions manually. This works well for strategic reasoning tasks (writing feature definitions, generating investor memos, conducting trend analysis).

However, some EPF skills contain **deterministic algorithms and template rendering** that the LLM executes unreliably:

- **value-model-preview** -- A 728-line HTML template with `{{VARIABLE}}` substitution, `{{#each}}` loops, and `{{#if}}` conditionals. The LLM acts as a template engine. The 362-line validator exists because the LLM fumbles placeholder replacement.
- **balance-checker** -- 500+ lines of pseudocode for dependency graph cycle detection (DFS), critical path calculation (topological sort), capacity scoring, and portfolio distribution math. Asking an LLM to execute graph algorithms produces unreliable results.
- **skattefunn-application** -- Budget arithmetic, TRL range filtering, timeline gap analysis, and character count enforcement. Wrong numbers in a SkatteFUNN application is a real compliance problem.

These are deterministic algorithms that should run as code, not LLM prompt-following.

## What Changes

- **ADDED: `execution` field on `SkillManifest`** -- Three active modes: `prompt-delivery` (default, existing behavior), `inline` (executed by the Go binary directly), and `script` (executed as a subprocess with JSON stdin/stdout). A fourth mode `plugin` is reserved for future external skill packs.
- **ADDED: `InlineSpec` on `SkillManifest`** -- For `inline` skills, specifies the Go handler name and input parameters.
- **ADDED: `ScriptSpec` on `SkillManifest`** -- For `script` skills, specifies the command, args, and I/O format. Enables users to write custom computational skills in any language without forking epf-cli.
- **ADDED: `internal/compute/` package** -- Go implementations of computational skills. Each skill is a standalone function that takes structured input and returns structured output.
- **ADDED: New MCP tool `epf_execute_skill`** -- Executes inline and script skills directly and returns structured results. Distinct from `epf_get_skill` which returns prompt content.
- **MODIFIED: `handleGetSkill` in MCP server** -- For `inline` and `script` skills, returns execution instructions directing the LLM to call `epf_execute_skill` instead of following a prompt.
- **ADDED: Plugin discovery system** -- `epf-cli` discovers external skill packs (`epf-pack-*` binaries on PATH) and registers their skills in the discovery system. Reserved for Phase 2.
- **NON-BREAKING: Existing skills unchanged** -- The `execution` field defaults to `prompt-delivery`. All existing prompt-delivery skills continue to work identically. No migration required.

## Initial Inline Skills (Phase 1)

1. **value-model-preview** -- Pure template rendering. Go's `text/template` processes the HTML template with value model data from `internal/valuemodel/`. Zero LLM involvement. Core EPF operation, stays in binary permanently.
2. **balance-checker** -- Algorithmic roadmap analysis. Go implements the graph algorithms and scoring formulas from the prompt's pseudocode. The LLM handles only the initial capacity gathering (interactive) and final narrative recommendations. Core EPF operation, stays in binary permanently.

## Skill Builder Agent

A prompt-delivery agent (`skill-builder`) embedded in `epf-cli` that guides users through creating their own custom skills and plugin packs. This is a meta-skill that uses the skill system to teach users how to extend it. The agent:

- Analyzes what the user wants to automate and recommends the right execution mode (prompt-delivery, script, or plugin)
- Generates working `skill.yaml` manifests with correct execution mode, parameters, and required artifacts
- Scaffolds starter scripts in the user's preferred language with the JSON stdin/stdout contract wired up
- Generates Go module scaffolds for plugin packs with the CLI contract (`list-skills`, `execute`)
- Produces test harnesses alongside each skill so the user can verify it works immediately
- Places files in the correct instance directory and verifies the skill appears in discovery

## Phased Roadmap

**Phase 1 (this proposal):** Execution mode infrastructure + core inline skills + skill builder agent. Adds `execution` field, `internal/compute/` package, `epf_execute_skill` tool, script executor. Implements value-model-preview and balance-checker as inline handlers. Embeds skill-builder agent for user extensibility.

**Phase 2 (future):** Plugin system infrastructure. Plugin discovery (`epf-pack-*` on PATH), execution routing, scaffold tooling (`epf-cli plugins create`). No packs yet -- just the infrastructure.

**Phase 3 (future):** Extract domain-specific skills to packs. SkatteFUNN and future soft-funding generators (Enova, SEIS, Horizon Europe) move to `epf-pack-softfunding`. Investor memo and pitch deck generators may move to `epf-pack-investor`. Domain-specific skills stay as prompt-delivery in the core binary until their pack exists.

## Scope Clarification

- **In scope:** Inline Go execution for core computational skills. Script execution for user-authored computational skills. Plugin discovery system (Phase 2).
- **Out of scope:** Companion TypeScript MCP server (superseded by inline Go execution). Memory graph operation skills (deferred until Memory server matures).
- **Prompt-delivery agents/skills** continue to live in `epf-canonical`. Only computational skills that benefit from deterministic code execution move to inline or script.

## Impact

- Affected specs: `epf-cli-mcp` (skill execution, new tool)
- Affected code:
  - `internal/skill/types.go` -- Add `Execution`, `InlineSpec` fields to `SkillManifest`
  - `internal/mcp/skill_tools.go` -- `handleGetSkill` checks execution mode; new `handleExecuteSkill` handler
  - `internal/mcp/server.go` -- Register `epf_execute_skill` tool
  - `internal/compute/` -- New package for inline skill implementations
  - `internal/compute/valuemodel/` -- value-model-preview implementation
  - `internal/compute/balance/` -- balance-checker implementation
- No changes to:
  - Three-tier discovery (instance > framework > global > embedded)
  - Agent-to-skill relationships (`skills.required` in agent.yaml)
  - Recommender system (keyword matching works on manifests regardless of execution mode)

## Distribution and Extensibility

**Core skills** (inline) compile into the `epf-cli` binary. Same distribution as today: `brew install epf-cli` gets everything.

**User skills** (script) live in the EPF instance's `skills/` directory alongside a script file. No compilation, no separate binary. Users write a script in any language that reads JSON from stdin and writes JSON to stdout. The skill manifest specifies the command to run. This works with any stock `epf-cli` installation or Docker image.

**Shared skill packs** (plugin, Phase 2) distribute as separate binaries: `brew install epf-pack-compliance`. The plugin protocol uses subprocess + JSON, so packs are independently compiled and versioned.

| Execution mode | Author | Lives in | Distribution | Requires |
|----------------|--------|----------|-------------|----------|
| `prompt-delivery` | Anyone | Instance, canonical, embedded | YAML + markdown | Nothing extra |
| `inline` | EPF core team | Compiled into `epf-cli` | `brew install epf-cli` | Nothing extra |
| `script` | Instance users | Instance `skills/` directory | Not distributed (local) | Script runtime (Python, etc.) |
| `plugin` | Pack authors | Separate binary on PATH | `brew install epf-pack-*` | Pack binary |

## Related

- GitHub Issue #25: Original inspiration (companion server approach superseded)
- `refactor-agents-and-skills` change: Established the current agent/skill architecture
- `migrate-canonical-agents-skills` change: Phase 2 canonical content migration (in progress)
