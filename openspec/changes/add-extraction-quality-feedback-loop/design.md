# Design: Extraction Quality Feedback Loop

## Overview

This design specifies how to export verified extractions from the knowledge base as training data for Vertex AI Gemini supervised fine-tuning, and how to manage a multi-layer model hierarchy.

## Prerequisite: Chunk Soft Delete Migration

### Problem

Training data is constructed by tracing from verified `GraphObject` → `ObjectExtractionJob` → `Chunk`. Currently, chunks are **hard deleted** when documents are re-processed, breaking this chain and losing training data.

### Migration

```sql
-- Migration: add-chunks-soft-delete
-- Add soft delete support to kb.chunks table

ALTER TABLE kb.chunks ADD COLUMN deleted_at TIMESTAMPTZ;

-- Index for efficient filtering of active chunks
CREATE INDEX idx_chunks_deleted_at ON kb.chunks(deleted_at) WHERE deleted_at IS NULL;

-- For training data queries that need soft-deleted chunks
CREATE INDEX idx_chunks_document_id_incl_deleted ON kb.chunks(document_id);
```

### Repository Changes

```typescript
// ChunkRepository - default behavior excludes soft-deleted
async findByDocumentId(documentId: string, options?: { includeDeleted?: boolean }): Promise<Chunk[]> {
  const query = this.createQueryBuilder('chunk')
    .where('chunk.document_id = :documentId', { documentId });

  if (!options?.includeDeleted) {
    query.andWhere('chunk.deleted_at IS NULL');
  }

  return query.getMany();
}

// Soft delete instead of hard delete
async softDeleteByDocumentId(documentId: string): Promise<void> {
  await this.createQueryBuilder()
    .update(Chunk)
    .set({ deletedAt: new Date() })
    .where('document_id = :documentId', { documentId })
    .andWhere('deleted_at IS NULL')
    .execute();
}
```

### Document Re-processing Update

When a document is re-processed:

1. **Before:** Hard delete all existing chunks → `DELETE FROM kb.chunks WHERE document_id = ?`
2. **After:** Soft delete existing chunks → `UPDATE kb.chunks SET deleted_at = NOW() WHERE document_id = ? AND deleted_at IS NULL`

This preserves chunks referenced by verified extraction jobs for training data construction.

---

## Source Data Model

### Entity Relationships

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         Training Data Source Model                           │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                               │
│  ┌──────────────┐      ┌─────────────────────┐      ┌──────────────────┐    │
│  │   Document   │──1:N─│  ObjectExtractionJob │──1:1─│      Chunk       │    │
│  │  (kb.documents)     │  (kb.object_extraction_jobs)│  (kb.chunks)     │    │
│  └──────────────┘      └─────────────────────┘      └──────────────────┘    │
│                                   │                          │               │
│                                   │ extraction_job_id        │ text         │
│                                   ▼                          │               │
│                        ┌──────────────────┐                  │               │
│                        │   GraphObject    │◀─────────────────┘               │
│                        │ (kb.graph_objects)│     (source content)            │
│                        └──────────────────┘                                  │
│                                   │                                          │
│                                   │ src_id / dst_id                          │
│                                   ▼                                          │
│                        ┌──────────────────┐                                  │
│                        │ GraphRelationship │                                 │
│                        │(kb.graph_relationships)                             │
│                        └──────────────────┘                                  │
│                                                                               │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Verification Fields on GraphObject

The `kb.graph_objects` table has built-in fields for tracking human verification:

| Column                  | Type        | Description                                                             |
| ----------------------- | ----------- | ----------------------------------------------------------------------- |
| `status`                | text        | Object lifecycle status (`'accepted'`, `'rejected'`, `'pending'`, etc.) |
| `extraction_confidence` | real        | 0.0-1.0 confidence score from LLM extraction                            |
| `needs_review`          | boolean     | Flag indicating object requires human review                            |
| `reviewed_by`           | uuid        | User ID who performed the review (NULL if not reviewed)                 |
| `reviewed_at`           | timestamptz | Timestamp when review was completed                                     |
| `extraction_job_id`     | uuid        | Link to the extraction job that created this object                     |

### Verification Criteria for Training Data

An object is considered **verified** if either:

1. **Human-reviewed:** `reviewed_by IS NOT NULL` (explicitly reviewed by a user)
2. **High-confidence auto-accepted:** `status = 'accepted' AND extraction_confidence >= 0.85`

```sql
-- Verified objects selection criteria
WHERE (
  reviewed_by IS NOT NULL  -- Human verified
  OR
  (status = 'accepted' AND extraction_confidence >= 0.85)  -- High confidence auto-accept
)
```

### Training Example Structure

Each training example reconstructs the original extraction scenario:

```
Training Example = {
  INPUT:  Chunk.text (the document chunk that was processed)
  OUTPUT: {
    entities: [Verified GraphObjects extracted from this chunk],
    relationships: [GraphRelationships between those entities]
  }
}
```

