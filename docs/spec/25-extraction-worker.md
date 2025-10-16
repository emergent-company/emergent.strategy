# Document Extraction Worker System

**Status**: Design Complete - Ready for Implementation  
**Created**: 2025-10-03  
**Related**: `24-dynamic-type-discovery-and-ingestion.md`, `05-ingestion-workflows.md`, `20-embeddings.md`

---

## 1. Overview

The Extraction Worker is a background processing system that automatically extracts structured objects from unstructured documents using AI/LLM technology. It follows the same architectural pattern as the Embedding Worker, using PostgreSQL as a job queue with polling-based batch processing.

### Key Capabilities

1. **Automated Object Extraction** - Parse documents and create graph objects
2. **Type-Aware Processing** - Use project type registry and template pack schemas
3. **Entity Linking** - Match/merge with existing objects or create new ones
4. **Quality Control** - Confidence scoring with configurable review thresholds
5. **Resilient Processing** - Retry logic with exponential backoff
6. **Rate Limiting** - Respect LLM provider API quotas

---

## 2. Architecture Components

```
┌─────────────────────────────────────────────────────────────────┐
│                     Extraction Job Queue                         │
│                  (kb.object_extraction_jobs)                     │
│  Status: pending → running → completed/failed/requires_review   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                   Extraction Worker Service                      │
│  ┌──────────────┬───────────────┬──────────────┬──────────────┐ │
│  │ Job Dequeue  │ Document Load │ LLM Extract  │ Entity Link  │ │
│  │ (SKIP LOCKED)│ (Full Text)   │ (Structured) │ (Merge/New)  │ │
│  └──────────────┴───────────────┴──────────────┴──────────────┘ │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    LLM Provider Adapter                          │
│                  (via LangChain TypeScript)                      │
│  ┌──────────────┬───────────────┬──────────────┬──────────────┐ │
│  │ Google Gemini│ OpenAI (TODO) │ Anthropic    │ Rate Limiter │ │
│  │ (PRIMARY)    │               │ (TODO)       │              │ │
│  └──────────────┴───────────────┴──────────────┴──────────────┘ │
│  Uses: ChatGoogleGenerativeAI.withStructuredOutput(zodSchema)   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Graph Service                               │
│  createObject() - Create new graph objects with provenance      │
│  patchObject()  - Merge extracted data into existing objects    │
└─────────────────────────────────────────────────────────────────┘
```

---

## 3. LLM Integration Strategy

### 3.1 Framework Selection: LangChain TypeScript

**Decision**: Use **LangChain** (`@langchain/google-genai`) for structured extraction.

**Rationale**:
1. ✅ **Already Installed** - Project uses LangChain v0.2.17 for chat and embeddings
2. ✅ **Consistent Patterns** - Matches existing `chat-generation.service.ts` structure  
3. ✅ **Shared Configuration** - Reuses Google API key from environment
4. ✅ **TypeScript Native** - Full type safety without Python microservice overhead
5. ✅ **Future-Ready** - Supports RAG, chains, and agents when needed

**Alternative Considered - LangExtract**:
- ❌ Python-only library (incompatible with TypeScript/NestJS stack)
- ❌ Would require separate Python microservice (Flask/FastAPI)
- ❌ Architectural overhead: inter-service communication, deployment complexity
- Verdict: Not suitable for TypeScript backend

**Alternative Considered - Vercel AI SDK**:
- ✅ TypeScript native, modern API
- ❌ New dependency, different patterns from existing chat service
- ❌ Would require separate configuration/authentication setup
- Verdict: Good library, but LangChain already integrated

### 3.2 Structured Extraction Method

Uses LangChain's **`.withStructuredOutput(zodSchema)`** method:

```typescript
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { z } from 'zod';

// Define schema for extraction
const RequirementSchema = z.object({
  name: z.string().describe('Short requirement name'),
  description: z.string().describe('Detailed requirement description'),
  priority: z.enum(['low', 'medium', 'high', 'critical']),
  status: z.enum(['draft', 'active', 'completed', 'deprecated']),
  confidence: z.number().min(0).max(1).describe('Confidence score 0-1'),
  source_text: z.string().describe('Verbatim text from document'),
});

// Initialize model (pattern from chat-generation.service.ts)
const model = new ChatGoogleGenerativeAI({
  modelName: 'gemini-1.5-flash-latest',
  apiKey: this.configService.get('GOOGLE_GENERATIVE_AI_API_KEY'),
  temperature: 0, // Deterministic for extraction
});

// Extract with structured output
const structuredModel = model.withStructuredOutput(RequirementSchema);
const result = await structuredModel.invoke([
  { role: 'system', content: systemPrompt },
  { role: 'user', content: documentText },
]);
```

### 3.3 Model Selection

**Primary Model**: `gemini-1.5-flash-latest`
- **Cost**: $0.075 input / $0.30 output per 1M tokens
- **Speed**: 33x cheaper than GPT-4 Turbo
- **Quality**: Sufficient for structured extraction tasks
- **Free Tier**: 15 requests/minute

**Alternative**: `gemini-1.5-pro` (higher quality, 17x cost increase)

### 3.4 Dependencies

**Required**:
- ✅ `@langchain/google-genai` v0.2.17 (already installed)
- 🔧 `zod` (needs installation) - Schema validation

**No New Dependencies Needed**:
- Chat service already configured Google Gemini authentication
- Same `GOOGLE_GENERATIVE_AI_API_KEY` environment variable

---

## 4. Configuration & Environment

### Environment Variables

```bash
# LLM Provider Configuration (LangChain + Google Gemini)
GOOGLE_API_KEY=<key>                    # Google Gemini API key (shared with chat service)
VERTEX_AI_MODEL=gemini-1.5-flash-latest # Model for extraction (default: gemini-1.5-flash-latest)

# Legacy Vertex AI Configuration (fallback if GOOGLE_API_KEY not set)
VERTEX_AI_PROJECT_ID=<project-id>       # GCP project for Vertex AI (optional)
VERTEX_AI_LOCATION=us-central1          # Region for API calls (optional)

# Worker Configuration
EXTRACTION_WORKER_ENABLED=true          # Enable/disable worker
EXTRACTION_WORKER_POLL_INTERVAL_MS=5000 # Polling interval (ms)
EXTRACTION_WORKER_BATCH_SIZE=5          # Jobs per batch (default: 5)
EXTRACTION_WORKER_RETRY_MAX=3           # Max retry attempts

# Rate Limiting (Gemini API quotas)
EXTRACTION_RATE_LIMIT_RPM=60            # Requests per minute (default: 60)
EXTRACTION_RATE_LIMIT_TPM=30000         # Tokens per minute (default: 30000)

# Quality Control
EXTRACTION_MIN_CONFIDENCE=0.0           # Minimum to create (0.0-1.0)
EXTRACTION_REVIEW_THRESHOLD=0.7         # Flag for review if below
EXTRACTION_AUTO_CREATE_THRESHOLD=0.85   # Auto-create without review

# Entity Linking
ENTITY_LINKING_ENABLED=true             # Enable similarity matching
ENTITY_LINKING_STRATEGY=vector_similarity # 'always_new' | 'key_match' | 'vector_similarity' | 'user_review'
ENTITY_LINKING_SIMILARITY_THRESHOLD=0.9 # Min similarity to merge (0.0-1.0)
ENTITY_LINKING_MAX_CANDIDATES=5         # Max similar objects to check

# Feature Flags
EXTRACTION_FULL_DOCUMENT=true           # true = full doc, false = chunk-by-chunk
EXTRACTION_RELATIONSHIP_INFERENCE=false # Extract relationships (Phase 3)
EXTRACTION_TYPE_DISCOVERY=false         # Auto-discover new types (Phase 3)
```

### Configuration Schema

