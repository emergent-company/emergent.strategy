# Project Constitution

A portable coding standard for Go microservices. Copy this file to any new project and adapt the project-specific sections. Keep the principles intact.

---

## 1. Core Philosophy

**Boring is good.** Choose proven, well-understood patterns. Prefer a single clear file over an elegant abstraction. Add complexity only when you have concrete evidence it is needed — performance data, scale requirements, or multiple proven use cases.

**Correctness first.** A slow correct system can be optimized. A fast incorrect system is a liability.

**Ledger mindset.** Prefer append-only data models. Current state is a projection of history. Never mutate or delete committed records — mark them superseded instead.

**Boundaries matter.** Domain logic must not depend on infrastructure. Infrastructure must not leak into domain. Enforce this by package layout, not willpower.

---

## 2. Tech Stack

### Core
| Concern | Library | Notes |
|---|---|---|
| Language | Go (latest stable) | Standard formatting, no generics unless clear win |
| Database | PostgreSQL 16 | Docker for local dev, same DB in all envs including tests |
| ORM | `uptrace/bun` + `jackc/pgx/v5` | Dialect-aware; no raw `database/sql` in service code |
| HTTP | Echo v4 + `danielgtaylor/huma/v2` via `humaecho` | Auto-generates OpenAPI 3.1; use `huma.Register` for all operations |
| CLI / Config | `alexflint/go-arg` | Struct-based; env var binding built-in; no cobra |
| Migrations | `pressly/goose/v3` with embedded SQL files | Auto-runs on startup with advisory lock |
| Decimals | `shopspring/decimal` | Never `float64` for money or percentages |
| Logging | `log/slog` | JSON to stderr in production; text in dev |
| UUIDs | `google/uuid` | All primary keys are UUIDs |

### Web Frontend (if applicable)
| Concern | Library | Notes |
|---|---|---|
| Templates | `a-h/templ` | Type-safe Go templates; run `templ generate` before build |
| UI components | `emergent-company/go-daisy` | Vanilla DaisyUI; never hand-roll CSS/HTML that daisy provides |
| Interactivity | HTMX v4 | Event names use colon-separated format; partial responses only |
| Live reload | Air (`air-verse/air`) + templ watch | Dev only; not in production binary |

### Tooling
| Tool | Purpose |
|---|---|
| `go-task/task` | Task runner (replaces Make) |
| `golangci-lint` | Linting (errcheck, staticcheck, misspell, gocyclo) |
| Docker Compose | Local dependencies (Postgres only; app runs as binary) |
| OpenSpec | Spec-driven development for non-trivial changes |

---

## 3. Directory Layout

```
.
├── main.go                  # Entry point — wires config, DB, server
├── cmd_serve.go             # runServer() implementation
├── cmd_*.go                 # One file per top-level command
├── config/                  # Config struct (go-arg), environment validation
├── domain/                  # Pure domain logic — no DB, no HTTP
│   └── <capability>/        # One package per bounded context
│       ├── service.go       # Business logic; receives *bun.DB
│       └── *.go             # Supporting types, queries, invariants
├── internal/
│   ├── database/            # db.go (Open, migrations), testdb.go
│   ├── domain/              # Shared domain types (structs with bun tags)
│   ├── handler/             # HTTP handlers (huma.Register), thin adapters
│   ├── web/                 # HTMX web frontend handlers (if applicable)
│   │   ├── routes.go        # RegisterRoutes — all route registration
│   │   ├── middleware.go    # Echo middleware (loaders, guards)
│   │   └── handler_*.go    # One file per feature area
│   ├── ui/                  # templ components (if applicable)
│   ├── navigation/          # Screen/route graph (if applicable)
│   ├── migration/           # Goose migration runner helpers
│   └── <infra>/             # Other infrastructure packages
├── pkg/                     # Exportable utility packages
│   ├── apperror/            # Typed HTTP errors with i18n support
│   └── logger/              # slog wrapper; context-aware
├── tests/
│   └── e2e/                 # End-to-end tests against a real HTTP server
├── Taskfile.yml
├── Dockerfile
├── docker-compose.yml       # Postgres only; app runs as binary locally
├── .golangci.yaml
├── .air.toml                # Live reload config (dev only)
├── openspec/                # Change proposals and specifications
│   ├── project.md           # Project-specific context (adapt per project)
│   ├── specs/               # Current truth — what is built
│   └── changes/             # Proposals — what should change
└── AGENTS.md                # Instructions for AI coding agents
```

### Package rules
- `domain/<capability>/` — pure Go, zero infrastructure imports. Only `shopspring/decimal`, `google/uuid`, standard library.
- `internal/domain/` — shared struct definitions with bun tags. Shared between handler and domain packages.
- `internal/handler/` — thin HTTP adapters. Decode request → call domain service → encode response. No business logic.
- `pkg/` — exportable utilities with no internal dependencies.
- Cross-package imports flow inward only: `handler → domain → (nothing)`.

---

## 4. Architecture Patterns

### Clean Architecture (enforced by package layout)
```
HTTP Request
    → internal/handler     (decode, validate, call service)
    → domain/<capability>  (business logic, domain rules)
    → *bun.DB              (queries inline in service methods)
    → internal/domain      (shared structs, bun models)
```

Domain packages query the database directly via `*bun.DB` — no repository abstraction layer. This matches the `21st-identity-api` pattern and keeps service code readable without indirection.

### Append-only ledger pattern
- Committed records are never updated or deleted.
- Current state is always derivable from the full history.
- When a record is "cancelled" or "superseded", write a new record that references it.
- Use `deleted_at` soft-delete only for administrative records (companies, stakeholders), never for financial ledger entries.

### Derived state, not stored state
- Computed values (totals, balances, percentages, ownership graphs) are calculated at read time, not stored.
- Only store the raw facts (transactions, share lots, events).
- Exception: cache expensive computations if you have measured performance evidence.

### Data trust layers
When the system holds both authoritative (self-managed) and reference (imported) data:
- **Layer 1 (collected):** External imports — useful for bootstrapping, never authoritative.
- **Layer 2 (authorized):** Managed by the record owner — authoritative. External imports cannot override it.
- **Layer 3 (composite):** Derived by linking Layer 2 records across entities. Read-only projection; each owner retains sovereignty.

Cross-entity ownership is a **reference link**, not a data merge.

---

## 5. Database Conventions

### Migrations
- All migrations live in `internal/database/migrations/*.sql`.
- Use goose: `-- +goose Up` / `-- +goose Down` comments.
- Files embedded with `//go:embed migrations/*.sql`.
- Migrations run automatically on startup with a PostgreSQL advisory lock (safe for multiple replicas).
- Never edit a committed migration — write a new one.

### Models
- All models registered with `db.RegisterModel(...)` in `internal/database/db.go`.
- Primary key: `UUID` generated in Go (`uuid.New()`), not by the database.
- Timestamps: `created_at`, `updated_at` managed by bun hooks or explicit Go code.
- Soft delete: `deleted_at *time.Time` where needed.
- Use `bun` struct tags: `bun:"column_name,pk"`, `bun:"rel:has-many"`, etc.

### Testing
- Every test that touches the database gets its own isolated PostgreSQL database via `database.TestDB(t)`.
- `TestDB` creates a unique database, runs migrations, and drops it in `t.Cleanup`.
- Tests run against real Postgres (not mocks, not SQLite). Start with `task docker-deps`.
- No shared test state between test functions.

```go
func TestMyFeature(t *testing.T) {
    db := database.TestDB(t)
    svc := mypackage.NewMyService(db)
    // ...
}
```

---

## 6. HTTP API Conventions

### Handler structure
Handlers are registered with `huma.Register`. Each operation is a function that:
1. Receives a typed input struct (huma decodes and validates automatically).
2. Calls a domain service.
3. Returns a typed output struct or a huma error.

```go
type CreateFooInput struct {
    Body struct {
        Name string `json:"name" doc:"Foo name" minLength:"1"`
    }
}

type CreateFooOutput struct {
    Body *domain.Foo
}

huma.Register(api, huma.Operation{
    OperationID: "create-foo",
    Method:      http.MethodPost,
    Path:        "/foos",
    Summary:     "Create a foo",
    Tags:        []string{"Foos"},
}, func(ctx context.Context, input *CreateFooInput) (*CreateFooOutput, error) {
    foo, err := s.fooSvc().Create(ctx, input.Body.Name)
    if err != nil {
        return nil, toHumaError(err)
    }
    return &CreateFooOutput{Body: foo}, nil
})
```