### Data Flow for Training Export

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      Training Data Construction Flow                         │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                               │
│  Step 1: Find verified GraphObjects                                          │
│          └─ WHERE reviewed_by IS NOT NULL                                    │
│             OR (status='accepted' AND extraction_confidence >= 0.85)         │
│                                                                               │
│  Step 2: Get extraction_job_id from each GraphObject                         │
│          └─ Links object to the job that created it                          │
│                                                                               │
│  Step 3: Join to ObjectExtractionJob to get chunk_id                         │
│          └─ ObjectExtractionJob.chunk_id → specific chunk processed          │
│                                                                               │
│  Step 4: Join to Chunk to get source text                                    │
│          └─ Chunk.text = original document content                           │
│                                                                               │
│  Step 5: Group all verified entities from same extraction job                │
│          └─ Multiple entities can come from one chunk                        │
│                                                                               │
│  Step 6: Get relationships between grouped entities                          │
│          └─ Only include relationships where BOTH endpoints are verified     │
│                                                                               │
│  Step 7: Format as Vertex AI JSONL                                           │
│          └─ {systemInstruction, contents: [{user: chunk}, {model: output}]}  │
│                                                                               │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Multi-Layer Model Architecture

### Model Hierarchy

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Model Selection Flow                          │
├─────────────────────────────────────────────────────────────────────┤
│                                                                       │
│   Extraction Request for Project X                                    │
│           │                                                           │
│           ▼                                                           │
│   ┌───────────────────┐                                              │
│   │ Has Project Model? │──Yes──▶ Use Project-Specific Model          │
│   └───────────────────┘                                              │
│           │ No                                                        │
│           ▼                                                           │
│   ┌───────────────────┐                                              │
│   │ Has General Model? │──Yes──▶ Use Organization General Model      │
│   └───────────────────┘                                              │
│           │ No                                                        │
│           ▼                                                           │
│   Use Base Gemini Model                                              │
│                                                                       │
└─────────────────────────────────────────────────────────────────────┘
```

### Model Registry Schema

```typescript
interface FineTunedModel {
  id: string;
  organizationId: string;
  projectId?: string; // null for general models
  modelType: 'general' | 'project';

  // Vertex AI references
  vertexModelId: string; // e.g., "projects/123/locations/us-central1/models/456"
  vertexEndpointId?: string; // If deployed to endpoint
  baseModelVersion: string; // e.g., "gemini-2.0-flash-001"
  parentModelId?: string; // For project models, reference to general model

  // Training metadata
  trainingDatasetUri: string; // gs:// path to training data
  trainingExamples: number;
  validationExamples: number;
  trainingStartedAt: Date;
  trainingCompletedAt?: Date;

  // Status
  status: 'training' | 'ready' | 'failed' | 'deprecated';
  version: number;

  // Metrics
  evaluationMetrics?: {
    loss: number;
    accuracy?: number;
  };

  createdAt: Date;
  updatedAt: Date;
}
```

### Database Table

```sql
CREATE TABLE ml.fine_tuned_models (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES admin.organizations(id),
  project_id UUID REFERENCES admin.projects(id), -- NULL for general models
  model_type VARCHAR(20) NOT NULL CHECK (model_type IN ('general', 'project')),

  -- Vertex AI references
  vertex_model_id VARCHAR(500) NOT NULL,
  vertex_endpoint_id VARCHAR(500),
  base_model_version VARCHAR(100) NOT NULL,
  parent_model_id UUID REFERENCES ml.fine_tuned_models(id),

  -- Training metadata
  training_dataset_uri VARCHAR(500) NOT NULL,
  training_examples INTEGER NOT NULL,
  validation_examples INTEGER NOT NULL,
  training_started_at TIMESTAMPTZ NOT NULL,
  training_completed_at TIMESTAMPTZ,

  -- Status
  status VARCHAR(20) NOT NULL DEFAULT 'training',
  version INTEGER NOT NULL DEFAULT 1,

  -- Metrics
  evaluation_metrics JSONB,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Constraints
  CONSTRAINT unique_active_general_model
    UNIQUE NULLS NOT DISTINCT (organization_id, model_type, status)
    WHERE model_type = 'general' AND status = 'ready',
  CONSTRAINT unique_active_project_model
    UNIQUE NULLS NOT DISTINCT (project_id, model_type, status)
    WHERE model_type = 'project' AND status = 'ready'
);

CREATE INDEX idx_fine_tuned_models_org ON ml.fine_tuned_models(organization_id);
CREATE INDEX idx_fine_tuned_models_project ON ml.fine_tuned_models(project_id);
CREATE INDEX idx_fine_tuned_models_status ON ml.fine_tuned_models(status);
```

### Model Selection Service

```typescript
@Injectable()
export class ModelSelectionService {
  constructor(
    @InjectRepository(FineTunedModel)
    private readonly modelRepo: Repository<FineTunedModel>
  ) {}

