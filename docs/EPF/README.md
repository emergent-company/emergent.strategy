# Emergent Product Framework (EPF) - Instance Data

This directory contains the **instance-specific EPF data** for the Emergent product.

## Structure

```
docs/EPF/
├── _instances/emergent/     # Git submodule → emergent-company/emergent-epf
│   ├── READY/               # Strategic foundation
│   ├── FIRE/                # Execution artifacts
│   ├── AIM/                 # Assessments
│   └── outputs/             # Generated documents
├── AGENTS.md                # AI agent instructions
└── README.md                # This file
```

> **Note:** `_instances/emergent/` is a git submodule. If the directory is empty,
> run `git submodule update --init` from the repo root.

## Working with EPF

All EPF operations are performed via **epf-cli**, which provides:

- **CLI commands** for common operations
- **MCP server** with 30 tools for AI agents
- **Schemas, templates, wizards, generators** loaded from canonical EPF

### Quick Commands

```bash
# Health check
epf-cli health docs/EPF/_instances/emergent

# Validate a file
epf-cli validate docs/EPF/_instances/emergent/READY/00_north_star.yaml

# List schemas
epf-cli schemas list

# Get a template
epf-cli templates get feature_definition

# List wizards
epf-cli wizards list
```

### MCP Server

For AI agent integration:

```bash
epf-cli serve
```

See `AGENTS.md` for detailed AI agent instructions.

## Configuration

epf-cli is configured via `~/.epf-cli.yaml`:

```yaml
canonical_path: /path/to/canonical-epf
```

## Documentation

- **AGENTS.md** - AI agent instructions and MCP tool reference
- **epf-cli --help** - CLI command reference
- Full EPF documentation available in the canonical EPF repository
