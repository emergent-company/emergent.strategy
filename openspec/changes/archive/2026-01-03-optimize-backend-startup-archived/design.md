## Context

The NestJS backend server currently has slow startup and hot-reload times that negatively impact developer productivity. Analysis identified multiple bottlenecks:

**Current State:**

- 46 modules loaded synchronously at startup
- 25+ services with `onModuleInit` hooks that start background workers immediately
- TypeScript type checking runs on every watch rebuild (SWC with `typeCheck: true`)
- Database migrations check/run on every startup
- Database connection pool initializes 5 connections minimum

**Stakeholders:**

- Developers (primary beneficiaries)
- CI/CD systems (faster test runs)

## Goals / Non-Goals

**Goals:**

- Reduce cold start time from ~15-20s to ~5-8s
- Reduce hot reload time from ~5-8s to ~1-3s
- Maintain full functionality in production mode
- Keep changes backward compatible

**Non-Goals:**

- Optimizing production startup time (already acceptable)
- Changing the module architecture fundamentally
- Adding new external dependencies

## Decisions

### Decision 1: Separate Type Checking from Compilation

**What:** Remove `typeCheck: true` from `nest-cli.json` for development, run type checking as a separate background process.

**Why:** SWC compilation is fast (~500ms), but type checking adds 3-5 seconds. Running them separately allows immediate feedback on code changes while type errors are reported asynchronously.

**Alternatives considered:**

- Keep current behavior: Rejected (too slow)
- Use `tsc --noEmit --watch` in parallel: Selected (best of both worlds)
- Use `ts-node-dev --transpile-only`: Rejected (loses incremental compilation benefits of SWC)

### Decision 2: Skip Migrations in Development by Default

**What:** Set `SKIP_MIGRATIONS=1` as the default for development startup. Developers manually run migrations when needed.

**Why:** Migration checks add 1-2 seconds on every startup. Developers rarely add migrations, and when they do, a one-time manual run is acceptable.

**Alternatives considered:**

- Keep current behavior: Rejected (unnecessary overhead)
- Cache migration state: Rejected (adds complexity)
- Environment variable toggle: Selected (simple, explicit)

### Decision 3: Deferred Worker Initialization

**What:** Workers that use `onModuleInit` will defer their actual startup by a configurable delay (e.g., 2 seconds) in development mode.

**Why:** Background workers (embedding, extraction, email, sync) don't need to be ready immediately. Deferring them allows the HTTP server to become responsive faster.

**Implementation:**

```typescript
// In worker services
async onModuleInit() {
  if (process.env.NODE_ENV === 'development' && process.env.DEFER_WORKERS !== 'false') {
    setTimeout(() => this.startWorker(), 2000);
    return;
  }
  await this.startWorker();
}
```

**Alternatives considered:**

- Disable workers entirely in dev: Rejected (breaks testing)
- Use lazy module loading: Rejected (more complex, less control)
- Defer with environment flag: Selected (simple, controllable)

### Decision 4: Reduce Development Database Pool

**What:** Set `DB_POOL_MIN=1` for development (vs 5 in production).

**Why:** Connection establishment is slow (~200ms per connection). Reducing minimum pool size defers connection creation until needed.

**Alternatives considered:**

- Set to 0: Rejected (causes latency on first query)
- Keep at 5: Rejected (unnecessary for dev)
- Set to 1: Selected (balance of latency and startup time)

## Risks / Trade-offs

| Risk                          | Mitigation                                             |
| ----------------------------- | ------------------------------------------------------ |
| Type errors discovered later  | IDE provides immediate feedback; CI catches all errors |
| Missed migrations in dev      | Clear error messages; documented workflow              |
| Workers not ready when needed | Short 2s delay; configurable via env var               |
| Different dev/prod behavior   | All optimizations are clearly documented dev-only      |

## Migration Plan

1. **Phase 1 (Quick Wins):** Update compiler config, add environment variables

   - Add `SKIP_MIGRATIONS=1` to `.env.dev.local`
   - Update `nest-cli.json` to disable type checking
   - Add parallel type-check script to package.json
   - Reduce `DB_POOL_MIN` default

2. **Phase 2 (Worker Deferral):** Update worker services

   - Add `DEFER_WORKERS` environment variable
   - Update all worker services with deferred initialization
   - Test to ensure workers still function correctly

3. **Rollback:** Remove environment variables, revert `nest-cli.json` change

## Open Questions

1. Should we also implement NestJS lazy modules for non-critical features (e.g., SuperadminModule, MonitoringModule)?

   - **Recommendation:** Defer to Phase 3, measure impact of Phase 1-2 first

2. What's the optimal worker defer delay?

   - **Recommendation:** Start with 2 seconds, make configurable via `WORKER_DEFER_MS`

3. Should hot-reload use `--watch` or `--watch-assets`?
   - **Recommendation:** Keep default `--watch`, add documentation for asset watching if needed

## Rejected Alternatives

### Alternative Runtime: Bun

**Evaluated:** Using Bun as the runtime instead of Node.js for faster startup.

**Decision:** Rejected - incompatible with critical dependencies.

| Dependency                   | Bun Compatibility     | Issue                                    |
| ---------------------------- | --------------------- | ---------------------------------------- |
| NestJS                       | Unsupported           | Relies on Node.js-specific APIs          |
| TypeORM                      | Experimental          | Native pg driver issues                  |
| OpenTelemetry (15+ packages) | "Unsupported Runtime" | gRPC errors, auto-instrumentation broken |
| @grpc/grpc-js                | Not compatible        | Native bindings                          |
| Passport                     | Node.js specific      | Auth would break                         |

**Conclusion:** Migration would require replacing core infrastructure (ORM, observability, auth). Risk far outweighs potential 1-2s startup improvement.

**Partial Use:** Bun CAN be used as a package manager (`bun install`) for 2-10x faster dependency installation while keeping Node.js as runtime.

### Alternative Runtime: Deno

**Evaluated:** Using Deno as the runtime.

**Decision:** Rejected - even less compatible than Bun.

- NestJS has no Deno support
- TypeORM doesn't support Deno
- Would require complete framework rewrite (e.g., to Hono/Fresh)
- Not viable for this codebase

### Alternative: ts-node-dev with transpile-only

**Evaluated:** Using `ts-node-dev --transpile-only` instead of NestJS CLI.

**Decision:** Rejected - loses SWC benefits.

- SWC is already configured and faster than ts-node
- Would lose incremental compilation
- NestJS CLI with SWC is the optimal choice
