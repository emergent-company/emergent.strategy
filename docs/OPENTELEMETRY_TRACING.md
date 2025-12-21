# OpenTelemetry Tracing Guide

This guide explains how to use distributed tracing in the Emergent server application.

## Overview

The application uses [OpenTelemetry](https://opentelemetry.io/) for distributed tracing, with [SigNoz](https://signoz.io/) as the trace visualization backend. The integration includes:

- **Automatic instrumentation** for HTTP, Express, PostgreSQL, and Redis
- **nestjs-otel** for NestJS-specific decorators and services
- **Custom span support** for tracing business logic

## Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                         NestJS Application                       │
├──────────────────────────────────────────────────────────────────┤
│  src/tracing.ts          │  src/common/tracing/                  │
│  - NodeSDK setup         │  - @Span decorator                    │
│  - Auto-instrumentations │  - @Traceable decorator               │
│  - OTLP HTTP exporter    │  - TraceService                       │
└──────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼ OTLP HTTP (:4318/v1/traces)
┌──────────────────────────────────────────────────────────────────┐
│                    OpenTelemetry Collector                       │
│                     (emergent-infra/signoz)                      │
└──────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌──────────────────────────────────────────────────────────────────┐
│                          ClickHouse                              │
│              (signoz_traces.signoz_index_v3)                     │
└──────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌──────────────────────────────────────────────────────────────────┐
│                          SigNoz UI                               │
│                     http://localhost:3301                        │
└──────────────────────────────────────────────────────────────────┘
```

## Configuration

### Environment Variables

```bash
# Enable/disable tracing (default: false)
OTEL_ENABLED=true

# Service identification
OTEL_SERVICE_NAME=emergent-server

# OTLP endpoint (SigNoz collector)
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4317

# Log level for OTEL diagnostics
OTEL_LOG_LEVEL=info  # debug, info, warn, error
```

### Starting SigNoz

```bash
cd emergent-infra/signoz
docker compose up -d
```

This starts:

- ClickHouse (trace storage on port 9000)
- Zookeeper (ClickHouse coordination)
- SigNoz Query Service + Frontend (http://localhost:3301)
- OpenTelemetry Collector (gRPC :4317, HTTP :4318)
- Alertmanager (port 9094)

## Automatic Instrumentation

The following are automatically traced without any code changes:

### HTTP Requests (Incoming)

Every HTTP request to the server creates a trace with:

- `http.method` - GET, POST, etc.
- `http.url` - Full URL path
- `http.status_code` - Response status
- `http.route` - Express route pattern
- `emergent.org_id` - Organization ID (from header)
- `emergent.project_id` - Project ID (from header)

### HTTP Requests (Outgoing)

External API calls (e.g., to LLM providers) are automatically traced.

### PostgreSQL Queries

All database queries include:

- `db.system` - postgres
- `db.name` - Database name
- `db.statement` - SQL query (sanitized)
- `db.row_count` - Number of rows affected

### Redis Operations

Cache operations are traced with:

- `db.system` - redis
- `db.operation` - GET, SET, etc.

## Custom Tracing with nestjs-otel

### 1. Using @Span Decorator

Add custom spans to specific methods:

```typescript
import { Span } from 'nestjs-otel';

@Injectable()
export class DocumentService {
  @Span('process-document')
  async processDocument(documentId: string) {
    // This method creates a child span named 'process-document'
    // All database calls within will be nested under this span
  }

  @Span('extract-entities')
  async extractEntities(text: string) {
    // Custom span for entity extraction
  }
}
```

### 2. Using @Traceable Decorator

Automatically trace ALL methods in a class:

```typescript
import { Traceable } from 'nestjs-otel';

@Traceable() // All methods will create spans
@Injectable()
export class ImportantService {
  async methodOne() {
    /* traced */
  }
  async methodTwo() {
    /* traced */
  }
}
```

### 3. Using TraceService Programmatically

For more control, inject TraceService:

```typescript
import { TraceService } from 'nestjs-otel';
import { SpanStatusCode } from '@opentelemetry/api';

@Injectable()
export class ComplexService {
  constructor(private readonly traceService: TraceService) {}

  async complexOperation() {
    // Start a new span
    return this.traceService.startActiveSpan('complex-op', async (span) => {
      try {
        // Add attributes to the span
        span.setAttribute('operation.type', 'batch');
        span.setAttribute('operation.count', 100);

        const result = await this.doWork();

        // Mark span as successful
        span.setStatus({ code: SpanStatusCode.OK });
        return result;
      } catch (error) {
        // Record error in span
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: error.message,
        });
        span.recordException(error);
        throw error;
      } finally {
        span.end();
      }
    });
  }
}
```

### 4. Adding Attributes to Current Span

```typescript
import { trace } from '@opentelemetry/api';

