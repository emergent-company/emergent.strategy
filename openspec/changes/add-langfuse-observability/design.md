# Design: LangFuse Integration Architecture

## Overview

This design document describes how LangFuse observability will integrate with the existing monitoring infrastructure, LLM providers, and extraction workflow without disrupting current functionality.

## System Context

```
┌─────────────────────────────────────────────────────────────────┐
│                     Extraction Job Workflow                      │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
                ┌─────────────────────────┐
                │ ExtractionWorkerService │
                │  - processJob()         │
                │  - Manages job context  │
                └─────────────────────────┘
                              │
                ┌─────────────┴─────────────┐
                ▼                           ▼
    ┌───────────────────────┐   ┌────────────────────────┐
    │ LLM Provider Factory  │   │ MonitoringLogger       │
    │ - VertexAIProvider    │   │ - Internal DB logs     │
    │ - LangChainGemini     │   │ - Cost calculation     │
    └───────────────────────┘   └────────────────────────┘
                │                           │
                │                           ▼
                │               ┌────────────────────────┐
                │               │  kb.llm_call_logs      │
                │               │  kb.system_process_logs│
                │               └────────────────────────┘
                │
                └──────────────┐
                               ▼
                   ┌─────────────────────┐
                   │  LangfuseService    │ ◄── NEW
                   │  - Trace management │
                   │  - SDK wrapper      │
                   └─────────────────────┘
                               │
                               ▼
              ┌─────────────────────────────────┐
              │  LangFuse Infrastructure        │
              │  - PostgreSQL (traces)          │
              │  - ClickHouse (observations)    │
              │  - Redis (queue/cache)          │
              │  - Server (web UI)              │
              │  - Worker (async processing)    │
              └─────────────────────────────────┘
```

## Component Design

### 1. LangfuseModule (New)

**Location**: `apps/server/src/modules/langfuse/`

**Structure**:
```
langfuse/
├── langfuse.module.ts       # Module definition
├── langfuse.service.ts      # Core service with SDK client
├── entities/
│   └── trace-context.entity.ts  # TypeScript interfaces
└── __tests__/
    └── langfuse.service.spec.ts
```

