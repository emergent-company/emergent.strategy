## ADDED Requirements

### Requirement: Taskfile Task Runner
The epf-cli project SHALL use `go-task/task` with a `Taskfile.yml` as its primary task runner,
providing standard constitution tasks (`build`, `format`, `lint`, `test`, `test-verbose`, `clean`)
and project-specific tasks (`sync-embedded`, `docker-build`, `docker-push-gcp`, `deploy-manual`,
`deploy-check`).

#### Scenario: Standard tasks exist and run
- **WHEN** a developer runs `task build`
- **THEN** the binary is compiled and the version is printed

#### Scenario: Format task enforces gofmt
- **WHEN** a developer runs `task format`
- **THEN** `gofmt -w .` and `goimports -w .` are executed across the module

#### Scenario: Lint task passes clean
- **WHEN** a developer runs `task lint`
- **THEN** `golangci-lint run ./...` exits 0 with no blocking findings

### Requirement: Golangci-lint Configuration
The epf-cli project SHALL have a `.golangci.yaml` enabling the constitution's linter set.
Blocking linters (`nilerr`, `errcheck`, `govet`, `gofmt`, `unused`, `bodyclose`) SHALL produce
zero findings. Advisory linters (`gocognit` min 60, `gocyclo` min 40) SHALL NOT block CI.

#### Scenario: Blocking linters pass
- **WHEN** `golangci-lint run ./...` is executed
- **THEN** no findings are reported for `nilerr`, `errcheck`, `govet`, `gofmt`, `unused`, or `bodyclose`

#### Scenario: Advisory linters have high thresholds
- **WHEN** `.golangci.yaml` is read
- **THEN** `gocyclo` min-complexity is ≥40 and `gocognit` min-complexity is ≥60

### Requirement: Structured Logging with slog
All internal operational logging in `internal/` packages SHALL use `log/slog` with structured
key/value pairs. Stdlib `log` SHALL NOT be imported in new code. The LSP package MAY continue
to use `tliron/commonlog` as required by the `glsp` framework. User-facing CLI output in `cmd/`
packages SHALL continue to use `fmt.Fprintf` as intentional human-readable output. In server
mode the JSON slog handler SHALL be used; in CLI mode the text handler SHALL be used.

#### Scenario: Internal packages use slog
- **WHEN** any file in `internal/` (except `internal/lsp/`) imports `"log"`
- **THEN** the import is replaced with `log/slog` and log calls use structured key/value pairs

#### Scenario: slog handler is mode-aware
- **WHEN** the server starts with `--http` flag
- **THEN** slog outputs JSON to stderr
- **WHEN** the server starts without `--http` (CLI or stdio MCP mode)
- **THEN** slog outputs human-readable text to stderr

### Requirement: Centralised Runtime Config
All runtime configuration for the MCP server (`cmd/serve.go`) SHALL be defined in a single
`config.Config` struct in `config/config.go` using `github.com/alexflint/go-arg` struct tags
for environment-variable binding. No `os.Getenv()` calls SHALL appear in `cmd/serve.go` or
the transport layer outside of `config/config.go`.

#### Scenario: Config loads from env vars
- **WHEN** `EPF_SERVER_PORT=9090` is set and `epf-cli serve --http` is run
- **THEN** the server listens on port 9090 without any `os.Getenv` call in `cmd/serve.go`

#### Scenario: Config struct is the single documentation source
- **WHEN** a developer reads `config/config.go`
- **THEN** all supported environment variables, their types, and their defaults are visible

### Requirement: Echo v4 + huma v2 HTTP Transport
The HTTP server layer SHALL use Echo v4 as the single HTTP router for all three surfaces
(MCP transport, REST API, HTMX web UI). huma v2 SHALL be registered on Echo for REST
operations. The MCP streamable HTTP transport and SSE transports SHALL be mounted on Echo
via `echo.WrapHandler`. The stdlib `net/http.ServeMux` in `internal/transport/http.go`
SHALL be replaced.

