# Emergent Strategy

Strategy tooling for the Emergent Product Framework (EPF).

## Overview

This repository contains:

- **`apps/epf-cli/`** - Go-based EPF CLI tool for validating, generating, and managing EPF artifacts
- **`docs/EPF/`** - EPF framework documentation and product instances
- **`openspec/`** - Spec-driven development infrastructure

## Getting Started

### EPF CLI

```bash
# Build the CLI
cd apps/epf-cli && go build

# Run tests
cd apps/epf-cli && go test ./...

# Run the CLI
./apps/epf-cli/epf-cli --help

# Run as MCP server (for AI agent integration)
./apps/epf-cli/epf-cli serve
```

### EPF Framework

The Emergent Product Framework (EPF) provides structured artifacts for product strategy:

```
docs/EPF/_instances/<product>/
├── READY/          # Foundation: north_star, personas, strategy_formula
├── FIRE/           # Execution: features, roadmaps, value_model
└── AIM/            # Assessment: reports, metrics, assessments
```

See `docs/EPF/` for complete framework documentation.

## MCP Server Integration

The EPF CLI can run as an MCP server for AI agent integration:

```jsonc
// opencode.jsonc
"epf-cli": {
  "type": "local",
  "command": ["./apps/epf-cli/epf-cli", "serve"],
  "timeout": 60000
}
```

This provides tools for:

- Validating EPF YAML files against schemas
- Health checking EPF instances
- Generating outputs from EPF data
- Managing EPF artifacts

## Development

### Code Style

- **Go**: Follow standard Go conventions (`gofmt`, `go vet`)
- **YAML/Markdown**: Consistent formatting in EPF artifacts

### Spec-Driven Development

Use OpenSpec for planning changes:

```bash
# List active changes
openspec list

# Validate a change
openspec validate <change-id>
```

See `openspec/AGENTS.md` for detailed workflow instructions.

## Related Repositories

- **[emergent-company/emergent](https://github.com/emergent-company/emergent)** - Web application (admin/server)