### Error handling
- Domain services return `*apperror.AppError` for expected failures.
- `toHumaError(err)` converts them to huma errors with the correct HTTP status.
- Never return raw Go errors to clients — they may leak internals.
- All `AppError` instances are defined as package-level `var` sentinels. Use `.WithDetail()` or `.WithInternal()` to add context without changing the base type.

```go
// Define once (pkg/apperror):
var ErrFooNotFound = NewHTTPDefinedError(404, 200001, "Foo not found")

// Use in services:
return nil, apperror.ErrFooNotFound.WithInternal(err)
```

### Error code namespacing
Assign numeric ranges per domain, e.g.:
- `100xxx` — generic (not found, bad request, forbidden)
- `110xxx` — company
- `111xxx` — stakeholder
- `112xxx` — share class
- `113xxx` — transaction
- etc.

### Pagination
All list endpoints use cursor-based pagination. Default page size 50, max 200. Response includes `next_cursor` field.

### Logging
Use `slog` throughout. Log at the point of failure with structured key/value pairs.

```go
slog.Error("failed to create foo", "name", name, "err", err)
slog.Info("foo created", "id", foo.ID)
```

Never log passwords, tokens, or PII. Redact DSNs before logging.

---

## 7. Configuration

Use `alexflint/go-arg` with a struct-based config. Environment variables bind automatically.

```go
type Config struct {
    Server   *ServerCmd   `arg:"subcommand:server"`
    DB       *DBCmd       `arg:"subcommand:db"`
    LogLevel string       `arg:"--log-level,env:LOG_LEVEL" default:"INFO"`
    PGHost   string       `arg:"--pg-host,env:PGHOST" default:"localhost"`
    PGPort   int          `arg:"--pg-port,env:PGPORT" default:"5432"`
    PGUser   string       `arg:"--pg-user,env:PGUSER" default:"myapp"`
    PGPass   string       `arg:"--pg-password,env:PGPASSWORD" default:"myapp"`
    PGDBName string       `arg:"--pg-database,env:PGDATABASE" default:"myapp"`
}

func (c *Config) PostgresDSN() string {
    return fmt.Sprintf("postgres://%s:%s@%s:%d/%s?sslmode=%s",
        c.PGUser, c.PGPass, c.PGHost, c.PGPort, c.PGDBName, c.PGSSLMode)
}
```

No hardcoded URLs, credentials, or environment-specific values in code. Everything configurable via environment variables with sensible defaults for local development.

---

## 8. Build & Dev Workflow

### Taskfile.yml (standard tasks)
```
task build          # Build production binary
task build-server   # Build server binary only
task docker-deps    # Start Postgres in Docker, wait for ready
task db:reset       # Drop and recreate database
task db:migrate     # Run migrations explicitly
task format         # gofmt -w .
task lint           # golangci-lint run ./...
task test           # Run tests (requires docker-deps)
task test-verbose   # Tests with -v
task test-e2e       # End-to-end tests
task clean          # Remove build artifacts
```

### Build tags
- `notui` — exclude optional TUI/dev-only code from production binary.
- Production Dockerfile always uses `-tags notui`.
- Development builds can omit the tag to get all tooling.

### Dockerfile (multi-stage, minimal)
```dockerfile
FROM golang:1.24-alpine AS build
ENV GOTOOLCHAIN=auto
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -tags notui -o /app/build/myapp -ldflags "-s -w" .

FROM alpine:3.21
RUN apk add --no-cache ca-certificates
COPY --from=build /app/build/myapp /bin/myapp
COPY --from=build /app/internal/database/migrations /opt/myapp/migrations
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s CMD wget -q -O- http://localhost:8080/health || exit 1
CMD ["myapp", "server"]
```

### docker-compose.yml (Postgres only)
```yaml
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: myapp
      POSTGRES_PASSWORD: myapp
      POSTGRES_DB: myapp
    ports:
      - "5432:5432"
    volumes:
      - postgres-data:/var/lib/postgresql/data

volumes:
  postgres-data:
```

The application runs as a local binary (`./build/myapp server`), not inside Docker, during development. Only dependencies (Postgres) run in Docker.

### Graceful shutdown
```go
done := make(chan struct{})
go func() {
    sigCh := make(chan os.Signal, 1)
    signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)
    <-sigCh
    ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
    defer cancel()
    _ = e.Shutdown(ctx)
    close(done)
}()
e.Start(addr)
<-done
```

---

## 9. Code Style

### Go formatting
- Always `gofmt` / `goimports`. No exceptions.
- All public types and functions have doc comments.
- Error handling follows Go idioms — check every error, no silent ignores.
- No panics in library code. Panics only in `main()` for unrecoverable startup failures.

### Naming
- Packages: lowercase, single word. Avoid `util`, `common`, `helpers`.
- Types: noun phrases (`CompanyService`, `ShareLot`).
- Functions: verb phrases (`CreateCompany`, `GetCapTable`).
- Error vars: `ErrXxx` prefix, defined at package level.
- Constants: `SCREAMING_SNAKE_CASE` for enums; `CamelCase` for typed constants.

### Decimal math
```go
// Correct:
price := decimal.NewFromString("10.50")
total := price.Mul(decimal.NewFromInt(100))

// Wrong:
price := 10.50
total := price * 100
```

Never use `float64` for money, ownership percentages, or any value that will be compared, summed, or displayed to users.

### Struct field ordering
1. Primary key (ID)
2. Foreign keys
3. Enum/status fields
4. Business data fields
5. Timestamps (created_at, updated_at, deleted_at)

### Service constructor pattern
```go
type FooService struct {
    db *bun.DB
}

func NewFooService(db *bun.DB) *FooService {
    return &FooService{db: db}
}
```

Services are stateless except for the database handle. Construct them per-request in handlers (cheap — just a pointer copy).

---

## 10. Testing Strategy

### Layer priorities
1. **Domain unit tests** — table-driven, no database. Test invariants, calculations, state machines.
2. **Integration tests** — real Postgres via `database.TestDB(t)`. Test service methods end-to-end through the database.
3. **E2E tests** — real HTTP server. Test complete API flows including auth, validation, error codes.
4. **Golden file tests** — capture complex output (reports, projections) as reference files; compare on each run.
5. **Property-based tests** — use `pgregory.net/rapid` for financial invariants (e.g. "total shares always equals sum of active lots").

### Test isolation
- Each test creates its own Postgres database. No shared state.
- `t.Cleanup` drops the database. No manual teardown needed.
- Parallel tests are safe — each has an independent DB.

### Table-driven tests
```go
func TestCreateFoo(t *testing.T) {
    tests := []struct {
        name    string
        input   CreateFooRequest
        wantErr bool
    }{
        {name: "valid", input: CreateFooRequest{Name: "bar"}, wantErr: false},
        {name: "empty name", input: CreateFooRequest{Name: ""}, wantErr: true},
    }
    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {
            db := database.TestDB(t)
            svc := NewFooService(db)
            _, err := svc.Create(context.Background(), tt.input)
            if (err != nil) != tt.wantErr {
                t.Errorf("want error=%v, got %v", tt.wantErr, err)
            }
        })
    }
}
```

---

## 11. Linting

Lint is a CI gate, not a suggestion. `task lint` must pass on every commit that
enters `main`. The threshold for what counts as a blocking finding is intentional:
not every lint category is equally important. The config below separates findings
that indicate **real bugs** from those that indicate **style or complexity**.

### Why each linter is enabled

