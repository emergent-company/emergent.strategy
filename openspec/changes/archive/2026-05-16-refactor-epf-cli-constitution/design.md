# Design: epf-cli Constitution Alignment

## Context

epf-cli is a standalone Go CLI tool and MCP server. The next major project adds an HTMX + templ
web frontend to it. This refactor aligns epf-cli with `CONSTITUTION.md` in preparation for that
frontend — specifically introducing Echo v4 + huma as the HTTP layer, which the frontend will
be built on top of.

## Goals / Non-Goals

**Goals:**
- Replace stdlib `net/http` transport with Echo v4 + huma as the HTTP foundation
- Add `pkg/apperror/` pattern required for REST API error handling
- Apply all applicable constitution rules (lint, formatting, slog, Taskfile, config struct)
- Extract business logic from fat `cmd/` files so REST handlers and CLI handlers share it
- Leave every external behavior unchanged (MCP tools, CLI commands, endpoint contracts)

**Non-Goals:**
- Implement any HTMX frontend (separate proposal)
- Implement any REST API endpoints beyond health (separate proposal)
- Full cobra → go-arg migration (see Decision 1 below)
- Introduce database, PostgreSQL, migrations, or bun

## Decisions

### Decision 1: Retain cobra for CLI dispatch

**What:** Keep `github.com/spf13/cobra`. Do not migrate command dispatch to `go-arg`.

**Why:** `go-arg` is designed for simple struct dispatch (2–5 subcommands). epf-cli has 42
top-level commands and deeply nested subcommand trees (`skills` has 9 subcommands, `aim` has ~10,
`config` has 6, etc.). Cobra features with no go-arg equivalent:
- `PersistentPreRun` hooks (update check, canonical write protection applied across all commands)
- Shell completion generation (`__complete`, `completion bash/zsh/fish/ps1`)
- Per-command `Short`/`Long` help fields rendered as formatted man-page-style help
- `PersistentFlags()` inheritance down subcommand trees

Migrating is XLARGE scope with no user-visible benefit and meaningful ergonomic regression (no
shell completion, no per-subcommand `--help` flags). Document as a constitution exception.

**Alternative considered:** Migrate only the top-level command and use go-arg within each
subcommand for flag parsing. Rejected — adds complexity with no benefit since cobra already
handles flags well.

### Decision 2: go-arg for Config struct only

**What:** Add `github.com/alexflint/go-arg` to `go.mod` and use it for a single `config.Config`
struct that replaces all `os.Getenv()` calls in the server path.

**Why:** The constitution's primary value from go-arg is env-var binding built-in to the struct
(no scattered `os.Getenv()` calls, documented defaults, type-safe). We get this benefit without
replacing cobra. The config struct is parsed once at server startup via `arg.MustParse(&cfg)`
and threaded through as a value.

**Implementation:**
```go
// config/config.go
package config

import (
    "github.com/alexflint/go-arg"
)

// Config holds all runtime configuration for the EPF server.
// Values are bound from environment variables automatically.
type Config struct {
    // GitHub source configuration
    GithubOwner   string `arg:"env:EPF_GITHUB_OWNER"   help:"GitHub owner for single-tenant mode"`
    GithubRepo    string `arg:"env:EPF_GITHUB_REPO"    help:"GitHub repo for single-tenant mode"`
    GithubRef     string `arg:"env:EPF_GITHUB_REF"     help:"branch/tag/SHA (default: repo default)"`
    GithubBasePath string `arg:"env:EPF_GITHUB_BASE_PATH" help:"path within repo"`

    // Auth configuration
    OAuthClientID     string `arg:"env:EPF_OAUTH_CLIENT_ID"`
    OAuthClientSecret string `arg:"env:EPF_OAUTH_CLIENT_SECRET"`
    SessionSecret     string `arg:"env:EPF_SESSION_SECRET"`
    SessionTTL        string `arg:"env:EPF_SESSION_TTL"     default:"24h"`

    // Server configuration
    ServerURL  string `arg:"env:EPF_SERVER_URL"  help:"external base URL for OAuth metadata"`
    ServerMode string `arg:"env:EPF_SERVER_MODE" default:"local" help:"local|strategy|multi-tenant"`
    ServerPort int    `arg:"env:EPF_SERVER_PORT" default:"8080"`
    LogLevel   string `arg:"env:EPF_LOG_LEVEL"   default:"INFO"`

    // Strategy instance
    StrategyInstance string `arg:"env:EPF_STRATEGY_INSTANCE"`
    StrategyWatch    bool   `arg:"env:EPF_STRATEGY_WATCH"`
    InstanceName     string `arg:"env:EPF_INSTANCE_NAME"`

    // GitHub App (multi-tenant)
    GithubAppID          int64  `arg:"env:EPF_GITHUB_APP_ID"`
    GithubAppPrivateKey  string `arg:"env:EPF_GITHUB_APP_PRIVATE_KEY"`
    GithubAppClientID    string `arg:"env:EPF_GITHUB_APP_CLIENT_ID"`
    GithubAppClientSecret string `arg:"env:EPF_GITHUB_APP_CLIENT_SECRET"`
}

// Load parses config from environment variables.
// Exits with an error message on missing required fields.
func Load() Config {
    var cfg Config
    arg.MustParse(&cfg)
    return cfg
}
```

### Decision 3: Echo v4 + huma v2 replaces stdlib net/http transport

**What:** Replace `internal/transport/http.go` (stdlib `net/http.ServeMux`) with Echo v4.
Mount the existing MCP streamable HTTP transport and all future REST/HTMX handlers on Echo.

