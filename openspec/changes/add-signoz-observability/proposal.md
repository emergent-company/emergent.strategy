# Add SigNoz Observability Integration

## Why

The system currently has file-based logging infrastructure (`FileLogger`, `HttpLoggerInterceptor`, `ExtractionLoggerService`) that writes structured logs to:
- `logs/app.log` - All application logs with file/line/method information
- `logs/errors.log` - Error and fatal level logs
- `logs/debug.log` - Debug and verbose logs (development only)
- `logs/http.log` - Apache/Nginx-style HTTP request logs
- `logs/extraction/{job_id}.json` - Detailed extraction job logs

While comprehensive, this file-based logging lacks:

1. **Real-time observability**: No live log streaming or alerting; requires manual tail/grep
2. **Distributed tracing**: No correlation between HTTP requests, background jobs, and database queries
3. **Metrics & dashboards**: No visual dashboards for system health, performance trends, or error rates
4. **Log aggregation**: Logs are scattered across local files; no centralized search across all services
5. **AI-assisted debugging**: AI agents must read files manually; no structured query interface for dynamic log exploration during development
6. **Production monitoring**: No alerts for error spikes, latency increases, or resource exhaustion

SigNoz provides a self-hosted, OpenTelemetry-native observability platform with:
- **Logs**: Centralized log aggregation with full-text search and filtering
- **Traces**: Distributed tracing for request flows across services
- **Metrics**: Custom metrics, histograms, and dashboard visualization
- **Alerts**: Threshold-based alerts for error rates, latency, resource usage
- **AI-friendly API**: Query API for programmatic log/trace access via MCP server

Since the user **already has SigNoz deployed**, this change focuses on:
1. Integrating the NestJS server to send all logs to SigNoz via OpenTelemetry
2. Creating an MCP server that exposes SigNoz's Query API for AI agent debugging
3. Maintaining existing file-based logging as a backup (dual-path)

## What Changes

Add SigNoz as a primary observability platform that:

1. **OpenTelemetry SDK Integration** (`opentelemetry-logging` capability):
   - Install `@opentelemetry/api`, `@opentelemetry/sdk-node`, `@opentelemetry/exporter-logs-otlp-http` packages
   - Create `TelemetryModule` with `TelemetryService` for SDK initialization
   - Configure OTLP exporter to send logs to SigNoz collector endpoint
   - Instrument `FileLogger` to send all log entries to OpenTelemetry LoggerProvider
   - Add trace context propagation (trace ID, span ID) to all log entries
   - Ensure graceful degradation: file logging continues if SigNoz fails

2. **Distributed Tracing** (`opentelemetry-tracing` capability):
   - Install `@opentelemetry/instrumentation-http`, `@opentelemetry/instrumentation-express`, `@opentelemetry/instrumentation-pg`
   - Configure auto-instrumentation for HTTP requests, Express middleware, PostgreSQL queries
   - Create manual spans for critical operations (extraction jobs, LLM calls, graph operations)
   - Add custom attributes to spans: user ID, org ID, project ID, document ID
   - Correlate logs with traces via trace context injection

3. **Custom Metrics** (`opentelemetry-metrics` capability):
   - Install `@opentelemetry/sdk-metrics`
   - Create custom metrics for business events:
     - `extraction_jobs_total` (counter) - Extraction jobs started
     - `extraction_jobs_duration` (histogram) - Job execution time
     - `llm_calls_total` (counter) - LLM API calls by provider/model
     - `llm_tokens_total` (counter) - Token usage by provider/model
     - `document_chunks_processed` (counter) - Chunks processed during ingestion
     - `graph_query_duration` (histogram) - Graph query execution time
     - `http_request_duration` (histogram) - HTTP request latency (supplement built-in instrumentation)
   - Expose metrics endpoint `/metrics` for Prometheus scraping (SigNoz compatibility)

