# Tasks: Refactor epf-cli to align with CONSTITUTION.md

Tasks are ordered so that each step keeps the binary fully functional. Complete in sequence.

## 1. Taskfile (zero functional risk)

- [ ] 1.1 Write `apps/epf-cli/Taskfile.yml` with all existing Makefile targets
- [ ] 1.2 Add standard constitution tasks: `format` (gofmt + goimports), `lint` (golangci-lint), `test-verbose`
- [ ] 1.3 Add `.golangci.yaml` with constitution linter set (nilerr, errcheck, govet, staticcheck, bodyclose, unused, ineffassign, misspell, gofmt, gocyclo, gocognit)
- [ ] 1.4 Run `golangci-lint run ./...` and capture all findings — do not fix yet, just enumerate
- [ ] 1.5 Verify all tasks run: `task build`, `task test`, `task lint`, `task format`
- [ ] 1.6 Decision: keep Makefile as shim or remove — record outcome in design.md
- [ ] 1.7 Add lint + format check to GitHub Actions CI workflow

## 2. Formatting (zero risk)

- [ ] 2.1 Run `gofmt -w ./apps/epf-cli/...` — one-time cleanup commit
- [ ] 2.2 Run `goimports -w ./apps/epf-cli/...`
- [ ] 2.3 Confirm `task lint` (gofmt linter) passes after cleanup

## 3. Logging: stdlib log → slog (internal-only, no external behavior change)

- [ ] 3.1 Grep for all files using `"log"` stdlib in `internal/` — enumerate them
- [ ] 3.2 Replace `log.Printf`/`log.Println`/`log.Fatal` with `slog.Info`/`slog.Error`/`slog.Debug`
- [ ] 3.3 Add slog handler setup in `cmd/serve.go`: JSON handler in server mode, text handler in CLI mode
- [ ] 3.4 Leave `tliron/commonlog` in `internal/lsp/server.go` (required by glsp framework)
- [ ] 3.5 Leave `fmt.Fprintf(os.Stderr, ...)` in `cmd/` (intentional user-facing CLI output)
- [ ] 3.6 Run `go test ./...` to confirm no regressions

## 4. Config struct with go-arg (replaces scattered os.Getenv)

- [ ] 4.1 Add `github.com/alexflint/go-arg` to `go.mod` (`go get github.com/alexflint/go-arg`)
- [ ] 4.2 Grep all `os.Getenv()` calls in `cmd/serve.go` and other files — compile exhaustive list
- [ ] 4.3 Create `apps/epf-cli/config/config.go` with `Config` struct covering all env vars (see design.md)
- [ ] 4.4 Add `config.Load()` function using `arg.MustParse`
- [ ] 4.5 Update `cmd/serve.go` to call `config.Load()` at startup and pass cfg to consumers
- [ ] 4.6 Remove all `os.Getenv()` calls from serve path — replace with `cfg.FieldName`
- [ ] 4.7 Keep `internal/config/` YAML user-preferences loader unchanged (separate concern)
- [ ] 4.8 Test: `EPF_SERVER_PORT=9090 epf-cli serve --http` must start on port 9090

## 5. pkg/apperror/ (additive, no existing code uses it yet)

- [ ] 5.1 Create `apps/epf-cli/pkg/apperror/apperror.go` with `AppError` type and sentinel definitions
- [ ] 5.2 Define error code ranges (see design.md for allocation table)
- [ ] 5.3 Add `toHumaError(err error) error` converter (to be used by REST handlers)
- [ ] 5.4 Add `pkg/logger/logger.go` — `slog` wrapper with context-aware structured logging
- [ ] 5.5 Write unit tests for apperror constructors and `toHumaError`

## 6. Business logic extraction from fat cmd/ files

Prerequisite: steps 1–5 complete. Run tests after each sub-step.