@Injectable()
export class MyService {
  async processItem(item: Item) {
    const span = trace.getActiveSpan();
    if (span) {
      span.setAttribute('item.id', item.id);
      span.setAttribute('item.type', item.type);
      span.addEvent('Processing started', { itemId: item.id });
    }

    // ... process item ...

    if (span) {
      span.addEvent('Processing completed');
    }
  }
}
```

## Importing the Tracing Module

For services that need custom tracing, import the TracingModule:

```typescript
import { Module } from '@nestjs/common';
import { TracingModule } from '../../common/tracing';
import { MyService } from './my.service';

@Module({
  imports: [TracingModule],
  providers: [MyService],
})
export class MyModule {}
```

## Best Practices

### 1. Span Naming

- Use lowercase with hyphens: `process-document`, `extract-entities`
- Be specific: `fetch-user-documents` not just `fetch`
- Include the entity type: `create-graph-object`

### 2. Attributes

- Add business context: `document.id`, `project.id`, `user.id`
- Add counts for batch operations: `batch.size`, `items.processed`
- Avoid PII in attributes (no emails, names, etc.)

### 3. Events

- Log important state transitions: `Processing started`, `Cache hit`
- Include relevant IDs in event attributes

### 4. Error Handling

- Always record exceptions: `span.recordException(error)`
- Set error status: `span.setStatus({ code: SpanStatusCode.ERROR })`

### 5. Performance

- Don't create spans for trivial operations
- Use sampling in production (configured in tracing.ts)
- Ignore health checks (already configured)

## Viewing Traces in SigNoz

1. Open http://localhost:3301
2. Navigate to **Traces** tab
3. Filter by service name: `emergent-server`
4. Click on a trace to see the full call hierarchy

### Useful Filters

- `service.name = emergent-server`
- `http.status_code >= 400` (errors)
- `db.system = postgres` (database calls)
- `http.method = POST` (mutations)

## Testing Tracing

### Send Test Traces

```bash
cd emergent-infra/signoz
./scripts/send-test-trace.sh
```

### Verify Collector Health

```bash
curl -s http://localhost:13133/health | jq
```

### Check Metrics

```bash
curl -s http://localhost:8889/metrics | head -20
```

## Troubleshooting

### Traces Not Appearing

1. **Check OTEL_ENABLED in .env**

   ```bash
   grep OTEL_ENABLED .env  # Should be "true"
   ```

   **Important:** The `tracing.ts` file loads `.env` before other modules, so changes require a server restart.

2. **Verify SigNoz is running**

   ```bash
   cd emergent-infra/signoz
   docker compose ps
   ```

3. **Check collector is receiving traces**

   ```bash
   # Send a test trace
   curl -X POST http://localhost:4318/v1/traces \
     -H "Content-Type: application/json" \
     -d '{"resourceSpans":[{"resource":{"attributes":[{"key":"service.name","value":{"stringValue":"test"}}]},"scopeSpans":[{"scope":{"name":"test"},"spans":[{"traceId":"'$(openssl rand -hex 16)'","spanId":"'$(openssl rand -hex 8)'","name":"test-span","kind":1,"startTimeUnixNano":"'$(date +%s)'000000000","endTimeUnixNano":"'$(date +%s)'001000000"}]}]}]}'

   # Should return: {"partialSuccess":{}}
   ```

4. **Query ClickHouse directly**

   ```bash
   # Check trace count (use v3 table for newer SigNoz versions)
   docker exec signoz-clickhouse clickhouse-client \
     --query "SELECT count() FROM signoz_traces.signoz_index_v3"

   # Query recent traces
   docker exec signoz-clickhouse clickhouse-client \
     --query "SELECT timestamp, trace_id, name, resources_string['service.name'] as service
              FROM signoz_traces.signoz_index_v3
              ORDER BY timestamp DESC LIMIT 5"
   ```

5. **Check collector logs for errors**

   ```bash
   docker logs signoz-otel-collector 2>&1 | grep -i "error\|trace" | tail -20
   ```

6. **Verify endpoint connectivity**
   ```bash
   nc -zv localhost 4318  # HTTP endpoint
   nc -zv localhost 4317  # gRPC endpoint
   ```

### Debug Mode

To enable verbose OTEL logging, set in `.env`:

```bash
OTEL_LOG_LEVEL=debug
```

Then restart the server and check logs for detailed trace export information.

2. **Verify SigNoz is running**

   ```bash
   cd emergent-infra/signoz
   docker compose ps
   ```

3. **Check collector logs**

   ```bash
   docker logs signoz-otel-collector 2>&1 | tail -20
   ```

4. **Verify endpoint connectivity**
   ```bash
   nc -zv localhost 4317  # gRPC endpoint
   ```

### High Cardinality Warnings

If you see cardinality warnings, review your attributes - avoid high-variability values like timestamps or request IDs as attribute values.

### Missing Database Spans

Ensure your database calls are within an async context. TypeORM queries should automatically be traced if the `pg` instrumentation is active.

## Related Files

- `apps/server/src/tracing.ts` - Main SDK configuration
- `apps/server/src/common/tracing/` - NestJS module and utilities
- `apps/server/src/modules/app.module.ts` - OpenTelemetryModule import
- `emergent-infra/signoz/` - SigNoz deployment
