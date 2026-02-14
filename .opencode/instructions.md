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

The EPF CLI includes an MCP server for AI agent integration. It provides tools for:

- Validating EPF YAML files
- Managing EPF instances
- Generating outputs from EPF data
- Health checking EPF instances

## Custom MCP Tools

- **epf-cli** - EPF framework tools (validation, generation, instance management)
- **context7** - Library documentation lookup
- **brave-search** - Web search
- **chrome-devtools** - Browser debugging

## Key Directories

| Directory       | Purpose                                  |
| --------------- | ---------------------------------------- |
| `apps/epf-cli/` | EPF CLI tool (Go)                        |
| `docs/EPF/`     | EPF framework docs and product instances |
| `openspec/`     | Spec-driven development infrastructure   |

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