```typescript
interface ExtractionWorkerConfig {
  enabled: boolean;
  intervalMs: number;
  batchSize: number;
  maxRetries: number;
  
  llm: {
    provider: 'google-vertex' | 'openai' | 'anthropic' | 'local';
    model: string;
    apiKey?: string;
    project?: string;
    location?: string;
  };
  
  rateLimits: {
    requestsPerMinute: number;
    tokensPerMinute?: number;
  };
  
  quality: {
    minConfidence: number;           // 0.0-1.0
    reviewThreshold: number;         // Below this, flag for review
    autoCreateThreshold: number;     // Above this, auto-create
  };
  
  entityLinking: {
    enabled: boolean;
    strategy: 'always_new' | 'key_match' | 'vector_similarity' | 'user_review';
    similarityThreshold: number;     // 0.0-1.0
    maxCandidates: number;
  };
  
  features: {
    fullDocument: boolean;           // true = full doc, false = chunk-by-chunk
    extractRelationships: boolean;   // Phase 3
    discoverTypes: boolean;          // Phase 3
  };
}
```

---

## 4. Job Lifecycle

### Job States

```typescript
enum ExtractionJobStatus {
  PENDING = 'pending',           // Waiting to be processed
  RUNNING = 'running',           // Currently being processed
  COMPLETED = 'completed',       // Successfully completed
  FAILED = 'failed',            // Failed after retries
  CANCELLED = 'cancelled',       // User cancelled
  REQUIRES_REVIEW = 'requires_review' // Low confidence, needs human review
}
```

### State Transitions

```
pending ──────────────► running ──────────────► completed
                           │                        │
                           │                        ▼
                           ├──────────────► requires_review
                           │                        │
                           ▼                        │
                        failed ◄────────────────────┘
                           │
                           └──► pending (retry with backoff)
```

### Job Dequeue Query

```sql
-- Atomic claim using FOR UPDATE SKIP LOCKED
WITH cte AS (
  SELECT id FROM kb.object_extraction_jobs
  WHERE status = 'pending' 
    AND scheduled_at <= now()
  ORDER BY priority DESC, scheduled_at ASC
  FOR UPDATE SKIP LOCKED
  LIMIT $1
)
UPDATE kb.object_extraction_jobs j 
SET status = 'running', 
    started_at = now(), 
    updated_at = now()
FROM cte 
WHERE j.id = cte.id
RETURNING j.*;
```

---

## 5. Extraction Process Flow

### 5.1 Overview

```typescript
async function processBatch() {
  // 1. Dequeue pending jobs
  const jobs = await dequeueJobs(config.batchSize);
  
  for (const job of jobs) {
    try {
      // 2. Load source document
      const document = await loadDocument(job.source_type, job.source_id);
      
      // 3. Get project type configuration
      const typeRegistry = await getProjectTypeRegistry(job.project_id);
      const enabledTypes = filterEnabledTypes(typeRegistry, job.extraction_config);
      
      // 4. Extract objects for each type
      const extractedObjects = [];
      for (const typeConfig of enabledTypes) {
        const objects = await extractObjectsOfType(document, typeConfig);
        extractedObjects.push(...objects);
      }
      
      // 5. Entity linking & object creation
      const results = await processExtractedObjects(extractedObjects, job);
      
      // 6. Update job with results
      await updateJobResults(job.id, results);
      
    } catch (error) {
      await handleJobFailure(job.id, error);
    }
  }
}
```

### 5.2 Document Loading

```typescript
async function loadDocument(sourceType: string, sourceId: string): Promise<Document> {
  switch (sourceType) {
    case 'document':
      // Load from kb.documents table
      const doc = await db.query(
        `SELECT id, content, metadata FROM kb.documents WHERE id = $1`,
        [sourceId]
      );
      return {
        id: doc.id,
        text: doc.content,
        metadata: doc.metadata,
        chunks: [] // Full document mode
      };
      
    case 'chunk':
      // Load specific chunk from kb.chunks
      const chunk = await db.query(
        `SELECT id, content, metadata, document_id FROM kb.chunks WHERE id = $1`,
        [sourceId]
      );
      return {
        id: chunk.document_id,
        text: chunk.content,
        metadata: chunk.metadata,
        chunks: [chunk]
      };
      
    case 'external':
      // Load from external source via API
      return await externalDocumentLoader.load(sourceId);
      
    default:
      throw new Error(`Unsupported source type: ${sourceType}`);
  }
}
```

### 5.3 Type-Aware Extraction