  async getModelForExtraction(
    organizationId: string,
    projectId: string
  ): Promise<ModelSelection> {
    // 1. Check for project-specific model
    const projectModel = await this.modelRepo.findOne({
      where: {
        projectId,
        modelType: 'project',
        status: 'ready',
      },
      order: { version: 'DESC' },
    });

    if (projectModel) {
      return {
        modelId: projectModel.vertexModelId,
        endpointId: projectModel.vertexEndpointId,
        type: 'project',
        version: projectModel.version,
      };
    }

    // 2. Check for organization general model
    const generalModel = await this.modelRepo.findOne({
      where: {
        organizationId,
        modelType: 'general',
        status: 'ready',
      },
      order: { version: 'DESC' },
    });

    if (generalModel) {
      return {
        modelId: generalModel.vertexModelId,
        endpointId: generalModel.vertexEndpointId,
        type: 'general',
        version: generalModel.version,
      };
    }

    // 3. Fall back to base model
    return {
      modelId: null,
      endpointId: null,
      type: 'base',
      version: null,
    };
  }
}
```

## JSONL Format Specification

### Vertex AI Required Structure

Each line in the JSONL file must contain:

```typescript
interface VertexAITrainingExample {
  systemInstruction?: {
    role: 'system';
    parts: Array<{ text: string }>;
  };
  contents: Array<{
    role: 'user' | 'model';
    parts: Array<{ text: string }>;
  }>;
}
```

### Training Example Format

```jsonl
{
  "systemInstruction": {
    "role": "system",
    "parts": [
      {
        "text": "You are an enterprise architecture extraction assistant..."
      }
    ]
  },
  "contents": [
    {
      "role": "user",
      "parts": [
        {
          "text": "Extract entities and relationships from the following document chunk:\n\n<chunk>\n{chunk_text}\n</chunk>\n\nEntity types available: {entity_types}\n\nProvide your response as JSON with 'entities' and 'relationships' arrays."
        }
      ]
    },
    {
      "role": "model",
      "parts": [
        {
          "text": "{\"entities\": [...], \"relationships\": [...]}"
        }
      ]
    }
  ]
}
```

### Entity Output Schema (Model Response)

```typescript
interface TrainingEntity {
  type: string; // Entity type name
  name: string; // Human-readable name
  description: string; // Description from properties
  business_key: string; // Deduplication key
  properties: {
    [key: string]: any; // Additional properties from schema
  };
}

interface TrainingRelationship {
  source_name: string; // Name of source entity
  target_name: string; // Name of target entity
  type: string; // Relationship type
  description?: string; // Optional relationship description
}

interface TrainingOutput {
  entities: TrainingEntity[];
  relationships: TrainingRelationship[];
}
```

## Data Selection Query

### Primary Query: Verified Objects with Source Chunks

This query retrieves all verified objects along with their source chunk text.

**Note:** Training data queries intentionally include soft-deleted chunks (no `c.deleted_at IS NULL` filter) because:

1. Chunks may be soft-deleted during document re-processing
2. Verified extraction jobs still reference these chunks
3. The chunk text is needed to reconstruct training examples

```sql
-- Select verified graph objects with their source chunks for training
-- NOTE: Does NOT filter chunks by deleted_at to include soft-deleted chunks
SELECT
  go.id,
  go.type,
  go.key as business_key,
  go.properties,
  go.extraction_job_id,
  go.extraction_confidence,
  go.reviewed_by,
  go.reviewed_at,
  go.status,
  -- Source chunk data (may be soft-deleted)
  c.id as chunk_id,
  c.text as chunk_text,
  c.chunk_index,
  c.deleted_at as chunk_deleted_at,  -- Track if chunk was soft-deleted
  d.id as document_id,
  d.filename as document_name
FROM kb.graph_objects go
JOIN kb.object_extraction_jobs oej ON go.extraction_job_id = oej.id
JOIN kb.chunks c ON oej.chunk_id = c.id  -- Includes soft-deleted chunks
JOIN kb.documents d ON c.document_id = d.id
WHERE
  go.project_id = :projectId
  AND go.deleted_at IS NULL
  AND go.supersedes_id IS NULL  -- Current version only
  AND (
    -- Explicitly reviewed by human
    go.reviewed_by IS NOT NULL
    OR
    -- High-confidence auto-accepted
    (go.status = 'accepted' AND go.extraction_confidence >= 0.85)
  )
  -- Has meaningful content
  AND go.properties->>'name' IS NOT NULL
  AND go.properties->>'description' IS NOT NULL
  AND length(go.properties->>'description') > 20
ORDER BY go.extraction_job_id, go.created_at
```

### Relationship Selection

```sql
-- Select relationships between verified entities
SELECT
  gr.id,
  gr.type,
  gr.src_id,
  gr.dst_id,
  gr.properties,
  src.properties->>'name' as source_name,
  dst.properties->>'name' as target_name
FROM kb.graph_relationships gr
JOIN kb.graph_objects src ON gr.src_id = src.id
JOIN kb.graph_objects dst ON gr.dst_id = dst.id
WHERE
  gr.project_id = :projectId
  AND gr.deleted_at IS NULL
  AND gr.supersedes_id IS NULL  -- Current version only
  -- Both endpoints are verified
  AND src.id IN (SELECT id FROM verified_objects)
  AND dst.id IN (SELECT id FROM verified_objects)
```

### Organization-Wide Query (for General Model)

```sql
-- Select verified objects across ALL projects in an organization
-- NOTE: Does NOT filter chunks by deleted_at to include soft-deleted chunks
SELECT
  go.id,
  go.type,
  go.key as business_key,
  go.properties,
  go.extraction_job_id,
  go.extraction_confidence,
  go.reviewed_by,
  go.project_id,
  -- Source chunk data (may be soft-deleted)
  c.text as chunk_text,
  c.chunk_index,
  c.deleted_at as chunk_deleted_at,
  d.filename as document_name
FROM kb.graph_objects go
JOIN kb.object_extraction_jobs oej ON go.extraction_job_id = oej.id
JOIN kb.chunks c ON oej.chunk_id = c.id  -- Includes soft-deleted chunks
JOIN kb.documents d ON c.document_id = d.id
JOIN kb.projects p ON go.project_id = p.id
WHERE
  p.organization_id = :organizationId
  AND go.deleted_at IS NULL
  AND go.supersedes_id IS NULL
  AND (
    go.reviewed_by IS NOT NULL
    OR (go.status = 'accepted' AND go.extraction_confidence >= 0.85)
  )
  AND go.properties->>'name' IS NOT NULL
  AND go.properties->>'description' IS NOT NULL
  AND length(go.properties->>'description') > 20
