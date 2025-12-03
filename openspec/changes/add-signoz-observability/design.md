# Design: SigNoz Observability Integration

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        NestJS Application                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌──────────────┐        ┌──────────────┐                       │
│  │  FileLogger  │───────▶│ OpenTelemetry│                       │
│  │   (existing) │        │ LoggerProvider│                       │
│  └──────┬───────┘        └──────┬────────┘                       │
│         │                       │                                │
│         ▼                       ▼                                │
│  ┌──────────────┐        ┌──────────────┐                       │
│  │   File I/O   │        │ OTLP Exporter│                       │
│  │ (app.log,    │        │ (Batch Queue) │                       │
│  │  errors.log) │        └──────┬────────┘                       │
│  └──────────────┘               │                                │
│                                 │ HTTP                           │
│  ┌──────────────────────────────┼────────────────────────┐      │
│  │     Auto-Instrumentation     │                        │      │
│  │  ┌────────┐  ┌────────┐     │  ┌────────────┐        │      │
│  │  │  HTTP  │  │Express │     │  │ PostgreSQL │        │      │
│  │  │Incoming│  │Routing │     │  │   Queries  │        │      │
│  │  └────────┘  └────────┘     │  └────────────┘        │      │
│  │                              │                        │      │
│  │     Manual Spans             │                        │      │
│  │  ┌────────┐  ┌────────┐     │  ┌────────────┐        │      │
│  │  │Extract │  │  LLM   │     │  │   Graph    │        │      │
│  │  │  Jobs  │  │  Calls │     │  │  Queries   │        │      │
│  │  └────────┘  └────────┘     │  └────────────┘        │      │
│  │                              │                        │      │
│  └──────────────────────────────┼────────────────────────┘      │
│                                 │                                │
│  ┌──────────────────────────────┼────────────────────────┐      │
│  │         MetricsService        │                        │      │
│  │  ┌────────┐  ┌────────┐     │  ┌────────────┐        │      │
│  │  │ LLM    │  │Extract │     │  │   Graph    │        │      │
│  │  │Counters│  │Histogr │     │  │  Counters  │        │      │
│  │  └────────┘  └────────┘     │  └────────────┘        │      │
│  └──────────────────────────────┼────────────────────────┘      │
│                                 │                                │
└─────────────────────────────────┼────────────────────────────────┘
                                  │
                                  ▼
                          ┌────────────────┐
                          │  SigNoz OTLP   │
                          │   Collector    │
                          │  (:4318/v1/*)  │
                          └────────┬───────┘
                                  │
              ┌───────────────────┼───────────────────┐
              │                   │                   │
              ▼                   ▼                   ▼
       ┌──────────┐        ┌──────────┐       ┌──────────┐
       │  Logs    │        │  Traces  │       │ Metrics  │
       │  Store   │        │  Store   │       │  Store   │
       │(ClickHse)│        │(ClickHse)│       │(ClickHse)│
       └──────────┘        └──────────┘       └──────────┘
              │                   │                   │
              └───────────────────┼───────────────────┘
                                  │
                                  ▼
                          ┌────────────────┐
                          │  SigNoz Query  │
                          │      API       │
                          │ (:3301/api/v1) │
                          └────────┬───────┘
                                  │
                                  ▼
                          ┌────────────────┐
                          │  SigNoz MCP    │
                          │     Server     │
                          │   (stdio/SSE)  │
                          └────────┬───────┘
                                  │
                                  ▼
                          ┌────────────────┐
                          │   AI Agent     │
                          │  (VS Code)     │
                          └────────────────┘
```

## Component Details

### 1. TelemetryModule

**Location**: `apps/server/src/modules/telemetry/`

**Responsibilities**:
- Initialize OpenTelemetry SDK with NodeSDK
- Configure OTLP exporters (logs, traces, metrics)
- Register auto-instrumentation packages
- Provide TelemetryService for manual instrumentation
- Handle graceful shutdown on application termination

**Key Files**:
- `telemetry.module.ts` - NestJS module definition
- `telemetry.service.ts` - SDK initialization and span helpers
- `telemetry.config.ts` - Configuration loading and validation
- `resource.ts` - Resource attributes (service name, version, environment)

**Configuration Schema**:
```typescript
interface SigNozConfig {
  enabled: boolean;                // SIGNOZ_ENABLED
  otlpEndpoint: string;            // SIGNOZ_OTLP_ENDPOINT (http://localhost:4318)
  apiEndpoint: string;             // SIGNOZ_API_ENDPOINT (http://localhost:3301)
  apiToken: string;                // SIGNOZ_API_TOKEN
  serviceName: string;             // OTEL_SERVICE_NAME (spec-server)
  environment: string;             // OTEL_ENVIRONMENT (development|staging|production)
  batchInterval: number;           // OTEL_BATCH_INTERVAL_MS (default: 5000)
  maxQueueSize: number;            // OTEL_MAX_QUEUE_SIZE (default: 2048)
  exportTimeout: number;           // OTEL_EXPORT_TIMEOUT_MS (default: 30000)
}
```

### 2. OpenTelemetry LoggerProvider Integration

**Strategy**: Dual-path logging
- `FileLogger` writes to both files AND OpenTelemetry
- File writes are synchronous (immediate)
- OTLP exports are asynchronous (batched)

**Implementation**:
```typescript
// In FileLogger.writeToFile()
private writeToFile(level: LogLevel, message: string, context?: string, trace?: string) {
    // Existing file write logic (unchanged)
    const formattedLog = `${timestamp} [${level.toUpperCase()}] [${contextStr}] ${locationStr} - ${message}`;
    appendFileSync(this.appLogPath, formattedLog, 'utf-8');
    
    // New: Send to OpenTelemetry
    if (this.otelLogger) {
        const logRecord = {
            timestamp: Date.now(),
            severityNumber: this.mapLevelToSeverity(level),
            severityText: level.toUpperCase(),
            body: message,
            attributes: {
                'service.name': 'spec-server',
                'log.level': level,
                'log.context': context || 'App',
                'log.file': caller.file,
                'log.line': caller.line,
                ...(caller.method && { 'log.method': caller.method }),
                ...(trace && { 'log.trace': trace }),
            },
        };
        
        this.otelLogger.emit(logRecord);
    }
}
```

**Trace Context Injection**:
```typescript
import { trace } from '@opentelemetry/api';

// Add trace context to log records
const span = trace.getActiveSpan();
if (span) {
    const spanContext = span.spanContext();
    logRecord.attributes['trace_id'] = spanContext.traceId;
    logRecord.attributes['span_id'] = spanContext.spanId;
}
```

### 3. Auto-Instrumentation

**Packages**:
- `@opentelemetry/instrumentation-http` - HTTP client/server
- `@opentelemetry/instrumentation-express` - Express middleware
- `@opentelemetry/instrumentation-pg` - PostgreSQL queries

**Registration**:
```typescript
import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';

const sdk = new NodeSDK({
  traceExporter: new OTLPTraceExporter({ url: 'http://localhost:4318/v1/traces' }),
  instrumentations: [
    getNodeAutoInstrumentations({
      '@opentelemetry/instrumentation-http': {
        requestHook: (span, request) => {
          span.setAttributes({
            'http.user_agent': request.headers['user-agent'],
            'http.x_org_id': request.headers['x-org-id'],
            'http.x_project_id': request.headers['x-project-id'],
          });
        },
      },
      '@opentelemetry/instrumentation-pg': {
        enhancedDatabaseReporting: true,
        requireParentSpan: true,
      },
    }),
  ],
});
```

### 4. Manual Spans

**Extraction Job Tracing**:
```typescript
// In ExtractionWorkerService.processJob()
import { trace } from '@opentelemetry/api';

async processJob(job: ExtractionJob): Promise<void> {
  const tracer = trace.getTracer('extraction-worker');
  
  return tracer.startActiveSpan('extraction.processJob', async (span) => {
    span.setAttributes({
      'job.id': job.id,
      'job.source_type': job.source_type,
      'job.document_count': job.document_ids.length,
      'user.id': job.user_id,
      'org.id': job.organization_id,
      'project.id': job.project_id,
    });
    
    try {
      // Process job...
      await this.extractEntities(job);
      span.setStatus({ code: SpanStatusCode.OK });
    } catch (error) {
      span.recordException(error);
      span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
      throw error;
    } finally {
      span.end();
    }
  });
}
```

**LLM Call Tracing**:
```typescript
// In VertexAIProvider.generateText()
async generateText(prompt: string, model: string): Promise<string> {
  const tracer = trace.getTracer('llm-provider');
  
  return tracer.startActiveSpan('llm.generateText', async (span) => {
    span.setAttributes({
      'llm.provider': 'vertexai',
      'llm.model': model,
      'llm.prompt_tokens': countTokens(prompt),
    });
    
    try {
      const response = await this.client.generateText(prompt);
      
      span.setAttributes({
        'llm.completion_tokens': response.usage.completion_tokens,
        'llm.total_tokens': response.usage.total_tokens,
      });
      
      return response.text;
    } catch (error) {
      span.recordException(error);
      throw error;
    } finally {
      span.end();
    }
  });
}
```

### 5. Custom Metrics

**Metric Definitions**:
```typescript
import { MeterProvider } from '@opentelemetry/sdk-metrics';

export class MetricsService {
  private meter: Meter;
  
  // Counters
  private extractionJobsTotal: Counter;
  private llmCallsTotal: Counter;
  private llmTokensTotal: Counter;
  private documentChunksProcessed: Counter;
  
  // Histograms
  private extractionJobsDuration: Histogram;
  private graphQueryDuration: Histogram;
  private httpRequestDuration: Histogram;
  
  constructor() {
    this.meter = trace.getMeterProvider().getMeter('spec-server-metrics');
    
    this.extractionJobsTotal = this.meter.createCounter('extraction_jobs_total', {
      description: 'Total extraction jobs started',
      unit: '1',
    });
    
    this.extractionJobsDuration = this.meter.createHistogram('extraction_jobs_duration', {
      description: 'Extraction job execution time',
      unit: 's',
    });
    
    this.llmCallsTotal = this.meter.createCounter('llm_calls_total', {
      description: 'Total LLM API calls',
      unit: '1',
    });
    
    this.llmTokensTotal = this.meter.createCounter('llm_tokens_total', {
      description: 'Total LLM tokens used',
      unit: '1',
    });
    
    // ... more metrics
  }
  
  recordExtractionJob(status: string, sourceType: string, durationSeconds: number) {
    this.extractionJobsTotal.add(1, { status, source_type: sourceType });
    this.extractionJobsDuration.record(durationSeconds, { status, source_type: sourceType });
  }
  
  recordLLMCall(provider: string, model: string, status: string, promptTokens: number, completionTokens: number) {
    this.llmCallsTotal.add(1, { provider, model, status });
    this.llmTokensTotal.add(promptTokens, { provider, model, type: 'prompt' });
    this.llmTokensTotal.add(completionTokens, { provider, model, type: 'completion' });
  }
}
```

### 6. SigNoz MCP Server

**Architecture**:
- Standalone Node.js application in `tools/signoz-mcp-server/`
- Communicates with SigNoz Query API via HTTP
- Exposes MCP tools via stdio transport
- Integrated with VS Code via `.vscode/mcp.json`

**Tool Definitions**:
```typescript
// query_logs tool
{
  name: 'query_logs',
  description: 'Search application logs with filters',
  inputSchema: {
    type: 'object',
    properties: {
      service: { type: 'string', description: 'Service name (e.g., spec-server)' },
      level: { type: 'string', enum: ['debug', 'info', 'warn', 'error', 'fatal'] },
      query: { type: 'string', description: 'Full-text search query' },
      timeRange: {
        type: 'object',
        properties: {
          start: { type: 'string', format: 'date-time' },
          end: { type: 'string', format: 'date-time' },
        },
      },
      limit: { type: 'number', default: 100 },
    },
  },
}

// get_traces tool
{
  name: 'get_traces',
  description: 'Retrieve distributed traces',
  inputSchema: {
    type: 'object',
    properties: {
      traceId: { type: 'string', description: 'Specific trace ID' },
      service: { type: 'string' },
      operation: { type: 'string', description: 'Operation name (e.g., HTTP GET /api/documents)' },
      minDuration: { type: 'number', description: 'Minimum duration in ms' },
      maxDuration: { type: 'number', description: 'Maximum duration in ms' },
      timeRange: { type: 'object' },
      limit: { type: 'number', default: 50 },
    },
  },
}

// query_metrics tool
{
  name: 'query_metrics',
  description: 'Query custom metrics and time series',
  inputSchema: {
    type: 'object',
    properties: {
      metricName: { type: 'string', description: 'Metric name (e.g., llm_calls_total)' },
      aggregation: { type: 'string', enum: ['sum', 'avg', 'min', 'max', 'count'] },
      groupBy: { type: 'array', items: { type: 'string' } },
      timeRange: { type: 'object' },
      interval: { type: 'string', description: 'Time bucket interval (e.g., 1m, 5m, 1h)' },
    },
    required: ['metricName'],
  },
}
```

**SigNoz API Client**:
```typescript
export class SigNozClient {
  constructor(
    private apiEndpoint: string,
    private apiToken: string,
  ) {}
  
  async queryLogs(filters: LogQueryFilters): Promise<LogEntry[]> {
    const response = await axios.post(
      `${this.apiEndpoint}/api/v1/logs/query`,
      {
        filters: [
          { key: 'service_name', value: filters.service, operator: '=' },
          { key: 'severity_text', value: filters.level?.toUpperCase(), operator: '=' },
          { key: 'body', value: filters.query, operator: 'contains' },
        ],
        timeRange: {
          start: filters.timeRange.start,
          end: filters.timeRange.end,
        },
        limit: filters.limit || 100,
      },
      {
        headers: {
          'Authorization': `Bearer ${this.apiToken}`,
          'Content-Type': 'application/json',
        },
      },
    );
    
    return response.data.logs;
  }
  
  async getTraces(filters: TraceQueryFilters): Promise<Trace[]> {
    // Similar implementation
  }
  
  async queryMetrics(params: MetricQueryParams): Promise<MetricTimeSeries> {
    // Similar implementation
  }
}
```

## Data Flow

### 1. Log Entry Flow

```
Application Code
    ↓
FileLogger.log(message, context)
    ↓
writeToFile(level, message, context)
    ├─→ appendFileSync(app.log)         [Sync, always succeeds]
    └─→ otelLogger.emit(logRecord)      [Async, batched]
            ↓
        BatchLogRecordProcessor
            ↓ (every 5s or 512 records)
        OTLPLogExporter
            ↓ (HTTP POST)
        SigNoz OTLP Collector (:4318/v1/logs)
            ↓
        ClickHouse (logs table)
```

### 2. Trace Span Flow

```
HTTP Request → NestJS Controller
    ↓
Auto-instrumentation creates span
    ↓ (span context propagated)
Service Method (manual span)
    ↓ (span context propagated)
Database Query (auto-instrumentation creates child span)
    ↓
All spans batched by BatchSpanProcessor
    ↓ (every 5s or 512 spans)
OTLPTraceExporter → SigNoz Collector (:4318/v1/traces)
    ↓
ClickHouse (traces table)
```

### 3. Metric Export Flow

```
Application Code
    ↓
MetricsService.recordLLMCall(...)
    ↓
Counter.add() / Histogram.record()
    ↓
PeriodicExportingMetricReader (every 60s)
    ↓
OTLPMetricExporter
    ↓ (HTTP POST)
SigNoz OTLP Collector (:4318/v1/metrics)
    ↓
ClickHouse (metrics table)
```

## Error Handling

### Circuit Breaker Pattern

```typescript
class SigNozCircuitBreaker {
  private failureCount = 0;
  private lastFailureTime = 0;
  private isOpen = false;
  
  private readonly FAILURE_THRESHOLD = 3;
  private readonly RESET_TIMEOUT = 60000; // 1 minute
  
  async execute<T>(fn: () => Promise<T>): Promise<T | null> {
    // If circuit is open, check if we should try again
    if (this.isOpen) {
      if (Date.now() - this.lastFailureTime > this.RESET_TIMEOUT) {
        this.reset();
      } else {
        // Circuit open, fail fast
        return null;
      }
    }
    
    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      return null;
    }
  }
  
  private onSuccess() {
    this.failureCount = 0;
    this.isOpen = false;
  }
  
  private onFailure() {
    this.failureCount++;
    this.lastFailureTime = Date.now();
    
    if (this.failureCount >= this.FAILURE_THRESHOLD) {
      this.isOpen = true;
      console.warn('[SigNoz] Circuit breaker opened after 3 consecutive failures');
    }
  }
  
  private reset() {
    console.log('[SigNoz] Circuit breaker reset, attempting reconnection');
    this.isOpen = false;
    this.failureCount = 0;
  }
}
```

### Graceful Degradation

```typescript
// In TelemetryService
async shutdown(): Promise<void> {
  try {
    await this.sdk.shutdown();
    console.log('[SigNoz] OpenTelemetry SDK shut down successfully');
  } catch (error) {
    console.error('[SigNoz] Failed to shutdown SDK gracefully:', error);
    // Continue shutdown anyway
  }
}

// In FileLogger
private writeToFile(level: LogLevel, message: string, context?: string) {
  // File write always succeeds (or throws)
  appendFileSync(this.appLogPath, formattedLog, 'utf-8');
  
  // OTLP export never throws
  try {
    if (this.otelLogger && this.circuitBreaker.isHealthy()) {
      this.otelLogger.emit(logRecord);
    }
  } catch (error) {
    // Swallow errors - file logging must never fail due to SigNoz issues
  }
}
```

## Performance Considerations

### Batching Strategy

- **Logs**: Batch every 5 seconds OR 512 log records (whichever comes first)
- **Traces**: Batch every 5 seconds OR 512 spans (whichever comes first)
- **Metrics**: Export every 60 seconds (configurable via `OTEL_METRIC_EXPORT_INTERVAL_MS`)

### Memory Management

- **Max Queue Size**: 2048 records/spans (configured via `OTEL_MAX_QUEUE_SIZE`)
- **Buffer Overflow**: Drop oldest records if queue full (prevent memory exhaustion)
- **Backpressure**: Circuit breaker prevents runaway retries

### Network Optimization

- **HTTP/2**: OTLP exporter uses HTTP/2 for multiplexing (single connection)
- **Compression**: gzip compression for OTLP payloads (typically 5-10x reduction)
- **Timeouts**: 30-second export timeout (fail fast if SigNoz unresponsive)

## Security

### API Token Management

- Store SigNoz API token in environment variable: `SIGNOZ_API_TOKEN`
- Never commit tokens to source control
- Use different tokens for development/staging/production
- Rotate tokens periodically (recommended: every 90 days)

### Network Security

- OTLP Collector should be internal-only (not exposed to public internet)
- Use TLS for OTLP traffic in production: `https://signoz:4318`
- Restrict MCP server access to local development machines only

### Data Privacy

- Redact sensitive data from logs/traces (PII, credentials, tokens)
- Use `@opentelemetry/instrumentation-pg` with parameter redaction enabled
- Add custom sanitization for log messages containing email/phone/SSN patterns

## Testing Strategy

### Unit Tests
- Mock OpenTelemetry SDK (no actual OTLP exports)
- Verify span attributes, log records, metric values
- Test circuit breaker state transitions

### Integration Tests
- Run real SigNoz instance (Docker Compose)
- Verify logs/traces/metrics appear in SigNoz
- Test graceful degradation (stop SigNoz mid-test)

### Load Tests
- Benchmark with/without tracing enabled
- Target: <5ms p99 latency increase, <1% CPU overhead
- Test with 1000 concurrent requests

## Rollout Plan

1. **Phase 1**: Deploy to development environment, validate configuration
2. **Phase 2**: Enable for 10% of staging traffic (canary deployment)
3. **Phase 3**: Full staging deployment, monitor for 48 hours
4. **Phase 4**: Production deployment with `SIGNOZ_ENABLED=false` (dark launch)
5. **Phase 5**: Enable SigNoz in production, monitor dashboards
6. **Phase 6**: Configure alerts and dashboards for production

## Rollback Plan

- Set `SIGNOZ_ENABLED=false` to disable OpenTelemetry integration
- File-based logging continues unchanged
- No code changes required
- Restart server to apply configuration change