4. **SigNoz MCP Server** (`signoz-mcp-server` capability):
   - Create new MCP server module: `tools/signoz-mcp-server/`
   - Implement MCP tools for SigNoz Query API:
     - `query_logs` - Search logs with filters (service, level, time range, full-text)
     - `get_traces` - Retrieve traces by trace ID or filters (service, operation, duration)
     - `query_metrics` - Get metric values (time series, aggregations)
     - `get_service_map` - Visualize service dependencies
     - `get_errors` - Fetch recent errors with stack traces and context
   - Configure SigNoz API credentials (endpoint, API token) via environment variables
   - Add to `.vscode/mcp.json` for automatic AI agent integration
   - Document usage in `docs/integrations/signoz/MCP_SERVER.md`

5. **Configuration** (`signoz-configuration` capability):
   - Add environment variables to `.env.example`:
     - `SIGNOZ_ENABLED=true` - Enable/disable SigNoz integration
     - `SIGNOZ_OTLP_ENDPOINT=http://localhost:4318` - OTLP collector endpoint
     - `SIGNOZ_API_ENDPOINT=http://localhost:3301` - SigNoz frontend/API endpoint
     - `SIGNOZ_API_TOKEN=` - API token for MCP server queries
     - `OTEL_SERVICE_NAME=spec-server` - Service name in SigNoz
     - `OTEL_ENVIRONMENT=development` - Environment tag (development/staging/production)
   - Create `apps/server/.env.signoz.example` with production-ready configuration
   - Update `AppConfigService` to load and validate SigNoz configuration
   - Add configuration validation on startup with helpful error messages

6. **Dual-Path Logging Strategy** (`dual-path-logging` capability):
   - Keep existing `FileLogger` as-is (backward compatibility)
   - Add OpenTelemetry layer that reads from same log stream
   - Ensure both destinations receive identical log data
   - Implement fallback: continue file logging even if SigNoz is unreachable
   - Add startup diagnostic: test SigNoz connectivity and log status
   - Document dual-path rationale: files for local debugging, SigNoz for production observability

7. **Testing**:
   - Unit tests for `TelemetryService` (initialization, configuration, error handling)
   - Integration tests for log forwarding (verify logs reach SigNoz)
   - E2E tests for distributed tracing (verify trace context propagation)
   - MCP server tests (mock SigNoz API, verify query formatting)
   - Load tests for metrics (ensure no performance degradation)

8. **Documentation**:
   - `docs/integrations/signoz/README.md` - Architecture overview and setup guide
   - `docs/integrations/signoz/CONFIGURATION.md` - Environment variables and tuning
   - `docs/integrations/signoz/MCP_SERVER.md` - AI agent usage guide with examples
   - `docs/integrations/signoz/DASHBOARDS.md` - Pre-built dashboard configurations
   - `docs/integrations/signoz/TROUBLESHOOTING.md` - Common issues and solutions
   - Update `SETUP.md` with SigNoz integration steps (user already has it deployed)
   - Update `.github/copilot-instructions.md` with MCP server usage instructions

## Impact

**Benefits**:
- **Real-time observability**: Live log streaming and dashboards for system health monitoring
- **AI-assisted debugging**: AI agents can dynamically query logs/traces during development sessions
- **Production readiness**: Alerting and monitoring for error rates, latency, resource usage
- **Distributed tracing**: End-to-end request flow visualization (HTTP → background jobs → database)
- **Performance optimization**: Identify slow queries, bottlenecks, and resource hotspots
- **Cost tracking**: Centralized LLM token usage metrics across all providers
- **Team collaboration**: Share dashboards and traces without file access or database queries

**Risks & Mitigations**:
- **Performance overhead** (SDK instrumentation + network calls):
  - Mitigation: OpenTelemetry batching (default 5s intervals, 512 events/batch)
  - Expected impact: <5ms per request, <1% CPU overhead (industry standard)
  - Make SigNoz optional via `SIGNOZ_ENABLED=false` for resource-constrained environments
- **Network dependency** (SigNoz unavailable):
  - Mitigation: File logging continues as fallback (dual-path)
  - Mitigation: Async buffering with circuit breaker (fail fast after 3 consecutive errors)
  - Mitigation: Clear startup diagnostic showing SigNoz connection status
