# Dynamic Type Discovery & Smart Ingestion System

Status: Draft
Created: 2025-10-02
Updated: 2025-10-04
Related: `04-data-model.md`, `19-dynamic-object-graph.md`, `05-ingestion-workflows.md`, `28-automatic-extraction-and-notifications.md`

---

## 1. Overview

This spec defines a comprehensive system for managing, discovering, and ingesting structured objects (e.g., TOGAF artifacts) with the following capabilities:

1. **Template Pack Management** - Project-level assignment and customization of object type templates
2. **Manual Object Creation** - User-friendly CRUD for structured objects
3. **Smart Ingestion** - AI-powered extraction of objects from unstructured documents
4. **Automatic Type Discovery** - Pattern-based suggestion of new object types
5. **Reprocessing Framework** - Re-run ingestion after schema evolution
6. **Automatic Extraction** - Trigger object extraction automatically on document upload (see `28-automatic-extraction-and-notifications.md`)
7. **Extraction Notifications** - Real-time notifications with summaries when extraction completes (see `28-automatic-extraction-and-notifications.md`)

## 2. Architecture Components

```
┌─────────────────────────────────────────────────────────────┐
│                     User Interface Layer                     │
├───────────────┬──────────────┬──────────────┬───────────────┤
│ Template      │ Manual       │ Discovery    │ Ingestion     │
│ Browser       │ Object CRUD  │ Dashboard    │ Monitor       │
└───────────────┴──────────────┴──────────────┴───────────────┘
         │              │              │              │
┌────────┴──────────────┴──────────────┴──────────────┴────────┐
│                      API Layer (NestJS)                       │
├───────────────┬──────────────┬──────────────┬───────────────┤
│ Template      │ Graph Object │ Discovery    │ Ingestion     │
│ Manager       │ Service      │ Engine       │ Orchestrator  │
└───────────────┴──────────────┴──────────────┴───────────────┘
         │              │              │              │
┌────────┴──────────────┴──────────────┴──────────────┴────────┐
│                      Storage Layer                            │
├───────────────┬──────────────┬──────────────┬───────────────┤
│ Template Packs│ Graph Objects│ Extraction   │ Type          │
│ & Schemas     │ & Relations  │ Jobs         │ Suggestions   │
└───────────────┴──────────────┴──────────────┴───────────────┘
```

## 3. Data Model Extensions

### 3.1 Template Pack Assignment

```sql
-- Project-level template installation
CREATE TABLE kb.project_template_packs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  organization_id UUID NOT NULL,
  project_id UUID NOT NULL REFERENCES kb.projects(id) ON DELETE CASCADE,
  template_pack_id UUID NOT NULL REFERENCES kb.graph_template_packs(id),
  installed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  installed_by UUID NOT NULL, -- user_id
  active BOOLEAN NOT NULL DEFAULT true,
  customizations JSONB DEFAULT '{}',
  UNIQUE (project_id, template_pack_id)
);

-- Track which types are active/customized per project
CREATE TABLE kb.project_object_type_registry (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  organization_id UUID NOT NULL,
  project_id UUID NOT NULL,
  type TEXT NOT NULL,
  source TEXT NOT NULL, -- 'template' | 'custom' | 'discovered'
  template_pack_id UUID REFERENCES kb.graph_template_packs(id),
  schema_version INT NOT NULL DEFAULT 1,
  json_schema JSONB NOT NULL,
  ui_config JSONB DEFAULT '{}', -- Form layouts, icons, colors
  enabled BOOLEAN NOT NULL DEFAULT true,
  discovery_confidence REAL, -- For discovered types
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (project_id, type)
);

CREATE INDEX idx_project_type_registry_project ON kb.project_object_type_registry(project_id, enabled);
CREATE INDEX idx_project_type_registry_source ON kb.project_object_type_registry(source);
```

### 3.2 Ingestion Job Tracking