| Linter | Category | Why it matters |
|---|---|---|
| `nilerr` | **Real bug** | Function checks an error, then returns `nil` instead. The caller sees success; the error is silently lost. This is the single highest-value linter for a Go service — it catches silent failure modes that are invisible in testing. |
| `errcheck` | **Real bug** | Return values of `Close()`, `Exec()`, and similar calls discarded without `_`. Missed `Close()` on an HTTP response body leaks the connection. |
| `govet` | **Real bug** | Catches misuse of `sync.Mutex` by value, `printf` format string mismatches, and other structural issues the compiler doesn't catch. |
| `staticcheck` | **Real bug + style** | Broad static analysis. The `SA` class (e.g. `SA4031` always-true nil check) are real bugs. The `S` and `QF` classes are style suggestions — less urgent. |
| `unused` | **Hygiene** | Dead code. Functions, types, and variables defined but never used. Accumulates over time and creates confusion. |
| `ineffassign` | **Hygiene** | Variable assigned a value that is immediately overwritten or never read. Usually indicates a logic error or leftover from a refactor. |
| `misspell` | **Hygiene** | Typos in comments and strings. |
| `gofmt` | **Hygiene** | Formatting. Run `gofmt -w .` to fix. Never let this fail. |
| `gocyclo` | **Advisory** | Cyclomatic complexity. High scores indicate functions that are hard to test exhaustively. Set threshold high (≥ 40) — do not use this as a CI blocker. |
| `gocognit` | **Advisory** | Cognitive complexity. Similar to gocyclo but measures readability. Large service functions in financial systems are inherently complex. Set threshold high (≥ 60) or disable entirely. |
| `bodyclose` | **Real bug** | HTTP response body not closed. Memory and connection leak. |

### What CI must enforce (blocking)

These categories must have zero findings before a PR can merge:

- `nilerr` — zero tolerance. A function that swallows an error is a silent failure.
- `errcheck` — zero tolerance (with test file exclusion).
- `govet` — zero tolerance.
- `gofmt` — zero tolerance. Run `gofmt -w .` before committing.
- `unused` — zero tolerance. Delete dead code.
- `bodyclose` — zero tolerance.

These categories are **advisory** — track them but do not block merges:

- `gocognit` / `gocyclo` — large domain functions are complex by necessity. Use
  these as a signal for refactoring opportunities, not as merge gates.
- `staticcheck` `S`/`QF` classes — style improvements. Address in a cleanup pass.
- `ineffassign` / `misspell` — low priority but should not accumulate.

### .golangci.yaml (recommended config)

```yaml
version: "2"

formatters:
  enable:
    - gofmt
    - goimports

linters:
  default: none
  enable:
    # Real bugs — zero tolerance, CI blocking.
    - nilerr
    - errcheck
    - govet
    - staticcheck
    - bodyclose
    # Hygiene — zero tolerance.
    - unused
    - ineffassign
    - misspell
    # Advisory — tracked but not blocking.
    - gocyclo
    - gocognit

  exclusions:
    rules:
      # Test files: errcheck false-positives on defer cleanup are acceptable.
      - path: _test\.go
        linters:
          - errcheck

linters-settings:
  gocyclo:
    min-complexity: 40    # High threshold — advisory only.
  gocognit:
    min-complexity: 60    # High threshold — advisory only. Large domain functions
                          # are inherently complex. Lower this only if you have
                          # the bandwidth to refactor.

issues:
  # Stop after this many issues so output is readable.
  max-issues-per-linter: 50
  max-same-issues: 10
  exclude-dirs:
    - openspec
    - docs
    - vendor
```

### Handling the initial debt

If you inherit a codebase with existing findings (common when adding lint to an
existing project), use this sequence:

1. **Fix `gofmt` immediately** — `gofmt -w .` is zero-effort and makes all other
   diffs cleaner.
2. **Fix `nilerr` next** — these are real bugs. Each one is a handler that returns
   success when something failed. Prioritise handlers that users interact with.
3. **Fix `errcheck` in non-test code** — wrap `defer f.Close()` with
   `defer func() { _ = f.Close() }()` or use `//nolint:errcheck` with a comment
   explaining why the error is intentionally ignored.
4. **Fix `unused`** — delete dead code. Do not move it to a comment "for reference".
5. **Add `//nolint:gocognit` to legitimately complex functions** with a comment
   explaining why the complexity is inherent (e.g. a tax calculation function that
   implements a legal specification). This makes the suppression intentional and
   reviewable, not a blanket setting.
6. **Do not fix `gocognit`/`gocyclo` by splitting functions artificially.** A
   100-line function that does one coherent thing is better than five 20-line
   functions that must be read together. Split only when there is a genuine
   reusable abstraction.

### The nilerr pattern

The most common `nilerr` pattern in web handlers is:

```go
// Wrong — error is checked but then nil is returned:
foo, err := svc.GetFoo(ctx, id)
if err != nil {
    // Someone intended to handle the error but left a stub:
    return nil
}

// Correct — return the error so the caller knows what happened:
foo, err := svc.GetFoo(ctx, id)
if err != nil {
    return redirectWithFlash(c, "/foos", "error", "Could not load foo: "+err.Error())
}
```

The fix is always: decide what to do with the error (redirect, render error page,
return error to caller) and do it — never return `nil` when you have a non-nil error.

---

## 12. Spec-Driven Development (OpenSpec)

Use OpenSpec for any non-trivial change. The threshold: if the change introduces a new capability, makes a breaking change, or touches multiple packages, write a proposal first.

### When to write a proposal
- New feature or capability
- Breaking API or schema change
- Architecture shift
- Performance optimization that changes observable behavior

### When to skip a proposal
- Bug fix restoring intended behavior
- Typos, formatting, comments
- Dependency version bump (non-breaking)
- Tests for existing behavior

### Proposal workflow
```bash
# 1. Review current state
openspec list
openspec list --specs

# 2. Scaffold
CHANGE=add-my-feature
mkdir -p openspec/changes/$CHANGE/specs/my-capability
# Write proposal.md, tasks.md, specs/<capability>/spec.md

# 3. Validate
openspec validate $CHANGE --strict

# 4. Implement (only after proposal is reviewed)
# 5. Archive
openspec archive $CHANGE --yes
```

### Proposal file structure
```
openspec/changes/<change-id>/
├── proposal.md   # Why, what changes, impact
├── tasks.md      # Implementation checklist
├── design.md     # Technical decisions (optional — only for cross-cutting changes)
└── specs/
    └── <capability>/
        └── spec.md  # ADDED/MODIFIED/REMOVED requirements with scenarios
```

---

## 13. Deployment (Google Cloud Run)

### Target architecture
- Stateless binary deployed to Cloud Run.
- PostgreSQL on Cloud SQL (same instance shared across services).
- Migrations run on startup (advisory lock prevents races across replicas).
- No persistent local state — Cloud Run instances are ephemeral.

### Health check
Every service exposes `GET /health` returning `{"status":"healthy","service":"<name>"}`.

### Timeouts
```go
// WriteTimeout long enough for multi-round LLM tool use (if applicable).
srv.Echo.Server.ReadTimeout  = 15 * time.Second
srv.Echo.Server.WriteTimeout = 180 * time.Second
srv.Echo.Server.IdleTimeout  = 120 * time.Second
```

### Cloud Logging
In production (`ENV=production`), `slog` outputs JSON to stderr. Cloud Run captures stderr as structured logs. Key fields: `message`, `level`, `time`, plus any structured attrs.

---

## 14. AI Coding Agent Instructions (AGENTS.md)

Every project should have an `AGENTS.md` at the root that tells AI coding agents:

```markdown
<!-- OPENSPEC:START -->
# OpenSpec Instructions

Always open `@/openspec/AGENTS.md` when the request:
- Mentions planning or proposals
- Introduces new capabilities or breaking changes
- Is ambiguous — read the spec before coding

Use `@/openspec/AGENTS.md` to learn how to create proposals and validate specs.
<!-- OPENSPEC:END -->
```

The `openspec/AGENTS.md` is auto-generated by `openspec update`. It contains the full workflow for the AI agent including proposal format, validation commands, and happy-path script.

### Agent principles
- Read `openspec/project.md` before starting any significant task.
- Check `openspec list` and `openspec list --specs` for existing work before creating new specs.
- Do not implement a proposal until it is approved.
- Mark todos as completed immediately after each task — do not batch completions.
- Prefer editing existing files over creating new ones.
- Do not create README or documentation files unless explicitly requested.

---

## 15. Web Frontend (HTMX + templ) — Optional Module

Include this section only when building a server-rendered web UI.

### Navigation graph
All screens are defined in a single `internal/navigation/graph.go` as a slice of `ScreenDef`. This is the single source of truth for:
- URL patterns
- HTTP methods (GET, GET+POST for forms)
- Icon names
- Sidebar grouping
- Tab grouping and render mode (full page, tab page, modal)
- Company-scoped flag
- Data hints (what data the handler needs to preload)

