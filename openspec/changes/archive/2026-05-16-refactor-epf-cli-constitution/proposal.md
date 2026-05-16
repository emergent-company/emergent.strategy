# Change: Refactor epf-cli to align with CONSTITUTION.md

## Why

`CONSTITUTION.md` is the portable coding standard for all Go projects in the Emergent organisation.
`epf-cli` pre-dates the constitution and diverges from it in areas that now matter more than ever:
the next major project is adding an **HTMX + templ web frontend** to epf-cli, turning it into a
full-stack Go server (REST API + MCP + HTMX web UI). The constitution's HTTP stack
(Echo v4 + huma) and clean architecture (thin handlers → domain services → infrastructure) are
the exact patterns needed for that frontend. Aligning now makes the frontend addition
straightforward; not aligning first means building the frontend on a different foundation than the
constitution specifies, incurring a larger refactor later.

## Strategic Context

epf-cli will serve three surfaces from a single Go binary:

| Surface | Transport | Pattern |
|---|---|---|
| MCP tools | stdio + HTTP/SSE | Existing `mcp-go` server (unchanged) |
| REST API | HTTP JSON | Echo v4 + huma v2 (new) |
| HTMX web UI | HTTP HTML | Echo v4 + templ (new) |

The current transport layer (`internal/transport/http.go`, stdlib `net/http`) handles MCP only.
This refactor replaces it with Echo as the single HTTP router, mounting the MCP transport as one
route group alongside future REST and HTMX route groups.

## What the Constitution Means for a CLI + Server Tool

The CONSTITUTION was written for a pure HTTP-API-server archetype. epf-cli adds a CLI surface.
Adaptations are documented below and in `openspec/project.md`.

| Constitution rule | Applicability |
|---|---|
| Echo v4 + huma v2 | **Applicable** — required for REST + HTMX |
| `go-arg` — no cobra | **Adapted** — cobra retained for CLI; go-arg used for Config struct only |
| `cmd_*.go` at root | **Adapted** — `cmd/` subdirectory retained (coupled to cobra) |
| `pkg/apperror/` typed errors | **Applicable** — needed for REST API error responses |
| `log/slog` | **Applicable** |
| `golangci-lint` + `.golangci.yaml` | **Applicable** |
| `Taskfile.yml` | **Applicable** |
| `gofmt` enforced | **Applicable** |
| No `util`/`common`/`helpers` names | **Applicable** |
| Thin handlers, logic in domain packages | **Applicable** |
| `database.TestDB(t)` | **Not applicable** — no database |
| `shopspring/decimal` / `google/uuid` | **Not applicable** — no financial data |

## What Changes

### 1. HTTP layer: stdlib net/http → Echo v4 + huma v2

Replace `internal/transport/http.go` (stdlib `net/http` + `http.ServeMux`) with Echo v4 as the
single HTTP router. Mount the existing MCP streamable HTTP transport at `/mcp` as an Echo route.
Register huma for future REST API routes.

This is the highest-priority change because every future REST and HTMX handler will be written
against Echo + huma. Doing this first means the MCP route + health endpoint prove the Echo wiring
before any new routes are added.

**What changes:**
- `internal/transport/http.go` refactored: Echo replaces `http.ServeMux`
- `HTTPServerConfig` adapted to Echo's `echo.Echo` instance
- MCP streamable HTTP handler mounted at `/mcp` via `echo.Any`
- Auth middleware adapted to `echo.MiddlewareFunc`
- CORS middleware switches from hand-rolled to `echo.Use(middleware.CORS(...))`
- Health endpoint becomes `huma.Register(api, ...)` returning `HealthResponse`

**What does not change:**
- MCP stdio transport (unaffected)
- All MCP tool implementations in `internal/mcp/`
- Auth logic in `internal/auth/`
- All cmd/ command implementations

### 2. Error handling: add pkg/apperror/

Add `pkg/apperror/apperror.go` with the constitution's typed `AppError` sentinel pattern and
numeric error code ranges. Add `toHumaError(err)` converter. This is required before writing
any REST API handler.

Error code ranges (initial allocation):
- `100xxx` — generic (not found, bad request, forbidden, unauthorized)
- `110xxx` — EPF instance
- `111xxx` — EPF validation
- `112xxx` — strategy query
- `113xxx` — workspace / auth

### 3. CLI framework: cobra retained, go-arg for Config struct

Cobra is retained for CLI dispatch (42 commands; go-arg cannot match cobra's ergonomics at this
scale — see design.md). `go-arg` is added to `go.mod` and used only for the runtime `Config`
struct, replacing the 20+ scattered `os.Getenv()` calls in `cmd/serve.go`.

```go
// config/config.go
type Config struct {
    GithubOwner       string `arg:"env:EPF_GITHUB_OWNER"`
    GithubRepo        string `arg:"env:EPF_GITHUB_REPO"`
    OAuthClientID     string `arg:"env:EPF_OAUTH_CLIENT_ID"`
    OAuthClientSecret string `arg:"env:EPF_OAUTH_CLIENT_SECRET"`
    SessionSecret     string `arg:"env:EPF_SESSION_SECRET"`
    ServerMode        string `arg:"env:EPF_SERVER_MODE" default:"local"`
    ServerPort        int    `arg:"env:EPF_SERVER_PORT" default:"8080"`
    LogLevel          string `arg:"env:EPF_LOG_LEVEL" default:"INFO"`
    // ... all current os.Getenv calls
}
```

### 4. Task runner: Makefile → Taskfile.yml

Replace `Makefile` with `Taskfile.yml`. Standard constitution tasks: `build`, `format`, `lint`,
`test`, `test-verbose`, `clean`. Project-specific tasks: `sync-embedded`, `docker-build`,
`docker-push-gcp`, `deploy-manual`, `deploy-check`.

### 5. Linting: add .golangci.yaml and enforce

Add `.golangci.yaml` with the constitution's linter set. Fix all blocking findings before
enabling as a CI gate.

### 6. Logging: stdlib log → slog

Replace stdlib `log` in 9 `internal/` packages with `log/slog`. Leave `tliron/commonlog` in
`internal/lsp/` (required by the glsp framework). Leave `fmt.Fprintf` in `cmd/` (intentional
user-facing CLI output).

### 7. Business logic extraction from fat cmd/ files

Extract business logic from `cmd/health.go` (2,162 lines) and `cmd/validate.go` (1,593 lines)
into `internal/` packages. `cmd/` files become thin adapters. This is required before adding
the REST API: the REST handlers and CLI handlers must share the same `internal/` logic.

### 8. Package naming

Rename `internal/pathutil` → `internal/epfpath`. Clarify `internal/validation` vs
`internal/validator` boundary.

### 9. Update project.md with constitution exceptions

Document cobra exception, `cmd/` exception, and non-applicable patterns.

## Impact

- **Affected code:** `apps/epf-cli/` — primarily `internal/transport/`, `cmd/serve.go`, new `config/`, new `pkg/apperror/`
- **Not affected:** `packages/opencode-epf/`, `docs/EPF/`, `openspec/`
- **External behavior:** No change to MCP tool signatures, CLI commands, or existing HTTP endpoints
- **Breaking changes (internal):** Transport layer rewrite; `internal/pathutil` import paths change
- **Enables:** HTMX frontend proposal (separate change) — this refactor is its prerequisite