```sql
-- Track document processing for object extraction
CREATE TABLE kb.object_extraction_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  organization_id UUID NOT NULL,
  project_id UUID NOT NULL,
  document_id UUID REFERENCES kb.documents(id) ON DELETE CASCADE,
  chunk_id UUID REFERENCES kb.chunks(id) ON DELETE CASCADE, -- optional, if chunk-level
  
  job_type TEXT NOT NULL, -- 'full_extraction' | 'type_discovery' | 'reprocessing'
  status TEXT NOT NULL DEFAULT 'pending', -- pending | processing | completed | failed
  
  -- Configuration
  enabled_types TEXT[] DEFAULT '{}', -- Which types to extract
  extraction_config JSONB DEFAULT '{}',
  
  -- Results
  objects_created INT DEFAULT 0,
  relationships_created INT DEFAULT 0,
  suggestions_created INT DEFAULT 0,
  
  -- Execution
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  error_message TEXT,
  retry_count INT DEFAULT 0,
  
  -- Provenance
  created_by UUID, -- user_id or system
  reprocessing_of UUID REFERENCES kb.object_extraction_jobs(id), -- for re-runs
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_extraction_jobs_project_status ON kb.object_extraction_jobs(project_id, status);
CREATE INDEX idx_extraction_jobs_document ON kb.object_extraction_jobs(document_id);
```

### 3.3 Type Discovery & Suggestions

```sql
-- AI-suggested new object types
CREATE TABLE kb.object_type_suggestions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  organization_id UUID NOT NULL,
  project_id UUID NOT NULL,
  
  suggested_type TEXT NOT NULL, -- Proposed type name
  description TEXT,
  
  -- Discovery context
  source TEXT NOT NULL, -- 'pattern_analysis' | 'user_feedback' | 'import'
  confidence REAL NOT NULL, -- 0.0-1.0
  
  -- Schema inference
  inferred_schema JSONB NOT NULL,
  example_instances JSONB DEFAULT '[]', -- Sample extracted objects
  frequency INT DEFAULT 1, -- How often this pattern appears
  
  -- Evidence
  source_document_ids UUID[] DEFAULT '{}',
  source_chunk_ids UUID[] DEFAULT '{}',
  similar_to_types TEXT[], -- Existing types this resembles
  
  -- Review status
  status TEXT NOT NULL DEFAULT 'pending', -- pending | accepted | rejected | merged
  reviewed_by UUID,
  reviewed_at TIMESTAMPTZ,
  review_notes TEXT,
  
  -- If accepted, the created type
  accepted_as_type TEXT,
  merged_into_type TEXT,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_type_suggestions_project_status ON kb.object_type_suggestions(project_id, status);
CREATE INDEX idx_type_suggestions_confidence ON kb.object_type_suggestions(confidence DESC);
```

### 3.4 Object Provenance Enhancement

```sql
-- Add extraction tracking to graph_objects
ALTER TABLE kb.graph_objects
  ADD COLUMN extraction_job_id UUID REFERENCES kb.object_extraction_jobs(id),
  ADD COLUMN extraction_confidence REAL, -- 0.0-1.0
  ADD COLUMN needs_review BOOLEAN DEFAULT false,
  ADD COLUMN reviewed_by UUID,
  ADD COLUMN reviewed_at TIMESTAMPTZ;

CREATE INDEX idx_graph_objects_extraction_job ON kb.graph_objects(extraction_job_id);
CREATE INDEX idx_graph_objects_needs_review ON kb.graph_objects(project_id, needs_review) WHERE needs_review = true;
```

## 4. Template Pack Management

### 4.1 Project Template Assignment Flow

```typescript
// API: POST /projects/:projectId/templates
interface AssignTemplateRequest {
  templatePackId: string;
  customizations?: {
    enabledTypes?: string[]; // Subset of pack types to enable
    disabledTypes?: string[];
    customSchemas?: Record<string, any>; // Override specific schemas
  };
}

// Response
interface AssignTemplateResponse {
  success: boolean;
  installedTypes: string[];
  disabledTypes: string[];
  conflicts?: Array<{
    type: string;
    issue: string;
    resolution: 'merged' | 'skipped' | 'renamed';
  }>;
}
```

**Installation Process:**

1. Validate template pack compatibility
2. Check for conflicts with existing custom types
3. Insert into `project_template_packs`
4. Populate `project_object_type_registry` with enabled types
5. Create default UI configs
6. Emit event for cache invalidation

### 4.2 Template Browsing UI