No screen is registered in `routes.go` unless it appears in the navigation graph. Tests enforce this invariant.

### Handler pattern
```go
func (s *Server) handleFooList(c echo.Context) error {
    company := companyFromContext(c) // loaded by middleware
    foos, err := s.fooSvc(c).List(c.Request().Context(), company.ID)
    if err != nil {
        return renderError(c, http.StatusInternalServerError, "Error", err.Error())
    }
    render.RenderAuto(c.Response().Writer, c.Request(),
        ui.FooListPage(company, foos),  // full page
        ui.FooListContent(company, foos), // HTMX partial
    )
    return nil
}
```

`render.RenderAuto` returns the full page for normal requests and the partial for HTMX requests (detects `HX-Request` header).

### HTMX conventions
- Use HTMX v4 event naming: `htmx:after-request` (colon-separated, not camel-case).
- `#modal-container` must be defined in the base layout before any `ModalScript` call.
- `<dialog>` elements require `.showModal()` — they are not visible by default.
- Polls use `hx-trigger="load, every 30s"` pattern.
- Form submissions return either a redirect (`HX-Redirect` header) or an updated partial.

### Flash messages
Flash messages are stored in a signed cookie and consumed on the next request. The pattern:
```go
// Set before redirect:
setFlash(c, FlashSuccess, "Foo created successfully")
return c.Redirect(http.StatusSeeOther, "/foos")

// Read in next handler:
flash := flashFromRequest(c) // returns nil if no flash
```

### DaisyUI component usage
- Use `go-daisy` component helpers — never write raw HTML/CSS for components daisy provides.
- Use native `<input type="date">` for all date fields (not text inputs with format hints).
- Form fields: use `dform.FormField(dform.FormFieldProps{Type: dform.FieldDate, ...})`.
- Avoid custom CSS; rely on DaisyUI utility classes and component variants.

---

## 16. Mobile-Responsive Web UI — Required from Day One

Mobile responsiveness is not a feature to add later. The cost of retrofitting it across 15+ template files is 40–50 tasks of mechanical, error-prone work. DaisyUI + Tailwind are mobile-first by design — the only reason a UI is not responsive is because the developer wrote non-adaptive patterns. The rules below prevent those patterns from appearing in the first place.

### Non-negotiables (apply to every template from the first line)

- **No bare `<table>` without a scroll wrapper.** Every `@table.Table()` call is wrapped in `<div class="overflow-x-auto rounded-box">`. No exceptions.
- **No fixed column counts without mobile fallback.** `grid-cols-2` → `grid-cols-1 sm:grid-cols-2`. `grid-cols-3` → `grid-cols-1 sm:grid-cols-3`. `grid-cols-4` → `grid-cols-2 sm:grid-cols-4`.
- **No inline `style="width:..."` on form fields.** Use Tailwind: `w-full sm:w-36`.
- **No fixed-width dropdowns.** Use `w-[min(24rem,calc(100vw-2rem))]` or equivalent viewport-constrained class.
- **No `whitespace-nowrap` on long strings inside table cells** (timestamps, ID numbers, org numbers). Let them wrap or truncate with `truncate max-w-[12ch]`.
- **Page header toolbars use `flex-wrap min-h-14`**, not `h-16 flex shrink-0`. Action buttons wrap below the breadcrumb on narrow screens rather than overflowing.
- **Main content area uses responsive padding:** `px-3 sm:px-6` — never bare `p-6` on the outermost content wrapper.
- **Inline meta-info rows** (company header, stakeholder header) use `flex flex-wrap gap-x-2`.

### Chat panel

The AI chat panel renders differently by viewport:
- **Mobile (< 640px):** full-width bottom sheet, ~60% viewport height.
- **Desktop (≥ 640px):** fixed-width right-side panel (`w-96`).

Use `class="w-full sm:w-96"` and a CSS media query or JS toggle to switch between bottom sheet and side panel modes. Never `style="width:24rem"`.

### Form modals

All form grids inside modals default to single-column on mobile:

```html
<!-- Correct -->
<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">

<!-- Wrong -->
<div class="grid grid-cols-2 gap-4">
```

Modal containers use `max-w-4xl w-full` — the `max-w` caps on large screens, `w-full` ensures the modal fills small screens.

### Stat grids

Multi-column stat cards always collapse to 2 columns on mobile:
```html
<div class="grid grid-cols-2 sm:grid-cols-4 gap-4">
```

### Pagination

The pagination bar uses `flex flex-wrap gap-2` so the count text drops below the nav buttons on very narrow screens rather than overflowing.

### The cost multiplier

| Pattern omitted | Retrofit cost | Multiplier |
|---|---|---|
| Table scroll wrappers | ~1 task per table × 15+ files | **~2x** |
| Responsive grid columns | ~2 tasks per form modal | **~2x** |
| Toolbar flex-wrap | ~1 task per page | **~1.5x** |
| Responsive padding | 1 task (shell only) | **~1x** |
| Chat panel responsive sizing | 2–3 tasks (structural change) | **~3x** |

Doing all of this from the first template takes zero extra time — the Tailwind classes are the same length as the non-responsive versions. Retrofitting across a 15-file UI takes 40+ tasks.

### Day-one mobile checklist

Before writing the first template, add these to the base layout and component helpers:

```
[ ] overflow-x-auto wrapper exported as a helper or go-daisy component
[ ] Table() helper always includes the scroll wrapper — callers cannot forget it
[ ] Shell content wrapper uses px-3 sm:px-6
[ ] Modal component defaults to max-w-4xl w-full
[ ] Stat grid component defaults to grid-cols-2 sm:grid-cols-N
[ ] Pagination component uses flex-wrap
[ ] Chat panel component has mobile/desktop mode wired in
```

The best enforcement mechanism is a shared component: if `go-daisy`'s `table.Table()` always emits the scroll wrapper, developers cannot produce a non-scrollable table accidentally. Push mobile-safe defaults into components, not into every call site.

### Critical: go-daisy ships a pre-built CSS bundle — your classes will be silently stripped

go-daisy's `staticfs` package embeds a CSS file built by scanning only go-daisy's own source. **Any Tailwind class you write in your own templ files that does not appear in go-daisy's source will be tree-shaken out and have no effect.** This includes every responsive modifier (`md:hidden`, `sm:grid-cols-2`, `sm:px-6`, etc.) and any utility class not coincidentally used by go-daisy itself.

**The symptom:** responsive classes are in the HTML, the browser receives them, but they have no effect. No error, no warning — silent failure.

**The fix: run your own Tailwind build.** The correct setup from day one:

```
web/
  app.css               # Tailwind entry: @import "./base.css" + @source "../internal/ui"
  base.css              # Copy of go-daisy's assets/app.css (themes, DaisyUI, icon plugin)
  package.json          # @tailwindcss/cli, daisyui, @iconify/tailwind4
  node_modules/
  staticfiles/
    staticfiles.go      # Go package: //go:embed static/css/app.css + FS() func
    static/css/
      app.css           # Output: built by Tailwind, committed, embedded at compile time
```

**Serve your CSS first, go-daisy as fallback:**
```go
// internal/web/static.go
func staticHandler() http.Handler {
    local := http.FileServer(http.FS(staticfiles.FS()))
    fallback := staticfs.Handler("/static/")
    return http.StripPrefix("/static", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        path := strings.TrimPrefix(r.URL.Path, "/")
        if f, err := staticfiles.FS().Open(path); err == nil {
            f.Close()
            local.ServeHTTP(w, r)
            return
        }
        r.URL.Path = "/static" + r.URL.Path
        fallback.ServeHTTP(w, r)
    }))
}
```

**Run Tailwind from the project root** (not from `web/`) so it auto-detects templ files:
```bash
node web/node_modules/.bin/tailwindcss -i web/app.css -o web/staticfiles/static/css/app.css --minify
```

**Taskfile task:**
```yaml
css:
  desc: Build Tailwind CSS (scans internal/ui/*.templ for responsive classes)
  cmds:
    - node web/node_modules/.bin/tailwindcss -i web/app.css -o web/staticfiles/static/css/app.css --minify
```

