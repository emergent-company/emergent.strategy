## 1. Fast Compilation Setup

- [ ] 1.1 Update `apps/server/nest-cli.json` to set `typeCheck: false`
- [ ] 1.2 Add `typecheck` script to `apps/server/package.json`: `tsc --noEmit`
- [ ] 1.3 Add `start:dev:check` script that runs typecheck in parallel with dev server
- [ ] 1.4 Update `apps/server/project.json` to add `typecheck` target
- [ ] 1.5 Verify SWC compilation completes in under 1 second

## 2. Development Database Configuration

- [ ] 2.1 Update `apps/server/src/modules/app.module.ts` TypeORM config to check `NODE_ENV` for migrations
- [ ] 2.2 Add `SKIP_MIGRATIONS` environment variable support with dev default
- [ ] 2.3 Add `DB_POOL_MIN` environment variable with dev default of 1
- [ ] 2.4 Update `.env.example` with new environment variables and documentation
- [ ] 2.5 Update `.env.dev.local` (if exists) with optimized defaults
- [ ] 2.6 Add migration skip log message for developer awareness

## 3. Deferred Worker Initialization

- [ ] 3.1 Create utility function `deferInDevelopment(fn, logger)` in common module
- [ ] 3.2 Update `ExtractionWorkerService.onModuleInit` to use deferred startup
- [ ] 3.3 Update `EmbeddingWorkerService.onModuleInit` to use deferred startup
- [ ] 3.4 Update `ChunkEmbeddingWorkerService.onModuleInit` to use deferred startup
- [ ] 3.5 Update `EmailWorkerService.onModuleInit` to use deferred startup
- [ ] 3.6 Update `EmailStatusSyncService.onModuleInit` to use deferred startup
- [ ] 3.7 Update `UserProfileSyncWorkerService.onModuleInit` to use deferred startup
- [ ] 3.8 Update `CacheCleanupService.onModuleInit` to use deferred startup
- [ ] 3.9 Update `RevisionCountRefreshWorkerService.onModuleInit` to use deferred startup
- [ ] 3.10 Update `TagCleanupWorkerService.onModuleInit` to use deferred startup
- [ ] 3.11 Update `ExternalSourceSyncWorkerService.onModuleInit` to use deferred startup
- [ ] 3.12 Add `DEFER_WORKERS` and `WORKER_DEFER_MS` environment variables
- [ ] 3.13 Update `.env.example` with worker configuration documentation

## 4. Documentation

- [ ] 4.1 Update `docs/setup/DEVELOPMENT.md` (or create if not exists) with startup optimization info
- [ ] 4.2 Update `AGENTS.md` or relevant instructions with new dev workflow
- [ ] 4.3 Document when to run migrations manually

## 5. Validation

- [ ] 5.1 Measure cold start time before and after changes
- [ ] 5.2 Measure hot reload time before and after changes
- [ ] 5.3 Verify all workers still function correctly after deferred startup
- [ ] 5.4 Verify production mode maintains existing behavior
- [ ] 5.5 Run existing test suite to ensure no regressions
