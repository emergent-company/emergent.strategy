# epf-cli

**The EPF Kernel** - Schema Validator, MCP Server, and AI Agent Guide for ProductFactoryOS.

## Role

epf-cli is the **normative authority** for EPF operations. It:

- **Validates** EPF YAML artifacts against JSON schemas
- **Discovers** EPF instances with confidence scoring
- **Guides** AI agents with structured instructions
- **Serves** MCP tools for programmatic operations
- **Migrates** legacy instances to modern structure

**Important:** epf-cli does NOT write content. It validates, discovers, and guides. AI agents write content, epf-cli validates it.

## Installation

```bash
cd apps/epf-cli
go build -o epf-cli .
```

## Quick Start for AI Agents

```bash
# 1. Get AI agent instructions (start here!)
epf-cli agent

# 2. Find EPF instances
epf-cli locate

# 3. Check instance health
epf-cli health [instance-path]

# 4. Validate files after editing
epf-cli validate path/to/file.yaml
```

## Usage

### AI Agent Guidance

```bash
# Display comprehensive AI agent instructions
epf-cli agent

# JSON output for programmatic use
epf-cli agent --json
```

### Find EPF Instances

```bash
# Search current directory tree
epf-cli locate

# Search with specific depth
epf-cli locate --max-depth 10

# Only show instances with anchor files
epf-cli locate --require-anchor

# JSON output
epf-cli locate --json
```

### Validate EPF Files

```bash
# Validate all EPF files in a directory
epf-cli validate .

# Validate a specific file
epf-cli validate epf/strategy/north_star.yaml

# AI-friendly validation output
epf-cli validate file.yaml --ai-friendly
```

### Migrate Legacy Instances

```bash
# Add anchor file to legacy instance
epf-cli migrate-anchor path/to/instance

# Preview what would be created
epf-cli migrate-anchor --dry-run
```

### Health Check

```bash
# Run comprehensive health check (8 checks)
epf-cli health [instance-path]

# Include anchor file validation
epf-cli health --verbose
```

### Start MCP Server

```bash
# Start MCP server (29 tools available)
epf-cli serve

# Custom port
epf-cli serve --port 3200
```

## Architecture

```
epf-cli/
├── cmd/                # Cobra commands
│   ├── root.go         # Root + schema dir auto-detection
│   ├── agent.go        # AI agent instructions
│   ├── locate.go       # EPF instance discovery
│   ├── health.go       # Comprehensive health check
│   ├── validate.go     # Schema validation
│   ├── migrate_anchor.go # Legacy migration
│   ├── serve.go        # MCP server
│   └── ...
├── internal/
│   ├── anchor/         # Anchor file management
│   ├── discovery/      # EPF instance discovery
│   ├── schema/         # Schema loading
│   ├── mcp/            # MCP server (29 tools)
│   └── validator/      # YAML validation logic
├── main.go
└── go.mod
```

## Anchor Files

The `_epf.yaml` anchor file is the authoritative marker for EPF instances:

```yaml
epf_anchor: true
version: '1.0.0'
instance_id: '550e8400-e29b-41d4-a716-446655440000'
created_at: 2024-01-15T10:30:00Z
product_name: 'My Product'
epf_version: '2.0.0'
```

See [AGENTS.md](./AGENTS.md) for comprehensive documentation.

## Related

- **product-factory-os**: The TUI that orchestrates epf-cli
- **EPF Canonical**: Schema definitions at `docs/EPF/`
- **AGENTS.md**: Full AI agent instructions (embedded in binary)
