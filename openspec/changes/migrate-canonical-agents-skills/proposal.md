# Change: Migrate Canonical Content to Agents & Skills Format

## Why

Phase 1 (`refactor-agents-and-skills`) built the infrastructure — agent/skill loaders, MCP tools, CLI commands, plugin integration — but left all canonical content in the old wizard/generator format. The new infrastructure reads old formats via backward compatibility, but structured `agent.yaml` and `skill.yaml` manifests are needed to unlock capability classes, tool scoping, trigger phrases, and proper agent-skill composition. Until the content is migrated, the new MCP tools return agents and skills loaded from legacy formats with limited metadata, which is functionally equivalent to the old wizard/generator tools.

This proposal migrates all 13 canonical agent prompts, 3 canonical wizards, and 5 canonical generators into the new format, updates the embedded pipeline, and establishes patterns for users and external frameworks to create and import their own agents and skills.

## What Changes

### Content Migration (canonical-epf)

- **13 agent prompt files** (`.agent_prompt.md`) migrate to `agents/{name}/agent.yaml` + `agents/{name}/prompt.md` with structured manifests declaring type, capability class, required skills, trigger phrases, keywords, and tool requirements
- **3 wizard files** (`.wizard.md`) migrate to `skills/{name}/skill.yaml` + `skills/{name}/prompt.md` as creation/enrichment-type skills with structured manifests declaring prerequisites, output validation, and tool scope
- **5 generator bundles** (`outputs/{name}/`) migrate to `skills/{name}/` with `skill.yaml` manifests added alongside existing `wizard.instructions.md`, `schema.json`, and `validator.sh` (old file names kept as permanent aliases)
- **1 deprecated wizard** (`context_sheet_generator.wizard.md`) removed — already superseded by the context-sheet generator
- **4 sub-wizard agent prompts** (`01_trend_scout` through `04_problem_detective`) become skills required by the `pathfinder` agent

### Embedded Pipeline (epf-cli)

- **`internal/embedded/embedded.go`** — Updated `go:embed` directives to include `agents/` and `skills/` directories
- **`scripts/sync-embedded.sh`** — Updated to sync from new canonical-epf structure with fallback to old directories
- **`MANIFEST.txt`** — Updated to list new directory structure

### Agent/Skill Import Support (epf-cli)

- **`epf-cli agents import`** — New CLI command to import agent definitions from external formats (raw prompt text, CrewAI YAML, OpenAI Assistants JSON) into EPF agent format
- **`epf-cli skills import`** — New CLI command to import skill definitions from external formats into EPF skill format
- **MCP tools** — `epf_import_agent` and `epf_import_skill` for AI-assisted import with manifest generation

## Impact

- Affected specs: `epf-cli-mcp` (new import tools)
- Affected code (epf-cli):
  - `internal/embedded/embedded.go` — Updated embed directives
  - `scripts/sync-embedded.sh` — New sync sources
  - `cmd/agents.go` — New `import` subcommand
  - `cmd/skills.go` — New `import` subcommand
  - `internal/agent/import.go` — Import logic
  - `internal/skill/import.go` — Import logic
  - `internal/mcp/agent_tools.go` — New import handler
  - `internal/mcp/skill_tools.go` — New import handler
- Affected external: `canonical-epf` repository directory structure (feature branch → main)
- No user migration required: existing instances with `generators/` directories and old file names continue to work permanently
