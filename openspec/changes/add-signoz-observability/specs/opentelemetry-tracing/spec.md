# Capability: OpenTelemetry Distributed Tracing

## ADDED Requirements

### Requirement: Auto-Instrumentation for HTTP
The application MUST automatically create trace spans for all incoming HTTP requests and outgoing HTTP client requests using @opentelemetry/instrumentation-http.

#### Scenario: Incoming HTTP request creates parent span
```typescript
// Given: OpenTelemetry SDK is initialized
// When: HTTP GET request arrives
const response = await axios.get('http://localhost:3001/api/documents');

// Then: SigNoz receives trace span
const traces = await querySignozTraces({ service: 'spec-server', operation: 'GET /api/documents' });
expect(traces).toHaveLength(1);
expect(traces[0].spans[0].attributes).toMatchObject({
  'http.method': 'GET',
  'http.target': '/api/documents',
  'http.status_code': 200,
  'http.user_agent': expect.stringContaining('axios'),
});
```

#### Scenario: Outgoing HTTP request creates child span
```typescript
// Given: Active trace span for API request
// When: Service makes HTTP call to external API
await axios.get('https://api.github.com/repos/example/repo');

// Then: Trace includes child span for outgoing request
const traces = await querySignozTraces({ service: 'spec-server' });
const spans = traces[0].spans;
const parentSpan = spans.find(s => s.name === 'GET /api/documents');
const childSpan = spans.find(s => s.name === 'GET https://api.github.com/repos/example/repo');
expect(childSpan.parentSpanId).toBe(parentSpan.spanId);
```

### Requirement: Auto-Instrumentation for Express
The application MUST automatically create trace spans for Express middleware and route handlers using @opentelemetry/instrumentation-express.

#### Scenario: Express middleware traced
```typescript
// Given: Express middleware for authentication
app.use(authMiddleware);

// When: Request passes through middleware
await axios.get('http://localhost:3001/api/documents');

// Then: Trace includes middleware span
const traces = await querySignozTraces({ service: 'spec-server' });
const spans = traces[0].spans;
expect(spans.find(s => s.name === 'middleware - authMiddleware')).toBeDefined();
```

### Requirement: Auto-Instrumentation for PostgreSQL
The application MUST automatically create trace spans for PostgreSQL queries using @opentelemetry/instrumentation-pg with enhanced database reporting enabled.

#### Scenario: Database query creates child span
```typescript
// Given: Active trace span for API request
// When: Service executes database query
await db.query('SELECT * FROM kb.documents WHERE project_id = $1', [projectId]);

// Then: Trace includes database span
const traces = await querySignozTraces({ service: 'spec-server' });
const spans = traces[0].spans;
const dbSpan = spans.find(s => s.name.startsWith('SELECT kb.documents'));
expect(dbSpan.attributes).toMatchObject({
  'db.system': 'postgresql',
  'db.name': 'spec',
  'db.statement': 'SELECT * FROM kb.documents WHERE project_id = $1',
  'db.operation': 'SELECT',
});
```

### Requirement: Manual Span Creation for Extraction Jobs
Extraction job processing MUST create manual trace spans with attributes for job ID, source type, document count, user ID, organization ID, and project ID.

#### Scenario: Extraction job traced end-to-end
```typescript
// Given: Extraction job queued
const job = await extractionJobService.create({
  source_type: 'clickup',
  document_ids: ['doc1', 'doc2', 'doc3'],
  user_id: 'user123',
  organization_id: 'org456',
  project_id: 'proj789',
});

// When: Worker processes job
await extractionWorker.processJob(job);

// Then: SigNoz receives trace with extraction span
const traces = await querySignozTraces({ service: 'spec-server', operation: 'extraction.processJob' });
expect(traces).toHaveLength(1);
expect(traces[0].spans[0].attributes).toMatchObject({
  'job.id': job.id,
  'job.source_type': 'clickup',
  'job.document_count': 3,
  'user.id': 'user123',
  'org.id': 'org456',
  'project.id': 'proj789',
});
```

#### Scenario: Extraction sub-operations traced as child spans
```typescript
// Given: Extraction job in progress
// When: Job extracts entities from each document
await extractionWorker.processJob(job);

// Then: Trace includes child spans for each document
const traces = await querySignozTraces({ service: 'spec-server', operation: 'extraction.processJob' });
const childSpans = traces[0].spans.filter(s => s.name === 'extraction.extractEntities');
expect(childSpans).toHaveLength(3); // One per document
```

### Requirement: Manual Span Creation for LLM Calls
LLM API calls MUST create manual trace spans with attributes for provider, model, prompt tokens, completion tokens, and total tokens.

#### Scenario: LLM call traced with token usage
```typescript
// Given: Active trace span for extraction
// When: LLM generates entity extraction
const result = await vertexAIProvider.generateText(prompt, 'gemini-1.5-pro');

// Then: Trace includes LLM span
const traces = await querySignozTraces({ service: 'spec-server' });
const llmSpan = traces[0].spans.find(s => s.name === 'llm.generateText');
expect(llmSpan.attributes).toMatchObject({
  'llm.provider': 'vertexai',
  'llm.model': 'gemini-1.5-pro',
  'llm.prompt_tokens': expect.any(Number),
  'llm.completion_tokens': expect.any(Number),
  'llm.total_tokens': expect.any(Number),
});
```

### Requirement: Trace Context Propagation
Trace context MUST be propagated across service boundaries using W3C Trace Context headers (traceparent, tracestate) and injected into log records.

#### Scenario: Trace context in HTTP headers
```typescript
// Given: Active trace span
const tracer = trace.getTracer('test');
await tracer.startActiveSpan('testOperation', async (span) => {
  // When: HTTP request is made
  await axios.get('http://localhost:3001/api/documents');
  span.end();
});

// Then: Request includes traceparent header
const requestHeaders = mockAxios.lastRequest.headers;
expect(requestHeaders['traceparent']).toMatch(/^00-[0-9a-f]{32}-[0-9a-f]{16}-[0-9a-f]{2}$/);
```

#### Scenario: Trace context in logs
```typescript
// Given: Active trace span
const tracer = trace.getTracer('test');
await tracer.startActiveSpan('testOperation', async (span) => {
  // When: Log is emitted within span
  logger.info('Processing request', 'TestService');
  span.end();
});

// Then: Log includes trace ID and span ID
const logs = await querySignozLogs({ query: 'Processing request' });
expect(logs[0].attributes['trace_id']).toBe(span.spanContext().traceId);
expect(logs[0].attributes['span_id']).toBe(span.spanContext().spanId);
```

### Requirement: Span Status and Error Recording
Spans MUST record exceptions and set error status when operations fail, including exception type, message, and stack trace.

#### Scenario: Span records exception
```typescript
// Given: Active trace span
const tracer = trace.getTracer('test');
await tracer.startActiveSpan('failingOperation', async (span) => {
  try {
    throw new Error('Database connection lost');
  } catch (error) {
    span.recordException(error);
    span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
    span.end();
  }
});

// Then: SigNoz receives span with error status
const traces = await querySignozTraces({ service: 'spec-server', operation: 'failingOperation' });
expect(traces[0].spans[0].status.code).toBe('ERROR');
expect(traces[0].spans[0].events).toContainEqual({
  name: 'exception',
  attributes: {
    'exception.type': 'Error',
    'exception.message': 'Database connection lost',
    'exception.stacktrace': expect.stringContaining('at failingOperation'),
  },
});
```
