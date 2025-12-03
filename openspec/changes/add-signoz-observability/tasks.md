# Implementation Tasks: Add SigNoz Observability Integration

## Phase 1: OpenTelemetry SDK Setup (2-3h)

### Infrastructure
- [ ] Install OpenTelemetry packages (`@opentelemetry/api`, `@opentelemetry/sdk-node`, exporters)
- [ ] Create `apps/server/src/modules/telemetry/` directory structure
- [ ] Create `TelemetryModule` with module definition and exports
- [ ] Create `TelemetryService` for SDK initialization and lifecycle management
- [ ] Add environment variables to `.env.example` (SIGNOZ_ENABLED, SIGNOZ_OTLP_ENDPOINT, etc.)
- [ ] Update `AppConfigService` to load and validate SigNoz configuration
- [ ] Add startup diagnostic to test SigNoz connectivity and log status

### OTLP Exporter Configuration
- [ ] Configure OTLP HTTP exporter for logs (endpoint, headers, timeout)
- [ ] Configure OTLP HTTP exporter for traces (endpoint, headers, timeout)
- [ ] Configure OTLP HTTP exporter for metrics (endpoint, headers, timeout)
- [ ] Set up resource attributes (service name, version, environment)
- [ ] Implement batch processing configuration (interval, max queue size)
- [ ] Add circuit breaker pattern for SigNoz failures (fail fast after 3 errors)

### Logger Integration
- [ ] Extend `FileLogger` to create OpenTelemetry LogRecords
- [ ] Add trace context injection (trace ID, span ID) to log records
- [ ] Map NestJS log levels to OpenTelemetry severity
- [ ] Ensure log attributes include: file, line, method, context
- [ ] Test dual-path logging (file + SigNoz) with sample log entries
- [ ] Verify graceful degradation when SigNoz is unreachable

## Phase 2: Distributed Tracing (3-4h)

### Auto-Instrumentation
- [ ] Install auto-instrumentation packages (HTTP, Express, PostgreSQL)
- [ ] Register auto-instrumentation in `TelemetryService.initialize()`
- [ ] Configure HTTP instrumentation (capture headers, query params)
- [ ] Configure Express instrumentation (route matching, error capturing)
- [ ] Configure PostgreSQL instrumentation (statement capturing, parameter redaction)
- [ ] Test auto-instrumentation with sample HTTP requests

### Manual Spans
- [ ] Create span helper utilities in `TelemetryService` (startSpan, endSpan, recordException)
- [ ] Instrument `ExtractionWorkerService.processJob()` with parent span
- [ ] Instrument LLM provider calls (`VertexAIProvider`, `LangChainGeminiProvider`) with child spans
- [ ] Instrument graph operations (`GraphService.createObject()`, `traverse()`) with spans
- [ ] Instrument document processing pipeline with spans
- [ ] Add custom span attributes: user_id, org_id, project_id, document_id, job_id

### Trace Context Propagation
- [ ] Implement trace context storage (AsyncLocalStorage or context propagation API)
- [ ] Pass trace context through service method calls
- [ ] Correlate HTTP requests with background job traces
- [ ] Test trace continuity across async boundaries
- [ ] Verify trace visualization in SigNoz (parent-child relationships)

## Phase 3: Custom Metrics (2h)

### Metric Definitions
- [ ] Create `MetricsService` in telemetry module
- [ ] Define `extraction_jobs_total` counter (labels: status, source_type)
- [ ] Define `extraction_jobs_duration` histogram (buckets: [1, 5, 10, 30, 60, 300, 600])
- [ ] Define `llm_calls_total` counter (labels: provider, model, status)
- [ ] Define `llm_tokens_total` counter (labels: provider, model, type=prompt|completion)
- [ ] Define `document_chunks_processed` counter (labels: source_type)
- [ ] Define `graph_query_duration` histogram (buckets: [0.01, 0.05, 0.1, 0.5, 1, 5])
- [ ] Define `http_request_duration` histogram (supplement auto-instrumentation)

### Metric Instrumentation
- [ ] Instrument `ExtractionJobService` to record job metrics
- [ ] Instrument `VertexAIProvider` to record LLM call and token metrics
- [ ] Instrument `LangChainGeminiProvider` to record LLM call and token metrics
- [ ] Instrument `ChunkingService` to record chunk processing metrics
- [ ] Instrument `GraphService` to record query duration metrics
- [ ] Add metrics middleware for HTTP request duration (if needed)

### Metrics Endpoint
- [ ] Create `/metrics` endpoint in a new `MetricsController`
- [ ] Configure Prometheus exporter for metrics scraping
- [ ] Secure metrics endpoint (require API key or internal network only)
- [ ] Test metrics endpoint with curl/Postman
- [ ] Document metrics schema and labels in `CONFIGURATION.md`

## Phase 4: SigNoz MCP Server (3-4h)

### MCP Server Setup
- [ ] Create `tools/signoz-mcp-server/` directory
- [ ] Initialize npm package with `package.json`
- [ ] Install dependencies: `@modelcontextprotocol/sdk`, `axios`, `zod`
- [ ] Create `src/index.ts` as MCP server entry point
- [ ] Create `src/signoz-client.ts` for SigNoz API wrapper
- [ ] Add TypeScript configuration and build scripts

### MCP Tools Implementation
- [ ] Implement `query_logs` tool (input schema: filters, time range, limit)
- [ ] Implement `get_traces` tool (input schema: trace_id OR filters)
- [ ] Implement `query_metrics` tool (input schema: metric_name, aggregation, time range)
- [ ] Implement `get_service_map` tool (input schema: time range)
- [ ] Implement `get_errors` tool (input schema: service, time range, limit)
- [ ] Add input validation with Zod schemas
- [ ] Add error handling for SigNoz API failures
- [ ] Format MCP responses with structured data (tables, lists)

