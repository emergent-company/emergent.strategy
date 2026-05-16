---
description: "Instructions for the emergent-strategy workspace focused on EPF CLI and strategy tooling."
applyTo: "**"
---

# Coding Agent Instructions

## Repository Overview

This repository (`emergent-strategy`) is focused on **strategy tooling**:

- **`apps/epf-cli/`** - Go-based EPF (Emergent Product Framework) CLI tool (frozen — do not modify)
- **`apps/strategy-server/`** - Go backend for the Emergent Strategy platform (active development)
- **`docs/EPF/`** - EPF framework documentation and instances
- **`openspec/`** - Spec-driven development infrastructure

## Strategy Server Development

The strategy-server is the primary application under active development. It serves
96 MCP tools for strategy management, with Zitadel auth, multi-tenant orgs, and
optional semantic graph features via emergent.memory.

### Quick Start

```bash
cd apps/strategy-server

# One command — starts Postgres, runs migrations, starts server on port 8090
task dev-up

# With Memory server for semantic features (search, contradictions, scenarios)
task dev-up-full

# Run tests (requires Postgres — start with task dev-deps first)
go test ./...

# Stop containers
task dev-down
```

MCP endpoint: `http://localhost:8090/mcp`

### Key Tasks

| Task | Purpose |
|------|---------|
| `task dev-up` | Full local env (Postgres + server) |
| `task dev-up-full` | Full local env with Memory server |
| `task dev-deps` | Start containers only, write `.env.local` |
| `task dev-down` | Stop containers |
| `task dev-reset` | Full reset (remove volumes + `.env.local`) |
| `task run` | Start server (auto-sources `.env.local`) |
| `task build` | Build production binary |
| `task test` | Run all tests |
| `task lint` | Run golangci-lint |

See `apps/strategy-server/AGENTS.md` for architecture, package layout, and full
MCP tool inventory.

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
- **Computational skills** — Inline Go handlers and script-based skills for deterministic execution (`epf_execute_skill`)
- **Skill builder** — Agent that guides users through creating custom skills
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

| Directory                  | Purpose                                   |
| -------------------------- | ----------------------------------------- |
| `apps/epf-cli/`            | EPF CLI tool (Go) — frozen                |
| `apps/strategy-server/`    | Strategy platform backend (Go) — active   |
| `docs/EPF/`                | EPF framework docs and product instances  |
| `openspec/`                | Spec-driven development infrastructure    |

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