```typescript
// API: GET /projects/:projectId/templates/available
interface AvailableTemplate {
  id: string;
  name: string;
  version: string;
  description: string;
  objectTypes: Array<{
    type: string;
    description: string;
    icon?: string;
    sampleCount?: number; // How many exist in project
  }>;
  relationshipTypes: string[];
  installed: boolean;
  compatible: boolean;
}

// API: GET /projects/:projectId/type-registry
interface TypeRegistryEntry {
  type: string;
  source: 'template' | 'custom' | 'discovered';
  templatePackName?: string;
  schema: object;
  uiConfig: {
    icon: string;
    color: string;
    formLayout: object;
  };
  objectCount: number;
  enabled: boolean;
  customized: boolean;
}
```

## 5. Manual Object Creation

### 5.1 Dynamic Form Generation

The UI generates forms dynamically from JSON schemas in the type registry:

```typescript
// API: GET /projects/:projectId/types/:type/schema
interface TypeSchemaResponse {
  type: string;
  jsonSchema: object;
  uiSchema: object; // UI hints for form rendering
  examples: any[];
  validationRules: object;
}

// API: POST /projects/:projectId/objects
interface CreateObjectRequest {
  type: string;
  title: string;
  properties: Record<string, any>;
  labels?: string[];
  relationships?: Array<{
    type: string;
    targetObjectId: string;
    direction: 'outbound' | 'inbound';
    properties?: Record<string, any>;
  }>;
}
```

### 5.2 Type-Specific CRUD Endpoints

```typescript
// Generic CRUD with type validation
// GET /projects/:projectId/objects?type=Requirement
// POST /projects/:projectId/objects
// GET /projects/:projectId/objects/:id
// PATCH /projects/:projectId/objects/:id
// DELETE /projects/:projectId/objects/:id

// Type-aware search
// GET /projects/:projectId/objects/search?q=...&types=Requirement,Feature

// Relationship management
// POST /projects/:projectId/objects/:id/relationships
// GET /projects/:projectId/objects/:id/relationships?type=trace_to
```

## 6. Smart Ingestion Pipeline

### 6.1 Extraction Architecture

```
Document/Chunk
      │
      ├─► 1. Intent Detection
      │   └─► Identify document type (spec, meeting notes, diagram, etc.)
      │
      ├─► 2. Object Extraction
      │   ├─► For each enabled type in project
      │   ├─► Use type-specific prompts
      │   └─► Extract structured instances
      │
      ├─► 3. Relationship Inference
      │   ├─► Identify connections between objects
      │   ├─► Use relationship type schemas
      │   └─► Assign confidence scores
      │
      ├─► 4. Entity Linking
      │   ├─► Match to existing objects
      │   ├─► Create new or update existing
      │   └─► Resolve duplicates
      │
      └─► 5. Quality Scoring
          ├─► Completeness check
          ├─► Confidence scoring
          └─► Flag for review if needed
```

### 6.2 Type-Aware Extraction Prompts

```typescript
interface ExtractionPrompt {
  objectType: string;
  systemPrompt: string;
  schema: object;
  examples: any[];
  relationshipHints: string[];
}

// Example for Requirement extraction
const requirementExtractionPrompt: ExtractionPrompt = {
  objectType: 'Requirement',
  systemPrompt: `Extract requirements from the document. For each requirement:
- Identify type (Functional/NFR/Constraint/Compliance)
- Capture rationale and acceptance criteria
- Identify relationships to Goals/Features
- Assign MoSCoW priority`,
  schema: { /* JSON Schema */ },
  examples: [/* Few-shot examples */],
  relationshipHints: ['trace_to Goals', 'satisfy by Features', 'refine from Epics']
};
```

### 6.3 Extraction Job Orchestration

