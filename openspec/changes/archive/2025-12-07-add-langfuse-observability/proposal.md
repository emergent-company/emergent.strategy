# Add LangFuse Observability Integration

## Why

The system currently has internal monitoring (`MonitoringLoggerService` with `kb.llm_call_logs` and `kb.system_process_logs`) that tracks LLM calls, costs, and system events. However, this monitoring lacks:

1. **Visual trace debugging**: No UI to inspect LLM prompts, responses, and token usage visually
2. **External dashboards**: Internal monitoring is database-only; can't share traces with teammates or stakeholders
3. **Hierarchical trace visualization**: No parent-child relationship visualization for extraction jobs → LLM calls
4. **Prompt optimization tools**: No tools to compare prompt versions or identify performance patterns

LangFuse provides a self-hosted observability platform specifically designed for LLM applications, with visual trace debugging, dashboards, prompt management, and team collaboration features. Integrating LangFuse as a complementary layer (alongside internal monitoring) will enable developers to debug extraction failures faster, optimize prompts for cost and quality, and share trace data externally.

## What Changes

Add LangFuse as a complementary observability layer that:

1. **Self-hosted infrastructure** - Deploy LangFuse via Docker Compose (PostgreSQL, ClickHouse, Redis, web server, worker)
2. **SDK integration** - Install `langfuse` npm package and create `LangfuseModule` with `LangfuseService`

1. **Docker Infrastructure** (`langfuse-infrastructure` capability):
   - Add 5 new Docker Compose services: `langfuse-db` (PostgreSQL), `clickhouse` (analytics), `redis` (job queue), `langfuse-server` (web UI), `langfuse-worker` (background processor)
   - Add environment configuration in `.env.langfuse.example` with secure defaults
   - Isolate LangFuse network from main application (internal-only communication except web UI)

2. **NestJS Integration** (`langfuse-tracing` capability):
   - Install `langfuse-node` SDK
   - Create `LangfuseModule` and `LangfuseService` for SDK client management
   - Add configuration to `AppConfigService` (`LANGFUSE_ENABLED`, `LANGFUSE_SECRET_KEY`, `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_HOST`)
   - Instrument `ExtractionWorkerService` to create parent traces for extraction jobs
   - Instrument `VertexAIProvider` and `LangChainGeminiProvider` to create child observations for LLM calls
   - Pass trace context (`traceId`, `observationId`) through call chains

3. **Monitoring Integration** (`langfuse-monitoring-integration` capability):
   - Extend `MonitoringLoggerService` to accept optional `traceId` and `observationId` parameters
   - Add database migration: `langfuse_trace_id` column to `kb.system_process_logs`, `langfuse_observation_id` column to `kb.llm_call_logs`
   - Implement dual-path monitoring: continue writing to internal DB while also sending to LangFuse
   - Ensure graceful degradation: internal monitoring continues even if LangFuse fails

4. **Testing**:
   - Unit tests for `LangfuseService` (initialization, observation creation, error handling)
   - Integration tests for LLM provider instrumentation (observation data accuracy)
   - E2E tests for complete job tracing flow (parent trace → child observations → finalization)

5. **Documentation**:
   - `SETUP.md` updates for LangFuse deployment
   - `docs/integrations/langfuse/README.md` with architecture overview
   - `docs/integrations/langfuse/DEVELOPER_GUIDE.md` with usage examples

## Impact

**Benefits**:
- **Faster debugging**: Visual trace timeline replaces manual log searching
- **Cost optimization**: Identify expensive prompts and optimize token usage
- **Team collaboration**: Share traces via URL without database access
- **Prompt engineering**: Compare prompt versions and measure quality
- **External reporting**: Generate observability reports for stakeholders

**Risks & Mitigations**:
- **Infrastructure overhead** (5 new Docker services): Make LangFuse optional via `LANGFUSE_ENABLED=false` flag; development environments can disable it
- **Performance impact** (SDK network calls): Use async batch sending (10 events or 10 seconds); add 5-10ms latency per LLM call (negligible)
- **Data duplication** (DB + LangFuse): Accept trade-off; complementary systems serve different purposes (internal cost tracking vs external debugging)

**Timeline**: 10-15 hours (5 phases: infrastructure setup 2-3h, core integration 3-4h, LLM instrumentation 2-3h, job tracing 2-3h, documentation 1-2h)

   - Recommendation: Yes, in a follow-up change after extraction jobs are validated
4. What retention policy should LangFuse use for traces (30 days, 90 days, indefinite)?
   - Recommendation: 90 days default, configurable via LangFuse admin UI
