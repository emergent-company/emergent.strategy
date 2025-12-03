# Capability: OpenTelemetry Custom Metrics

## ADDED Requirements

### Requirement: Extraction Job Metrics
The application MUST expose counters and histograms for extraction jobs: extraction_jobs_total (counter by status and source_type), extraction_jobs_duration (histogram in seconds).

#### Scenario: Successful extraction increments counter
```typescript
// Given: Extraction job completes successfully
await extractionWorker.processJob(job);

// Then: Counter incremented
const metrics = await querySignozMetrics({ metric: 'extraction_jobs_total' });
const successMetric = metrics.dataPoints.find(dp => 
  dp.attributes.status === 'success' && dp.attributes.source_type === 'clickup'
);
expect(successMetric.value).toBeGreaterThan(0);
```

#### Scenario: Failed extraction increments counter with failure status
```typescript
// Given: Extraction job fails
mockLLMProvider.generateText.mockRejectedValue(new Error('LLM timeout'));
await expect(extractionWorker.processJob(job)).rejects.toThrow();

// Then: Counter incremented with failure status
const metrics = await querySignozMetrics({ metric: 'extraction_jobs_total' });
const failureMetric = metrics.dataPoints.find(dp => 
  dp.attributes.status === 'failure' && dp.attributes.source_type === 'clickup'
);
expect(failureMetric.value).toBeGreaterThan(0);
```

#### Scenario: Extraction duration recorded
```typescript
// Given: Extraction job runs for 45 seconds
const startTime = Date.now();
await extractionWorker.processJob(job);
const duration = (Date.now() - startTime) / 1000;

// Then: Histogram records duration
const metrics = await querySignozMetrics({ metric: 'extraction_jobs_duration' });
const durationBucket = metrics.dataPoints.find(dp => 
  dp.attributes.source_type === 'clickup' && dp.value >= duration - 1 && dp.value <= duration + 1
);
expect(durationBucket).toBeDefined();
```

### Requirement: LLM Call Metrics
The application MUST expose counters for LLM calls and tokens: llm_calls_total (counter by provider, model, status), llm_tokens_total (counter by provider, model, type=prompt|completion).

#### Scenario: LLM call increments counter
```typescript
// Given: LLM call succeeds
await vertexAIProvider.generateText(prompt, 'gemini-1.5-pro');

// Then: Counter incremented
const metrics = await querySignozMetrics({ metric: 'llm_calls_total' });
const callMetric = metrics.dataPoints.find(dp => 
  dp.attributes.provider === 'vertexai' && 
  dp.attributes.model === 'gemini-1.5-pro' &&
  dp.attributes.status === 'success'
);
expect(callMetric.value).toBeGreaterThan(0);
```

#### Scenario: Token usage recorded separately for prompt and completion
```typescript
// Given: LLM call with token usage
const result = await vertexAIProvider.generateText(prompt, 'gemini-1.5-pro');
// result.usage = { prompt_tokens: 1500, completion_tokens: 500, total_tokens: 2000 }

// Then: Token counters incremented
const metrics = await querySignozMetrics({ metric: 'llm_tokens_total' });
const promptTokens = metrics.dataPoints.find(dp => 
  dp.attributes.provider === 'vertexai' && 
  dp.attributes.model === 'gemini-1.5-pro' &&
  dp.attributes.type === 'prompt'
);
const completionTokens = metrics.dataPoints.find(dp => 
  dp.attributes.provider === 'vertexai' && 
  dp.attributes.model === 'gemini-1.5-pro' &&
  dp.attributes.type === 'completion'
);
expect(promptTokens.value).toBe(1500);
expect(completionTokens.value).toBe(500);
```

### Requirement: Document Processing Metrics
The application MUST expose a counter for document chunks processed: document_chunks_processed (counter by source_type, processing_status).

#### Scenario: Chunk processing increments counter
```typescript
// Given: Document chunker processes document
await documentChunker.chunkDocument(document);

// Then: Counter incremented
const metrics = await querySignozMetrics({ metric: 'document_chunks_processed' });
const chunkMetric = metrics.dataPoints.find(dp => 
  dp.attributes.source_type === 'confluence' &&
  dp.attributes.processing_status === 'success'
);
expect(chunkMetric.value).toBeGreaterThan(0);
```