ORDER BY go.extraction_job_id, go.created_at
```

## Export Service Design

### Service Interface

```typescript
interface TrainingDataExportOptions {
  projectId: string;

  // Filtering
  minConfidence?: number; // Default: 0.85
  requireHumanReview?: boolean; // Default: false
  entityTypes?: string[]; // Filter to specific types

  // Output
  outputPath?: string; // Local path or GCS URI
  splitRatio?: {
    // Train/validation split
    train: number; // Default: 0.8
    validation: number; // Default: 0.2
  };

  // Limits
  maxExamples?: number; // Cap total examples
  shuffleSeed?: number; // For reproducible splits
}

interface TrainingDataExportResult {
  totalExamples: number;
  trainExamples: number;
  validationExamples: number;
  entityTypes: string[];
  outputFiles: {
    train: string;
    validation: string;
  };
  statistics: {
    avgEntitiesPerExample: number;
    avgRelationshipsPerExample: number;
    entityTypeDistribution: Record<string, number>;
    relationshipTypeDistribution: Record<string, number>;
  };
}
```

### Export Flow

```typescript
class TrainingDataExportService {
  async exportTrainingData(
    options: TrainingDataExportOptions
  ): Promise<TrainingDataExportResult> {
    // 1. Query verified entities grouped by extraction job
    const verifiedObjects = await this.queryVerifiedObjects(options);

    // 2. Group by extraction job (one training example per job)
    const byJob = this.groupByExtractionJob(verifiedObjects);

    // 3. For each job, reconstruct the training example
    const examples: VertexAITrainingExample[] = [];
    for (const [jobId, objects] of byJob) {
      // Get source chunk
      const chunk = await this.getSourceChunk(jobId);
      if (!chunk) continue;

      // Get relationships between these objects
      const relationships = await this.getRelationships(
        objects.map((o) => o.id),
        options.projectId
      );

      // Build training example
      const example = this.buildTrainingExample(chunk, objects, relationships);

      examples.push(example);
    }

    // 4. Shuffle and split
    const { train, validation } = this.splitDataset(
      examples,
      options.splitRatio,
      options.shuffleSeed
    );

    // 5. Write JSONL files
    const trainPath = await this.writeJsonl(
      train,
      'train.jsonl',
      options.outputPath
    );
    const validPath = await this.writeJsonl(
      validation,
      'validation.jsonl',
      options.outputPath
    );

    // 6. Return statistics
    return this.computeStatistics(examples, trainPath, validPath);
  }

  private buildTrainingExample(
    chunk: DocumentChunk,
    entities: GraphObject[],
    relationships: GraphRelationship[]
  ): VertexAITrainingExample {
    // Get available entity types from project schema
    const entityTypes = [...new Set(entities.map((e) => e.type))];

    // Build system instruction (matches current extraction prompt style)
    const systemInstruction = this.buildSystemPrompt(entityTypes);

    // Build user input (the chunk with instructions)
    const userInput = this.buildUserPrompt(chunk.content, entityTypes);

    // Build model output (the verified extraction result)
    const modelOutput = this.buildModelOutput(entities, relationships);

    return {
      systemInstruction: {
        role: 'system',
        parts: [{ text: systemInstruction }],
      },
      contents: [
        { role: 'user', parts: [{ text: userInput }] },
        { role: 'model', parts: [{ text: JSON.stringify(modelOutput) }] },
      ],
    };
  }
}
```

## System Prompt Template

The system prompt should match the existing extraction prompt to ensure consistency:

```typescript
const TRAINING_SYSTEM_PROMPT = `You are an enterprise architecture extraction assistant. Your task is to extract structured entities and relationships from document chunks.

ENTITY TYPES:
{entityTypeDefinitions}

RELATIONSHIP TYPES:
{relationshipTypeDefinitions}

EXTRACTION GUIDELINES:
1. Extract all entities that match the defined types
2. Use the entity's name as it appears in the text
3. Include descriptions that capture the entity's purpose and context
4. Create relationships only when explicitly stated or strongly implied
5. Use business_key for entity deduplication (e.g., "system:customer_portal")

OUTPUT FORMAT:
Respond with a JSON object containing:
- entities: Array of extracted entities
- relationships: Array of relationships between entities

Be precise and only extract information that is clearly stated in the document.`;
```

## User Prompt Template

```typescript
const TRAINING_USER_PROMPT = `Extract entities and relationships from the following document chunk:

<document>
{chunkText}
</document>

Available entity types: {entityTypesList}
Available relationship types: {relationshipTypesList}

Provide your response as a JSON object with 'entities' and 'relationships' arrays.`;
```

## Cloud Storage Integration

### GCS Upload

```typescript
async uploadToGCS(
  localPath: string,
  bucketName: string,
  objectPath: string
): Promise<string> {
  const { Storage } = await import('@google-cloud/storage');
  const storage = new Storage();

  await storage.bucket(bucketName).upload(localPath, {
    destination: objectPath,
    metadata: {
      contentType: 'application/jsonl',
    }
  });

  return `gs://${bucketName}/${objectPath}`;
}
```

### Dataset Organization

```
gs://training-data-bucket/
├── orgs/
│   └── {organization_id}/
│       ├── general/
│       │   ├── v1700000000000/
│       │   │   ├── train.jsonl
│       │   │   ├── validation.jsonl
│       │   │   └── metadata.json
│       │   └── v1700100000000/
│       │       └── ...
│       └── projects/
│           └── {project_id}/
│               └── v1700000000000/
│                   ├── train.jsonl
│                   ├── validation.jsonl
│                   └── metadata.json
```

## Validation Rules

Before export, validate each training example:

1. **Chunk text not empty** - Source chunk must have content
2. **At least one entity** - Example must extract something
3. **Valid JSON output** - Model response must be valid JSON
4. **Entity references valid** - Relationships reference entities in the example
5. **No PII leakage** - Filter sensitive patterns (emails, SSNs, etc.)
6. **Token limits** - Combined tokens < 32K (Gemini context window)

## CLI Command

```bash
# Export training data from a project
nx run server:export-training-data \
  --project-id=<uuid> \
  --output=./training-data/v1 \
  --min-confidence=0.85 \
  --require-human-review=false \
  --split-ratio=0.8