```typescript
async function extractObjectsOfType(
  document: Document,
  typeConfig: TypeRegistryEntry
): Promise<ExtractedObject[]> {
  // Build extraction prompt from template
  const prompt = buildExtractionPrompt(typeConfig, document);
  
  // Call LLM provider
  const response = await llmProvider.extract({
    model: config.llm.model,
    prompt: prompt.system,
    content: document.text,
    schema: typeConfig.json_schema,
    temperature: 0.1, // Low temp for structured extraction
    maxTokens: 4000
  });
  
  // Parse and validate response
  const objects = parseExtractionResponse(response, typeConfig.json_schema);
  
  // Calculate confidence scores
  return objects.map(obj => ({
    type: typeConfig.type,
    properties: obj.data,
    confidence: calculateConfidence(obj),
    source_evidence: extractEvidence(document, obj),
    metadata: {
      model: config.llm.model,
      prompt_version: typeConfig.extraction_prompt_version || '1.0',
      extraction_timestamp: new Date().toISOString()
    }
  }));
}
```

### 5.4 Prompt Construction

```typescript
function buildExtractionPrompt(
  typeConfig: TypeRegistryEntry,
  document: Document
): ExtractionPrompt {
  const schemaStr = JSON.stringify(typeConfig.json_schema, null, 2);
  
  const systemPrompt = `You are an expert at extracting structured data from documents.

Task: Extract all instances of "${typeConfig.type}" from the provided document.

Type Definition:
${typeConfig.description || 'No description available'}

Schema:
${schemaStr}

${typeConfig.extraction_prompt || ''}

Instructions:
1. Carefully read the document
2. Identify all instances that match the type definition
3. Extract data matching the schema exactly
4. Return a JSON array of objects
5. Include a "confidence" field (0.0-1.0) for each object
6. Include "evidence" field with relevant text excerpts

Response format:
{
  "objects": [
    {
      "data": { /* object matching schema */ },
      "confidence": 0.95,
      "evidence": ["relevant", "text", "excerpts"]
    }
  ]
}

IMPORTANT: Only return valid JSON. Do not include explanations or markdown.`;

  return {
    system: systemPrompt,
    content: document.text,
    schema: typeConfig.json_schema
  };
}
```

---

## 6. Entity Linking & Deduplication

### 6.1 Strategies

```typescript
enum EntityLinkingStrategy {
  ALWAYS_NEW = 'always_new',           // Always create new objects
  KEY_MATCH = 'key_match',             // Match by object key field
  VECTOR_SIMILARITY = 'vector_similarity', // Match by embedding similarity
  USER_REVIEW = 'user_review'          // Always flag for human review
}
```

### 6.2 Similarity Matching

```typescript
async function findSimilarObjects(
  extracted: ExtractedObject,
  projectId: string,
  config: EntityLinkingConfig
): Promise<SimilarityMatch[]> {
  if (!config.enabled || config.strategy === 'always_new') {
    return [];
  }
  
  // Strategy: Key Match
  if (config.strategy === 'key_match') {
    const key = extractKey(extracted.properties);
    if (!key) return [];
    
    const existing = await db.query(
      `SELECT * FROM kb.graph_objects 
       WHERE project_id = $1 
         AND type = $2 
         AND key = $3 
         AND deleted_at IS NULL
       LIMIT 1`,
      [projectId, extracted.type, key]
    );
    
    if (existing.rowCount) {
      return [{
        object: existing.rows[0],
        similarity: 1.0,
        matchType: 'key'
      }];
    }
    return [];
  }
  
  // Strategy: Vector Similarity
  if (config.strategy === 'vector_similarity') {
    // Generate embedding for extracted object
    const embedding = await embeddingProvider.generate(
      JSON.stringify(extracted.properties)
    );
    
    // Find similar objects using vector search
    const similar = await vectorSearchService.searchByVector(embedding, {
      projectId,
      type: extracted.type,
      limit: config.maxCandidates,
      minScore: config.similarityThreshold
    });
    
    return similar.map(match => ({
      object: match,
      similarity: 1 - match.distance, // Convert distance to similarity
      matchType: 'vector'
    }));
  }
  
  return [];
}
```

### 6.3 Merge Strategy