```typescript
interface ExtractionJobConfig {
  projectId: string;
  documentId?: string; // Optional - all docs if not specified
  
  // Type selection
  enabledTypes: string[]; // From project registry
  autoDetectTypes?: boolean; // Try to discover new types
  
  // Quality settings
  minConfidence: number; // 0.0-1.0
  requireReview?: boolean;
  
  // Relationship extraction
  extractRelationships: boolean;
  maxRelationshipDepth: number;
  
  // Reprocessing
  isReprocessing: boolean;
  replaceExisting?: boolean; // or merge
  previousJobId?: string;
}

// Worker process
async function processExtractionJob(jobId: string) {
  const job = await loadJob(jobId);
  const config = job.extraction_config as ExtractionJobConfig;
  
  // Load project type registry
  const typeRegistry = await getProjectTypeRegistry(config.projectId);
  const enabledTypes = typeRegistry.filter(t => 
    config.enabledTypes.includes(t.type) && t.enabled
  );
  
  // Process documents
  for (const doc of await loadDocuments(config)) {
    // 1. Intent detection
    const intent = await detectDocumentIntent(doc);
    
    // 2. Extract objects
    for (const typeConfig of enabledTypes) {
      const extracted = await extractObjectsOfType(doc, typeConfig, intent);
      
      for (const obj of extracted) {
        // Entity linking
        const existing = await findSimilarObject(obj, config.projectId);
        
        if (existing && !config.replaceExisting) {
          await mergeObjects(existing, obj, jobId);
        } else {
          await createGraphObject(obj, jobId);
        }
      }
    }
    
    // 3. Extract relationships
    if (config.extractRelationships) {
      await extractRelationships(doc, config);
    }
    
    // 4. Type discovery (if enabled)
    if (config.autoDetectTypes) {
      await discoverNewTypes(doc, config.projectId);
    }
  }
  
  await completeJob(jobId);
}
```

## 7. Automatic Type Discovery

### 7.1 Pattern Analysis Engine

```typescript
interface TypeDiscoveryConfig {
  projectId: string;
  minFrequency: number; // Minimum occurrences to suggest
  minConfidence: number;
  similarityThreshold: number;
}

async function discoverTypes(config: TypeDiscoveryConfig) {
  // 1. Collect untyped or loosely-typed entities
  const candidates = await findEntityCandidates(config.projectId);
  
  // 2. Cluster by similarity (embeddings + property patterns)
  const clusters = await clusterEntities(candidates);
  
  // 3. For each cluster, infer schema
  for (const cluster of clusters) {
    if (cluster.size < config.minFrequency) continue;
    
    // Schema inference
    const inferredSchema = inferSchemaFromInstances(cluster.instances);
    
    // Generate type name using LLM
    const suggestedName = await generateTypeName(cluster);
    
    // Check similarity to existing types
    const existingTypes = await getProjectTypes(config.projectId);
    const similar = findSimilarTypes(inferredSchema, existingTypes);
    
    if (similar.length > 0) {
      // Suggest merge or specialization
      await createTypeSuggestion({
        suggestedType: suggestedName,
        inferredSchema,
        confidence: cluster.confidence,
        similar_to_types: similar.map(t => t.type),
        action: 'merge_or_specialize'
      });
    } else {
      // New type suggestion
      await createTypeSuggestion({
        suggestedType: suggestedName,
        inferredSchema,
        confidence: cluster.confidence,
        example_instances: cluster.instances.slice(0, 5)
      });
    }
  }
}
```

### 7.2 Schema Inference Algorithm

```typescript
function inferSchemaFromInstances(instances: any[]): JSONSchema {
  const schema: any = {
    type: 'object',
    properties: {},
    required: []
  };
  
  // Analyze each property across instances
  const propertyStats = new Map<string, PropertyStats>();
  
  for (const instance of instances) {
    for (const [key, value] of Object.entries(instance.properties || {})) {
      if (!propertyStats.has(key)) {
        propertyStats.set(key, {
          count: 0,
          types: new Set(),
          values: [],
          nullable: false
        });
      }
      
      const stats = propertyStats.get(key)!;
      stats.count++;
      stats.types.add(typeof value);
      stats.values.push(value);
      
      if (value === null || value === undefined) {
        stats.nullable = true;
      }
    }
  }
  
  // Generate schema properties
  for (const [key, stats] of propertyStats.entries()) {
    const frequency = stats.count / instances.length;
    
    // Determine property schema
    const propSchema = inferPropertySchema(stats);
    schema.properties[key] = propSchema;
    
    // Mark as required if > 90% frequency and not nullable
    if (frequency > 0.9 && !stats.nullable) {
      schema.required.push(key);
    }
  }
  
  return schema;
}

function inferPropertySchema(stats: PropertyStats): JSONSchema {
  // Single type
  if (stats.types.size === 1) {
    const type = Array.from(stats.types)[0];
    
    if (type === 'string') {
      // Check for enums
      const uniqueValues = new Set(stats.values);
      if (uniqueValues.size <= 10 && stats.count >= 3) {
        return { type: 'string', enum: Array.from(uniqueValues) };
      }
      
      // Check for patterns (date, email, url)
      const pattern = detectPattern(stats.values);
      if (pattern) {
        return { type: 'string', format: pattern };
      }
      
      return { type: 'string' };
    }
    
    if (type === 'number') {
      // Analyze range
      const numbers = stats.values.filter(v => typeof v === 'number');
      return {
        type: 'number',
        minimum: Math.min(...numbers),
        maximum: Math.max(...numbers)
      };
    }
    
    return { type };
  }
  
  // Multiple types - use anyOf
  return {
    anyOf: Array.from(stats.types).map(type => ({ type }))
  };
}
```