# Upload to GCS
nx run server:upload-training-data \
  --source=./training-data/v1 \
  --bucket=my-training-bucket \
  --prefix=extraction-v1
```

## Metrics and Monitoring

Track export quality metrics:

```typescript
interface ExportMetrics {
  // Volume
  totalCandidates: number;
  includedExamples: number;
  excludedExamples: number;
  excludedReasons: Record<string, number>;

  // Quality
  avgChunkLength: number;
  avgEntitiesPerExample: number;
  avgRelationshipsPerExample: number;

  // Coverage
  entityTypeCoverage: Record<string, number>;
  relationshipTypeCoverage: Record<string, number>;

  // Tokens
  avgTokensPerExample: number;
  maxTokensPerExample: number;
}
```

## Future Enhancements

1. **Incremental Export** - Only export new verified data since last export
2. **Negative Examples** - Include rejected extractions as negative training
3. **Multi-turn Conversations** - Support extraction with follow-up corrections
4. **Active Learning** - Prioritize exporting examples that will most improve the model

## Fine-Tuning Orchestration

### Fine-Tuning Service

```typescript
@Injectable()
export class FineTuningOrchestrationService {
  constructor(
    private readonly exportService: TrainingDataExportService,
    private readonly storageService: GCSStorageService,
    private readonly vertexAIService: VertexAITuningService,
    @InjectRepository(FineTunedModel)
    private readonly modelRepo: Repository<FineTunedModel>
  ) {}

  /**
   * Trigger fine-tuning for organization general model
   * Uses verified data from ALL projects in the organization
   */
  async trainGeneralModel(
    organizationId: string,
    options: TrainModelOptions = {}
  ): Promise<FineTunedModel> {
    // 1. Export training data from all projects in org
    const exportResult = await this.exportService.exportOrganizationData({
      organizationId,
      minConfidence: options.minConfidence ?? 0.85,
      minExamples: options.minExamples ?? 100,
    });

    if (exportResult.totalExamples < (options.minExamples ?? 100)) {
      throw new InsufficientTrainingDataError(
        `Need at least ${options.minExamples ?? 100} examples, found ${
          exportResult.totalExamples
        }`
      );
    }

    // 2. Upload to GCS
    const gcsUri = await this.storageService.uploadDataset({
      localPath: exportResult.outputFiles.train,
      bucket: this.configService.get('TRAINING_BUCKET'),
      prefix: `orgs/${organizationId}/general/v${Date.now()}`,
    });

    // 3. Start Vertex AI tuning job
    const tuningJob = await this.vertexAIService.createTuningJob({
      displayName: `general-model-${organizationId}`,
      baseModel: options.baseModel ?? 'gemini-2.0-flash-001',
      trainingDataUri: gcsUri,
      validationDataUri: exportResult.outputFiles.validation,
      hyperParameters: {
        epochCount: options.epochs ?? 3,
        learningRateMultiplier: options.learningRate ?? 1.0,
      },
    });

    // 4. Create model record
    const model = this.modelRepo.create({
      organizationId,
      modelType: 'general',
      vertexModelId: tuningJob.tunedModelId,
      baseModelVersion: options.baseModel ?? 'gemini-2.0-flash-001',
      trainingDatasetUri: gcsUri,
      trainingExamples: exportResult.trainExamples,
      validationExamples: exportResult.validationExamples,
      trainingStartedAt: new Date(),
      status: 'training',
    });

    await this.modelRepo.save(model);

    // 5. Start polling for completion (async)
    this.pollTrainingCompletion(model.id, tuningJob.name);

    return model;
  }