**When upgrading go-daisy**, refresh `web/base.css`:
```bash
cp $(go env GOPATH)/pkg/mod/github.com/emergent-company/go-daisy@<version>/assets/app.css web/base.css
```

**Day-one CSS pipeline checklist:**
```
[ ] web/base.css copied from go-daisy assets/app.css
[ ] web/app.css imports base.css and @source "../internal/ui"
[ ] web/package.json with @tailwindcss/cli, daisyui, @iconify/tailwind4
[ ] web/staticfiles/ Go package with embed + FS()
[ ] internal/web/static.go with merged handler (local first, go-daisy fallback)
[ ] task css wired into Taskfile, runs before build
[ ] task build-server:web runs css → templ → build in that order
[ ] Verify: curl /static/css/app.css | grep "md\\:hidden" — must return a match
```

---

## 17. MCP Server (AI Tool API) — Optional Module

Include this section when the service exposes tools for AI agents via MCP.

### Tool design
- Each MCP tool corresponds to one domain service method.
- Tools are pure functions: input → output, no side effects beyond the domain operation.
- Tool descriptions are precise and include what the tool does NOT do (e.g., "pure calculation — does not modify the cap table").
- Write tools require explicit user confirmation before execution (staging batch pattern).

### Staging batch pattern
For destructive or multi-step write operations:
1. AI agent creates a staging batch (preview of changes).
2. User reviews in the web UI.
3. User confirms → changes are committed atomically.

This prevents the AI from making irreversible changes without human review.

---

## Quick Reference

### Starting a new project from this constitution

1. Copy this file to your project root as `CONSTITUTION.md`.
2. Create `AGENTS.md` with the OpenSpec instructions block.
3. Run `openspec init` to scaffold `openspec/project.md` and `openspec/changes/`.
4. Edit `openspec/project.md` with your project's purpose, stack, and conventions.
5. Scaffold the directory structure from section 3.
6. Copy `Taskfile.yml`, `Dockerfile`, `docker-compose.yml`, `.golangci.yaml` from the captable project and adapt names.
7. Implement `pkg/apperror/apperror.go` and `pkg/logger/logger.go` (these are reusable as-is).
8. Implement `internal/database/db.go` (adapt model registration) and `internal/database/testdb.go` (reusable as-is).
9. Write `config/config.go` with your env var bindings.
10. Wire `main.go` with subcommand dispatch.

### File checklist for a new service
```
main.go
cmd_serve.go
config/config.go
internal/database/db.go
internal/database/testdb.go
internal/database/migrations/001_initial.sql
internal/domain/models.go
internal/handler/handler.go
pkg/apperror/apperror.go
pkg/logger/logger.go
Taskfile.yml
Dockerfile
docker-compose.yml
.golangci.yaml
.air.toml
.dockerignore
AGENTS.md
openspec/project.md
```

### Non-negotiables (never compromise these)
- No `float64` for money or percentages — always `decimal.Decimal`.
- No business logic in HTTP handlers.
- No infrastructure imports in domain packages.
- No hardcoded credentials or URLs — always env vars.
- No editing committed migrations — write new ones.
- No raw SQL outside database/repository packages.
- No panics in library code.
- All public APIs must be documented.
- `nilerr` findings are zero-tolerance — a function that checks an error and then returns `nil` is a silent bug. Fix it before merging. This is the single most common source of invisible failures in Go web handlers.
- `task lint` must pass on `main`. New code must not add new lint findings in the blocking categories (`nilerr`, `errcheck`, `govet`, `gofmt`, `unused`, `bodyclose`). Use `//nolint:<linter> // reason` with a mandatory explanation for any intentional suppression.
- No hardcoded user-facing strings in templates — always `T(ctx, "key")`. Define the translation infrastructure before writing the first template. (Retrofitting i18n across 60 template files costs ~15 days. Doing it from day one costs zero.)
- Audit logging is a domain concern, not a handler concern. Domain write functions call the audit hook from inside the function, not from the caller. Callers that forget to audit never exist. (Retrofitting this across 40+ domain operations costs ~77 tasks.)
- Auth middleware is scaffolded from day one as a no-op in dev and real in prod via config flag. Never add auth as a retrofit across every route.

---

## 18. Development Strategy: Four-Phase Build Order

This strategy produces systems that are correct before they are convenient, and that use AI as the first UI to validate the backend before a human UI is built. Each phase has a clear exit gate. Do not advance until the gate is met.

```
Phase 1: Foundation Spec
Phase 2: MCP + Coding Agent as UI
Phase 3: HTMX Web UI
Phase 4: Inline AI in the Web UI
```

---

### Phase 1 — Foundation Spec

**Goal:** Establish the complete written specification of the system before a single line of application code is written.

The spec is the contract. If it is vague, the implementation will be too. Spend more time here than feels comfortable. It is far cheaper to change a spec than to change a running system.

#### What to spec

**`openspec/project.md`** — the project constitution (adapt from this file):
- Purpose and problem statement in plain language
- Target users and their primary jobs-to-be-done
- Tech stack and rationale for each choice
- Architecture patterns that must be followed
- Data sovereignty rules (who owns what data, who can override what)
- External systems and integration boundaries
- Commercial model (free/premium tiers, enforcement rules)
- Non-negotiables

**Domain capabilities** — one OpenSpec spec per bounded context. Each spec must contain:
- Named requirements using SHALL/MUST language
- At least one scenario per requirement (WHEN / THEN format)
- Explicit error cases (what happens when input is invalid, resource not found, operation not permitted)
- State machine diagrams or tables for entities with lifecycle (DRAFT → ACTIVE → ARCHIVED, etc.)

**Navigation graph** — before any UI code, define the complete screen inventory:
- Every screen the system will have (name, URL pattern, parent, sidebar group)
- Which screens are forms (GET + POST) vs read-only (GET only)
- Which screens are modals vs full pages vs tab panels
- What data each screen needs to load (data hints)
- Which screens are company-scoped vs global

The navigation graph is the contract between backend and frontend. Define it in full — even if some screens are marked `TODO: future` — so the scope is visible and the URL structure is stable from day one.

**MCP tool inventory** — before writing any tool code, list every tool the AI agent will need:
- Tool name (verb-noun, e.g. `create_company`, `transfer_shares`)
- Description: what it does, what it explicitly does NOT do
- Input parameters with types and validation rules
- Output shape
- Which tools are read-only vs write (write tools go through staging)
- Which tools require premium tier

**Test scenario library** — before writing tests, write the user journeys in plain language:
- Happy path: complete end-to-end flow a user would follow
- Edge cases: boundary conditions, zero states, maximum values
- Error cases: invalid inputs, permission violations, state conflicts
- Compliance cases: regulatory rules that must be enforced

Write these as narrative scenarios first. They become the acceptance criteria for Phase 2.

#### Three foundation patterns that must be scaffolded before any feature code

These three patterns have a cost multiplier of 5–8x if retrofitted later. Define and scaffold all three in Phase 1, before the first service method or template is written.

**1. Internationalisation (i18n)**

Define the translation infrastructure completely before writing the first user-facing string.

```
internal/langs/
  locale.toml        # All translatable strings, keyed, in every supported language
  langs.go           # T(ctx, key) — returns translated string for context's language
  middleware.go      # Detects language from Accept-Language header + cookie, sets in ctx
internal/ui/
  helpers.go         # ui.T(ctx, key) — thin wrapper so templates don't import langs
```

The locale detection order: cookie override → `Accept-Language` header → project default language.

Every user-facing string in every template is written as `{ T(ctx, "key") }` from the first template onwards. The TOML file grows alongside the code — adding a new string takes 30 seconds. Retrofitting 500 strings across 60 template files takes 2 weeks.

Add to locale.toml before writing templates:
- `[en.nav]`, `[nb.nav]` — navigation labels
- `[en.btn]`, `[nb.btn]` — button labels (save, cancel, create, delete, confirm, submit…)
- `[en.label]`, `[nb.label]` — form field labels
- `[en.heading]`, `[nb.heading]` — page headings
- `[en.error]`, `[nb.error]` — typed error messages (these can grow as errors are added)
- `[en.flash]`, `[nb.flash]` — flash message templates
- `[en.empty]`, `[nb.empty]` — empty state messages