```typescript
async function processSimilarityMatch(
  extracted: ExtractedObject,
  match: SimilarityMatch,
  job: ExtractionJob
): Promise<ProcessingResult> {
  const existingProps = match.object.properties;
  const extractedProps = extracted.properties;
  
  // Calculate property overlap
  const overlap = calculatePropertyOverlap(existingProps, extractedProps);
  
  if (overlap > 0.9) {
    // High overlap - likely duplicate, skip
    return {
      action: 'skipped_duplicate',
      objectId: match.object.id,
      reason: `High similarity (${match.similarity.toFixed(2)}) with existing object`
    };
  }
  
  if (overlap > 0.5) {
    // Partial overlap - merge new properties
    const mergedProps = mergeProperties(existingProps, extractedProps);
    
    await graphService.patchObject(match.object.id, {
      properties: mergedProps,
      labels: [...new Set([...match.object.labels, 'extracted', 'merged'])],
      // Track extraction provenance in metadata
      _extraction: {
        job_id: job.id,
        updated_at: new Date().toISOString(),
        merged_fields: Object.keys(extractedProps).filter(k => !(k in existingProps))
      }
    });
    
    return {
      action: 'merged',
      objectId: match.object.id,
      mergedFields: Object.keys(extractedProps).filter(k => !(k in existingProps))
    };
  }
  
  // Low overlap - create new object
  return await createNewObject(extracted, job);
}
```

---

## 7. Quality Control & Confidence Scoring

### 7.1 Confidence Calculation

```typescript
function calculateConfidence(extracted: ExtractedObject): number {
  let score = 0.5; // Base score
  
  // Factor 1: LLM-provided confidence
  if (extracted.metadata?.llm_confidence) {
    score = extracted.metadata.llm_confidence * 0.4;
  }
  
  // Factor 2: Schema completeness
  const requiredFields = getRequiredFields(extracted.schema);
  const providedFields = Object.keys(extracted.properties);
  const completeness = providedFields.filter(f => requiredFields.includes(f)).length / requiredFields.length;
  score += completeness * 0.3;
  
  // Factor 3: Evidence quality
  const evidenceScore = extracted.source_evidence?.length > 0 ? 0.2 : 0;
  score += evidenceScore;
  
  // Factor 4: Property value quality
  const valueQuality = assessPropertyQuality(extracted.properties);
  score += valueQuality * 0.1;
  
  return Math.min(1.0, Math.max(0.0, score));
}

function assessPropertyQuality(properties: any): number {
  let quality = 0;
  let count = 0;
  
  for (const [key, value] of Object.entries(properties)) {
    count++;
    
    if (value == null || value === '') {
      quality += 0;
    } else if (typeof value === 'string' && value.length < 3) {
      quality += 0.3;
    } else if (typeof value === 'string' && value.length > 10) {
      quality += 1.0;
    } else {
      quality += 0.7;
    }
  }
  
  return count > 0 ? quality / count : 0;
}
```

### 7.2 Review Flagging

```typescript
async function processExtractedObject(
  extracted: ExtractedObject,
  job: ExtractionJob,
  config: ExtractionWorkerConfig
): Promise<ProcessingResult> {
  const confidence = extracted.confidence;
  
  // Below minimum threshold - reject
  if (confidence < config.quality.minConfidence) {
    return {
      action: 'rejected',
      reason: `Confidence ${confidence.toFixed(2)} below minimum ${config.quality.minConfidence}`,
      extractedData: extracted
    };
  }
  
  // Above auto-create threshold - create immediately
  if (confidence >= config.quality.autoCreateThreshold) {
    return await createObjectWithLinking(extracted, job, config);
  }
  
  // Between thresholds - flag for review
  if (confidence >= config.quality.reviewThreshold) {
    return await createObjectForReview(extracted, job);
  }
  
  // Below review threshold - flag with high priority
  return await createObjectForReview(extracted, job, { priority: 'high' });
}

async function createObjectForReview(
  extracted: ExtractedObject,
  job: ExtractionJob,
  options?: { priority?: 'low' | 'medium' | 'high' }
): Promise<ProcessingResult> {
  const object = await graphService.createObject({
    type: extracted.type,
    properties: extracted.properties,
    labels: ['extracted', 'requires_review'],
    // Store extraction metadata
    _extraction_metadata: {
      job_id: job.id,
      confidence: extracted.confidence,
      model: extracted.metadata?.model,
      evidence: extracted.source_evidence,
      review_priority: options?.priority || 'medium',
      flagged_at: new Date().toISOString()
    }
  });
  
  // Update job status to requires_review if any object needs review
  await updateJobStatus(job.id, 'requires_review');
  
  return {
    action: 'flagged_for_review',
    objectId: object.id,
    confidence: extracted.confidence
  };
}
```

