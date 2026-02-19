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

### Wizard-First Protocol (Mandatory)

When working with EPF artifacts, you MUST follow the wizard-first workflow:

1. `epf_get_wizard_for_task` -- find the right wizard for your task (creation, modification, or evaluation)
2. `epf_get_wizard` -- retrieve and follow the wizard instructions
3. Write the artifact or execute the review following wizard guidance
4. `epf_validate_file` -- validate the result

### Strategy Context Tools

Before feature work, roadmap changes, or competitive decisions, query strategy context using: `epf_get_product_vision`, `epf_get_personas`, `epf_get_competitive_position`, `epf_get_roadmap_summary`, `epf_search_strategy`.

## Detailed Documentation

- **EPF Framework**: `docs/EPF/`
- **OpenSpec**: `openspec/AGENTS.md`