### 7.3 Type Suggestion Review UI

```typescript
// API: GET /projects/:projectId/type-suggestions
interface TypeSuggestion {
  id: string;
  suggestedType: string;
  description: string;
  confidence: number;
  inferredSchema: object;
  exampleInstances: any[];
  frequency: number;
  sourceDocuments: number;
  similarToTypes: string[];
  status: 'pending' | 'accepted' | 'rejected';
}

// API: POST /projects/:projectId/type-suggestions/:id/review
interface ReviewTypeSuggestionRequest {
  action: 'accept' | 'reject' | 'merge' | 'customize';
  customizations?: {
    finalTypeName?: string;
    schemaAdjustments?: object;
    mergeIntoType?: string;
  };
  notes?: string;
}

// On acceptance
async function acceptTypeSuggestion(
  suggestionId: string,
  request: ReviewTypeSuggestionRequest
) {
  const suggestion = await loadSuggestion(suggestionId);
  
  // Create type in registry
  const newType = await createProjectObjectType({
    projectId: suggestion.project_id,
    type: request.customizations?.finalTypeName || suggestion.suggested_type,
    source: 'discovered',
    json_schema: applyCustomizations(
      suggestion.inferred_schema,
      request.customizations?.schemaAdjustments
    ),
    discovery_confidence: suggestion.confidence
  });
  
  // Update suggestion status
  await updateSuggestion(suggestionId, {
    status: 'accepted',
    accepted_as_type: newType.type,
    reviewed_by: getCurrentUserId(),
    reviewed_at: new Date()
  });
  
  // Optionally trigger reprocessing to tag existing instances
  if (request.reprocessExisting) {
    await triggerReprocessing({
      projectId: suggestion.project_id,
      newTypes: [newType.type],
      documentIds: suggestion.source_document_ids
    });
  }
  
  return newType;
}
```

## 8. Reprocessing Framework

### 8.1 Reprocessing Triggers

```typescript
interface ReprocessingRequest {
  projectId: string;
  
  // Scope
  documentIds?: string[]; // Specific docs or all
  chunkIds?: string[];
  
  // Type filtering
  newTypes?: string[]; // Only extract these new types
  allTypes?: boolean; // Re-extract all types
  
  // Strategy
  strategy: 'replace' | 'merge' | 'create_new_versions';
  
  // Quality
  minConfidence?: number;
  requireReview?: boolean;
}

async function triggerReprocessing(request: ReprocessingRequest) {
  // Create reprocessing job
  const job = await createExtractionJob({
    project_id: request.projectId,
    job_type: 'reprocessing',
    extraction_config: {
      ...request,
      enabled_types: request.newTypes || await getActiveTypes(request.projectId)
    }
  });
  
  // Enqueue for processing
  await enqueueJob(job.id);
  
  return job;
}
```

### 8.2 Merge Strategies

**Replace Strategy:**
```typescript
async function replaceStrategy(existing: GraphObject, extracted: any, jobId: string) {
  // Create new version superseding old
  await createObjectVersion({
    canonical_id: existing.canonical_id,
    supersedes_id: existing.id,
    ...extracted,
    extraction_job_id: jobId,
    change_summary: generateDiff(existing.properties, extracted.properties)
  });
}
```