---

## 8. Rate Limiting

### 8.1 Token Bucket Implementation

```typescript
class RateLimiter {
  private tokens: number;
  private lastRefill: number;
  
  constructor(
    private readonly maxTokens: number,
    private readonly refillRate: number // tokens per second
  ) {
    this.tokens = maxTokens;
    this.lastRefill = Date.now();
  }
  
  async acquire(cost: number = 1): Promise<void> {
    this.refill();
    
    while (this.tokens < cost) {
      const waitMs = ((cost - this.tokens) / this.refillRate) * 1000;
      await sleep(Math.min(waitMs, 1000)); // Wait max 1 second at a time
      this.refill();
    }
    
    this.tokens -= cost;
  }
  
  private refill(): void {
    const now = Date.now();
    const elapsed = (now - this.lastRefill) / 1000;
    const tokensToAdd = elapsed * this.refillRate;
    
    this.tokens = Math.min(this.maxTokens, this.tokens + tokensToAdd);
    this.lastRefill = now;
  }
  
  getAvailableTokens(): number {
    this.refill();
    return this.tokens;
  }
}
```

### 8.2 Usage

```typescript
@Injectable()
export class ExtractionWorkerService {
  private rateLimiter: RateLimiter;
  
  constructor(private config: ExtractionWorkerConfig) {
    // Vertex AI: 60 RPM = 1 request per second
    const tokensPerSecond = config.rateLimits.requestsPerMinute / 60;
    this.rateLimiter = new RateLimiter(
      config.rateLimits.requestsPerMinute,
      tokensPerSecond
    );
  }
  
  async extractWithRateLimit(
    document: Document,
    typeConfig: TypeRegistryEntry
  ): Promise<ExtractedObject[]> {
    // Wait for rate limit token
    await this.rateLimiter.acquire();
    
    // Make LLM request
    return await this.extractObjectsOfType(document, typeConfig);
  }
}
```

---

## 9. Error Handling & Retry Logic

### 9.1 Retry Strategy

```typescript
async function handleJobFailure(
  jobId: string,
  error: Error,
  config: ExtractionWorkerConfig
): Promise<void> {
  const job = await loadJob(jobId);
  const retryCount = (job.retry_count || 0) + 1;
  
  // Max retries exceeded
  if (retryCount > config.maxRetries) {
    await db.query(
      `UPDATE kb.object_extraction_jobs 
       SET status = 'failed',
           error_message = $1,
           error_details = $2,
           completed_at = now(),
           updated_at = now()
       WHERE id = $3`,
      [
        error.message,
        JSON.stringify({ 
          stack: error.stack,
          retry_count: retryCount,
          final_failure: true
        }),
        jobId
      ]
    );
    return;
  }
  
  // Calculate exponential backoff
  const baseDelay = 60; // 60 seconds
  const delay = Math.min(3600, baseDelay * Math.pow(2, retryCount)); // Cap at 1 hour
  const scheduledAt = new Date(Date.now() + delay * 1000);
  
  // Requeue with backoff
  await db.query(
    `UPDATE kb.object_extraction_jobs 
     SET status = 'pending',
         retry_count = $1,
         error_message = $2,
         scheduled_at = $3,
         updated_at = now()
     WHERE id = $4`,
    [
      retryCount,
      error.message,
      scheduledAt,
      jobId
    ]
  );
  
  logger.warn(`Job ${jobId} failed (attempt ${retryCount}/${config.maxRetries}), retrying in ${delay}s`);
}
```

### 9.2 Error Categories