- **Data duplication** (files + SigNoz):
  - Accept trade-off: complementary systems serve different purposes
  - File logs: local debugging, forensics, audit trail (always available)
  - SigNoz: real-time monitoring, dashboards, AI queries (production focus)
  - Recommend log rotation for file logs (7-day retention) to save disk space
- **Learning curve** (new observability platform):
  - Mitigation: Comprehensive documentation with examples
  - Mitigation: Pre-built dashboards for common use cases (errors, latency, LLM costs)
  - Mitigation: MCP server abstracts SigNoz API complexity for AI agents

**Timeline**: 12-16 hours (6 phases: OpenTelemetry SDK setup 2-3h, tracing instrumentation 3-4h, custom metrics 2h, MCP server 3-4h, testing 2-3h, documentation 2h)

**Open Questions**:
1. Should we instrument admin frontend (React) to send logs/traces to SigNoz?
   - Recommendation: No in this change; focus on server-side first. Add frontend tracing in follow-up change if needed.
2. What retention policy should SigNoz use (7 days, 30 days, 90 days)?
   - Recommendation: 30 days default (configurable in SigNoz), with file logs at 7 days.
3. Should we disable file-based debug logs (`logs/debug.log`) in production?
   - Recommendation: Yes, only write to SigNoz in production (set `NODE_ENV=production`). Keep debug file logs in development.
4. Should extraction job logs (`logs/extraction/{job_id}.json`) continue writing to files?
   - Recommendation: Yes, keep as forensic audit trail. These are low-volume (per-job) and valuable for debugging failed extractions.

## Dependencies

- User-provided SigNoz deployment with accessible endpoints:
  - OTLP collector: `http://<signoz-host>:4318`
  - Frontend/API: `http://<signoz-host>:3301`
  - API token for MCP server authentication
- NPM packages (18 new dependencies):
  - Core: `@opentelemetry/api`, `@opentelemetry/sdk-node`, `@opentelemetry/resources`
  - Logs: `@opentelemetry/exporter-logs-otlp-http`, `@opentelemetry/sdk-logs`
  - Traces: `@opentelemetry/exporter-trace-otlp-http`, `@opentelemetry/sdk-trace-node`
  - Metrics: `@opentelemetry/sdk-metrics`, `@opentelemetry/exporter-metrics-otlp-http`
  - Instrumentation: `@opentelemetry/instrumentation`, `@opentelemetry/instrumentation-http`, `@opentelemetry/instrumentation-express`, `@opentelemetry/instrumentation-pg`, `@opentelemetry/auto-instrumentations-node`
  - Semantic conventions: `@opentelemetry/semantic-conventions`
  - MCP server: `@modelcontextprotocol/sdk`, `axios` (for SigNoz API queries)

## Compatibility

- **Backward compatible**: Existing file-based logging continues unchanged
- **Optional**: Entire integration can be disabled via `SIGNOZ_ENABLED=false`
- **No schema changes**: No database migrations required
- **No API changes**: No breaking changes to controllers or services
- **Development workflow**: Developers can continue using file logs; SigNoz is additive
- **Testing**: E2E tests unaffected; SigNoz disabled by default in test environment

## Success Criteria

1. **All logs forwarded**: Every log entry written to files also appears in SigNoz
2. **Trace context**: HTTP requests generate traces with spans for key operations
3. **Custom metrics**: LLM call counts and token usage visible in SigNoz dashboards
4. **MCP server working**: AI agents can query logs via `signoz_query_logs` tool
5. **Zero performance regression**: <5ms latency increase per request, <1% CPU overhead
6. **Graceful degradation**: File logging continues if SigNoz unreachable
7. **Documentation complete**: All setup steps documented with screenshots

## Out of Scope

- Frontend (React admin) observability - defer to future change
- SigNoz deployment itself (user already has it)
- Log aggregation from other services (focus on `spec-server` only)
- Alert rule configuration (document examples, but don't auto-create)
- Custom SigNoz dashboard JSON exports (document structure, provide templates)
- Migration from existing LangFuse integration (if already present)