Also define locale-aware formatting functions before writing the first template that displays a number or date:
- `formatInt(ctx, n int64) string` — locale-aware integer formatting
- `formatDecimal(ctx, d decimal.Decimal) string` — locale-aware decimal formatting
- `formatDate(ctx, t time.Time) string` — long form: "2. januar 2026" / "2 Jan 2026"
- `formatDateShort(ctx, t time.Time) string` — "02.01.2026" / "01/02/2026"

**2. Audit logging via context propagation**

Define the audit context contract before writing the first domain service method.

```go
// domain/audit/audit_context.go

// ContextWithAudit stores the audit writer in the context.
func ContextWithAudit(ctx context.Context, a AuditWriter) context.Context

// AuditFromContext retrieves the audit writer. Returns nil if not set — nil-safe.
func AuditFromContext(ctx context.Context) AuditWriter

// ContextWithSource stores the entry point name: "web", "mcp", "api", "import", "system".
func ContextWithSource(ctx context.Context, source string) context.Context

// SourceFromContext retrieves the source. Defaults to "system" if not set.
func SourceFromContext(ctx context.Context) string
```

Every domain write function ends with:
```go
if a := audit.AuditFromContext(ctx); a != nil {
    a.Log(ctx, audit.Entry{
        EntityType: "foo",
        EntityID:   foo.ID,
        Action:     "created",
        Source:     audit.SourceFromContext(ctx),
    })
}
```

Each entry point sets the context before calling domain code:
```go
// Web handler middleware:
ctx = audit.ContextWithAudit(ctx, s.auditSvc)
ctx = audit.ContextWithSource(ctx, "web")

// MCP dispatch:
ctx = audit.ContextWithAudit(ctx, s.auditSvc)
ctx = audit.ContextWithSource(ctx, "mcp")

// Import pipeline:
ctx = audit.ContextWithAudit(ctx, s.auditSvc)
ctx = audit.ContextWithSource(ctx, "import")
```

Result: every mutation — regardless of entry point — is audited automatically. Adding a new entry point requires one line. Adding a new domain operation requires one nil-safe audit call at the end of the function. Forgetting to audit is impossible because the domain function owns it.

**3. Auth middleware scaffold**

Scaffold auth as a no-op in dev and real in prod before registering any routes.

```go
// internal/web/middleware.go

// AuthMiddleware returns a middleware that validates the session.
// In dev mode (cfg.AuthEnabled == false), it is a pass-through — no auth required.
// In prod mode, it validates the JWT/cookie and sets the user in context.
func AuthMiddleware(cfg *config.Config) echo.MiddlewareFunc {
    if !cfg.AuthEnabled {
        return func(next echo.HandlerFunc) echo.HandlerFunc {
            return func(c echo.Context) error {
                // Inject a dev user so handlers that read the user don't need auth guards.
                c.Set("user", DevUser)
                return next(c)
            }
        }
    }
    return realAuthMiddleware(cfg)
}

// RequireRole returns middleware that checks the user has at least the given role.
// In dev mode, always passes.
func RequireRole(role Role) echo.MiddlewareFunc { ... }
```

Define the permission model — roles, what each can do — in Phase 1 even if the real implementation is weeks away. The shape of the middleware must be stable so that wiring real auth later does not touch route definitions.

Also define from day one:
- `UserFromContext(c echo.Context) *User` — retrieves the current user (returns DevUser in dev)
- `created_by uuid.UUID` column on all mutable entities (populated from `UserFromContext`)

#### Exit gate for Phase 1
- [ ] `openspec/project.md` reviewed and approved
- [ ] All domain capability specs written and validated (`openspec validate --strict`)
- [ ] Navigation graph document complete (all screens enumerated)
- [ ] MCP tool inventory complete
- [ ] Test scenario library covers all primary user journeys
- [ ] No open architecture questions — all design decisions made
- [ ] i18n infrastructure scaffolded: locale.toml seeded, `T(ctx, key)` helper in place, formatting functions defined
- [ ] Audit context contract defined: `ContextWithAudit`, `AuditFromContext`, `ContextWithSource` implemented and unit tested
- [ ] Auth middleware scaffold in place: no-op in dev, real validator wired in prod via config flag, `UserFromContext` defined

---

### Phase 2 — MCP Server + Coding Agent as First UI

**Goal:** Build and validate the complete backend using an AI coding agent as the only UI. The MCP server IS the UI for this phase.

The insight: an AI coding agent using MCP tools exercises the backend in exactly the way a human using the web UI would. If the agent can complete a user journey correctly using only MCP tools, the backend is correct. The web UI is just a rendering layer on top of this validated backend.

This phase is complete when the agent can drive every user journey from the test scenario library written in Phase 1 — without errors, without workarounds, and with the correct data outcomes.

#### What to build

**Domain services** — implement all business logic first:
- One service per bounded context (matches the spec structure from Phase 1)
- Each service method is a complete, validated operation: it reads its preconditions, enforces business rules, writes its results, and returns a typed response or a typed error
- No shortcuts: if the spec says "board approval is required", the service enforces it
- All financial calculations use `decimal.Decimal`; all state transitions are explicit

**PostgreSQL schema + migrations** — implement all tables:
- One migration file per logical group of tables
- All foreign key constraints enforced at the database level
- Indexes on all foreign keys and commonly queried columns
- Soft-delete pattern (`deleted_at`) for user-facing entities; hard append for ledger entries

**MCP server** — expose every domain operation as an MCP tool:
- Read tools: direct service calls, return data as structured JSON
- Write tools: create a staging record (draft), return a preview of the change, do NOT commit
- Commit tool: takes a staging batch ID, commits all drafts atomically
- The staging pattern means the agent can propose changes and humans can review before committing — even in Phase 2 where the "review" is the agent itself describing what it is about to do

**Test suite** — implement all test scenarios from Phase 1:
- Integration tests: each test scenario becomes a Go test function using `database.TestDB(t)`
- Tests drive the service layer directly (not HTTP, not MCP) for speed and debuggability
- E2E tests: a subset of scenarios run against the real HTTP server to validate the full stack
- Golden file tests: complex outputs (reports, aggregations) captured as reference files

#### MCP tool design rules

Every MCP tool must follow these rules:

**Naming:** `verb_noun` in snake_case. Verbs: `create`, `get`, `list`, `update`, `delete`, `transfer`, `issue`, `calculate`, `import`, `export`. Never `do`, `run`, `process`, `handle`.

**Single responsibility:** Each tool does exactly one thing. A tool that creates and then transfers is two tools called in sequence by the agent, not one tool that does both.

**Read vs write separation:**
- Read tools are safe to call at any time. They have no side effects.
- Write tools create a staging draft. They describe what WILL happen if committed, but do not commit.
- A dedicated `commit_batch` tool commits a group of staged writes atomically.
- This gives the user (or a supervising human) a review window before any data is changed.

**Error messages are user-readable:** The agent surfaces error messages directly to the user. Every error must be a complete sentence that explains what went wrong and (where possible) what to do about it. Never: `"CONSTRAINT_VIOLATION"`. Always: `"Cannot transfer shares: the seller does not currently hold any shares in this share class."`.

**Descriptions are precise:** The tool description is what the AI reads to decide which tool to call. It must state:
- What the tool does (one sentence)
- What it does NOT do (if there is a common confusion)
- Any preconditions (e.g., "company must be in REGISTERED status")
- Whether it modifies data or is read-only

**Output is structured:** Every tool returns a consistent JSON shape. List tools always return arrays. Single-entity tools always return an object. Errors are never mixed into the success response body.

#### Agent-driven testing procedure

For each test scenario in the library:

1. Start a fresh database (`task db:reset`).
2. Open an AI coding agent session with MCP tools available.
3. Give the agent the scenario description in plain language.
4. Let the agent execute the scenario using only MCP tools.
5. After the agent reports completion, verify the database state directly (SQL queries or read tools).
6. Document any tool that was confusing, required workarounds, or produced wrong results.
7. Fix the tool or service and re-run until the scenario passes cleanly.

The agent is a proxy for the real user. If the agent is confused by a tool, a user will be confused by the UI. Fix the backend — not the agent's prompt.

