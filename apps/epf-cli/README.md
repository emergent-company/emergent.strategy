# epf-cli

**The EPF Kernel** - Schema Validator, MCP Server, and AI Agent Guide for ProductFactoryOS.

## Role

epf-cli is the **normative authority** for EPF operations. It:

- **Validates** EPF YAML artifacts against JSON schemas
- **Discovers** EPF instances with confidence scoring
- **Guides** AI agents with structured instructions
- **Serves** MCP tools for programmatic operations
- **Migrates** legacy instances to modern structure
- **Exposes** product strategy to AI agents via Strategy Server

**Important:** epf-cli does NOT write content. It validates, discovers, and guides. AI agents write content, epf-cli validates it.

## Installation

### Homebrew (macOS / Linux)

```bash
brew tap emergent-company/tap
brew install epf-cli
```

To upgrade to the latest version:

```bash
brew upgrade epf-cli
```

### Download Binary

Pre-built binaries for macOS (arm64/amd64), Linux (arm64/amd64), and Windows (amd64) are available on the [GitHub Releases](https://github.com/emergent-company/emergent.strategy/releases) page.

### Build from Source

```bash
cd apps/epf-cli
go build -o epf-cli .
```

### Update Notifications

epf-cli automatically checks for new versions once every 24 hours. When a new version is available, a notice is printed to stderr:

```
  A new version of epf-cli is available: 0.12.6 → 0.13.0
  Update with: brew upgrade epf-cli
  Release: https://github.com/emergent-company/emergent.strategy/releases/tag/v0.13.0
  Disable: EPF_CLI_NO_UPDATE_CHECK=1 or set update_check: false in ~/.epf-cli/config.yaml
```

To disable update checks:

```bash
# Environment variable
export EPF_CLI_NO_UPDATE_CHECK=1

# Or in config file (~/.epf-cli/config.yaml)
update_check: false
```

### Self-Update (Standalone Installs)

If you installed via direct binary download (not Homebrew):

```bash
epf-cli update
```

This downloads the latest release, verifies the SHA256 checksum, and replaces the current binary. Homebrew users should use `brew upgrade epf-cli` instead.

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

# 5. Access product strategy (NEW in v0.16.0)
epf-cli strategy status ./epf
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

# AI-friendly validation output (includes product context, template warnings, semantic warnings)
epf-cli validate file.yaml --ai-friendly
```

**New in v0.14.0:** The `--ai-friendly` output now includes:

- **Product context** - Product name, description, and keywords from instance metadata
- **Template warnings** - Detects TBD, TODO, [INSERT...] placeholders
- **Semantic warnings** - Flags content that may not align with the product domain

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
# Start MCP server (49 tools available)
epf-cli serve

# Custom port
epf-cli serve --port 3200
```

### Product Strategy Server (v0.16.0)

The Strategy Server provides read-only access to EPF product strategy for AI agents. It exposes vision, personas, competitive positioning, and roadmap data through MCP tools.

```bash
# Check strategy store status
epf-cli strategy status ./epf

# JSON output for programmatic use
epf-cli strategy status ./epf --json

# Export strategy as markdown document
epf-cli strategy export ./epf

# Export to file
epf-cli strategy export ./epf --output strategy.md

# Start MCP server with strategy tools pre-loaded
epf-cli strategy serve ./epf

# With file watching for auto-reload
epf-cli strategy serve ./epf --watch
```

**Strategy MCP Tools:**

| Tool                               | Description                                    |
| ---------------------------------- | ---------------------------------------------- |
| `epf_get_product_vision`           | Get vision, mission, and north star            |
| `epf_get_personas`                 | List all personas with summaries               |
| `epf_get_persona_details`          | Get full persona details including pain points |
| `epf_get_value_propositions`       | Get value propositions, optionally by persona  |
| `epf_get_competitive_position`     | Get competitive analysis and positioning       |
| `epf_get_roadmap_summary`          | Get OKRs and key results, optionally by track  |
| `epf_search_strategy`              | Full-text search across all strategy artifacts |
| `epf_get_feature_strategy_context` | Get strategic context for a specific feature   |

**Use cases:**

- **Context-aware development**: Understand product vision before implementing features
- **User research**: Access persona details and pain points when designing UX
- **Competitive awareness**: Review positioning before feature design
- **Strategic alignment**: Verify work aligns with current OKRs

## Architecture

```
epf-cli/
├── cmd/                # Cobra commands
│   ├── root.go         # Root + schema dir auto-detection
│   ├── agent.go        # AI agent instructions
│   ├── locate.go       # EPF instance discovery
│   ├── health.go       # Comprehensive health check
│   ├── validate.go     # Schema validation
│   ├── strategy.go     # Strategy server commands
│   ├── migrate_anchor.go # Legacy migration
│   ├── serve.go        # MCP server
│   └── ...
├── internal/
│   ├── anchor/         # Anchor file management
│   ├── discovery/      # EPF instance discovery
│   ├── schema/         # Schema loading
│   ├── strategy/       # Strategy store (model, parser, search, watcher)
│   ├── mcp/            # MCP server (49 tools)
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
