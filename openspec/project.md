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
- **Generators:** Output generators for producing documents from EPF data (investor memos, compliance docs, context sheets, etc.)

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
- **Generators:** Output document generation from EPF data
- **Wizards:** Guided workflows for creating EPF artifacts
- **MCP Server:** AI agent integration for editors like Cursor and OpenCode

## Important Constraints

### Technical Constraints

- **Go version:** 1.24+ required
- **EPF Schema version:** 2.0.0 (current)
- **YAML format:** All EPF artifacts are YAML files validated against JSON Schema

### Operational Constraints

- **No server infrastructure:** This repo has no backend services, databases, or deployment pipelines
- **CLI-only:** The EPF CLI is a standalone binary with no external dependencies at runtime
- **AI-first:** The MCP server is the primary integration point for AI agent workflows

## External Dependencies

### Development

- **Go toolchain:** 1.24+ for building and testing
- **Git:** Version control
- **OpenSpec CLI:** Spec management (optional, for development workflow)

### Runtime

- **None:** The EPF CLI is a self-contained binary with no external service dependencies