#### Exit gate for Phase 2
- [ ] All domain services implemented and tested (unit + integration)
- [ ] All MCP tools implemented and documented
- [ ] Every test scenario from Phase 1 passes via agent-driven execution
- [ ] All Go tests pass (`task test`)
- [ ] Agent can complete a fresh end-to-end user journey (from empty database to finished state) for each primary user story
- [ ] Staging/commit pattern tested: agent proposes, human reviews, human confirms
- [ ] No workarounds in any scenario — if a workaround was needed, the backend was fixed

---

### Phase 3 — HTMX Web UI

**Goal:** Build the human-facing web UI as a rendering layer on top of the already-validated backend.

At this point the backend is correct and fully tested. The web UI has zero new business logic — it is a form-based interface that calls the same service methods the MCP tools call. The test scenarios from Phase 2 are the acceptance criteria.

The navigation graph from Phase 1 is the build plan. Work through it screen by screen.

#### Build order within Phase 3

Build screens in this order — most-used first, least-used last:

1. **Shell and navigation** — sidebar, header, breadcrumbs, company switcher, flash messages. This is the frame everything else lives in. Get it right before building content.

2. **List screens** — company list, stakeholder list, transaction history. These are read-only and straightforward. They give you confidence the data layer works before you touch forms.

3. **Detail screens** — company dashboard, stakeholder detail, share register. Read-only projections of backend data. No forms yet.

4. **Core operation forms** — the highest-frequency write operations first: share issuance, share transfer, new company, new stakeholder. These are the critical paths. If these work, the system is useful.

5. **Supporting operation forms** — less-frequent operations: split, bonus issue, capital reduction, dividend. Same pattern as core forms but lower risk to get wrong.

6. **Complex corporate actions** — merger, demerger, squeeze-out, dissolution. These touch multiple domain services and have multi-step workflows. Build them after simpler forms are stable.

7. **Settings and configuration** — governance settings, share classes, premium tier. Low-traffic, low-risk.

8. **Reporting screens** — tax report preview, compliance status, data quality. Read-only aggregations; build last because they depend on all the data being correct.

#### Screen implementation pattern

Every screen follows the same pattern:

```
GET /companies/:id/<feature>
  → load company (middleware)
  → load screen-specific data (service calls)
  → render full page OR HTMX partial

POST /companies/:id/<feature>
  → parse and validate form values
  → call domain service
  → on success: set flash message, redirect to canonical GET URL
  → on error: re-render form with error state and preserved values
```

**Never render different content on POST success** — always redirect. This prevents double-submit on refresh and makes the browser history correct.

**Preserve form values on error** — when a form submission fails validation, re-render the form with all submitted values preserved and error messages shown inline next to the relevant fields. The user should not have to retype everything.

**HTMX partial responses** — every screen has two render paths:
- Full page: for direct navigation (no `HX-Request` header)
- Partial: for HTMX requests (returns only the content area, not the shell)

Use `render.RenderAuto` to detect and dispatch automatically.

#### Form conventions

- All date fields use native `<input type="date">` — never a text field with a format hint.
- All money fields use `<input type="number" step="0.01">` — let the browser validate.
- All dropdowns for related entities (stakeholders, share classes) are populated server-side — no client-side fetching.
- Required fields are marked both in the HTML (`required` attribute) and re-validated in the handler before calling the service.
- Submit buttons are disabled with HTMX's `hx-disabled-elt` during submission to prevent double-click.

#### Test scenarios become acceptance tests

For each screen:
1. Take the corresponding scenario from Phase 2.
2. Execute it manually in the web UI and verify the outcome matches.
3. Check database state after the operation to confirm correctness.
4. Test the error path: submit invalid data and verify the form re-renders correctly with the error shown.
5. Test HTMX partial rendering: navigate to the screen via HTMX and verify only the partial is returned.

Write automated Playwright (or equivalent) tests for the critical paths. These supplement the Go integration tests — they test the rendering layer, not the business logic.

#### Navigation graph as build checklist

The navigation graph from Phase 1 doubles as the build checklist for Phase 3. Each screen entry gets checked off when:
- [ ] Handler registered in `routes.go`
- [ ] GET handler implemented and tested
- [ ] POST handler implemented and tested (for form screens)
- [ ] Full page rendering works
- [ ] HTMX partial rendering works
- [ ] Error states handled and tested
- [ ] Scenario from Phase 2 passes via web UI

#### Exit gate for Phase 3
- [ ] All screens in the navigation graph are implemented
- [ ] All Phase 2 test scenarios pass via the web UI (manual verification)
- [ ] No business logic in any handler — all logic is in domain services
- [ ] All forms preserve values on error
- [ ] Flash messages work for all success/error states
- [ ] HTMX partial rendering works for all screens
- [ ] All Go tests still pass (`task test`)

---

### Phase 4 — Inline AI in the Web UI

**Goal:** Wire the MCP infrastructure from Phase 2 into the web UI to provide contextual AI assistance at every screen, without rebuilding any backend logic.

The MCP server built in Phase 2 is the engine. Phase 4 is the wiring: connecting the chat interface to the navigation context so the AI knows where the user is and what data is in scope.

This phase transforms the application from a form-based tool into a form-based tool with an AI co-pilot that can answer questions, suggest next actions, execute operations on behalf of the user, and explain what is happening.

#### Context injection architecture

The AI chat interface is context-aware. At every screen, the AI receives:

**Navigation context:**
- Current screen ID (from the navigation graph)
- Company ID and company name (if company-scoped)
- URL and page title

**Data context (data hints):**
- The same data the screen loaded for rendering (cap table snapshot, transaction list, etc.)
- Serialised as a compact JSON summary — not the full dataset

**Tool context:**
- The restricted tool set relevant to the current screen
- Write tools available only if the user has permission
- Tool list filtered by the screen's data hints and navigation category

The navigation graph's `DataHints` field (defined in Phase 1) drives this automatically. The AI always has the same data the user sees on screen.

#### Chat panel design

The chat panel is:
- A persistent sidebar panel, collapsible, available on all company-scoped screens
- Stateless per page load — no conversation history persisted server-side (optional: add session-based history in Phase 4b)
- Driven by HTMX streaming (`hx-swap="beforeend"`) for token-by-token response rendering
- Connected to the MCP orchestrator via a `/chat` endpoint that accepts the current context

The chat panel has two modes:

**Question mode** — the user asks a question. The AI answers using read-only tools. No staging, no confirmation flow. Fast and safe.

**Action mode** — the user asks the AI to do something. The AI uses write tools to create a staging batch. The staging batch is shown in the chat panel as a preview. The user confirms with a single button. The batch is committed.

This is the staging batch pattern from Phase 2, surfaced in the UI.

#### Screen-aware tool restriction

The MCP orchestrator is configured with the full tool set in Phase 2. In Phase 4, the web chat orchestrator uses a **restricted safe tool set** — a subset of tools appropriate for the current screen.

```
Screen: Cap Table
  Read tools:  get_cap_table, list_share_lots, get_transaction_history
  Write tools: issue_shares (→ staging), transfer_shares (→ staging)
  Hidden:      all dissolution tools, all reporting tools

Screen: Tax Reporting
  Read tools:  get_tax_report_preview, get_ownership_days
  Write tools: none (reporting is read-only)
  Hidden:      all write tools
```

The screen's `NavCategory` and `TabGroup` determine which tool groups are exposed. The AI can only use the tools that make sense in context. This prevents the AI from, e.g., initiating a company dissolution while the user is looking at the cap table.

#### Knowledge base

The AI has access to a knowledge base — a curated set of domain knowledge entries that explain:
- How each operation works (what happens step by step)
- What the relevant legal/regulatory requirements are
- Common errors and how to resolve them
- Which MCP tools to use for each user goal
- Links to the relevant spec sections

The knowledge base is a Go map of `string → string` (topic → explanation). It is injected into the AI's system prompt at startup. Keep it in a single file (`internal/agent/knowledge.go`) so it can be edited without touching business logic.

Update the knowledge base whenever:
- A new domain operation is added
- A regulatory requirement changes
- A common user confusion is identified in production

#### Proactive suggestions

At each screen, the AI can offer proactive suggestions based on the current data context:
- "Your cap table has 3 provisional share lots. Would you like me to confirm them?"
- "The RF-1086 deadline is 31 January. Your data quality score is 72% — here are the 3 issues to fix."
- "You have 2 pending board approval requests."