#### Scenario: MCP transport mounts on Echo
- **WHEN** `epf-cli serve --http` starts
- **THEN** `POST /mcp` responds with a valid MCP protocol response
- **AND** the request is handled through Echo's middleware chain (CORS, auth)

#### Scenario: Health endpoint registered via huma
- **WHEN** `GET /health` is called
- **THEN** a JSON response with `{"status":"ok", ...}` is returned
- **AND** the endpoint appears in the auto-generated OpenAPI spec

#### Scenario: Echo CORS middleware replaces hand-rolled CORS
- **WHEN** an OPTIONS preflight request is sent to `/mcp` with `Origin: https://example.com`
- **AND** `https://example.com` is in the allowed origins list
- **THEN** `Access-Control-Allow-Origin: https://example.com` is set in the response

#### Scenario: Echo server timeouts are set
- **WHEN** the Echo HTTP server is started
- **THEN** ReadTimeout is 15s, WriteTimeout is 180s, IdleTimeout is 120s

### Requirement: Typed HTTP Error Package
A `pkg/apperror/` package SHALL exist with typed `AppError` sentinels, numeric error codes
namespaced by domain, and a `toHumaError(err)` converter for use in REST handlers. Domain
services SHALL return `*apperror.AppError` for expected failures. Raw Go errors SHALL NOT be
returned from REST handlers to clients.

#### Scenario: Domain error converts to HTTP response
- **WHEN** a REST handler calls a domain function that returns `apperror.ErrInstanceNotFound`
- **THEN** `toHumaError(err)` produces a 404 response with error code `110001`

#### Scenario: Error codes are namespaced
- **WHEN** `pkg/apperror/apperror.go` is read
- **THEN** generic errors are in the `100xxx` range and EPF-specific errors have distinct ranges

### Requirement: Thin Command Handlers
Files in `cmd/` SHALL act as thin adapters: parse arguments, call an `internal/` package, and
format output. No `cmd/` file SHALL exceed 500 lines after the extraction is complete. Business
logic, data transformations, and orchestration SHALL live in `internal/` packages so that both
CLI commands and REST API handlers can share the same implementation.

#### Scenario: health.go is extracted
- **WHEN** the refactor is complete
- **THEN** `cmd/health.go` is ≤500 lines
- **AND** `epf-cli health docs/EPF/_instances/emergent` produces output identical to pre-refactor

#### Scenario: validate.go is extracted
- **WHEN** the refactor is complete
- **THEN** `cmd/validate.go` is ≤500 lines
- **AND** `epf-cli validate <file>` produces output identical to pre-refactor

#### Scenario: Shared logic between CLI and REST
- **WHEN** a REST handler for `GET /api/health` is later added
- **THEN** it calls the same `internal/checks` function as `cmd/health.go` — no duplication

### Requirement: Package Naming Convention
No package in `internal/` SHALL have a name ending in `util`, `common`, or `helpers`. The
`internal/pathutil` package SHALL be renamed. The boundary between `internal/validation` and
`internal/validator` SHALL be documented and redundancy eliminated.

#### Scenario: pathutil is renamed
- **WHEN** the refactor is complete
- **THEN** no directory named `pathutil` exists under `internal/`
- **AND** all former import paths compile successfully under the new name

### Requirement: Constitution Exceptions Documented
`openspec/project.md` SHALL contain a "Constitution Exceptions" section documenting: cobra
retained for CLI dispatch (go-arg inapplicable at 42-command scale), `cmd/` subdirectory
retained (coupled to cobra), `database.TestDB(t)` not applicable (no database), with
justification for each exception.

#### Scenario: Exceptions are findable
- **WHEN** an AI agent reads `openspec/project.md`
- **THEN** it finds a "Constitution Exceptions" section explaining each exception and its rationale