  /**
   * Trigger fine-tuning for project-specific model
   * Builds on top of the general model (if available)
   */
  async trainProjectModel(
    projectId: string,
    options: TrainModelOptions = {}
  ): Promise<FineTunedModel> {
    const project = await this.projectRepo.findOneOrFail({
      where: { id: projectId },
      relations: ['organization'],
    });

    // 1. Check if general model exists (use as base if so)
    const generalModel = await this.modelRepo.findOne({
      where: {
        organizationId: project.organizationId,
        modelType: 'general',
        status: 'ready',
      },
      order: { version: 'DESC' },
    });

    const baseModel =
      generalModel?.vertexModelId ??
      options.baseModel ??
      'gemini-2.0-flash-001';

    // 2. Export project-specific training data
    const exportResult = await this.exportService.exportTrainingData({
      projectId,
      minConfidence: options.minConfidence ?? 0.85,
    });

    if (exportResult.totalExamples < (options.minExamples ?? 50)) {
      throw new InsufficientTrainingDataError(
        `Need at least ${options.minExamples ?? 50} examples, found ${
          exportResult.totalExamples
        }`
      );
    }

    // 3. Upload to GCS
    const gcsUri = await this.storageService.uploadDataset({
      localPath: exportResult.outputFiles.train,
      bucket: this.configService.get('TRAINING_BUCKET'),
      prefix: `projects/${projectId}/v${Date.now()}`,
    });

    // 4. Start Vertex AI tuning job
    const tuningJob = await this.vertexAIService.createTuningJob({
      displayName: `project-model-${projectId}`,
      baseModel,
      trainingDataUri: gcsUri,
      validationDataUri: exportResult.outputFiles.validation,
      hyperParameters: {
        epochCount: options.epochs ?? 2, // Fewer epochs for project-specific
        learningRateMultiplier: options.learningRate ?? 0.5, // Lower LR to avoid forgetting
      },
    });

    // 5. Create model record
    const model = this.modelRepo.create({
      organizationId: project.organizationId,
      projectId,
      modelType: 'project',
      vertexModelId: tuningJob.tunedModelId,
      baseModelVersion: baseModel,
      parentModelId: generalModel?.id,
      trainingDatasetUri: gcsUri,
      trainingExamples: exportResult.trainExamples,
      validationExamples: exportResult.validationExamples,
      trainingStartedAt: new Date(),
      status: 'training',
    });

    await this.modelRepo.save(model);

    // 6. Start polling for completion (async)
    this.pollTrainingCompletion(model.id, tuningJob.name);

    return model;
  }

  private async pollTrainingCompletion(
    modelId: string,
    tuningJobName: string
  ): Promise<void> {
    // Poll every 5 minutes for up to 4 hours
    const maxAttempts = 48;
    let attempts = 0;

    while (attempts < maxAttempts) {
      await new Promise((resolve) => setTimeout(resolve, 5 * 60 * 1000));
      attempts++;

      const jobStatus = await this.vertexAIService.getTuningJobStatus(
        tuningJobName
      );

      if (jobStatus.state === 'JOB_STATE_SUCCEEDED') {
        await this.modelRepo.update(modelId, {
          status: 'ready',
          trainingCompletedAt: new Date(),
          vertexEndpointId: jobStatus.tunedModelEndpointName,
          evaluationMetrics: jobStatus.experimentMetrics,
        });
        return;
      }

      if (jobStatus.state === 'JOB_STATE_FAILED') {
        await this.modelRepo.update(modelId, {
          status: 'failed',
          trainingCompletedAt: new Date(),
        });
        return;
      }
    }

    // Timeout - mark as failed
    await this.modelRepo.update(modelId, {
      status: 'failed',
      trainingCompletedAt: new Date(),
    });
  }
}
```

### Vertex AI Tuning Service

```typescript
@Injectable()
export class VertexAITuningService {
  private readonly client: VertexAI;
  private readonly project: string;
  private readonly location: string;

  constructor(private readonly configService: ConfigService) {
    this.project = configService.get('GOOGLE_CLOUD_PROJECT');
    this.location = configService.get('VERTEX_AI_LOCATION', 'us-central1');
    this.client = new VertexAI({
      project: this.project,
      location: this.location,
    });
  }

  async createTuningJob(
    options: CreateTuningJobOptions
  ): Promise<TuningJobResult> {
    const { GenAiTuningServiceClient } = await import(
      '@google-cloud/aiplatform'
    );
    const tuningClient = new GenAiTuningServiceClient();

    const [operation] = await tuningClient.createTuningJob({
      parent: `projects/${this.project}/locations/${this.location}`,
      tuningJob: {
        baseModel: options.baseModel,
        supervisedTuningSpec: {
          trainingDatasetUri: options.trainingDataUri,
          validationDatasetUri: options.validationDataUri,
          hyperParameters: {
            epochCount: options.hyperParameters.epochCount,
            learningRateMultiplier:
              options.hyperParameters.learningRateMultiplier,
          },
        },
        tunedModelDisplayName: options.displayName,
      },
    });

    // Wait for operation to start (not complete)
    const [job] = await operation.promise();

    return {
      name: job.name,
      tunedModelId: job.tunedModel?.model,
      state: job.state,
    };
  }

  async getTuningJobStatus(jobName: string): Promise<TuningJobStatus> {
    const { GenAiTuningServiceClient } = await import(
      '@google-cloud/aiplatform'
    );
    const tuningClient = new GenAiTuningServiceClient();

    const [job] = await tuningClient.getTuningJob({ name: jobName });

    return {
      state: job.state,
      tunedModelEndpointName: job.tunedModel?.endpoint,
      experimentMetrics: job.tuningDataStats,
    };
  }
}
```

### CLI Commands

```bash
# Train general model for organization
nx run server:train-general-model \
  --organization-id=<uuid> \
  --min-examples=100 \
  --epochs=3

# Train project-specific model
nx run server:train-project-model \
  --project-id=<uuid> \
  --min-examples=50 \
  --epochs=2

# Check training status
nx run server:training-status \
  --model-id=<uuid>

# List models for organization
nx run server:list-models \
  --organization-id=<uuid>