### SigNoz API Client
- [ ] Create `queryLogs(filters)` method (POST /api/v1/logs/query)
- [ ] Create `getTraces(filters)` method (POST /api/v1/traces/query)
- [ ] Create `queryMetrics(params)` method (POST /api/v1/metrics/query)
- [ ] Create `getServiceMap()` method (GET /api/v1/service-map)
- [ ] Create `getErrors(filters)` method (POST /api/v1/errors/query)
- [ ] Add authentication via API token (Authorization header)
- [ ] Add request timeout and retry logic
- [ ] Add response parsing and error mapping

### VS Code Integration
- [ ] Add MCP server to `.vscode/mcp.json`:
  ```json
  "signoz": {
    "command": "node",
    "args": ["tools/signoz-mcp-server/dist/index.js"],
    "env": {
      "SIGNOZ_API_ENDPOINT": "http://localhost:3301",
      "SIGNOZ_API_TOKEN": "${env:SIGNOZ_API_TOKEN}"
    }
  }
  ```
- [ ] Test MCP server connection in VS Code
- [ ] Verify tools appear in AI agent tool list
- [ ] Test each tool with sample queries

## Phase 5: Testing (2-3h)

### Unit Tests
- [ ] Test `TelemetryService.initialize()` (success, failure, disabled)
- [ ] Test `TelemetryService.shutdown()` (graceful cleanup)
- [ ] Test OTLP exporter configuration (validate settings)
- [ ] Test trace context propagation (AsyncLocalStorage)
- [ ] Test metrics recording (`MetricsService` methods)
- [ ] Test SigNoz API client (mock HTTP responses)
- [ ] Test MCP tool input validation (invalid schemas)

### Integration Tests
- [ ] Test log forwarding (verify logs appear in SigNoz)
- [ ] Test trace creation (verify spans in SigNoz)
- [ ] Test metrics export (verify metrics in SigNoz)
- [ ] Test dual-path logging (file + SigNoz both receive logs)
- [ ] Test graceful degradation (SigNoz down, file logging continues)
- [ ] Test MCP server with real SigNoz API (query logs, traces, metrics)

### E2E Tests
- [ ] Create E2E test: HTTP request → background job → database query (full trace)
- [ ] Create E2E test: Extraction job with LLM calls (parent-child spans)
- [ ] Create E2E test: MCP server queries logs for recent errors
- [ ] Create E2E test: MCP server retrieves trace by ID
- [ ] Run load test: 1000 requests with metrics/tracing enabled (<5ms overhead)

## Phase 6: Documentation (2h)

### Integration Guides
- [ ] Create `docs/integrations/signoz/README.md` (architecture overview, components diagram)
- [ ] Create `docs/integrations/signoz/CONFIGURATION.md` (environment variables, tuning options)
- [ ] Create `docs/integrations/signoz/MCP_SERVER.md` (tool descriptions, example queries)
- [ ] Create `docs/integrations/signoz/DASHBOARDS.md` (pre-built dashboard JSON templates)
- [ ] Create `docs/integrations/signoz/TROUBLESHOOTING.md` (common issues, diagnostic commands)

### Setup Instructions
- [ ] Update `SETUP.md` with SigNoz integration section
- [ ] Document environment variable setup (`.env` configuration)
- [ ] Document SigNoz deployment verification steps
- [ ] Document MCP server installation and configuration
- [ ] Add screenshots of SigNoz dashboard with sample data

### Developer Guide
- [ ] Update `.github/copilot-instructions.md` with MCP server usage
- [ ] Document how to query logs during debugging (example prompts)
- [ ] Document how to find traces for failed requests
- [ ] Document how to view custom metrics in dashboards
- [ ] Add troubleshooting section for local development

### Code Documentation
- [ ] Add JSDoc comments to `TelemetryService` public methods
- [ ] Add JSDoc comments to `MetricsService` metric definitions
- [ ] Add JSDoc comments to MCP server tools
- [ ] Add inline comments for complex OpenTelemetry configuration
- [ ] Document dual-path logging rationale in `FileLogger`

## Verification Checklist

### Functional Requirements
- [ ] All logs forwarded to SigNoz (verify in SigNoz Logs UI)
- [ ] HTTP requests create traces with spans (verify in SigNoz Traces UI)
- [ ] Custom metrics visible in dashboards (verify in SigNoz Metrics UI)
- [ ] MCP server tools work in VS Code (test with AI agent)
- [ ] File logging continues if SigNoz fails (disconnect test)
- [ ] Startup diagnostic shows SigNoz connection status (check logs)

### Performance Requirements
- [ ] <5ms latency increase per HTTP request (benchmark with/without tracing)
- [ ] <1% CPU overhead (measure with load test)
- [ ] No memory leaks (run 10,000 requests, check heap size)
- [ ] Batch processing prevents backpressure (verify buffer metrics)

### Documentation Requirements
- [ ] All setup steps documented with examples
- [ ] All MCP tools documented with input/output schemas
- [ ] All environment variables documented with defaults
- [ ] Troubleshooting guide covers common issues
- [ ] Screenshots included for SigNoz UI navigation

## Notes

- **Priority Order**: Phase 1 → Phase 2 → Phase 3 → Phase 4 → Phase 5 → Phase 6
- **Incremental Testing**: Test each phase before moving to next
- **SigNoz Availability**: User must provide SigNoz endpoint and API token before starting
- **Backward Compatibility**: File-based logging must continue working throughout
- **Rollback Plan**: Set `SIGNOZ_ENABLED=false` to disable integration without code changes