```typescript
enum ExtractionErrorType {
  // Retriable errors
  RATE_LIMIT = 'rate_limit',         // LLM API rate limit hit
  NETWORK = 'network',               // Network timeout/connection
  LLM_TIMEOUT = 'llm_timeout',       // LLM response timeout
  
  // Non-retriable errors
  INVALID_SCHEMA = 'invalid_schema', // Schema validation failed
  DOCUMENT_NOT_FOUND = 'document_not_found',
  INVALID_CONFIG = 'invalid_config',
  PARSE_ERROR = 'parse_error'        // LLM returned unparseable response
}

function isRetriableError(error: Error): boolean {
  const retriable = [
    'ECONNRESET',
    'ETIMEDOUT',
    'RATE_LIMIT',
    '429', // HTTP Too Many Requests
    '503', // Service Unavailable
    '504'  // Gateway Timeout
  ];
  
  return retriable.some(code => 
    error.message.includes(code) || error.name.includes(code)
  );
}
```

---

## 10. Monitoring & Observability

### 10.1 Metrics

```typescript
interface ExtractionWorkerMetrics {
  // Job Processing
  jobsProcessed: number;
  jobsSucceeded: number;
  jobsFailed: number;
  jobsRequiringReview: number;
  
  // Object Creation
  objectsCreated: number;
  objectsMerged: number;
  objectsSkipped: number;
  
  // Quality
  avgConfidence: number;
  lowConfidenceCount: number;
  
  // Performance
  avgProcessingTimeMs: number;
  avgLlmResponseTimeMs: number;
  
  // Rate Limiting
  rateLimitHits: number;
  avgWaitTimeMs: number;
  
  // Errors
  retriableErrors: number;
  nonRetriableErrors: number;
}
```

### 10.2 Logging

```typescript
// Structured logging for extraction events
logger.log({
  event: 'extraction_job_completed',
  jobId: job.id,
  projectId: job.project_id,
  duration: Date.now() - job.started_at,
  results: {
    objectsCreated: results.created.length,
    objectsMerged: results.merged.length,
    objectsSkipped: results.skipped.length,
    requiresReview: results.review.length
  },
  confidence: {
    avg: avgConfidence,
    min: minConfidence,
    max: maxConfidence
  }
});
```

---

## 11. Testing Strategy

### 11.1 Unit Tests

```typescript
describe('ExtractionWorkerService', () => {
  describe('extractObjectsOfType', () => {
    it('should extract objects matching schema');
    it('should calculate confidence scores');
    it('should handle LLM errors gracefully');
    it('should validate against JSON schema');
  });
  
  describe('entityLinking', () => {
    it('should find similar objects by key');
    it('should find similar objects by vector');
    it('should merge properties correctly');
    it('should skip duplicates');
  });
  
  describe('qualityControl', () => {
    it('should flag low confidence objects for review');
    it('should auto-create high confidence objects');
    it('should reject below minimum threshold');
  });
});
```

### 11.2 Integration Tests

```typescript
describe('Extraction E2E', () => {
  it('should create job, extract, and create objects', async () => {
    // 1. Seed document
    const doc = await createTestDocument('TOGAF requirement spec');
    
    // 2. Install template pack
    await assignTemplatePackToProject(projectId, togafPackId);
    
    // 3. Create extraction job
    const job = await createExtractionJob({
      project_id: projectId,
      source_type: 'document',
      source_id: doc.id,
      extraction_config: {
        enabled_types: ['Requirement', 'BusinessCapability']
      }
    });
    
    // 4. Process job
    await worker.processBatch();
    
    // 5. Verify results
    const updated = await getJob(job.id);
    expect(updated.status).toBe('completed');
    expect(updated.created_objects.length).toBeGreaterThan(0);
    
    // 6. Verify objects exist in graph
    const objects = await graphService.searchObjects({
      type: 'Requirement',
      projectId
    });
    expect(objects.items.length).toBeGreaterThan(0);
  });
});
```

---

## 12. Future Enhancements (Phase 3+)

### 12.1 Relationship Extraction

- Extract relationships between objects in same document
- Infer relationships across documents
- Confidence scoring for relationships

### 12.2 Type Discovery

- Automatically detect new object type patterns
- Suggest schema for discovered types
- User approval workflow

### 12.3 Chunk-by-Chunk Processing

- Process large documents in chunks
- Aggregate results across chunks
- Handle cross-chunk entity resolution

### 12.4 Streaming Extraction

