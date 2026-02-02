# epf-cli

**The EPF Kernel** - Schema Validator and MCP Server for ProductFactoryOS.

## Role

epf-cli is the "Compiler Backend" of ProductFactoryOS. It:

- **Validates** EPF YAML artifacts against JSON schemas
- **Serves** schema definitions via MCP (Model Context Protocol)
- **Lints** content written by OpenCode or humans

**Important:** epf-cli does NOT write content. It only validates content. OpenCode is the writer, epf-cli is the linter.

## Installation

```bash
cd apps/epf-cli
go build -o epf-cli .
```

## Usage

### Validate EPF Files

```bash
# Validate all EPF files in a directory
epf-cli validate .

# Validate a specific file
epf-cli validate epf/strategy/north_star.yaml

# Validate against explicit schema
epf-cli validate --schema product.schema.json file.yaml
```

### Start MCP Server

```bash
# Start MCP server (default port 3100)
epf-cli serve

# Custom port
epf-cli serve --port 3200
```

## Architecture

```
epf-cli/
├── cmd/           # Cobra commands
│   ├── root.go    # Root command
│   ├── validate.go # Validation command
│   ├── serve.go   # MCP server command
│   └── version.go # Version command
├── internal/
│   ├── schema/    # Schema loading and validation
│   ├── mcp/       # MCP server implementation
│   └── validator/ # YAML validation logic
├── main.go
└── go.mod
```

## Related

- **product-factory-os**: The TUI that orchestrates epf-cli
- **EPF Canonical**: Schema definitions at `docs/EPF/`
