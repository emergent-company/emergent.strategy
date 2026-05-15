# Project Constitution

A coding standard for Go projects in the emergent-strategy monorepo.
Adapted from the organisational Go microservice constitution.

This repo contains two Go applications:

- **`apps/epf-cli/`** — CLI tool (cobra, no database, MCP server)
- **`apps/strategy-server/`** — Backend server (go-arg, PostgreSQL/bun, MCP + HTTP)

The `strategy-server` follows the full `go-microservice` skill conventions
(PostgreSQL, bun, huma, go-arg, goose, etc.). See its own `AGENTS.md` for
app-specific rules. This constitution covers the shared principles and the
epf-cli-specific conventions. Where a section says "this project", it means
whichever app you are currently working in.

---

## 1. Core Philosophy

**Boring is good.** Choose proven, well-understood patterns. Prefer a single
clear file over an elegant abstraction. Add complexity only when you have
concrete evidence it is needed — performance data, scale requirements, or
multiple proven use cases.

**Correctness first.** A slow correct system can be optimized. A fast
incorrect system is a liability.

**Boundaries matter.** Domain logic must not depend on infrastructure.
Infrastructure must not leak into domain. Enforce this by package layout,
not willpower.

**Schema first.** The JSON schemas in `docs/EPF/schemas/` are the source of
truth. The CLI validates against them — it never invents its own rules.

**Agent as writer, tool as linter.** `epf-cli` never writes EPF content.
It only validates, analyses, and provides tooling. AI agents write content;
the CLI validates it.

---

## 2. Tech Stack

### Core
| Concern | Library | Notes |
|---|---|---|
| Language | Go (latest stable) | Standard formatting, no generics unless clear win |
| CLI | `spf13/cobra` | Subcommand-based CLI framework |
| YAML | `gopkg.in/yaml.v3` | Parsing EPF artifacts |
| JSON Schema | `santhosh-tekuri/jsonschema/v5` | Validation engine |
| MCP Server | `mark3labs/mcp-go` | AI agent tool integration |
| TUI | `charm.land/bubbletea/v2` + `charm.land/lipgloss/v2` | Interactive terminal UI |
| LSP | `tliron/glsp` | Language Server Protocol for editor integration |
| UUIDs | `google/uuid` | Instance and artifact IDs |
| Logging | `log/slog` | JSON to stderr in production; text in dev |
| Concurrency | `golang.org/x/sync` | Errgroup for parallel operations |
| File watching | `fsnotify/fsnotify` | Instance auto-reload |

### Tooling
| Tool | Purpose |
|---|---|
| `make` | Build, test, sync-embedded, release (see Makefile) |
| `golangci-lint` | Linting (errcheck, staticcheck, nilerr, gocyclo, etc.) |
| Docker | Container builds for Cloud Run deployment |
| OpenSpec | Spec-driven development for non-trivial changes |

---

## 3. Directory Layout

```
apps/epf-cli/
├── main.go                  # Entry point
├── cmd/                     # Cobra commands (one file per command)
│   ├── root.go              # Root command + schema dir auto-detection
│   ├── serve.go             # MCP server
│   ├── lsp.go               # LSP server
│   ├── validate.go          # Schema validation
│   ├── health.go            # Health checks
│   └── *.go                 # Other commands
├── internal/
│   ├── agent/               # Agent loader, recommender, types
│   ├── skill/               # Skill loader, scaffold, validator
│   ├── wizard/              # Legacy wizard loader
│   ├── generator/           # Legacy generator loader
│   ├── schema/              # Schema loading + artifact type detection
│   ├── validator/           # YAML validation using jsonschema
│   ├── mcp/                 # MCP server and tool handlers
│   ├── lsp/                 # LSP server for editor integration
│   ├── checks/              # Health check implementations
│   ├── strategy/            # Strategy store (query tools)
│   ├── navigation/          # Navigation graph types, loader, validator, runner
│   ├── decompose/           # YAML → graph objects
│   ├── memory/              # emergent.memory REST API client
│   ├── ingest/              # Ingestion pipeline + incremental sync
│   ├── reasoning/           # Tiered LLM reasoning
│   ├── propagation/         # Propagation circuit
│   ├── scenario/            # What-if exploration via graph branching
│   ├── embedded/            # Embedded canonical EPF artifacts
│   ├── config/              # Server configuration
│   └── version/             # Build version info
├── tests/
│   └── integration_test.go  # Integration tests with real EPF files
├── scripts/                 # Build and sync scripts
├── Makefile                 # Build, test, deploy targets
├── Dockerfile               # Multi-stage container build
├── go.mod
└── VERSION                  # Release version (bumped manually)
```