**Why:**
1. The constitution mandates Echo + huma for HTTP services
2. HTMX handlers will be registered via Echo — they must share the same router as MCP
3. huma provides automatic OpenAPI 3.1 generation for REST endpoints — required for the REST API
4. Echo's middleware ecosystem (CORS, timeout, recover, logger) replaces hand-rolled equivalents
5. One router, three surfaces (MCP, REST, HTMX): cleaner than running multiple servers

**Architecture after refactor:**
```
cmd/serve.go
    └─ starts Echo instance
    └─ mounts MCP transport: e.Any("/mcp", echo.WrapHandler(streamable))
    └─ mounts huma API at /api (REST endpoints registered here)
    └─ mounts HTMX routes at / (future — separate proposal)
    └─ echo.Use: CORS, Recover, Logger, Auth middleware
```

**MCP transport mounting:**
```go
// MCP streamable HTTP transport mounted on Echo via WrapHandler
streamable := server.NewStreamableHTTPServer(mcpServer)
e.Any("/mcp", echo.WrapHandler(streamable))

// SSE legacy (optional)
if cfg.EnableSSE {
    sseServer := server.NewSSEServer(mcpServer, ...)
    e.Any("/sse", echo.WrapHandler(sseServer.SSEHandler()))
    e.Any("/message", echo.WrapHandler(sseServer.MessageHandler()))
}
```

**Health endpoint via huma:**
```go
huma.Register(api, huma.Operation{
    OperationID: "health-check",
    Method:      http.MethodGet,
    Path:        "/health",
    Summary:     "Server health check",
    Tags:        []string{"System"},
}, func(ctx context.Context, input *struct{}) (*HealthOutput, error) {
    return &HealthOutput{Body: buildHealthResponse()}, nil
})
```

**Alternative considered:** Run a second Echo server alongside the existing stdlib server. Rejected
— two routers means the HTMX and REST handlers cannot share auth middleware with MCP easily, and
it doubles the server management code.

### Decision 4: pkg/apperror/ added before any REST handler

**What:** Add `pkg/apperror/apperror.go` with typed `AppError` sentinels and `toHumaError(err)`.

**Why:** The constitution requires this before the first REST endpoint. Every REST handler
returns domain errors via `toHumaError(err)`. Without it, error handling is ad-hoc across
handlers. The pattern also gives the REST API consistent error response bodies and numeric codes
that clients can program against.

**Error code allocation:**
```
100001 - not found (generic)
100002 - bad request (generic)
100003 - forbidden
100004 - unauthorized
110001 - EPF instance not found
110002 - EPF instance invalid structure
111001 - validation error (schema)
111002 - validation error (content)
112001 - strategy query error
112002 - strategy not loaded
113001 - workspace not found
113002 - auth session expired
```

### Decision 5: Business logic extraction from cmd/ before REST API

**What:** Extract orchestration logic from `cmd/health.go` (2,162 lines) and `cmd/validate.go`
(1,593 lines) into `internal/` packages before implementing any REST endpoints.

**Why:** The REST API will expose the same operations as the CLI (`GET /api/health`,
`POST /api/validate`, etc.). If the business logic lives in `cmd/`, the REST handlers cannot
call it without importing `cmd/` (circular) or duplicating it (wrong). Extracting first means
both CLI and REST handlers call the same `internal/` functions.

**Target package structure:**
```
internal/
  checks/      — health check implementations (already exists, needs filling)
  validation/  — validation orchestration (extract from cmd/validate.go)
```

### Decision 6: slog — partial adoption

**What:** Replace stdlib `log` in 9 `internal/` packages with `log/slog`. Do not replace
`tliron/commonlog` in `internal/lsp/` (required by glsp). Do not replace `fmt.Fprintf` in
`cmd/` (correct user-facing CLI output).

**Why:** slog is the constitution's logging standard. The 9 stdlib `log` usages are internal
operational logging that should be structured. In server mode, configure the JSON slog handler;
in CLI mode, use the text handler.

```go
// main.go — configure slog based on mode
if serveMode {
    slog.SetDefault(slog.New(slog.NewJSONHandler(os.Stderr, &slog.HandlerOptions{
        Level: parseLogLevel(cfg.LogLevel),
    })))
} else {
    slog.SetDefault(slog.New(slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{
        Level: slog.LevelWarn, // CLI: only warnings and errors
    })))
}
```

## Risks / Trade-offs

| Risk | Mitigation |
|---|---|
| Echo wrapping of mcp-go's http.Handler breaks MCP protocol | Test with real MCP client (Claude Desktop) before merging |
| Lint reveals many blocking findings (2,162-line health.go) | Audit first; use `//nolint:gocognit // inherently complex domain function` with reason |
| Business logic extraction breaks health/validate CLI behavior | Run full `epf-cli health` and `epf-cli validate` end-to-end tests after each extraction step |
| Config struct missing an env var | Compile exhaustive grep of `os.Getenv` before writing struct |
| Echo v4 CORS behaviour differs from hand-rolled | Side-by-side test the MCP client against both before switching |

## Migration Plan

Execute in this order to keep the server functional at every step:

1. **Taskfile + lint + format** — zero functional risk; CI improvements only
2. **slog adoption** — internal-only; no external behavior change
3. **config/Config struct** — replaces scattered os.Getenv; test by running `epf-cli serve`
4. **pkg/apperror/** — additive; no existing code uses it yet
5. **Business logic extraction** from cmd/health.go and cmd/validate.go — with tests at each step
6. **Echo transport** — last and highest risk; run MCP integration test before and after
7. **Package rename** (pathutil) — mechanical; update all imports

## Open Questions

- Should the old `Makefile` be kept as a thin shim (`make build` → `task build`) for contributors who don't have `task` installed?
- After business logic extraction, should `internal/validation` and `internal/validator` merge into one package?
- Should the health endpoint move from `/health` to `/api/health` under huma, or stay at `/health` to match Cloud Run expectations?
