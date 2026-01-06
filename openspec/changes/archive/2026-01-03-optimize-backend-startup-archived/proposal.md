# Change: Optimize Backend Start and Reload Time

> **⚠️ ARCHIVED** - Investigation completed 2026-01-03. This proposal was based on an
> incorrect assumption of 15-20s startup time. Actual measurement showed **~1.1 seconds**
> from bootstrap to server listening. The current setup (SWC + Node.js 20) is already optimal.
> Bun/Deno alternatives were evaluated but are not viable due to NestJS, TypeORM, and
> OpenTelemetry incompatibilities. No action needed.

## Why

Developer productivity is significantly impacted by slow backend startup and hot-reload times. The current NestJS server takes substantial time to start due to:

1. **TypeScript type checking on every rebuild** - The SWC builder has `typeCheck: true`, adding ~3-5s per reload
2. **Database migrations running on every startup** - `migrationsRun: true` by default checks/runs migrations on each start
3. **25+ services with `onModuleInit` hooks** - Background workers, pollers, and schedulers all initialize immediately
4. **46 modules loaded synchronously** - All modules loaded at startup regardless of usage
5. **Heavy OTEL auto-instrumentations** - When enabled, loads numerous instrumentation packages

These issues compound to create a slow feedback loop during development, reducing iteration speed.

## What Changes

### Phase 1: Quick Wins (Immediate Impact)

- **Disable type checking during watch mode** - Use separate type-check process
- **Skip migrations by default in dev** - Add `SKIP_MIGRATIONS=1` to dev startup
- **Reduce DB connection pool minimum** - Lower `DB_POOL_MIN` from 5 to 1 in dev

### Phase 2: Deferred Worker Initialization

- **Lazy worker startup** - Workers start on first use or after configurable delay
- **Conditional worker loading** - Disable non-essential workers in dev mode

### Phase 3: Module Optimization (Optional)

- **NestJS lazy modules** - Use `LazyModuleLoader` for non-critical features
- **Dynamic imports** - Convert heavy static imports to dynamic where possible

## Impact

- **Affected code:**

  - `apps/server/nest-cli.json` - Compiler configuration
  - `apps/server/src/modules/app.module.ts` - Module loading
  - `apps/server/package.json` - Dev scripts
  - Worker services with `onModuleInit` hooks
  - `.env.example` - New environment variables

- **Expected improvements:**

  - Cold start: 15-20s → 5-8s (2-3x faster)
  - Hot reload: 5-8s → 1-3s (2-4x faster)

- **No breaking changes** - All optimizations are development-mode only