- [ ] 6.1 Audit `cmd/health.go` (2,162 lines): identify business logic vs CLI adapter code
- [ ] 6.2 Move health-check orchestration to `internal/checks/` (package already exists — expand it)
- [ ] 6.3 `cmd/health.go` becomes: parse flags → call `checks.RunHealthCheck(path, opts)` → format output
- [ ] 6.4 Target: `cmd/health.go` ≤ 300 lines after extraction
- [ ] 6.5 Run `epf-cli health docs/EPF/_instances/emergent` — output must be identical before/after
- [ ] 6.6 Audit `cmd/validate.go` (1,593 lines): same extraction
- [ ] 6.7 Move validation orchestration to `internal/validation/` (consolidate with `internal/validator/`)
- [ ] 6.8 `cmd/validate.go` becomes: parse flags → call `validation.Run(path, opts)` → format output
- [ ] 6.9 Target: `cmd/validate.go` ≤ 300 lines after extraction
- [ ] 6.10 Run `epf-cli validate docs/EPF/_instances/emergent/READY/00_north_star.yaml` — output identical
- [ ] 6.11 Audit other large files and extract similarly (`cmd/aim.go`, `cmd/serve.go` helpers)
- [ ] 6.12 Run full `go test ./...` — all tests must pass

## 7. HTTP transport: stdlib net/http → Echo v4 + huma v2

Prerequisite: steps 1–6 complete (especially business logic extraction). This is the highest-risk step.

- [ ] 7.1 Add `github.com/labstack/echo/v4` and `github.com/danielgtaylor/huma/v2` to `go.mod`
- [ ] 7.2 Add `github.com/labstack/echo/v4/middleware` (CORS, Logger, Recover)
- [ ] 7.3 Rewrite `internal/transport/http.go`:
  - Replace `http.ServeMux` with `echo.New()`
  - Mount MCP streamable HTTP at `/mcp` via `e.Any("/mcp", echo.WrapHandler(streamable))`
  - Mount SSE (if enabled) at `/sse` and `/message` via `echo.WrapHandler`
  - Replace hand-rolled CORS middleware with `middleware.CORSWithConfig`
  - Replace hand-rolled health handler with `huma.Register` health operation
  - Adapt auth middleware to `echo.MiddlewareFunc`
  - Adapt auth route registrar to use `echo.Group` or direct `e.GET`/`e.POST`
- [ ] 7.4 Update `cmd/serve.go` to construct Echo server instead of `transport.NewHTTPServer`
- [ ] 7.5 Verify `HTTPServerConfig` struct is updated or replaced
- [ ] 7.6 **Integration test**: run `epf-cli serve --http` and connect Claude Desktop / curl
  - `curl http://localhost:8080/health` → JSON response
  - MCP initialize handshake via `curl -X POST http://localhost:8080/mcp` → valid MCP response
  - CORS preflight: `curl -X OPTIONS -H "Origin: http://example.com" http://localhost:8080/mcp` → correct headers
- [ ] 7.7 Set Echo server timeouts per constitution:
  - `ReadTimeout`: 15s
  - `WriteTimeout`: 180s (for streaming MCP responses)
  - `IdleTimeout`: 120s
- [ ] 7.8 Wire graceful shutdown through Echo's `e.Shutdown(ctx)` (replace current httpServer.Shutdown)

## 8. Package naming

- [ ] 8.1 Rename `internal/pathutil` → `internal/epfpath`
- [ ] 8.2 Update all import paths referencing `pathutil` in the module
- [ ] 8.3 Evaluate and document boundary between `internal/validation` and `internal/validator`
  - If validation extracted in step 6 consolidates them: merge
  - If they serve distinct purposes: update each package doc comment to make boundary explicit
- [ ] 8.4 Run `go build ./...` to confirm no broken imports
- [ ] 8.5 Fix any remaining lint findings from step 1.4 audit

## 9. Documentation updates

- [ ] 9.1 Update `openspec/project.md`:
  - Add "Constitution Exceptions" section: cobra retained, `cmd/` subdirectory, no pkg/apperror HTTP errors (now added), no DB
  - Update tech stack to include Echo v4, huma v2, go-arg
  - Update directory layout to show new `config/` and `pkg/` directories
- [ ] 9.2 Update `apps/epf-cli/AGENTS.md`: build/test section references `task` commands
- [ ] 9.3 Update `apps/epf-cli/README.md`: development commands, env var table from config struct

## 10. Final validation gate

- [ ] 10.1 `task build` succeeds
- [ ] 10.2 `task test` passes (all existing tests green)
- [ ] 10.3 `task lint` exits 0 — zero blocking findings
- [ ] 10.4 `task format` shows no diffs
- [ ] 10.5 `epf-cli health docs/EPF/_instances/emergent` produces correct output
- [ ] 10.6 `epf-cli serve --http` starts and health endpoint responds
- [ ] 10.7 MCP initialize handshake succeeds over HTTP
- [ ] 10.8 `epf-cli serve` (stdio mode) still works for local AI agent use