### Package rules
- `internal/<capability>/` — each package has a single responsibility.
- No circular dependencies between internal packages.
- Cross-package imports flow inward: `cmd → internal/*`, `mcp → schema/validator/checks/strategy`.
- The `embedded/` package contains artifacts synced from canonical EPF — never edit these manually.

---

## 4. Architecture Patterns

### CLI Architecture (three layers)
```
CLI commands (cmd/)
    → internal packages (business logic)
    → embedded artifacts (schemas, templates, wizards)
```

### MCP Server Architecture
```
MCP Request (stdin/stdout or HTTP/SSE)
    → internal/mcp/server.go (decode, route to handler)
    → internal/<capability>/ (business logic)
    → response (JSON)
```

### Schema-driven validation
- JSON schemas in `docs/EPF/schemas/` are the source of truth.
- Schemas are synced to `internal/embedded/schemas/` at build time.
- The `schema/` package loads schemas; the `validator/` package compiles and validates.
- Artifact types are detected from filename patterns (not file content).

### Embedded artifacts pattern
- Canonical EPF artifacts (schemas, templates, wizards, generators) are embedded in the binary.
- `scripts/sync-embedded.sh` copies from canonical-epf repo to `internal/embedded/`.
- `//go:embed` makes them available at runtime without external dependencies.
- The binary is fully self-contained.

---

## 5. Code Style

### Go formatting
- Always `gofmt` / `goimports`. No exceptions.
- All public types and functions have doc comments.
- Error handling follows Go idioms — check every error, no silent ignores.
- No panics in library code. Panics only in `main()` for unrecoverable startup failures.

### Naming
- Packages: lowercase, single word. Avoid `util`, `common`, `helpers`.
- Types: noun phrases (`SchemaLoader`, `WizardInfo`).
- Functions: verb phrases (`LoadSchemas`, `ValidateFile`).
- Error vars: `ErrXxx` prefix, defined at package level.
- Constants: `SCREAMING_SNAKE_CASE` for enums; `CamelCase` for typed constants.

### Struct field ordering
1. Primary key (ID)
2. Foreign keys / references
3. Enum/status fields
4. Business data fields
5. Timestamps

### Logging
Use `slog` throughout. Log at the point of failure with structured key/value pairs.

```go
slog.Error("failed to load schema", "file", filename, "err", err)
slog.Info("schema loaded", "count", len(schemas))
```

Never log passwords, tokens, or PII.

---

## 6. Error Handling

### Pattern
- Functions return `error` (or a typed error when the caller needs to distinguish cases).
- Wrap errors with `fmt.Errorf("context: %w", err)` to preserve the chain.
- Never return `nil` when you have a non-nil error — this is the `nilerr` anti-pattern.
- CLI commands print errors to stderr and return a non-zero exit code.
- MCP tool handlers return structured error responses, never raw Go errors.

### The nilerr pattern (most common bug)

```go
// Wrong — error is checked but then nil is returned:
schema, err := loader.LoadSchema(path)
if err != nil {
    return nil  // silent failure!
}

// Correct — return the error:
schema, err := loader.LoadSchema(path)
if err != nil {
    return fmt.Errorf("load schema %s: %w", path, err)
}
```

---

## 7. Testing Strategy

### Layer priorities
1. **Unit tests** — table-driven, test individual functions and types.
2. **Integration tests** — test against real EPF files in `tests/`.
3. **MCP tool tests** — validate tool request/response contracts.

### Test isolation
- Each test is independent — no shared mutable state.
- Tests use embedded test fixtures or `testdata/` directories.
- Parallel tests are safe.

### Table-driven tests
```go
func TestDetectArtifactType(t *testing.T) {
    tests := []struct {
        name     string
        filename string
        want     ArtifactType
    }{
        {name: "north star", filename: "00_north_star.yaml", want: NorthStar},
        {name: "feature def", filename: "fd-001.yaml", want: FeatureDefinition},
    }
    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {
            got := DetectArtifactType(tt.filename)
            if got != tt.want {
                t.Errorf("want %v, got %v", tt.want, got)
            }
        })
    }
}
```