- Real-time extraction progress updates
- SSE/WebSocket for UI updates
- Incremental result display

### 12.5 Multi-Model Ensemble

- Run extraction with multiple models
- Compare and merge results
- Confidence boosting

---

## 13. Security Considerations

### 13.1 Data Privacy

- Never log full document content
- Redact sensitive fields in logs
- Respect data residency requirements (Vertex AI location)

### 13.2 API Key Management

- Store keys in secure secrets manager
- Rotate keys regularly
- Monitor API usage for anomalies

### 13.3 Authorization

- RLS policies on extraction jobs
- Project-level access control
- Audit log for object creation

---

## 14. Cost Optimization

### 14.1 Strategies

1. **Caching** - Cache extraction results by document hash
2. **Batching** - Combine multiple small documents in one request
3. **Smart Scheduling** - Process low-priority jobs during off-peak hours
4. **Model Selection** - Use cheaper models for simple extractions
5. **Prompt Optimization** - Reduce token count in prompts

### 14.2 Cost Tracking

```typescript
interface ExtractionCostMetrics {
  totalTokensConsumed: number;
  estimatedCostUSD: number;
  costPerObject: number;
  costPerDocument: number;
}
```

---

## 15. API Reference

### Extraction Job Endpoints

```typescript
// Create extraction job
POST /extraction-jobs
Body: CreateExtractionJobDto
Response: ExtractionJobDto

// Get job status
GET /extraction-jobs/:jobId
Response: ExtractionJobDto

// List jobs
GET /extraction-jobs?status=completed&page=1&limit=20
Response: ExtractionJobListDto

// Cancel job
POST /extraction-jobs/:jobId/cancel
Response: ExtractionJobDto

// Retry failed job
POST /extraction-jobs/:jobId/retry
Response: ExtractionJobDto

// Get job statistics
GET /extraction-jobs/stats
Response: ExtractionStatsDto
```

---

## Appendix A: Google Vertex AI Integration

### A.1 Setup

```typescript
import { VertexAI } from '@google-cloud/vertexai';

const vertex = new VertexAI({
  project: process.env.GOOGLE_VERTEX_PROJECT,
  location: process.env.GOOGLE_VERTEX_LOCATION
});

const model = vertex.getGenerativeModel({
  model: 'gemini-1.5-pro'
});
```

### A.2 Structured Generation

```typescript
const result = await model.generateContent({
  contents: [{
    role: 'user',
    parts: [{ text: prompt }]
  }],
  generationConfig: {
    temperature: 0.1,
    topP: 0.95,
    topK: 40,
    maxOutputTokens: 4096,
    responseMimeType: 'application/json',
    responseSchema: {
      type: 'object',
      properties: {
        objects: {
          type: 'array',
          items: typeConfig.json_schema
        }
      }
    }
  }
});
```

### A.3 Error Handling

```typescript
try {
  const result = await model.generateContent(request);
} catch (error) {
  if (error.message.includes('429')) {
    // Rate limit - retry with backoff
    throw new RateLimitError('Vertex AI rate limit exceeded');
  } else if (error.message.includes('quota')) {
    // Quota exceeded - log and notify
    throw new QuotaExceededError('Vertex AI quota exceeded');
  } else {
    // Unknown error
    throw new LLMError(`Vertex AI error: ${error.message}`);
  }
}
```

---

## Appendix B: Sample Extraction Prompts

### B.1 Business Requirement Extraction

```
You are extracting Business Requirements from a requirements document.

A Business Requirement describes a high-level business need or objective that the system must support.

Extract all business requirements matching this schema:
{
  "type": "object",
  "required": ["title", "description", "category"],
  "properties": {
    "title": { "type": "string" },
    "description": { "type": "string" },
    "category": { "enum": ["functional", "non-functional", "constraint", "compliance"] },
    "priority": { "enum": ["must", "should", "could", "wont"] },
    "rationale": { "type": "string" },
    "acceptance_criteria": { "type": "array", "items": { "type": "string" } }
  }
}

Return JSON:
{
  "objects": [
    {
      "data": { ... },
      "confidence": 0.95,
      "evidence": ["text excerpt 1", "text excerpt 2"]
    }
  ]
}
```

---

**End of Document**
