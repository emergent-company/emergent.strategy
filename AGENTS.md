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

### Tool Selection Protocol

**Start with `epf_get_agent_for_task`** — it routes to the right tool or agent:

- For direct operations (validate, search, health check), it returns a `direct_tool` recommendation — call that tool immediately, no agent needed.
- For authoring workflows (create feature, plan roadmap), it recommends an agent to activate.

All tool descriptions use the format `[Category] USE WHEN <trigger>` — scan the first sentence to find the right tool.

### Agent-First Protocol (for authoring)

When creating or modifying EPF artifacts:

1. `epf_get_agent_for_task` — routes to agent or direct tool
2. If agent recommended: `epf_get_agent` → `epf_get_skill` → write → `epf_validate_file`
3. If direct tool recommended: call it directly

Wizard tools (`epf_get_wizard_for_task`, `epf_get_wizard`) and generator tools (`epf_list_generators`, `epf_get_generator`) coexist permanently with agent/skill tools. Prefer agent/skill tools for new workflows.

### Computational Skill Execution

Some skills use `execution: inline` or `execution: script` instead of prompt-delivery. These run deterministic code rather than relying on the LLM to follow instructions.

- **`epf_execute_skill`** -- Runs inline or script skills and returns structured `ExecutionResult` JSON. Use this instead of `epf_get_skill` for computational skills.
- When `epf_get_skill` is called for an inline/script skill, it returns redirection instructions directing you to call `epf_execute_skill` instead.
- Inline skills: `value-model-preview` (HTML rendering), `balance-checker` (roadmap viability scoring)
- Script skills: user-authored skills in instance `skills/` directories (any language, JSON stdin/stdout)
- Use the `skill-builder` agent to help users create custom script or prompt-delivery skills

### Strategy Context Tools

Before feature work, roadmap changes, or competitive decisions, query strategy context using: `epf_get_product_vision`, `epf_get_personas`, `epf_get_competitive_position`, `epf_get_roadmap_summary`, `epf_search_strategy`.

### Removed Tools (use equivalents)

These tools were removed as redundant. Use the equivalent:

| Removed | Use instead |
|---------|------------|
| `epf_review_strategic_coherence` | `epf_get_wizard("strategic_coherence_review")` |
| `epf_review_feature_quality` | `epf_get_wizard("feature_quality_review")` |
| `epf_review_value_model` | `epf_get_wizard("value_model_review")` |
| `epf_recommend_reviews` | `epf_list_wizards(type="review")` |
| `epf_check_instance` | `epf_health_check` |
| `epf_check_content_readiness` | `epf_health_check` |
| `epf_check_feature_quality` | `epf_health_check` |
| `epf_detect_artifact_type` | `epf_validate_file` (auto-detects) |
| `epf_check_migration_status` | `epf_get_migration_guide` |
| `epf_reload_instance` | Automatic on file change |
| `epf_list_agent_skills` | `epf_get_agent` (includes skills) |
| `epf_migrate_definitions` | CLI: `epf-cli migrate-definitions` |
| `epf_sync_canonical` | CLI: `epf-cli sync-canonical` |
| `epf_generate_report` | CLI: `epf-cli report` |

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
| `epf_semantic_neighbors` | Get connected nodes with edge types (includes quality hints for disconnected nodes) |
| `epf_semantic_impact` | Run propagation circuit (dry-run cascade) |
| `epf_contradictions` | Detect structural contradictions in the graph (includes fix_with instructions) |

### MCP Tools (Memory Integration)

| Tool | Description |
|------|-------------|
| `epf_memory_status` | Check Memory configuration and ingestion status |
| `epf_graph_list` | List graph objects by type with optional property filter (deterministic) |
| `epf_graph_similar` | Find semantically similar objects by embedding distance |
| `epf_quality_audit` | Combined quality checks (contradictions, generic content, disconnected nodes) with fix instructions |
| `epf_suggest_enrichment` | Per-feature enrichment suggestions (missing fields, contradictions, weak UVPs, dependency suggestions) |

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