### Requirement: Graph Query Metrics
The application MUST expose a histogram for graph query duration: graph_query_duration (histogram in seconds by query_type).

#### Scenario: Graph query duration recorded
```typescript
// Given: Graph query executes
await graphService.vectorSearch(embedding, projectId);

// Then: Histogram records duration
const metrics = await querySignozMetrics({ metric: 'graph_query_duration' });
const queryMetric = metrics.dataPoints.find(dp => 
  dp.attributes.query_type === 'vector_search'
);
expect(queryMetric.value).toBeGreaterThan(0);
```

### Requirement: HTTP Request Metrics
The application MUST expose a histogram for HTTP request duration: http_request_duration (histogram in seconds by method, route, status_code).

#### Scenario: HTTP request duration recorded
```typescript
// Given: HTTP request completes
await axios.get('http://localhost:3001/api/documents');

// Then: Histogram records duration
const metrics = await querySignozMetrics({ metric: 'http_request_duration' });
const requestMetric = metrics.dataPoints.find(dp => 
  dp.attributes.method === 'GET' &&
  dp.attributes.route === '/api/documents' &&
  dp.attributes.status_code === 200
);
expect(requestMetric.value).toBeGreaterThan(0);
```

### Requirement: Metric Export Interval
Metrics MUST be exported to SigNoz every 60 seconds by default (configurable via OTEL_METRIC_EXPORT_INTERVAL_MS).

#### Scenario: Metrics exported after interval
```typescript
// Given: Metric recorded
metricsService.recordLLMCall('vertexai', 'gemini-1.5-pro', 'success', 1000, 500);

// When: 60 seconds elapse
await sleep(60000);

// Then: Metric exported to SigNoz
const metrics = await querySignozMetrics({ metric: 'llm_calls_total' });
expect(metrics.dataPoints.length).toBeGreaterThan(0);
```

#### Scenario: Custom export interval
```typescript
// Given: Custom export interval configured
process.env.OTEL_METRIC_EXPORT_INTERVAL_MS = '10000'; // 10 seconds

// When: Metric recorded and 10 seconds elapse
metricsService.recordLLMCall('vertexai', 'gemini-1.5-pro', 'success', 1000, 500);
await sleep(10000);

// Then: Metric exported to SigNoz
const metrics = await querySignozMetrics({ metric: 'llm_calls_total' });
expect(metrics.dataPoints.length).toBeGreaterThan(0);
```

### Requirement: Metric Aggregation
Counters MUST accumulate values across multiple recordings, and histograms MUST track distribution (min, max, sum, count, buckets).

#### Scenario: Counter accumulation
```typescript
// Given: Multiple LLM calls
await vertexAIProvider.generateText('prompt1', 'gemini-1.5-pro');
await vertexAIProvider.generateText('prompt2', 'gemini-1.5-pro');
await vertexAIProvider.generateText('prompt3', 'gemini-1.5-pro');

// When: Metrics exported
await sleep(60000);

// Then: Counter reflects total calls
const metrics = await querySignozMetrics({ metric: 'llm_calls_total' });
const callMetric = metrics.dataPoints.find(dp => 
  dp.attributes.provider === 'vertexai' && dp.attributes.model === 'gemini-1.5-pro'
);
expect(callMetric.value).toBe(3);
```

#### Scenario: Histogram distribution
```typescript
// Given: Multiple extraction jobs with varying durations
await extractionWorker.processJob(job1); // 10s
await extractionWorker.processJob(job2); // 45s
await extractionWorker.processJob(job3); // 120s

// When: Metrics exported
await sleep(60000);

// Then: Histogram includes distribution stats
const metrics = await querySignozMetrics({ metric: 'extraction_jobs_duration' });
expect(metrics.min).toBe(10);
expect(metrics.max).toBe(120);
expect(metrics.sum).toBe(175);
expect(metrics.count).toBe(3);
```