These are generated by the AI reading the data hints injected into the context. They are shown as dismissible hints below the chat input, not as unsolicited messages.

Implement proactive suggestions as a separate `GET /companies/:id/ai-hints` endpoint that the page polls via HTMX on load. The endpoint calls a lightweight AI model with the data context and returns 0–3 suggestion strings. Cache per (company, screen, data hash) to avoid redundant calls.

#### Streaming responses

AI responses must stream token-by-token to feel responsive. Use Server-Sent Events (SSE) or chunked HTTP responses. HTMX handles this with `hx-swap="beforeend"` on a streaming endpoint.

```
POST /companies/:id/chat
  → parse message + context
  → call AI orchestrator (streaming)
  → stream tokens as SSE events: data: {"token": "..."}\n\n
  → on tool use: stream a structured tool-call event the UI can render distinctly
  → on staging batch created: stream a confirmation widget the user can click
```

Tool use events are rendered differently from text — they appear as structured action cards (tool name, parameters, result summary) rather than prose. This makes it clear to the user what the AI actually did vs what it said.

#### Exit gate for Phase 4
- [ ] Chat panel available on all company-scoped screens
- [ ] Context injection working: AI receives current screen, company, and data hints
- [ ] Tool set correctly restricted per screen and nav category
- [ ] Write operations go through staging: AI creates batch, user confirms
- [ ] Streaming responses render token-by-token
- [ ] Tool use events render as structured cards (not prose)
- [ ] Proactive suggestions working on key screens (cap table, tax reporting, data quality)
- [ ] Knowledge base covers all primary domain operations
- [ ] All Phase 2 test scenarios can be completed via the chat interface
- [ ] No regression in Phase 3 web UI functionality

---

### Lessons from the field: what gets expensive when deferred

This section documents real retrofitting costs observed in the 21st-captable project. Use it as a checklist when reviewing a backlog for a new project.

#### The cost multiplier table

| Decision deferred | Right time | Retrofitting cost | Multiplier |
|---|---|---|---|
| i18n / `T(ctx, key)` in templates | Before first template | ~15 dev-days to extract 500 strings from 60 files | **~8x** |
| Audit logging in domain layer | Before first service method | ~77 tasks to move calls from 25 handlers into 40+ domain functions | **~5x** |
| Auth middleware scaffold | Before first route | Touching every route registration + every list handler for data scoping | **~3x** |
| `created_by` / source tracking on mutations | Same time as audit scaffold | Requires schema migration + backfill on all mutable entities | **~3x** |
| Mobile-responsive UI patterns | Before first template | ~40–50 tasks across 15+ template files (table wrappers, grid breakpoints, flex-wrap, chat panel restructure) | **~2x** |
| go-daisy CSS pipeline (own Tailwind build) | Day 1, before first template | All responsive classes silently no-op; discovering this after shipping mobile fixes is a full debugging cycle | **~1.5x** |
| CI pipeline (lint + test on PR) | Day 1 | Low — but every day without it means undetected regressions accumulate | **~1.5x** |
| Structured error types (`AppError`) | Before first service error | Low if caught early; high if raw errors are already scattered across handlers | **~2x** |

#### Patterns that are cheap to add but expensive to retrofit

**Feature gating (free/premium tiers)**
If your product has tiers, define the enforcement pattern before writing the first premium feature. A single `RequirePremium(ctx, companyID)` guard call at the top of each premium service method is trivial to add from the start. Retrofitting it means auditing every service method for tier compliance after the fact — and tier checks in the wrong layer (handler vs service) lead to inconsistent enforcement.

**Soft-delete vs hard-delete**
Decide upfront which entities use soft-delete (`deleted_at`) and which are hard-deleted. Changing a hard-delete to soft-delete later requires a migration, data recovery considerations, and query updates to add `WHERE deleted_at IS NULL` everywhere. The domain model spec from Phase 1 should tag every entity with its deletion policy.

**Pagination on list endpoints**
Adding cursor-based pagination to list endpoints after they are in use requires an API version change (the response shape changes) and frontend updates. Define the paginated response envelope — `{ items: [...], next_cursor: "..." }` — from the first list endpoint. Even if you return all results initially, the envelope means the contract is forward-compatible.

**Structured logging with request context**
Retrofitting `request_id`, `company_id`, and `user_id` into log lines after the fact means touching every log call. Using `slog.With(...)` on a context-bound logger from day one means all downstream log calls automatically include the context. Define `logger.FromContext(ctx)` and set it in middleware before writing the first log line.

**Database advisory lock for migrations**
If you ever deploy more than one replica, migrations that run on startup without coordination will race. Adding the advisory lock after the fact is safe but requires a migration to add the lock call to the migration runner. Add it from the first migration.

#### Patterns that are correctly deferred

Not everything should be built upfront. These are correctly done later:

**Performance caching** — only after you have measured that a specific query is slow under real load. Speculative caches add complexity and invalidation bugs without measurable benefit.

**Batch import tooling** — only after the single-entity operations are stable and tested. Batch operations are just loops over single operations with error aggregation; build the single operation first.

**Complex corporate actions** (merger, demerger, squeeze-out) — only after simple operations (issue, transfer, split) are solid. The complex actions compose the simple ones.

**External API integrations** (tax submission, government registries) — only after the internal data model is stable. External integrations that depend on an unstable schema are the most expensive kind of rework.

**Group / multi-tenant views** — only after the single-entity view is correct. Consolidation is a projection across correct single-entity data; if the single-entity data is wrong, the consolidation will be wrong in amplified ways.

#### The "day one" checklist for any new project

Before writing the first service method or template, verify these are in place:

```
[ ] locale.toml seeded with at least nav/btn/label/error/flash sections
[ ] T(ctx, key) helper in place and tested
[ ] formatInt, formatDecimal, formatDate helpers defined
[ ] audit context contract: ContextWithAudit, AuditFromContext, ContextWithSource
[ ] audit writer nil-safe — calling AuditFromContext on a context without audit never panics
[ ] auth middleware scaffold: no-op in dev, real validator config-gated
[ ] UserFromContext(c) defined — returns DevUser in dev
[ ] created_by column on all mutable entities (populated in domain write functions)
[ ] paginated response envelope defined for all list endpoints
[ ] AppError sentinel pattern defined in pkg/apperror
[ ] Structured error code ranges assigned per domain (100xxx generic, 110xxx entity1, etc.)
[ ] CI pipeline: lint + test on every PR
[ ] pg_advisory_lock in migration runner
[ ] feature gate guard: RequirePremium(ctx, companyID) defined even if all features are free today
[ ] go-daisy CSS pipeline set up: web/base.css, web/app.css, web/staticfiles/, task css
[ ] verify: curl /static/css/app.css | grep "md\\:hidden" returns a match before writing first template
[ ] table scroll wrapper built into the table component — callers cannot produce a bare table
[ ] shell content wrapper uses px-3 sm:px-6 (not bare p-6)
[ ] modal component defaults to max-w-4xl w-full
[ ] all form grids use grid-cols-1 sm:grid-cols-N from the first modal
[ ] chat panel (if applicable) has mobile bottom-sheet / desktop side-panel modes from the first commit
```

---

### Phase sequencing rules

**Do not skip phases.** Each phase validates the previous. A web UI built before the backend is tested produces a tested web UI wrapping an untested backend — the most dangerous combination.

**Do not start Phase 3 until Phase 2's exit gate is met.** If the MCP agent cannot complete a scenario cleanly, the backend has a bug. Fix it. Do not paper over it with frontend workarounds.

**Do not start Phase 4 until Phase 3's exit gate is met.** The AI chat must have correct backend operations to call. If the web UI has bugs, the AI will make them worse.

**Each phase's artifacts are inputs to the next:**
- Phase 1 specs → Phase 2 implementation targets and test scenarios
- Phase 2 MCP tools + test scenarios → Phase 3 acceptance criteria
- Phase 3 navigation graph + screens → Phase 4 context injection and tool restriction
- Phase 4 knowledge base → improved Phase 2 tool descriptions (feeds back)

**The navigation graph is the thread.** It is defined in Phase 1, drives the MCP tool inventory in Phase 2, is the build checklist for Phase 3, and drives context injection in Phase 4. Keep it as the single source of truth for all four phases.