### Test timeouts
A test that hangs for more than 30 seconds is a bug, not a slow test.
Investigate the cause (missing mock, real network call, blocking channel).
Do not raise the timeout as a fix. Either mock the dependency or add
`t.Skip()` with a clear reason.

---

## 8. Build & Dev Workflow

### Makefile targets (standard)
```
make build          # Sync embedded + build binary
make build-quick    # Build without syncing embedded
make test           # Run all tests
make test-coverage  # Tests with coverage report
make clean          # Remove build artifacts
make sync-embedded  # Copy canonical EPF to internal/embedded/
make install        # Install to GOPATH/bin
make docker-build   # Build Docker image
make deploy-manual  # Deploy to Cloud Run
```

### Version management
- Version is read from the `VERSION` file.
- Build flags inject version, git commit, and build date into `internal/version`.
- Bump `VERSION`, commit, then `git tag v$(cat VERSION) && git push --tags`.
- Production releases use GoReleaser CI (not the Makefile).

---

## 9. Linting

Lint is a CI gate, not a suggestion. `golangci-lint run ./...` must pass on
every commit that enters `main`.

### Why each linter is enabled

| Linter | Category | Why it matters |
|---|---|---|
| `nilerr` | **Real bug** | Function checks an error, then returns `nil` instead. Silent failure mode. |
| `errcheck` | **Real bug** | Return values of `Close()`, `Exec()`, etc. discarded without `_`. |
| `govet` | **Real bug** | Catches misuse of `sync.Mutex` by value, `printf` format mismatches. |
| `staticcheck` | **Real bug + style** | Broad static analysis. `SA` class are real bugs; `S`/`QF` are style. |
| `unused` | **Hygiene** | Dead code. Functions, types, variables defined but never used. |
| `ineffassign` | **Hygiene** | Variable assigned a value that is immediately overwritten or never read. |
| `misspell` | **Hygiene** | Typos in comments and strings. |
| `gofmt` | **Hygiene** | Formatting. Run `gofmt -w .` to fix. |
| `gocyclo` | **Advisory** | Cyclomatic complexity. High threshold (≥ 40) — advisory only. |
| `gocognit` | **Advisory** | Cognitive complexity. High threshold (≥ 60) — advisory only. |
| `bodyclose` | **Real bug** | HTTP response body not closed. Memory and connection leak. |

### CI blocking categories (zero tolerance)
- `nilerr`, `errcheck`, `govet`, `gofmt`, `unused`, `bodyclose`

### Advisory categories (tracked, not blocking)
- `gocognit`, `gocyclo`, `staticcheck` S/QF classes, `ineffassign`, `misspell`

### Handling the initial debt
1. Fix `gofmt` immediately — `gofmt -w .` is zero-effort.
2. Fix `nilerr` next — these are real bugs.
3. Fix `errcheck` in non-test code.
4. Fix `unused` — delete dead code. Do not comment it out.
5. Add `//nolint:gocognit` to legitimately complex functions with an explanation.

---

## 10. Spec-Driven Development (OpenSpec)

Use OpenSpec for any non-trivial change. Threshold: new capability, breaking
change, or multi-package change.

### When to write a proposal
- New feature or capability
- Breaking API or schema change
- Architecture shift
- Changes touching 3+ packages

### When to skip a proposal
- Bug fix restoring intended behavior
- Typos, formatting, comments
- Dependency version bump (non-breaking)
- Tests for existing behavior

---

## 11. Deployment (Google Cloud Run)

### Target architecture
- Stateless binary deployed to Cloud Run.
- MCP server exposed via HTTP/SSE transport.
- No persistent local state — Cloud Run instances are ephemeral.

### Health check
Every deployment exposes `GET /health` returning `{"status":"healthy","service":"epf-strategy"}`.

---

## Non-Negotiables (never compromise these)

- No business logic in CLI command handlers — commands parse args and call internal packages.
- No infrastructure imports in domain packages.
- No hardcoded credentials or URLs — always env vars.
- No raw Go errors returned to MCP clients — use structured error responses.
- No panics in library code.
- All public APIs must be documented.
- `nilerr` findings are zero-tolerance — a function that checks an error and then returns `nil` is a silent bug.
- `golangci-lint run ./...` must pass on `main`. New code must not add new lint findings in the blocking categories.
- Embedded artifacts are never edited manually — always synced from canonical EPF.
- Schema changes go in canonical-epf, not in this repo.
