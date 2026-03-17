<!-- OPENSPEC:START -->

# OpenSpec Instructions

These instructions are for AI assistants working in this project.

Always open `@/openspec/AGENTS.md` when the request:

- Mentions planning or proposals (words like proposal, spec, change, plan)
- Introduces new capabilities, breaking changes, architecture shifts, or big performance/security work
- Sounds ambiguous and you need the authoritative spec before coding

Use `@/openspec/AGENTS.md` to learn:

- How to create and apply change proposals
- Spec format and conventions
- Project structure and guidelines

Keep this managed block so 'openspec update' can refresh the instructions.

<!-- OPENSPEC:END -->

# AI Agent Instructions

## Repository Overview

This repository (`emergent-strategy`) is focused on **strategy tooling**:

- **`apps/epf-cli/`** - Go-based EPF (Emergent Product Framework) CLI tool
- **`docs/EPF/`** - EPF framework documentation and instances
- **`openspec/`** - Spec-driven development infrastructure

The admin/server apps have been migrated to `emergent-company/emergent`.

## Quick Reference

### EPF CLI

```bash
# Build
cd apps/epf-cli && go build

# Run tests
cd apps/epf-cli && go test ./...

# Run CLI
./apps/epf-cli/epf-cli --help
```

### Code Style

- **Go**: Follow standard Go conventions (`gofmt`, `go vet`)
- **YAML/Markdown**: Consistent formatting in EPF artifacts

## Key Directories

| Directory       | Purpose                                   |
| --------------- | ----------------------------------------- |
| `apps/epf-cli/` | EPF CLI tool (Go)                         |
| `docs/EPF/`     | EPF framework docs and product instances  |
| `openspec/`     | Spec-driven development specs and changes |

## EPF Strategy Context

The company-wide EPF strategy instance is at `docs/EPF/_instances/emergent/`.
This is a **git submodule** pointing to `emergent-company/emergent-epf`.

```bash
# If the directory is empty after cloning, initialize the submodule:
git submodule update --init

# To update to the latest strategy:
git submodule update --remote docs/EPF/_instances/emergent
```

Use EPF CLI MCP tools with `instance_path: "docs/EPF/_instances/emergent"` for strategic context lookups, value model analysis, and feature-strategy alignment.

## EPF CLI MCP Server

The EPF CLI includes an MCP server for AI agent integration. Configure in `opencode.jsonc`:

```jsonc
"epf-cli": {
  "type": "local",
  "command": ["./apps/epf-cli/epf-cli", "serve"],
  "timeout": 60000,
}
```

### Three-Layer Architecture

EPF uses a three-layer architecture for AI integration:

1. **CLI binary** (`epf-cli`) — Core logic: validation, loading, scaffolding
2. **MCP Server** (`epf-cli serve`) — Universal interface: agents, skills, tools, resources, prompts
3. **Orchestration Plugin** (`opencode-epf`) — Platform-specific: persona injection, auto-validation, tool scoping

The MCP server works well standalone. The plugin enhances the experience with automatic guardrails.

### Agent-First Protocol (Mandatory)

When working with EPF artifacts, you MUST follow the agent-first workflow:

1. `epf_get_agent_for_task` — find the right agent for your task
2. `epf_get_agent` — retrieve the agent's instructions and required skills
3. `epf_get_skill` — retrieve each skill needed for execution
4. Write the artifact following agent/skill guidance
5. `epf_validate_file` — validate the result

Legacy tools (`epf_get_wizard_for_task`, `epf_get_wizard`, `epf_list_generators`, `epf_get_generator`) coexist as independent tools backed by separate loaders. They load the same embedded content but return different response shapes. Prefer the agent/skill tools (`epf_get_agent_for_task`, `epf_get_agent`, `epf_list_skills`, `epf_get_skill`) for new workflows — they provide structured metadata (capability class, tool scoping, activation data) that the legacy tools do not.

### Strategy Context Tools

Before feature work, roadmap changes, or competitive decisions, query strategy context using: `epf_get_product_vision`, `epf_get_personas`, `epf_get_competitive_position`, `epf_get_roadmap_summary`, `epf_search_strategy`.

## Semantic Strategy Engine

The EPF CLI includes a semantic strategy engine that treats EPF artifacts as a live semantic graph in emergent.memory. Configure with environment variables:

```bash
export EPF_MEMORY_URL="https://memory.emergent-company.ai"
export EPF_MEMORY_PROJECT="<project-id>"
export EPF_MEMORY_TOKEN="<project-token>"
```

### CLI Commands

| Command | Description |
|---------|-------------|
| `epf ingest [path]` | Full ingestion to Memory (with `--dry-run`) |
| `epf sync [path]` | Incremental sync (only changed objects) |
| `epf impact <desc> --node <key>` | Dry-run impact analysis |
| `epf scenario create/modify/evaluate/discard` | What-if exploration via graph branching |

### MCP Tools (Semantic)

| Tool | Description |
|------|-------------|
| `epf_semantic_search` | Search the strategy graph by meaning |
| `epf_semantic_neighbors` | Get connected nodes with edge types |
| `epf_semantic_impact` | Run propagation circuit (dry-run cascade) |

### Engine Packages

| Package | Purpose |
|---------|---------|
| `apps/epf-cli/internal/decompose/` | YAML → graph objects (self-contained, no strategy parser dependency) |
| `apps/epf-cli/internal/memory/` | emergent.memory REST API client |
| `apps/epf-cli/internal/ingest/` | Ingestion pipeline + incremental sync |
| `apps/epf-cli/internal/reasoning/` | Tiered LLM reasoning (Local/Cloud/Frontier) |
| `apps/epf-cli/internal/propagation/` | Propagation circuit with 4-layer protection |
| `apps/epf-cli/internal/scenario/` | What-if exploration via graph branching |

## Key Packages

| Package | Purpose |
|---------|---------|
| `packages/opencode-epf/` | OpenCode orchestration plugin (TypeScript) |
| `apps/epf-cli/internal/agent/` | Agent loader, recommender, types |
| `apps/epf-cli/internal/skill/` | Skill loader, scaffold, validator, sharing |
| `apps/epf-cli/internal/wizard/` | Legacy wizard loader (still functional) |
| `apps/epf-cli/internal/generator/` | Legacy generator loader (permanent) |

## Detailed Documentation

- **EPF Framework**: `docs/EPF/`
- **Semantic Engine Spec**: `openspec/specs/epf-semantic-engine/spec.md`
- **OpenSpec**: `openspec/AGENTS.md`
