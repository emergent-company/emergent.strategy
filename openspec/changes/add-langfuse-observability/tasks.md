# Implementation Tasks for LangFuse Observability

## Phase 1: Infrastructure Setup

- [ ] **Task 1.1**: Create LangFuse infrastructure in `~/emergent-infra/`

  - Create directory `~/emergent-infra/` if it doesn't exist
  - Create `~/emergent-infra/docker-compose.yml`
  - Add `langfuse-db` service (PostgreSQL 16 on port 5433)
  - Add `clickhouse` service (ClickHouse 24.1 on port 8123, 9000)
  - Add `redis` service (Redis 7 on port 6380)
  - Add `langfuse-server` service (Langfuse v3.0 on port 3010)
  - Add `langfuse-worker` service (background job processor)
  - Configure service dependencies and health checks
  - Test: `docker-compose -f ~/emergent-infra/docker-compose.yml up langfuse-server` succeeds and UI is accessible at `http://localhost:3010`

- [ ] **Task 1.2**: Create environment configuration in `~/emergent-infra/`

  - Create `~/emergent-infra/.env.example`:
    - `LANGFUSE_ENABLED` (default: false)
    - `LANGFUSE_SECRET_KEY`, `LANGFUSE_PUBLIC_KEY` (empty defaults)
    - `LANGFUSE_HOST` (default: http://localhost:3010)
    - `LANGFUSE_FLUSH_AT`, `LANGFUSE_FLUSH_INTERVAL` (optional batch config)
    - `POSTGRES_PASSWORD_LANGFUSE`, `SALT`, `NEXTAUTH_SECRET`
  - Document configuration in `~/emergent-infra/README.md`
  - Test: Copy `.env.example` to `.env` in `~/emergent-infra/`, set `LANGFUSE_ENABLED=true`, verify no errors on startup

- [ ] **Task 1.3**: Verify Docker Compose deployment
  - Run `docker-compose -f ~/emergent-infra/docker-compose.yml up -d langfuse-server langfuse-worker`
  - Verify all 5 services start without errors (check `docker ps`)
  - Verify langfuse-server web UI loads at `http://localhost:3010`
  - Verify langfuse-server can connect to langfuse-db and clickhouse
  - Test: Create a test project in LangFuse UI, generate API keys, verify keys work

## Phase 2: Core NestJS Integration

- [ ] **Task 2.1**: Install LangFuse SDK

  - Run `npm install langfuse-node --save` in `apps/server/`
  - Verify package appears in `package.json` dependencies
  - Run `npm install` to update lock file
  - Test: Import `import { Langfuse } from 'langfuse-node'` in a test file, verify no errors

- [ ] **Task 2.2**: Create LangfuseModule

  - Create `apps/server/src/modules/langfuse/langfuse.module.ts`
  - Define module with `LangfuseService` as provider
  - Export `LangfuseService` for use in other modules
  - Mark module as `@Global()` for application-wide availability
  - Test: Import `LangfuseModule` in `AppModule`, verify application starts

- [ ] **Task 2.3**: Implement LangfuseService

  - Create `apps/server/src/modules/langfuse/langfuse.service.ts`
  - Inject `AppConfigService` to read configuration
  - Implement `onModuleInit()` to initialize SDK client or skip if disabled
  - Implement `isEnabled()` method returning boolean
  - Implement `createJobTrace(jobId, metadata)` method
  - Implement `createObservation(traceId, name, input)` method
  - Implement `finalizeTrace(traceId, status)` method
  - Implement `shutdown()` method to flush pending traces
  - Add error handling: wrap all SDK calls in try-catch, log errors, return null on failure
  - Test: Unit test with mocked SDK client, verify graceful degradation

- [ ] **Task 2.4**: Extend AppConfigService with LangFuse configuration

  - Add properties to `AppConfigService`:
    - `langfuseEnabled: boolean`
    - `langfuseSecretKey?: string`
    - `langfusePublicKey?: string`
    - `langfuseHost?: string`
    - `langfuseFlushAt?: number`
    - `langfuseFlushInterval?: number`
  - Read from environment variables in constructor
  - Add validation: log warning if enabled but keys missing
  - Test: Set env vars, verify `AppConfigService` properties are populated

- [ ] **Task 2.5**: Create unit tests for LangfuseService
  - Create `apps/server/src/modules/langfuse/__tests__/langfuse.service.spec.ts`
  - Test: Service initializes when enabled with valid config
  - Test: Service skips initialization when disabled
  - Test: Service handles missing credentials gracefully
  - Test: `createJobTrace()` returns null when disabled
  - Test: `createObservation()` catches SDK errors and returns null
  - Test: `shutdown()` flushes pending traces on app shutdown
  - Ensure all tests pass with `npm run test`

## Phase 3: LLM Provider Instrumentation

- [ ] **Task 3.1**: Update LangChainGeminiProvider with LangFuse tracing

  - Inject `LangfuseService` into constructor
  - Modify `extractEntitiesForType()` to accept optional `traceId` in context
  - Create observation before LLM call, update after completion
  - Handle errors gracefully, ensure provider works if LangFuse disabled
  - Test: Run extraction with LangChainGeminiProvider, verify observations

- [ ] **Task 3.2**: Create integration tests for LLM provider tracing
  - Create `apps/server/src/modules/extraction-jobs/llm/__tests__/langchain-tracing.integration.spec.ts`
  - Test: Observation created when LangFuse enabled
  - Test: Observation includes correct input metadata (type, model, prompt)
  - Test: Observation updates with output and token usage
  - Test: Observation marks error on LLM failure
  - Test: Provider works normally when LangFuse disabled or fails
  - Ensure all tests pass

## Phase 4: Job-Level Parent Traces

- [ ] **Task 4.1**: Update ExtractionWorkerService to create parent traces

  - Inject `LangfuseService` into constructor
  - At start of `processJob()`: call `createJobTrace(jobId, metadata)` to get traceId
  - Pass `traceId` in context to LLM provider calls
  - After job completes: call `finalizeTrace(traceId, "success")` or `finalizeTrace(traceId, "error")`
  - Test: Run extraction job, verify parent trace appears in LangFuse UI

- [ ] **Task 4.2**: Update MonitoringLoggerService to accept trace context

  - Add optional `traceId` and `observationId` to method signatures:
    - `logProcessEvent(eventType, metadata, traceId?)`
    - `startLLMCall(model, context, observationId?)`
  - Store traceId/observationId in database records for cross-referencing
  - Test: Query `kb.llm_call_logs` with observationId, verify linkage

- [ ] **Task 4.3**: Create database migration for LangFuse columns

  - Create migration: `apps/server/migrations/add-langfuse-trace-columns.sql`
  - Add `langfuse_trace_id TEXT` to `kb.system_process_logs`
  - Add `langfuse_observation_id TEXT` to `kb.llm_call_logs`
  - Apply migration: `npm run migrate` or manual execution
  - Test: Insert test record with traceId, query by traceId

- [ ] **Task 4.4**: Create E2E test for complete job tracing flow
  - Create `apps/server/test/langfuse-tracing.e2e-spec.ts`
  - Test: Queue extraction job, verify parent trace created
  - Test: Verify child observations for each LLM call
  - Test: Verify trace status updates to "success" on completion
  - Test: Verify internal DB logs include traceId and observationId
  - Test: Full flow works when LangFuse disabled (no errors)
  - Ensure all tests pass

## Phase 5: Documentation and Rollout

- [ ] **Task 5.1**: Update SETUP.md with LangFuse installation

  - Document Docker Compose setup for LangFuse services
  - Document environment variable configuration
  - Document how to access LangFuse UI (`http://localhost:3010`)
  - Document how to generate API keys in LangFuse UI
  - Document optional vs required deployment

- [ ] **Task 5.2**: Create LangFuse integration README

  - Create `docs/integrations/langfuse/README.md`
  - Document architecture: dual-path monitoring, parent traces, observations
  - Document how to enable/disable LangFuse
  - Document error handling and graceful degradation
  - Document how to query internal DB and link to LangFuse traces
  - Include screenshots of LangFuse UI showing traces

- [ ] **Task 5.3**: Update main README with LangFuse mention

  - Add LangFuse to "Features" or "Observability" section
  - Link to LangFuse integration README
  - Mention optional deployment (works without LangFuse)

- [ ] **Task 5.4**: Create developer guide for using LangFuse

  - Create `docs/integrations/langfuse/DEVELOPER_GUIDE.md`
  - Document how to inspect traces for debugging
  - Document how to share traces with teammates
  - Document how to identify slow LLM calls
  - Document how to compare LangFuse and internal monitoring data
  - Document how to extend tracing to new LLM providers

- [ ] **Task 5.5**: Test complete system end-to-end
  - Run full extraction pipeline with LangFuse enabled
  - Verify traces appear in LangFuse UI
  - Verify internal monitoring DB has complete data
  - Test graceful degradation: stop langfuse-server, verify app still works
  - Test re-enabling: restart langfuse-server, verify tracing resumes
  - Document any issues or edge cases discovered

## Validation Checklist

Before marking this change as complete, verify:

- [ ] All Docker Compose services start without errors
- [ ] LangFuse UI is accessible at `http://localhost:3010`
- [ ] Application starts successfully with `LANGFUSE_ENABLED=true`
- [ ] Application starts successfully with `LANGFUSE_ENABLED=false`
- [ ] Extraction jobs create parent traces in LangFuse
- [ ] LLM calls create child observations with correct metadata
- [ ] Traces show input, output, tokens, duration, status
- [ ] Internal monitoring continues to work when LangFuse enabled
- [ ] Internal monitoring continues to work when LangFuse disabled
- [ ] Application does not crash if LangFuse API is unreachable
- [ ] All unit tests pass: `npm run test`
- [ ] All integration tests pass: `npm run test:integration`
- [ ] All E2E tests pass: `npm run test:e2e`
- [ ] Database migration applied successfully
- [ ] Documentation is complete and accurate
- [ ] Code follows existing conventions (NestJS modules, error handling, logging)

## Estimated Timeline

- Phase 1 (Infrastructure): 2-3 hours
- Phase 2 (Core Integration): 3-4 hours
- Phase 3 (LLM Providers): 2-3 hours
- Phase 4 (Job Traces): 2-3 hours
- Phase 5 (Documentation): 1-2 hours

**Total Estimated Time**: 10-15 hours (matches proposal timeline of 8-14 hours)

## Dependencies

- Docker Compose for local development
- PostgreSQL 16 (for langfuse-db)
- ClickHouse 24.1 (for langfuse analytics)
- Redis 7 (for langfuse job queue)
- `langfuse-node` npm package (SDK)
- Existing `MonitoringLoggerService` (for dual-path monitoring)
- Existing LLM providers (`VertexAIProvider`, `LangChainGeminiProvider`)

## Rollback Plan

If LangFuse integration causes issues:

1. Set `LANGFUSE_ENABLED=false` in environment to disable immediately
2. Stop LangFuse Docker services: `docker-compose stop langfuse-server langfuse-worker langfuse-db clickhouse redis`
3. Remove LangFuse SDK calls from code (revert PRs)
4. Remove `langfuse-node` package: `npm uninstall langfuse-node`
5. Remove database migration (if necessary): run rollback SQL
6. Internal monitoring continues to function normally throughout rollback