**Responsibilities**:
- Initialize LangFuse SDK client with configuration from `AppConfigService`
- Provide singleton client instance across application
- Manage trace creation, observation logging, and score recording
- Handle SDK errors gracefully (fallback to logs, don't crash)
- Support optional deployment (check `LANGFUSE_ENABLED` flag)

**Key Methods**:
```typescript
class LangfuseService {
  // Initialize client
  private initializeClient(): Langfuse | null;
  
  // Check if LangFuse is enabled and configured
  isEnabled(): boolean;
  
  // Create parent trace for extraction job
  createJobTrace(params: {
    jobId: string;
    projectId: string;
    metadata: Record<string, any>;
  }): TraceHandle | null;
  
  // Create observation for individual LLM call
  createObservation(params: {
    traceId: string;
    name: string;
    input: any;
    output: any;
    metadata: Record<string, any>;
    usage?: { promptTokens: number; completionTokens: number; totalTokens: number };
    level?: 'DEFAULT' | 'DEBUG' | 'WARNING' | 'ERROR';
  }): ObservationHandle | null;
  
  // Finalize trace on job completion
  finalizeTrace(traceId: string, status: 'success' | 'error'): Promise<void>;
  
  // Flush pending events (shutdown hook)
  async shutdown(): Promise<void>;
}
```

### 2. Infrastructure Integration

**Docker Compose Configuration** (`docker/docker-compose.yml`):

```yaml
services:
  langfuse-db:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: ${LANGFUSE_POSTGRES_USER:-langfuse}
      POSTGRES_PASSWORD: ${LANGFUSE_POSTGRES_PASSWORD}
      POSTGRES_DB: ${LANGFUSE_POSTGRES_DB:-langfuse}
    volumes:
      - langfuse-db-data:/var/lib/postgresql/data
    networks:
      - langfuse-network
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${LANGFUSE_POSTGRES_USER:-langfuse}"]
      interval: 10s
      timeout: 5s
      retries: 5

  clickhouse:
    image: clickhouse/clickhouse-server:24-alpine
    environment:
      CLICKHOUSE_USER: ${CLICKHOUSE_USER:-default}
      CLICKHOUSE_PASSWORD: ${CLICKHOUSE_PASSWORD}
      CLICKHOUSE_DB: ${CLICKHOUSE_DB:-langfuse}
    volumes:
      - clickhouse-data:/var/lib/clickhouse
    networks:
      - langfuse-network
    healthcheck:
      test: ["CMD", "clickhouse-client", "--query", "SELECT 1"]
      interval: 10s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    command: redis-server --appendonly yes
    volumes:
      - redis-data:/data
    networks:
      - langfuse-network
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5

  langfuse-server:
    image: ghcr.io/langfuse/langfuse:latest
    depends_on:
      langfuse-db:
        condition: service_healthy
      clickhouse:
        condition: service_healthy
      redis:
        condition: service_healthy
    environment:
      DATABASE_URL: postgresql://${LANGFUSE_POSTGRES_USER:-langfuse}:${LANGFUSE_POSTGRES_PASSWORD}@langfuse-db:5432/${LANGFUSE_POSTGRES_DB:-langfuse}
      CLICKHOUSE_HOST: clickhouse
      CLICKHOUSE_PORT: 8123
      CLICKHOUSE_USER: ${CLICKHOUSE_USER:-default}
      CLICKHOUSE_PASSWORD: ${CLICKHOUSE_PASSWORD}
      CLICKHOUSE_DATABASE: ${CLICKHOUSE_DB:-langfuse}
      REDIS_HOST: redis
      REDIS_PORT: 6379
      NEXTAUTH_SECRET: ${NEXTAUTH_SECRET}
      SALT: ${SALT}
      NEXTAUTH_URL: ${LANGFUSE_URL:-http://localhost:3010}
      LANGFUSE_SECRET_KEY: ${LANGFUSE_SECRET_KEY}
      LANGFUSE_PUBLIC_KEY: ${LANGFUSE_PUBLIC_KEY}
    ports:
      - "3010:3000"  # Avoid conflict with app server on 3001
    networks:
      - langfuse-network
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/api/health"]
      interval: 30s
      timeout: 10s
      retries: 3

  langfuse-worker:
    image: ghcr.io/langfuse/langfuse:latest
    command: worker
    depends_on:
      langfuse-db:
        condition: service_healthy
      clickhouse:
        condition: service_healthy
      redis:
        condition: service_healthy
    environment:
      DATABASE_URL: postgresql://${LANGFUSE_POSTGRES_USER:-langfuse}:${LANGFUSE_POSTGRES_PASSWORD}@langfuse-db:5432/${LANGFUSE_POSTGRES_DB:-langfuse}
      CLICKHOUSE_HOST: clickhouse
      CLICKHOUSE_PORT: 8123
      CLICKHOUSE_USER: ${CLICKHOUSE_USER:-default}
      CLICKHOUSE_PASSWORD: ${CLICKHOUSE_PASSWORD}
      CLICKHOUSE_DATABASE: ${CLICKHOUSE_DB:-langfuse}
      REDIS_HOST: redis
      REDIS_PORT: 6379
      NEXTAUTH_SECRET: ${NEXTAUTH_SECRET}
      SALT: ${SALT}
    networks:
      - langfuse-network

networks:
  langfuse-network:
    driver: bridge

volumes:
  langfuse-db-data:
  clickhouse-data:
  redis-data:
```

**Key Infrastructure Decisions**:
- Separate network (`langfuse-network`) isolates LangFuse from main app
- PostgreSQL 16 for trace metadata (separate from main app DB)
- ClickHouse for high-volume observations (optimized for analytics)
- Redis for job queue and caching
- Port 3010 for LangFuse UI (avoid conflict with app server on 3001)
- Health checks ensure proper startup order
- Alpine images minimize disk footprint

### 3. Configuration Extension

**AppConfigService Updates** (`apps/server/src/common/config/config.service.ts`):

```typescript
class AppConfigService {
  // Existing properties...
  
  // LangFuse configuration (NEW)
  get langfuseEnabled(): boolean {
    return this.get('LANGFUSE_ENABLED') === 'true';
  }
  
  get langfuseSecretKey(): string | undefined {
    return this.get('LANGFUSE_SECRET_KEY');
  }
  
  get langfusePublicKey(): string | undefined {
    return this.get('LANGFUSE_PUBLIC_KEY');
  }
  
  get langfuseHost(): string {
    return this.get('LANGFUSE_HOST') || 'http://localhost:3010';
  }
  
  get langfuseFlushAt(): number {
    return parseInt(this.get('LANGFUSE_FLUSH_AT') || '10', 10);
  }
  
  get langfuseFlushInterval(): number {
    return parseInt(this.get('LANGFUSE_FLUSH_INTERVAL') || '10000', 10);
  }
}
```

**Environment Variables** (`.env.example`):

```bash
# LangFuse Observability (Optional)
LANGFUSE_ENABLED=false
LANGFUSE_SECRET_KEY=sk-lf-your-secret-key
LANGFUSE_PUBLIC_KEY=pk-lf-your-public-key
LANGFUSE_HOST=http://localhost:3010
LANGFUSE_FLUSH_AT=10        # Flush after N events
LANGFUSE_FLUSH_INTERVAL=10000  # Flush every N ms
```

### 4. LLM Provider Instrumentation

**VertexAIProvider Updates** (`apps/server/src/modules/extraction-jobs/llm/vertex-ai.provider.ts`):

Current flow:
```typescript
async extractEntitiesForType(..., context?: { jobId: string; projectId: string }) {
  // Start internal monitoring
  const callId = await this.monitoringLogger.startLLMCall(...);
  
  try {
    const result = await generativeModel.generateContent(...);
    
    // Complete internal monitoring
    await this.monitoringLogger.completeLLMCall(...);
    
    return result;
  } catch (error) {
    // Log error to internal monitoring
    await this.monitoringLogger.completeLLMCall(..., { status: 'error' });
    throw error;
  }
}
```

Updated flow (with LangFuse):
```typescript
async extractEntitiesForType(..., context?: { 
  jobId: string; 
  projectId: string;
  traceId?: string;  // NEW: Parent trace ID
}) {
  // Start internal monitoring (unchanged)
  const callId = await this.monitoringLogger.startLLMCall(...);
  
  // Create LangFuse observation (NEW)
  const observation = this.langfuseService.isEnabled()
    ? this.langfuseService.createObservation({
        traceId: context?.traceId,
        name: `extract-${type}`,
        input: { type, documentLength, promptLength },
        metadata: { jobId: context.jobId, projectId: context.projectId, model: 'gemini-1.5-pro' }
      })
    : null;
  
  try {
    const result = await generativeModel.generateContent(...);
    
    // Complete internal monitoring (unchanged)
    await this.monitoringLogger.completeLLMCall(...);
    
    // Update LangFuse observation (NEW)
    if (observation) {
      observation.update({
        output: { entitiesCount: result.entities.length },
        usage: {
          promptTokens: result.usageMetadata.promptTokenCount,
          completionTokens: result.usageMetadata.candidatesTokenCount,
          totalTokens: result.usageMetadata.totalTokenCount
        }
      });
    }
    
    return result;
  } catch (error) {
    // Log error to internal monitoring (unchanged)
    await this.monitoringLogger.completeLLMCall(..., { status: 'error' });
    
    // Log error to LangFuse (NEW)
    if (observation) {
      observation.update({ level: 'ERROR', statusMessage: error.message });
    }
    
    throw error;
  }
}
```

**Key Design Decisions**:
- LangFuse is **additive** - internal monitoring continues unchanged
- `traceId` is optional - graceful degradation if not provided
- Observation creation is **non-blocking** - failures logged but don't crash
- Token usage from Google response flows to both systems
- Error handling duplicated to ensure both systems capture failures

### 5. Job-Level Trace Context

**ExtractionWorkerService Updates** (`apps/server/src/modules/extraction-jobs/extraction-worker.service.ts`):

Current flow:
```typescript
async processJob(job: ObjectExtractionJob) {
  // Log job start
  await this.monitoringLogger.logProcessEvent({ processId: job.id, ... });
  
  // Process document
  const result = await this.llmProvider.extractEntities(..., {
    jobId: job.id,
    projectId: job.project_id
  });
  
  // Log job completion
  await this.monitoringLogger.logProcessEvent({ processId: job.id, ... });
}
```

Updated flow (with LangFuse):
```typescript
async processJob(job: ObjectExtractionJob) {
  // Create parent trace for entire job (NEW)
  const trace = this.langfuseService.isEnabled()
    ? this.langfuseService.createJobTrace({
        jobId: job.id,
        projectId: job.project_id,
        metadata: {
          sourceType: job.source_type,
          sourceId: job.source_id,
          documentCount: job.documents?.length || 0
        }
      })
    : null;
  
  // Log job start (unchanged)
  await this.monitoringLogger.logProcessEvent({ processId: job.id, ... });
  
  try {
    // Process document - pass trace ID to LLM provider (NEW)
    const result = await this.llmProvider.extractEntities(..., {
      jobId: job.id,
      projectId: job.project_id,
      traceId: trace?.id  // Child observations will nest under this
    });
    
    // Log job completion (unchanged)
    await this.monitoringLogger.logProcessEvent({ processId: job.id, ... });
    
    // Finalize trace (NEW)
    if (trace) {
      await this.langfuseService.finalizeTrace(trace.id, 'success');
    }
    
    return result;
  } catch (error) {
    // Log error (unchanged)
    await this.monitoringLogger.logProcessEvent({ 
      processId: job.id, 
      level: 'error', 
      message: error.message 
    });
    
    // Finalize trace with error (NEW)
    if (trace) {
      await this.langfuseService.finalizeTrace(trace.id, 'error');
    }
    
    throw error;
  }
}
```

**Trace Hierarchy**:
```
Job Trace (Parent)
├── Observation: extract-Location (model: gemini-1.5-pro)
├── Observation: extract-Person (model: gemini-1.5-pro)
├── Observation: extract-Organization (model: gemini-1.5-flash)
└── Observation: extract-Event (model: gemini-1.5-flash)
```

## Data Flow

### Dual-Path Monitoring

```
LLM Call
    │
    ├─────────────────────────────┬──────────────────────────────┐
    │                             │                              │
    ▼                             ▼                              ▼
MonitoringLoggerService    LangfuseService              LLM Provider
    │                             │                              │
    ▼                             ▼                              │
kb.llm_call_logs           LangFuse API                         │
    │                             │                              │
    │                             ▼                              │
    │                    LangFuse Infrastructure                 │
    │                    (PostgreSQL + ClickHouse)               │
    │                             │                              │
    │                             ▼                              │
    │                      LangFuse Web UI                       │
    │                                                            │
    ▼                                                            ▼
Internal API Endpoints                                   Application Logic
(/monitoring/...)                                        (continues execution)
```

**Important**: Both paths are **independent**. Failure in LangFuse path does not affect:
- Internal monitoring (still writes to `kb.llm_call_logs`)
- LLM execution (still returns results to application)
- Job completion (still updates job status)

## Error Handling Strategy

### LangFuse Service Error Boundaries

```typescript
class LangfuseService {
  private handleError(operation: string, error: Error): void {
    this.logger.warn(`LangFuse ${operation} failed: ${error.message}`);
    // Do NOT throw - graceful degradation
  }
  
  createObservation(...): ObservationHandle | null {
    if (!this.isEnabled()) return null;
    
    try {
      return this.client.trace(...);
    } catch (error) {
      this.handleError('createObservation', error);
      return null;  // Return null, not throw
    }
  }
}
```

### Provider Error Handling

```typescript
// In VertexAIProvider
const observation = this.langfuseService.isEnabled()
  ? this.langfuseService.createObservation(...)
  : null;

// No try-catch needed - LangfuseService handles errors internally
// If observation is null, update calls are no-ops
if (observation) {
  observation.update(...);  // Safe even if observation creation failed
}
```

### Startup Validation

```typescript
// In LangfuseService.onModuleInit()
async onModuleInit() {
  if (!this.config.langfuseEnabled) {
    this.logger.log('LangFuse is disabled (LANGFUSE_ENABLED=false)');
    return;
  }
  
  if (!this.config.langfuseSecretKey || !this.config.langfusePublicKey) {
    this.logger.warn('LangFuse is enabled but credentials are missing. Traces will not be sent.');
    return;
  }
  
  try {
    this.client = this.initializeClient();
    this.logger.log(`LangFuse initialized: ${this.config.langfuseHost}`);
  } catch (error) {
    this.logger.error(`LangFuse initialization failed: ${error.message}`);
    // Continue startup - LangFuse is optional
  }
}
```

## Performance Considerations

### Async Trace Sending

LangFuse SDK batches events and sends asynchronously:
- **Flush threshold**: Send after 10 events (configurable via `LANGFUSE_FLUSH_AT`)
- **Flush interval**: Send every 10 seconds (configurable via `LANGFUSE_FLUSH_INTERVAL`)
- **Non-blocking**: Trace creation returns immediately; actual API call happens in background

### Resource Impact

Estimated overhead per LLM call:
- **Memory**: ~2KB per observation (held in SDK buffer until flushed)
- **CPU**: Negligible (JSON serialization only)
- **Network**: 1 HTTP request per 10 observations (batched)
- **Latency**: 0ms added to LLM call (async background sending)

### Shutdown Handling

```typescript
// In LangfuseModule
async onApplicationShutdown() {
  await this.langfuseService.shutdown();
}

// In LangfuseService
async shutdown(): Promise<void> {
  if (this.client) {
    await this.client.flushAsync();  // Send all pending events
    this.logger.log('LangFuse client shut down successfully');
  }
}
```

## Testing Strategy

### Unit Tests

**LangfuseService** (`langfuse.service.spec.ts`):
```typescript
describe('LangfuseService', () => {
  it('should initialize when enabled with valid credentials', () => {
    // Mock AppConfigService with enabled=true, valid keys
    // Verify client initialization
  });
  
  it('should return null when disabled', () => {
    // Mock AppConfigService with enabled=false
    // Verify createObservation returns null
  });
  
  it('should handle SDK initialization errors gracefully', () => {
    // Mock Langfuse constructor to throw error
    // Verify service logs warning, does not crash
  });
  
  it('should create parent trace with correct metadata', () => {
    // Mock Langfuse client
    // Call createJobTrace
    // Verify trace.create called with correct params
  });
});
```

### Integration Tests

**VertexAIProvider Tracing** (`vertex-ai.provider.spec.ts`):
```typescript
describe('VertexAIProvider with LangFuse', () => {
  it('should create observation for successful LLM call', async () => {
    // Mock LangfuseService
    // Mock Vertex AI response
    // Call extractEntitiesForType with traceId
    // Verify observation.create called
    // Verify observation.update called with usage metadata
  });
  
  it('should mark observation as error on LLM failure', async () => {
    // Mock LangfuseService
    // Mock Vertex AI to throw error
    // Call extractEntitiesForType with traceId
    // Verify observation.update called with level='ERROR'
  });
  
  it('should continue working if LangFuse is disabled', async () => {
    // Mock LangfuseService.isEnabled() to return false
    // Call extractEntitiesForType
    // Verify LLM call still succeeds
    // Verify internal monitoring still logs
  });
});
```

### E2E Tests

**Full Extraction Job** (`extraction-worker.e2e-spec.ts`):
```typescript
describe('Extraction with LangFuse tracing', () => {
  it('should create parent trace and child observations', async () => {
    // Setup: Enable LangFuse, mock LangFuse client
    // Create extraction job
    // Process job (extracts 3 entity types)
    // Verify: 1 parent trace created
    // Verify: 3 child observations created
    // Verify: Parent trace finalized with success
  });
  
  it('should finalize trace with error on job failure', async () => {
    // Setup: Enable LangFuse, mock LLM to fail
    // Create extraction job
    // Process job (expect failure)
    // Verify: Parent trace finalized with error status
  });
});
```

## Migration Path

### Phase 1: Infrastructure (No Code Changes)
1. Add LangFuse services to `docker-compose.yml`
2. Add environment variables to `.env.example`
3. Document LangFuse UI access in `docs/`
4. Verify LangFuse UI accessible at `http://localhost:3010`

### Phase 2: Core Integration
1. Install `langfuse` npm package
2. Create `LangfuseModule` and `LangfuseService`
3. Add configuration to `AppConfigService`
4. Add unit tests for `LangfuseService`
5. Verify service initializes correctly (integration test)

### Phase 3: LLM Provider Instrumentation
1. Inject `LangfuseService` into `VertexAIProvider`
2. Add observation creation around LLM calls
3. Add unit tests for observation logic
4. Verify observations appear in LangFuse UI (manual test)

### Phase 4: Job-Level Tracing
1. Inject `LangfuseService` into `ExtractionWorkerService`
2. Create parent traces for extraction jobs
3. Pass `traceId` to LLM providers
4. Add E2E tests for full trace hierarchy
5. Verify parent-child relationships in LangFuse UI

### Phase 5: Documentation & Rollout
1. Update `README.md` with LangFuse setup instructions
2. Create `docs/integrations/langfuse/SETUP.md` guide
3. Add screenshots of LangFuse UI to documentation
4. Announce feature to team with onboarding session

## Rollback Plan

If issues arise post-deployment:

1. **Immediate**: Set `LANGFUSE_ENABLED=false` in environment (disables tracing, no code changes needed)
2. **Infrastructure**: Stop LangFuse containers via `docker-compose stop langfuse-*`
3. **Code**: Revert commits (all changes are additive, no breaking changes)
4. **Data**: Internal monitoring continues unaffected throughout

## Open Questions

1. **Trace retention**: LangFuse default is 30 days. Should we configure differently?
   - Recommendation: Start with 90 days, adjust based on storage usage
2. **Access control**: Should LangFuse UI require authentication? How to integrate with Zitadel?
   - Recommendation: Phase 1 uses LangFuse built-in auth; Phase 2 evaluates Zitadel SSO
3. **Multi-environment**: Should development/staging/production use separate LangFuse instances?
   - Recommendation: Yes, separate instances to avoid data mixing
4. **Cost dashboard**: Should we build a custom dashboard combining internal logs + LangFuse data?
   - Recommendation: Start with separate views; combine if user feedback requests it
