# Project Context

## Purpose

Emergent Strategy is a strategy tooling repository focused on the Emergent Product Framework (EPF). It provides:

- **EPF CLI** — A Go-based command-line tool and MCP server for validating, managing, and generating outputs from EPF artifacts
- **EPF Framework** — Documentation, schemas, templates, and product instances for the Emergent Product Framework
- **OpenSpec** — Spec-driven development infrastructure for managing changes to the above

## Tech Stack

### EPF CLI

- **Language:** Go 1.24+
- **Build:** Standard `go build` toolchain
- **Testing:** `go test ./...`
- **MCP Server:** Built-in MCP server mode (`epf-cli serve`) for AI agent integration
- **Key packages:** YAML parsing, JSON Schema validation, template rendering

### EPF Framework

- **Artifacts:** YAML files organized in phased structure (READY/FIRE/AIM)
- **Schemas:** JSON Schema for artifact validation
- **Templates:** Canonical templates for creating new artifacts
- **Generators/Skills:** Output generators for producing documents from EPF data (investor memos, compliance docs, context sheets, etc.). Generators are now aliased as "skills" in the agents/skills architecture.

### OpenCode Plugin (opencode-epf)

- **Language:** TypeScript (Bun runtime)
- **Package:** `packages/opencode-epf/`
- **Purpose:** Orchestration layer for OpenCode — agent persona injection, auto-validation, tool scoping, commit guards, health dashboard
- **Hooks:** `shell.env`, `tool.execute.before`, `tool.execute.after`, `experimental.chat.system.transform`, `tool.definition`

### Development Tools

- **Version Control:** Git
- **Spec Management:** OpenSpec CLI for spec-driven development
- **AI Integration:** MCP server for Cursor, OpenCode, and other AI-powered editors

## Project Conventions

### Code Style

- **Go:** Follow standard Go conventions (`gofmt`, `go vet`). Use `golint` guidance.
- **YAML/Markdown:** Consistent formatting in EPF artifacts. Validate with EPF CLI.
- **Naming:** kebab-case for file names and directories, PascalCase for Go types, camelCase for Go functions.

### Architecture

#### Repository Structure

- **`apps/epf-cli/`** — Go-based EPF CLI tool and MCP server
- **`docs/EPF/`** — EPF framework documentation, schemas, templates, and product instances
- **`openspec/`** — Spec-driven development infrastructure

#### EPF Instance Structure

```
docs/EPF/_instances/<product>/
├── READY/          # Foundation artifacts (north_star, personas, strategy_formula, etc.)
├── FIRE/           # Execution artifacts (features, roadmaps, value_model)
└── AIM/            # Assessment artifacts (reports, metrics, living_reality_assessment)
```

### Testing

```bash
# Run all Go tests
cd apps/epf-cli && go test ./...

# Build the CLI
cd apps/epf-cli && go build

# Validate an EPF instance
./apps/epf-cli/epf-cli health /path/to/instance

# Validate a specific file
./apps/epf-cli/epf-cli validate /path/to/file.yaml
```

### Git Workflow

#### Branch Strategy

- **Main branch:** `main`
- **Feature branches:** `feature/description` or `add-feature-name`
- **Fix branches:** `fix/issue-description`
- **Change branches:** When using OpenSpec proposals, branch name matches change-id

#### Commit Conventions

- Use conventional commits or clear, concise messages (1-2 sentences)
- Focus on "why" rather than "what"
- Examples:
  - `feat: add schema explain command to EPF CLI`
  - `fix: correct validation of nested value model paths`
  - `chore: clean up residual monorepo files`

## Domain Context

### Emergent Product Framework (EPF)

EPF is a structured framework for product strategy and execution. It organizes strategic thinking into:

- **READY phase:** Foundation artifacts that define vision, personas, strategy, and competitive positioning
- **FIRE phase:** Execution artifacts like feature definitions, roadmaps, and value models that map features to strategic value
- **AIM phase:** Assessment artifacts for measuring progress, validating assumptions, and tracking OKR achievement

Key concepts:
- **Value Model:** Hierarchical model mapping product capabilities to strategic value across tracks (Product, Strategy, OrgOps, Commercial)
- **Feature Definitions:** Detailed feature specs with personas, scenarios, capabilities, and value model contributions
- **Roadmaps:** OKR-based planning with key results linked to value model paths
- **Living Reality Assessment (LRA):** Baseline capturing organizational context and maturity

### EPF CLI