**Merge Strategy:**
```typescript
async function mergeStrategy(existing: GraphObject, extracted: any, jobId: string) {
  // Intelligent merge of properties
  const merged = {
    ...existing.properties
  };
  
  // Add new properties from extraction
  for (const [key, value] of Object.entries(extracted.properties)) {
    if (!(key in merged) || existing.extraction_confidence < extracted.confidence) {
      merged[key] = value;
    }
  }
  
  // Create new version with merged data
  await createObjectVersion({
    canonical_id: existing.canonical_id,
    supersedes_id: existing.id,
    properties: merged,
    extraction_job_id: jobId,
    extraction_confidence: Math.max(
      existing.extraction_confidence,
      extracted.confidence
    )
  });
}
```

### 8.3 Provenance Tracking

```typescript
// Link objects to extraction jobs for reprocessing history
interface ObjectProvenance {
  objectId: string;
  extractionJobs: Array<{
    jobId: string;
    jobType: string;
    timestamp: Date;
    changesApplied: string[]; // Property keys changed
    confidence: number;
  }>;
  manualEdits: Array<{
    userId: string;
    timestamp: Date;
    changesApplied: string[];
  }>;
}

// Query for reprocessing impact
// "Show me what would change if I reprocess with new type X"
async function previewReprocessing(request: ReprocessingRequest) {
  const impactedDocs = await getDocumentsInScope(request);
  const currentObjects = await getObjectsFromDocuments(impactedDocs);
  
  // Dry-run extraction
  const dryRunJob = await simulateExtraction({
    ...request,
    dryRun: true
  });
  
  return {
    documentsScanned: impactedDocs.length,
    objectsAffected: currentObjects.length,
    newObjectsEstimate: dryRunJob.objects_would_create,
    changedObjectsEstimate: dryRunJob.objects_would_update,
    newRelationshipsEstimate: dryRunJob.relationships_would_create
  };
}
```

## 9. API Endpoints Summary

### 9.1 Template Management
```
GET    /projects/:id/templates/available
POST   /projects/:id/templates/install
GET    /projects/:id/templates/installed
PATCH  /projects/:id/templates/:templateId
DELETE /projects/:id/templates/:templateId

GET    /projects/:id/type-registry
GET    /projects/:id/type-registry/:type
PATCH  /projects/:id/type-registry/:type
```

### 9.2 Object CRUD
```
GET    /projects/:id/objects
POST   /projects/:id/objects
GET    /projects/:id/objects/:objectId
PATCH  /projects/:id/objects/:objectId
DELETE /projects/:id/objects/:objectId

GET    /projects/:id/objects/search
GET    /projects/:id/objects/by-type/:type
```

### 9.3 Extraction & Ingestion
```
POST   /projects/:id/extraction/jobs
GET    /projects/:id/extraction/jobs
GET    /projects/:id/extraction/jobs/:jobId
DELETE /projects/:id/extraction/jobs/:jobId

POST   /projects/:id/extraction/reprocess
POST   /projects/:id/extraction/preview
```

### 9.4 Type Discovery
```
GET    /projects/:id/type-suggestions
POST   /projects/:id/type-suggestions/:id/review
DELETE /projects/:id/type-suggestions/:id

POST   /projects/:id/discovery/analyze
GET    /projects/:id/discovery/stats
```

## 10. UI Component Structure

### 10.1 Template Gallery Page
```
/projects/:id/templates
├── Available Templates Grid
│   ├── Template Card (TOGAF Core, Agile PM, etc.)
│   ├── Install Button
│   └── Preview Modal
├── Installed Templates List
│   ├── Active/Inactive Toggle
│   ├── Customization Panel
│   └── Uninstall Button
```

### 10.2 Type Registry Page
```
/projects/:id/types
├── Type List (Grouped by Source)
│   ├── Template Types
│   ├── Custom Types
│   └── Discovered Types (with badges)
├── Type Details Panel
│   ├── Schema Viewer
│   ├── Object Count
│   ├── Form Preview
│   └── Enable/Disable Toggle
├── Create Custom Type Button
```

### 10.3 Object Browser
```
/projects/:id/objects
├── Type Filter Sidebar
├── Object List (Virtual scroll)
│   ├── Type Icon + Title
│   ├── Confidence Badge (for extracted)
│   ├── Needs Review Flag
│   └── Quick Actions
├── Object Detail Panel
│   ├── Properties Form
│   ├── Relationships Graph
│   ├── Provenance Timeline
│   └── Edit/Delete Actions
├── Create Object FAB
```