```

## Admin UI Specification

### Navigation

Add new menu item under Project Settings:

- **Settings** → **AI Training** (new section)

For organization-level settings (org admins only):

- **Organization Settings** → **AI Training** (new section)

### Project AI Training Page

**Route:** `/projects/:projectId/settings/ai-training`

#### Section 1: Training Data Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  Training Data Overview                                                      │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                               │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐              │
│  │      156        │  │       89        │  │       67        │              │
│  │  Verified       │  │  Human          │  │  Auto-Accepted  │              │
│  │  Extractions    │  │  Reviewed       │  │  (≥85% conf)    │              │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘              │
│                                                                               │
│  Entity Type Distribution:                                                   │
│  ├── System (45)                    ████████████████░░░░  29%              │
│  ├── Capability (38)                █████████████░░░░░░░  24%              │
│  ├── Process (32)                   ██████████░░░░░░░░░░  21%              │
│  ├── Technology (25)                ████████░░░░░░░░░░░░  16%              │
│  └── Other (16)                     █████░░░░░░░░░░░░░░░  10%              │
│                                                                               │
│  ⚠️  Minimum 50 verified extractions required for project training           │
│      Current: 156 ✓                                                          │
│                                                                               │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### Section 2: Training Actions

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  Model Training                                                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                               │
│  Current Model: Project-specific v2                                          │
│  Base Model: General Extraction Model v3                                     │
│  Status: ● Ready                                                             │
│  Last trained: 2024-01-15 14:32 (156 examples)                              │
│                                                                               │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │                                                                        │   │
│  │  [  Export Training Data  ]    [  Start Training  ]                   │   │
│  │                                                                        │   │
│  │  ☑ Include only human-reviewed extractions                            │   │
│  │  ☐ Include auto-accepted (≥85% confidence)                            │   │
│  │                                                                        │   │
│  │  Minimum confidence: [0.85____] ▼                                     │   │
│  │                                                                        │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                                                               │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### Section 3: Training History / Logs

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  Training History                                                            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                               │
│  ┌─────────┬──────────────────┬──────────────────┬──────────┬─────────────┐ │
│  │ Version │ Started          │ Completed        │ Examples │ Status      │ │
│  ├─────────┼──────────────────┼──────────────────┼──────────┼─────────────┤ │
│  │ v2      │ 2024-01-15 14:00 │ 2024-01-15 14:32 │ 156      │ ● Ready     │ │
│  │ v1      │ 2024-01-10 09:15 │ 2024-01-10 09:45 │ 98       │ ○ Deprecated│ │
│  │ -       │ 2024-01-08 11:00 │ 2024-01-08 11:02 │ 45       │ ✗ Failed    │ │
│  └─────────┴──────────────────┴──────────────────┴──────────┴─────────────┘ │
│                                                                               │
│  [View Details] for selected row:                                            │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │ Training Job Details - v2                                              │ │
│  │ ──────────────────────────────────────────────────────────────────────│ │
│  │ Job ID: tuning-job-abc123                                              │ │
│  │ Base Model: general-extraction-model-v3                                │ │
│  │ Training Examples: 125 (80%)                                           │ │
│  │ Validation Examples: 31 (20%)                                          │ │
│  │ Epochs: 2                                                              │ │
│  │ Learning Rate: 0.5x                                                    │ │
│  │ Duration: 32 minutes                                                   │ │
│  │ Final Loss: 0.0234                                                     │ │
│  │ Dataset URI: gs://training-bucket/projects/xxx/v1705329600000/        │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                               │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### Section 4: Scheduled Training Settings

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  Automatic Training Schedule                                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                               │
│  ☑ Enable automatic training                                                 │
│                                                                               │
│  Trigger Conditions (any of):                                                │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │ ☑ New verified extractions threshold                                   │ │
│  │   Train when [ 50 ] new verified extractions since last training       │ │
│  │                                                                        │ │
│  │ ☑ Scheduled interval                                                   │ │
│  │   Train every [ Weekly ▼ ] on [ Sunday ▼ ] at [ 02:00 ▼ ]             │ │
│  │                                                                        │ │
│  │ ☐ After general model update                                           │ │
│  │   Automatically retrain when organization's general model is updated   │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                               │
│  Training Parameters:                                                        │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │ Minimum confidence threshold: [ 0.85 ]                                 │ │
│  │ Include human-reviewed only:  [ No ▼ ]                                 │ │
│  │ Epochs:                       [ 2    ]                                 │ │
│  │ Learning rate multiplier:     [ 0.5  ]                                 │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                               │
│  Next scheduled training: Sunday, Jan 21, 2024 at 02:00 AM                   │
│  Estimated examples available: ~180                                          │
│                                                                               │
│  [  Save Settings  ]    [  Cancel  ]                                         │
│                                                                               │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Organization AI Training Page

**Route:** `/organizations/:orgId/settings/ai-training`

#### Section 1: Organization Training Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  Organization Training Overview                                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                               │
│  General Model Status: ● Ready (v3)                                          │
│  Last trained: 2024-01-12 03:00                                              │
│                                                                               │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐              │
│  │      1,245      │  │       8         │  │       5         │              │
│  │  Total Verified │  │  Projects       │  │  Project Models │              │
│  │  Extractions    │  │  Contributing   │  │  Trained        │              │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘              │
│                                                                               │
│  Project Contributions:                                                      │
│  ┌──────────────────────┬──────────────┬──────────────┬───────────────────┐ │
│  │ Project              │ Verified     │ Last Updated │ Has Custom Model  │ │
│  ├──────────────────────┼──────────────┼──────────────┼───────────────────┤ │
│  │ Enterprise Arch      │ 456          │ 2024-01-15   │ ● Yes (v2)        │ │
│  │ Cloud Migration      │ 312          │ 2024-01-14   │ ● Yes (v1)        │ │
│  │ Data Platform        │ 234          │ 2024-01-13   │ ○ No              │ │
│  │ Security Framework   │ 156          │ 2024-01-12   │ ● Yes (v1)        │ │
│  │ API Gateway          │ 87           │ 2024-01-10   │ ○ No              │ │
│  └──────────────────────┴──────────────┴──────────────┴───────────────────┘ │
│                                                                               │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### Section 2: General Model Training

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  General Model Training                                                      │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                               │
│  The general model is trained on verified extractions from ALL projects.     │
│  It serves as the base for project-specific models.                          │
│                                                                               │
│  Current: General Extraction Model v3                                        │
│  Base: gemini-2.0-flash-001                                                  │
│  Training examples: 1,156                                                    │
│  Projects included: 8                                                        │
│                                                                               │
│  [  Export All Training Data  ]    [  Train General Model  ]                 │
│                                                                               │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### Section 3: Organization Training Schedule

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  Automatic General Model Training                                            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                               │
│  ☑ Enable automatic training                                                 │
│                                                                               │
│  Trigger Conditions:                                                         │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │ ☑ New verified extractions threshold                                   │ │
│  │   Train when [ 200 ] new verified extractions across all projects      │ │
│  │                                                                        │ │
│  │ ☑ Scheduled interval                                                   │ │
│  │   Train every [ Monthly ▼ ] on [ 1st ▼ ] at [ 03:00 ▼ ]               │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                               │
│  After general model training completes:                                     │
│  ☑ Notify project admins to consider retraining their project models        │
│  ☐ Automatically trigger project model retraining                           │
│                                                                               │
│  [  Save Settings  ]                                                         │
│                                                                               │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Database Schema for Scheduling

```sql
-- Training schedule configuration
CREATE TABLE ml.training_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES admin.organizations(id),
  project_id UUID REFERENCES kb.projects(id), -- NULL for org-level general model

  -- Enable/disable
  enabled BOOLEAN NOT NULL DEFAULT false,

  -- Trigger: new extractions threshold
  threshold_enabled BOOLEAN NOT NULL DEFAULT false,
  threshold_count INTEGER DEFAULT 50,

  -- Trigger: scheduled interval
  schedule_enabled BOOLEAN NOT NULL DEFAULT false,
  schedule_cron VARCHAR(100), -- e.g., "0 2 * * 0" for Sunday 2am
  schedule_timezone VARCHAR(50) DEFAULT 'UTC',

  -- Trigger: after general model update (project-level only)
  retrain_on_general_update BOOLEAN NOT NULL DEFAULT false,

  -- Training parameters
  min_confidence REAL NOT NULL DEFAULT 0.85,
  human_reviewed_only BOOLEAN NOT NULL DEFAULT false,
  epochs INTEGER NOT NULL DEFAULT 2,
  learning_rate_multiplier REAL NOT NULL DEFAULT 0.5,

  -- Tracking
  last_training_at TIMESTAMPTZ,
  last_example_count INTEGER,
  next_scheduled_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT unique_project_schedule UNIQUE (project_id) WHERE project_id IS NOT NULL,
  CONSTRAINT unique_org_schedule UNIQUE (organization_id) WHERE project_id IS NULL
);