The CLI provides:
- **Validation:** Schema validation, relationship validation, content readiness checks
- **Health checks:** Comprehensive instance health with workflow guidance
- **Agents:** AI personas that orchestrate EPF workflows (replacing wizards)
- **Skills:** Bundled capabilities with prompts, validation, and tools (replacing wizards + generators)
- **Generators:** Output document generation from EPF data (permanent, aliased to skills)
- **MCP Server:** AI agent integration via three-layer architecture (CLI → MCP → Plugin)

### Three-Layer Architecture

1. **CLI binary** (`epf-cli`) — Core logic: validation, loading, scaffolding (Go)
2. **MCP Server** (`epf-cli serve`) — Universal interface: agents, skills, tools, resources, prompts
3. **Orchestration Plugin** (`opencode-epf`) — Platform-specific: persona injection, auto-validation, tool scoping (TypeScript)

## strategy-server (Phase 1 — In Progress)

A new Go application at `apps/strategy-server/` — a constitution-compliant backend that
serves the live strategy authoring platform.

### Tech Stack

| Concern | Library |
|---|---|
| Language | Go 1.26 |
| Database | PostgreSQL 16 (`uptrace/bun` + `jackc/pgx/v5`) |
| HTTP | Echo v4 + `danielgtaylor/huma/v2` |
| CLI/Config | `alexflint/go-arg` |
| Migrations | `pressly/goose/v3` embedded SQL |
| Logging | `log/slog` JSON |
| UUIDs | `google/uuid` |
| MCP | `mark3labs/mcp-go` (Phase 2) |
| Templates | `a-h/templ` (Phase 3) |

### Relationship to epf-cli

- **epf-cli is frozen** — bug fixes only, no new features
- **strategy-server imports epf-cli's `internal/` packages** as a library (same go.work workspace)
- epf-cli remains the reference validator and local developer CLI/MCP tool

### Four-Phase Build Order

| Phase | Exit Gate |
|-------|-----------|
| Phase 1 | All capability specs written; day-one scaffolding verified; `task build/test/lint` green |
| Phase 2 | All MCP tools implemented; every scenario in strategy-scenarios passes via agent |
| Phase 3 | All navigation graph screens implemented; all scenarios pass via web UI |
| Phase 4 | AI chat panel integrated; write ops go through staging in UI |

### Day-One Patterns (installed in Phase 1)

- **i18n:** `langs.T(ctx, "key")` — never hard-code user-facing strings
- **Audit:** `audit.FromContext(ctx).Write(...)` — every write method logs to audit_log
- **Auth middleware:** `web.UserFromContext(ctx)` — always available after middleware, never nil

### Build & Test

```bash
# Build
cd apps/strategy-server && task build

# Run (requires Postgres: task docker-deps)
cd apps/strategy-server && task run

# Unit tests (no DB required)
cd apps/strategy-server && go test ./pkg/... ./internal/audit/... ./internal/langs/...

# All tests (requires running Postgres)
cd apps/strategy-server && task test
```

### Capability Specs

| Spec | Description |
|------|-------------|
| `strategy-core` | Workspace and instance lifecycle |
| `strategy-authoring` | Staged artifact writes and commits |
| `strategy-serving` | Read-only strategy content access |
| `strategy-semantic` | Semantic graph via emergent.memory |
| `strategy-auth` | GitHub OAuth + workspace-scoped authz |
| `strategy-mcp` | MCP tool inventory (Phase 2) |
| `strategy-web` | Navigation graph + web UI spec (Phase 3) |
| `strategy-scenarios` | Primary user journey test scenarios |

---

## Important Constraints

### Technical Constraints

- **Go version:** 1.26+ required
- **EPF Schema version:** 2.0.0 (current)
- **YAML format:** All EPF artifacts are YAML files validated against JSON Schema

### Operational Constraints

- **epf-cli:** Frozen — no new features; bug fixes only
- **strategy-server:** Constitution-compliant; four-phase build order strictly enforced
- **AI-first:** The MCP server (Phase 2) is the primary integration point for AI workflows

## External Dependencies

### Development

- **Go toolchain:** 1.26+ for building and testing
- **Docker Compose:** PostgreSQL 16 for local dev and tests
- **Git:** Version control
- **OpenSpec CLI:** Spec management

### Runtime (strategy-server)

- **PostgreSQL 16:** Primary data store
- **emergent.memory:** Semantic graph (optional; graceful degradation if unavailable)