### 10.4 Discovery Dashboard
```
/projects/:id/discovery
├── Stats Cards
│   ├── Pending Suggestions
│   ├── Discovery Confidence
│   └── New Patterns Found
├── Type Suggestions List
│   ├── Suggestion Card
│   │   ├── Proposed Type Name
│   │   ├── Confidence Badge
│   │   ├── Example Instances
│   │   └── Review Actions (Accept/Reject/Customize)
│   └── Filters (by confidence, source, status)
├── Run Discovery Button
```

### 10.5 Ingestion Monitor
```
/projects/:id/ingestion
├── Job Queue Status
├── Active Jobs List
│   ├── Job Progress
│   ├── Types Extracted
│   ├── Objects Created
│   └── Cancel/Retry Actions
├── Job History
└── Create Extraction Job Button
    ├── Document Selection
    ├── Type Selection (from registry)
    ├── Quality Settings
    └── Reprocessing Options
```

## 11. Implementation Phases

### Phase 1: Foundation (MVP)
- [ ] Schema for template packs, project registry, extraction jobs
- [ ] Template pack CRUD APIs
- [ ] Project template assignment
- [ ] Manual object CRUD with schema validation
- [ ] Basic extraction job framework

### Phase 2: Smart Ingestion
- [ ] Type-aware extraction prompts
- [ ] Relationship inference
- [ ] Entity linking (duplicate detection)
- [ ] Confidence scoring
- [ ] Review queue

### Phase 3: Type Discovery
- [ ] Pattern analysis engine
- [ ] Schema inference
- [ ] Type suggestion creation
- [ ] Review & acceptance workflow
- [ ] Merge with existing types

### Phase 4: Reprocessing
- [ ] Reprocessing job type
- [ ] Merge strategies (replace/merge/version)
- [ ] Provenance tracking
- [ ] Impact preview
- [ ] Incremental re-extraction

### Phase 5: Advanced Features
- [ ] Automatic type refinement over time
- [ ] Cross-project type sharing
- [ ] Type evolution tracking
- [ ] Quality metrics & analytics
- [ ] ML model fine-tuning per project

## 12. Configuration

```typescript
// Environment variables
EXTRACTION_MAX_CONCURRENT_JOBS=5
EXTRACTION_MIN_CONFIDENCE=0.7
DISCOVERY_MIN_FREQUENCY=3
DISCOVERY_MIN_CONFIDENCE=0.8
TYPE_SIMILARITY_THRESHOLD=0.85
ENTITY_LINKING_SIMILARITY=0.90
REPROCESSING_BATCH_SIZE=100
```

## 13. Metrics & Monitoring

```typescript
interface ExtractionMetrics {
  jobs_created: Counter;
  jobs_completed: Counter;
  jobs_failed: Counter;
  extraction_duration_ms: Histogram;
  objects_created: Counter;
  relationships_created: Counter;
  confidence_distribution: Histogram;
  review_required_rate: Gauge;
}

interface DiscoveryMetrics {
  suggestions_created: Counter;
  suggestions_accepted: Counter;
  suggestions_rejected: Counter;
  discovery_confidence: Histogram;
  schema_complexity: Histogram; // property count
  cluster_size: Histogram;
}
```

## 14. Security Considerations

- Template packs signed with Ed25519
- Project-level RLS on all tables
- Extraction jobs scoped to project
- Type registry isolated per project
- User permissions for type management
- Audit log for type changes
- Rate limiting on extraction jobs

## 15. Open Questions

1. Should we allow cross-project type inheritance?
2. How to handle type name conflicts when merging suggestions?
3. Versioning strategy for evolved types?
4. Should discovered types automatically be enabled?
5. How to handle schema breaking changes in reprocessing?
6. UI for visual schema editing vs JSON?
7. Export/import of custom type registries?

## 16. Success Criteria

- User can install TOGAF template in < 30 seconds
- Extraction job processes 100 documents in < 5 minutes
- Type discovery suggests relevant types with > 80% acceptance rate
- Reprocessing job completes without data loss
- Manual object creation form renders in < 100ms
- Type registry queries return in < 50ms
- 95% of extracted objects meet confidence threshold

---

**Next Steps:**
1. Review and approve design
2. Create database migrations
3. Implement Phase 1 MVP
4. Build template pack for TOGAF
5. Develop extraction prompts library
