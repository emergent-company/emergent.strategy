# Emergent Strategy (formerly ProductFactoryOS)

**The Local-First Venture Compiler** - Developer Console and Build System for EPF.

## Vision

Emergent Strategy treats **Business Logic** (Strategy, Ops, Commercial) exactly like **Software Logic**. Both are defined in source code (.yaml), versioned in Git, and "compiled" into executable outputs.

## Core Philosophy

1. **Everything is Code:** Strategy is YAML. Process is Markdown. The Repo is the Database.
2. **One Universal Writer:** OpenCode writes _all_ files, assisted by epf-cli.
3. **Git is God:** Do not hide state in a database.

## Installation

```bash
cd apps/emergent-strategy
go build -o emergent-strategy .
```

## Usage

### Mode A: Vibe Coding (VS Code + Copilot)

Just use VS Code with Copilot. epf-cli provides schema autocomplete.

### Mode B: Agent Coding (TUI + OpenCode)

```bash
# Launch the interactive TUI
emergent-strategy tui
```

### Mode C: Visual Editing (Web Dashboard)

```bash
# Start the web server
emergent-strategy server --port 8080
```

### Build Artifacts

```bash
# Build all tracks
emergent-strategy build all

# Build specific track
emergent-strategy build strategy
emergent-strategy build ops --output ./dist
```

## The 4-Track Production Line

| Track      | Input (Source)       | Output (Artifact)   | Runtime            |
| ---------- | -------------------- | ------------------- | ------------------ |
| Strategy   | epf/strategy/\*.yaml | decisions.md        | Linear / Dashboard |
| Product    | epf/product/\*.yaml  | main.go, Dockerfile | Cloud (AWS)        |
| Org/Ops    | epf/ops/\*.yaml      | process.json        | ClickUp / ERP      |
| Commercial | epf/growth/\*.yaml   | campaign.csv        | HubSpot / CRM      |

## Architecture

```
emergent-strategy/
├── cmd/           # Cobra commands
│   ├── root.go    # Root command
│   ├── tui.go     # TUI command (BubbleTea)
│   ├── server.go  # Web server (HTMX + Templ)
│   ├── build.go   # Build command
│   └── version.go # Version command
├── internal/
│   ├── tui/       # BubbleTea TUI components
│   ├── web/       # HTMX + Templ web components
│   ├── build/     # Build/compile logic
│   └── council/   # Quality Council (MoE)
├── main.go
└── go.mod
```

## Related

- **epf-cli**: The schema validator/linter (Kernel)
- **EPF Instance**: `docs/EPF/_instances/emergent/`
- **Emergent.Core**: AI Knowledge Agent (MCP integration)
