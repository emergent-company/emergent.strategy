---
description: "Instructions for the emergent-strategy workspace focused on EPF CLI and strategy tooling."
applyTo: "**"
---

# Coding Agent Instructions

## Repository Overview

This repository (`emergent-strategy`) is focused on **strategy tooling**:

- **`apps/epf-cli/`** - Go-based EPF (Emergent Product Framework) CLI tool
- **`docs/EPF/`** - EPF framework documentation and instances
- **`openspec/`** - Spec-driven development infrastructure

## EPF CLI Development

### Building and Testing

```bash
# Build the CLI
cd apps/epf-cli && go build

# Run tests
cd apps/epf-cli && go test ./...

# Run the CLI
./apps/epf-cli/epf-cli --help

# Run MCP server
./apps/epf-cli/epf-cli serve
```

### Code Style

- **Go**: Follow standard Go conventions (`gofmt`, `go vet`)
- **YAML/Markdown**: Consistent formatting in EPF artifacts

## EPF CLI MCP Server

The EPF CLI includes an MCP server for AI agent integration. It provides:

- **Agents** — AI personas that orchestrate EPF workflows (replacing wizards)
- **Skills** — Bundled capabilities with prompts, validation, and tools (replacing wizards + generators)
- **Validation** — Schema validation, relationship checks, content readiness
- **Strategy queries** — Vision, personas, roadmap, competitive context
- **Instance management** — Health checks, scaffolding, migration

### Three-Layer Architecture

1. **CLI** (`epf-cli`) — Core logic (Go)
2. **MCP Server** (`epf-cli serve`) — Universal agent interface
3. **Plugin** (`opencode-epf`) — Platform-specific orchestration (TypeScript)

## Custom MCP Tools

- **epf-cli** - EPF framework tools (agents, skills, validation, generation, instance management)
- **context7** - Library documentation lookup
- **brave-search** - Web search
- **chrome-devtools** - Browser debugging

## Key Directories

| Directory       | Purpose                                  |
| --------------- | ---------------------------------------- |
| `apps/epf-cli/` | EPF CLI tool (Go)                        |
| `docs/EPF/`     | EPF framework docs and product instances |
| `openspec/`     | Spec-driven development infrastructure   |

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

## Working with EPF Artifacts

EPF uses YAML files organized in a phased structure:

```
docs/EPF/_instances/<product>/
├── READY/          # Foundation artifacts (north_star, personas, etc.)
├── FIRE/           # Execution artifacts (features, roadmaps)
└── AIM/            # Assessment artifacts (reports, metrics)
```

Use EPF CLI tools for validation:

```bash
# Health check an instance
./apps/epf-cli/epf-cli health /path/to/instance

# Validate a specific file
./apps/epf-cli/epf-cli validate /path/to/file.yaml
```