CREATE INDEX idx_training_schedules_org ON ml.training_schedules(organization_id);
CREATE INDEX idx_training_schedules_project ON ml.training_schedules(project_id);
CREATE INDEX idx_training_schedules_next ON ml.training_schedules(next_scheduled_at) WHERE enabled = true;
```

### API Endpoints

```typescript
// Training data stats
GET /api/projects/:projectId/training/stats
Response: {
  totalVerified: number;
  humanReviewed: number;
  autoAccepted: number;
  entityTypeDistribution: Record<string, number>;
  meetsMinimumThreshold: boolean;
  minimumRequired: number;
}

// Export training data (returns download URL or triggers GCS upload)
POST /api/projects/:projectId/training/export
Body: {
  minConfidence?: number;
  humanReviewedOnly?: boolean;
  uploadToGcs?: boolean;
}
Response: {
  exportId: string;
  totalExamples: number;
  downloadUrl?: string;
  gcsUri?: string;
}

// Trigger training
POST /api/projects/:projectId/training/train
Body: {
  epochs?: number;
  learningRateMultiplier?: number;
}
Response: {
  modelId: string;
  status: 'training';
  estimatedCompletionMinutes: number;
}

// Get training history
GET /api/projects/:projectId/training/history
Response: {
  models: Array<{
    id: string;
    version: number;
    status: 'training' | 'ready' | 'failed' | 'deprecated';
    trainingExamples: number;
    startedAt: string;
    completedAt?: string;
    evaluationMetrics?: object;
  }>;
}

// Get/update training schedule
GET /api/projects/:projectId/training/schedule
PUT /api/projects/:projectId/training/schedule
Body: {
  enabled: boolean;
  thresholdEnabled: boolean;
  thresholdCount: number;
  scheduleEnabled: boolean;
  scheduleCron: string;
  retrainOnGeneralUpdate: boolean;
  trainingParams: {
    minConfidence: number;
    humanReviewedOnly: boolean;
    epochs: number;
    learningRateMultiplier: number;
  };
}

// Organization-level endpoints (similar pattern)
GET /api/organizations/:orgId/training/stats
POST /api/organizations/:orgId/training/export
POST /api/organizations/:orgId/training/train
GET /api/organizations/:orgId/training/history
GET /api/organizations/:orgId/training/schedule
PUT /api/organizations/:orgId/training/schedule
```
