# Auto-Discovery System - Complete Specification

## Overview

The Auto-Discovery System enables AI-powered automatic discovery of object types and relationships from a project's knowledge base. It analyzes documents along with a project's purpose description to generate custom template packs that can be reviewed, edited, and installed.

## User Story

**As a** project manager setting up a new knowledge base,
**I want to** automatically discover relevant object types and relationships from my documents,
**So that** I can quickly establish a domain-specific schema without manually creating types.

## System Architecture

### High-Level Flow

```
┌─────────────────────────────────────────────────────────────────┐
│ 1. User defines KB Purpose (markdown) in settings               │
│    "This knowledge base tracks software architecture decisions, │
│     technical debt, and system components for a microservices   │
│     platform."                                                   │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│ 2. User uploads/ingests documents (architecture docs, ADRs,    │
│    design specs, runbooks, etc.)                                │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│ 3. User clicks "Run Auto-Discovery" in Auto-Extraction Settings│
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│ 4. Discovery Wizard Opens (Multi-Step Modal)                   │
│    Step 1: Select documents to analyze                          │
│    Step 2: Configure discovery parameters                       │
│    Step 3: Review progress (processing batches)                 │
│    Step 4: Review/edit discovered types                         │
│    Step 5: Create template pack                                 │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│ 5. Backend Discovery Job (Background Processing)               │
│    • Batch documents into chunks                                │
│    • Analyze each batch with LLM                                │
│    • Extract candidate types and relationships                  │
│    • Merge and deduplicate across batches                       │
│    • Refine schemas iteratively                                 │
│    • Generate JSON schemas                                      │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│ 6. Template Pack Creation                                       │
│    • Convert discovered types to template pack format           │
│    • Mark as source='discovered'                                │
│    • Set status='pending_review'                                │
│    • Add to available packs list                                │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│ 7. User Reviews & Installs                                      │
│    • Preview discovered pack in templates settings               │
│    • Edit types/relationships/schemas                            │
│    • Install pack to activate types                              │
└─────────────────────────────────────────────────────────────────┘
```

## Database Schema Changes

### 1. Add KB Purpose to Projects

```sql
-- Migration: 00XX_add_kb_purpose_to_projects.sql

ALTER TABLE kb.projects 
ADD COLUMN kb_purpose TEXT;

COMMENT ON COLUMN kb.projects.kb_purpose IS 
'Markdown description of the knowledge base purpose, domain, and scope. Used by auto-discovery to understand context.';
```

### 2. Create Discovery Jobs Table

```sql
-- Migration: 00XX_create_discovery_jobs.sql

CREATE TABLE kb.discovery_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    organization_id UUID NOT NULL,
    project_id UUID NOT NULL REFERENCES kb.projects(id) ON DELETE CASCADE,
    
    -- Job metadata
    status TEXT NOT NULL CHECK (status IN (
        'pending',
        'analyzing_documents',
        'extracting_types',
        'refining_schemas',
        'creating_pack',
        'completed',
        'failed',
        'cancelled'
    )),
    progress JSONB NOT NULL DEFAULT '{"current_step": 0, "total_steps": 0, "message": ""}',
    
    -- Configuration
    config JSONB NOT NULL DEFAULT '{}', -- {document_ids, batch_size, min_confidence, etc.}
    kb_purpose TEXT NOT NULL, -- Snapshot of purpose at discovery time
    
    -- Results
    discovered_types JSONB DEFAULT '[]', -- Array of candidate types
    discovered_relationships JSONB DEFAULT '[]', -- Array of candidate relationships
    template_pack_id UUID REFERENCES kb.graph_template_packs(id),
    
    -- Error handling
    error_message TEXT,
    retry_count INT DEFAULT 0,
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    
    CONSTRAINT fk_project FOREIGN KEY (project_id) REFERENCES kb.projects(id) ON DELETE CASCADE
);

CREATE INDEX idx_discovery_jobs_project ON kb.discovery_jobs(project_id);
CREATE INDEX idx_discovery_jobs_status ON kb.discovery_jobs(status) WHERE status IN ('pending', 'analyzing_documents', 'extracting_types', 'refining_schemas');
CREATE INDEX idx_discovery_jobs_created ON kb.discovery_jobs(created_at DESC);

COMMENT ON TABLE kb.discovery_jobs IS 'Background jobs for automatic discovery of object types and relationships from documents';
```

### 3. Create Type Candidates Table (Working Memory)

```sql
-- Migration: 00XX_create_discovery_type_candidates.sql

CREATE TABLE kb.discovery_type_candidates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id UUID NOT NULL REFERENCES kb.discovery_jobs(id) ON DELETE CASCADE,
    batch_number INT NOT NULL, -- Which batch discovered this type
    
    -- Type information
    type_name TEXT NOT NULL,
    description TEXT,
    confidence REAL NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
    
    -- Schema
    inferred_schema JSONB NOT NULL,
    example_instances JSONB DEFAULT '[]', -- Sample extracted objects
    frequency INT DEFAULT 1, -- How many instances found
    
    -- Relationships
    proposed_relationships JSONB DEFAULT '[]', -- Array of {target_type, relation_type, description}
    
    -- Evidence
    source_document_ids UUID[] DEFAULT '{}',
    extraction_context TEXT, -- Snippet showing where type was discovered
    
    -- Refinement tracking
    refinement_iteration INT DEFAULT 1,
    merged_from UUID[], -- If this type was merged from others
    
    -- Status
    status TEXT NOT NULL DEFAULT 'candidate' CHECK (status IN ('candidate', 'approved', 'rejected', 'merged')),
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_discovery_candidates_job ON kb.discovery_type_candidates(job_id);
CREATE INDEX idx_discovery_candidates_status ON kb.discovery_type_candidates(job_id, status);
CREATE INDEX idx_discovery_candidates_confidence ON kb.discovery_type_candidates(job_id, confidence DESC);

COMMENT ON TABLE kb.discovery_type_candidates IS 'Working memory for type candidates during discovery process';
```

### 4. Extend Template Packs for Discovery

```sql
-- Migration: 00XX_extend_template_packs_for_discovery.sql

ALTER TABLE kb.graph_template_packs
ADD COLUMN source TEXT DEFAULT 'manual' CHECK (source IN ('manual', 'discovered', 'imported', 'system')),
ADD COLUMN discovery_job_id UUID REFERENCES kb.discovery_jobs(id),
ADD COLUMN pending_review BOOLEAN DEFAULT FALSE;

CREATE INDEX idx_template_packs_source ON kb.graph_template_packs(source);
CREATE INDEX idx_template_packs_pending_review ON kb.graph_template_packs(pending_review) WHERE pending_review = TRUE;

COMMENT ON COLUMN kb.graph_template_packs.source IS 'Origin of the template pack';
COMMENT ON COLUMN kb.graph_template_packs.discovery_job_id IS 'Reference to discovery job if source=discovered';
COMMENT ON COLUMN kb.graph_template_packs.pending_review IS 'Whether pack needs review before installation';
```

## Backend Implementation

### 1. Discovery Service

**File**: `apps/server/src/modules/discovery-jobs/discovery-job.service.ts`

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '@/common/database/database.service';
import { ConfigService } from '@/common/config/config.service';
import { LangChainGeminiProvider } from '@/modules/extraction-jobs/llm/langchain-gemini.provider';
import { TemplatePackService } from '@/modules/template-packs/template-pack.service';

export interface DiscoveryJobConfig {
    document_ids: string[];
    batch_size: number;
    min_confidence: number;
    include_relationships: boolean;
    max_iterations: number;
}

export interface DiscoveredType {
    type_name: string;
    description: string;
    confidence: number;
    properties: Record<string, any>;
    required_properties: string[];
    example_instances: any[];
    frequency: number;
}

export interface DiscoveredRelationship {
    source_type: string;
    target_type: string;
    relation_type: string;
    description: string;
    confidence: number;
    cardinality: 'one-to-one' | 'one-to-many' | 'many-to-many';
}

@Injectable()
export class DiscoveryJobService {
    private readonly logger = new Logger(DiscoveryJobService.name);

    constructor(
        private readonly db: DatabaseService,
        private readonly config: ConfigService,
        private readonly llmProvider: LangChainGeminiProvider,
        private readonly templatePackService: TemplatePackService,
    ) {}

    /**
     * Start a new discovery job
     */
    async startDiscovery(
        projectId: string,
        orgId: string,
        tenantId: string,
        config: DiscoveryJobConfig,
    ): Promise<{ job_id: string }> {
        // Get KB purpose
        const projectResult = await this.db.query(
            'SELECT kb_purpose FROM kb.projects WHERE id = $1',
            [projectId]
        );

        if (!projectResult.rows.length) {
            throw new Error('Project not found');
        }

        const kbPurpose = projectResult.rows[0].kb_purpose || 
            'General purpose knowledge base for project documentation and knowledge management.';

        // Create discovery job
        const jobResult = await this.db.query(
            `INSERT INTO kb.discovery_jobs (
                tenant_id, organization_id, project_id,
                status, config, kb_purpose, progress
            ) VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING id`,
            [
                tenantId,
                orgId,
                projectId,
                'pending',
                JSON.stringify(config),
                kbPurpose,
                JSON.stringify({
                    current_step: 0,
                    total_steps: this.calculateTotalSteps(config),
                    message: 'Discovery job created, waiting to start...'
                })
            ]
        );

        const jobId = jobResult.rows[0].id;

        // Start processing asynchronously
        this.processDiscoveryJob(jobId, projectId, tenantId).catch(error => {
            this.logger.error(`Discovery job ${jobId} failed: ${error.message}`, error.stack);
            this.updateJobStatus(jobId, 'failed', error.message);
        });

        return { job_id: jobId };
    }

    /**
     * Main discovery processing loop
     */
    private async processDiscoveryJob(
        jobId: string,
        projectId: string,
        tenantId: string,
    ): Promise<void> {
        this.logger.log(`[DISCOVERY] Starting job ${jobId} for project ${projectId}`);

        // Update status
        await this.updateJobStatus(jobId, 'analyzing_documents', null);

        // Get job config
        const jobResult = await this.db.query(
            'SELECT config, kb_purpose FROM kb.discovery_jobs WHERE id = $1',
            [jobId]
        );
        const config: DiscoveryJobConfig = JSON.parse(jobResult.rows[0].config);
        const kbPurpose: string = jobResult.rows[0].kb_purpose;

        // Step 1: Batch documents
        const batches = await this.batchDocuments(config.document_ids, config.batch_size);
        this.logger.log(`[DISCOVERY] Processing ${batches.length} batches`);

        // Step 2: Extract types from each batch
        await this.updateJobStatus(jobId, 'extracting_types', null);
        let batchNumber = 1;

        for (const batch of batches) {
            await this.updateProgress(jobId, {
                current_step: batchNumber,
                total_steps: batches.length + 2, // batches + refinement + pack creation
                message: `Analyzing batch ${batchNumber}/${batches.length}...`
            });

            await this.extractTypesFromBatch(jobId, batch, batchNumber, kbPurpose);
            batchNumber++;
        }

        // Step 3: Refine and merge types
        await this.updateJobStatus(jobId, 'refining_schemas', null);
        await this.updateProgress(jobId, {
            current_step: batches.length + 1,
            total_steps: batches.length + 2,
            message: 'Refining discovered types and merging duplicates...'
        });

        const refinedTypes = await this.refineAndMergeTypes(jobId, config);

        // Step 4: Discover relationships
        if (config.include_relationships) {
            const relationships = await this.discoverRelationships(jobId, refinedTypes);
            await this.db.query(
                'UPDATE kb.discovery_jobs SET discovered_relationships = $1 WHERE id = $2',
                [JSON.stringify(relationships), jobId]
            );
        }

        // Step 5: Create template pack
        await this.updateJobStatus(jobId, 'creating_pack', null);
        await this.updateProgress(jobId, {
            current_step: batches.length + 2,
            total_steps: batches.length + 2,
            message: 'Creating template pack from discovered types...'
        });

        const templatePackId = await this.createTemplatePackFromDiscovery(
            jobId,
            projectId,
            refinedTypes,
            config.include_relationships
        );

        // Step 6: Complete
        await this.db.query(
            `UPDATE kb.discovery_jobs 
             SET status = 'completed', template_pack_id = $1, completed_at = now()
             WHERE id = $2`,
            [templatePackId, jobId]
        );

        this.logger.log(`[DISCOVERY] Job ${jobId} completed, pack ${templatePackId} created`);
    }

    /**
     * Batch documents for processing
     */
    private async batchDocuments(
        documentIds: string[],
        batchSize: number
    ): Promise<string[][]> {
        const batches: string[][] = [];
        for (let i = 0; i < documentIds.length; i += batchSize) {
            batches.push(documentIds.slice(i, i + batchSize));
        }
        return batches;
    }

    /**
     * Extract type candidates from a batch of documents using LLM
     */
    private async extractTypesFromBatch(
        jobId: string,
        documentIds: string[],
        batchNumber: number,
        kbPurpose: string
    ): Promise<void> {
        // Get document content
        const docsResult = await this.db.query(
            'SELECT id, content, title FROM kb.documents WHERE id = ANY($1)',
            [documentIds]
        );

        const combinedContent = docsResult.rows
            .map(doc => `### ${doc.title}\n\n${doc.content}`)
            .join('\n\n---\n\n');

        // LLM prompt for type discovery
        const prompt = this.buildTypeDiscoveryPrompt(kbPurpose, combinedContent);

        // Call LLM
        const response = await this.llmProvider.discoverTypes(prompt, combinedContent);

        // Store candidates
        for (const type of response.discovered_types) {
            await this.db.query(
                `INSERT INTO kb.discovery_type_candidates (
                    job_id, batch_number, type_name, description, confidence,
                    inferred_schema, example_instances, frequency,
                    source_document_ids, extraction_context
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
                [
                    jobId,
                    batchNumber,
                    type.type_name,
                    type.description,
                    type.confidence,
                    JSON.stringify(type.schema),
                    JSON.stringify(type.examples),
                    type.frequency,
                    documentIds,
                    type.context
                ]
            );
        }
    }

    /**
     * Build LLM prompt for type discovery
     */
    private buildTypeDiscoveryPrompt(kbPurpose: string, content: string): string {
        return `You are an expert at analyzing documents and identifying structured data types.

**Knowledge Base Purpose:**
${kbPurpose}

**Your Task:**
Analyze the provided documents and identify distinct object types (entities) that should be tracked in this knowledge base.

**Guidelines:**
1. Look for nouns and concepts that are repeatedly mentioned
2. Identify attributes/properties for each type
3. Determine which properties are required vs optional
4. Provide 2-3 example instances from the text
5. Estimate confidence (0.0-1.0) based on:
   - Frequency of mentions
   - Clarity of structure
   - Consistency across documents

**Output Format:**
For each discovered type, provide:
- type_name (PascalCase, e.g., "ArchitectureDecision")
- description (1-2 sentences explaining what this type represents)
- confidence (0.0-1.0)
- properties (object with property names as keys and {type, description} as values)
- required_properties (array of required property names)
- examples (2-3 sample instances extracted from text)
- frequency (estimated number of instances)

**Important:**
- Focus on business/domain concepts, not technical implementation details
- Prefer quality over quantity (5-15 types is ideal)
- Merge similar concepts (e.g., "SystemComponent" and "Component" → "SystemComponent")
- Don't create types for generic concepts like "Document" or "Note"

Return JSON array of discovered types.`;
    }

    /**
     * Refine and merge duplicate type candidates
     */
    private async refineAndMergeTypes(
        jobId: string,
        config: DiscoveryJobConfig
    ): Promise<DiscoveredType[]> {
        // Get all candidates
        const result = await this.db.query(
            `SELECT * FROM kb.discovery_type_candidates 
             WHERE job_id = $1 AND status = 'candidate'
             ORDER BY confidence DESC`,
            [jobId]
        );

        const candidates = result.rows;

        // Group by similar names (case-insensitive, fuzzy match)
        const groups = this.groupSimilarTypes(candidates);

        const refinedTypes: DiscoveredType[] = [];

        for (const group of groups) {
            // Merge schemas
            const mergedType = await this.mergeTypeSchemas(group);

            // Filter by confidence
            if (mergedType.confidence >= config.min_confidence) {
                refinedTypes.push(mergedType);

                // Mark originals as merged
                for (const candidate of group) {
                    await this.db.query(
                        'UPDATE kb.discovery_type_candidates SET status = $1 WHERE id = $2',
                        ['merged', candidate.id]
                    );
                }
            }
        }

        // Store refined types in job
        await this.db.query(
            'UPDATE kb.discovery_jobs SET discovered_types = $1 WHERE id = $2',
            [JSON.stringify(refinedTypes), jobId]
        );

        return refinedTypes;
    }

    /**
     * Group similar type candidates using fuzzy matching
     */
    private groupSimilarTypes(candidates: any[]): any[][] {
        const groups: any[][] = [];
        const used = new Set<string>();

        for (const candidate of candidates) {
            if (used.has(candidate.id)) continue;

            const group = [candidate];
            used.add(candidate.id);

            // Find similar candidates
            for (const other of candidates) {
                if (used.has(other.id)) continue;

                const similarity = this.calculateTypeSimilarity(
                    candidate.type_name,
                    other.type_name
                );

                if (similarity > 0.8) {
                    group.push(other);
                    used.add(other.id);
                }
            }

            groups.push(group);
        }

        return groups;
    }

    /**
     * Calculate similarity between two type names (0.0-1.0)
     */
    private calculateTypeSimilarity(name1: string, name2: string): number {
        // Simple implementation using Levenshtein distance
        // In production, use embeddings or more sophisticated matching
        const n1 = name1.toLowerCase().replace(/[^a-z]/g, '');
        const n2 = name2.toLowerCase().replace(/[^a-z]/g, '');

        if (n1 === n2) return 1.0;

        const maxLen = Math.max(n1.length, n2.length);
        const distance = this.levenshteinDistance(n1, n2);
        return 1 - (distance / maxLen);
    }

    private levenshteinDistance(a: string, b: string): number {
        const matrix: number[][] = [];

        for (let i = 0; i <= b.length; i++) {
            matrix[i] = [i];
        }

        for (let j = 0; j <= a.length; j++) {
            matrix[0][j] = j;
        }

        for (let i = 1; i <= b.length; i++) {
            for (let j = 1; j <= a.length; j++) {
                if (b.charAt(i - 1) === a.charAt(j - 1)) {
                    matrix[i][j] = matrix[i - 1][j - 1];
                } else {
                    matrix[i][j] = Math.min(
                        matrix[i - 1][j - 1] + 1,
                        matrix[i][j - 1] + 1,
                        matrix[i - 1][j] + 1
                    );
                }
            }
        }

        return matrix[b.length][a.length];
    }

    /**
     * Merge multiple type candidates into a single refined type
     */
    private async mergeTypeSchemas(candidates: any[]): Promise<DiscoveredType> {
        // Use the highest confidence name
        const bestCandidate = candidates.reduce((best, curr) =>
            curr.confidence > best.confidence ? curr : best
        );

        // Merge properties from all schemas
        const allProperties: Record<string, any> = {};
        const allRequired = new Set<string>();
        const allExamples: any[] = [];

        for (const candidate of candidates) {
            const schema = JSON.parse(candidate.inferred_schema);
            Object.assign(allProperties, schema.properties || {});
            
            if (schema.required) {
                schema.required.forEach((prop: string) => allRequired.add(prop));
            }

            const examples = JSON.parse(candidate.example_instances);
            allExamples.push(...examples);
        }

        // Calculate aggregate confidence (weighted average)
        const avgConfidence = candidates.reduce((sum, c) => sum + c.confidence, 0) / candidates.length;

        // Sum frequencies
        const totalFrequency = candidates.reduce((sum, c) => sum + (c.frequency || 1), 0);

        return {
            type_name: bestCandidate.type_name,
            description: bestCandidate.description,
            confidence: avgConfidence,
            properties: allProperties,
            required_properties: Array.from(allRequired),
            example_instances: allExamples.slice(0, 5), // Keep top 5 examples
            frequency: totalFrequency
        };
    }

    /**
     * Discover relationships between types
     */
    private async discoverRelationships(
        jobId: string,
        types: DiscoveredType[]
    ): Promise<DiscoveredRelationship[]> {
        // Build prompt asking LLM to identify relationships
        const typeNames = types.map(t => t.type_name);
        const prompt = this.buildRelationshipDiscoveryPrompt(types);

        // Call LLM
        const response = await this.llmProvider.discoverRelationships(prompt, types);

        return response.relationships;
    }

    private buildRelationshipDiscoveryPrompt(types: DiscoveredType[]): string {
        const typeList = types.map(t => 
            `- ${t.type_name}: ${t.description}`
        ).join('\n');

        return `Given these discovered object types:

${typeList}

Identify meaningful relationships between them.

For each relationship, provide:
- source_type (which type this relationship starts from)
- target_type (which type it connects to)
- relation_type (snake_case name, e.g., "implements", "depends_on", "assigned_to")
- description (what this relationship means)
- confidence (0.0-1.0)
- cardinality ("one-to-one" | "one-to-many" | "many-to-many")

Return JSON array of relationships.`;
    }

    /**
     * Create a template pack from discovered types
     */
    private async createTemplatePackFromDiscovery(
        jobId: string,
        projectId: string,
        types: DiscoveredType[],
        includeRelationships: boolean
    ): Promise<string> {
        // Convert discovered types to template pack format
        const objectTypeSchemas: Record<string, any> = {};
        const uiConfigs: Record<string, any> = {};

        for (const type of types) {
            objectTypeSchemas[type.type_name] = {
                type: 'object',
                required: type.required_properties,
                properties: type.properties
            };

            uiConfigs[type.type_name] = {
                icon: this.suggestIconForType(type.type_name),
                color: this.generateColorForType(type.type_name),
                displayName: type.type_name,
                description: type.description
            };
        }

        // Get relationships if available
        let relationshipTypeSchemas: Record<string, any> = {};
        if (includeRelationships) {
            const jobResult = await this.db.query(
                'SELECT discovered_relationships FROM kb.discovery_jobs WHERE id = $1',
                [jobId]
            );

            if (jobResult.rows[0].discovered_relationships) {
                const relationships: DiscoveredRelationship[] = 
                    JSON.parse(jobResult.rows[0].discovered_relationships);

                for (const rel of relationships) {
                    relationshipTypeSchemas[rel.relation_type] = {
                        sourceTypes: [rel.source_type],
                        targetTypes: [rel.target_type],
                        cardinality: rel.cardinality,
                        description: rel.description
                    };
                }
            }
        }

        // Create template pack
        const packName = `Discovered Types - ${new Date().toISOString().split('T')[0]}`;
        
        const packResult = await this.db.query(
            `INSERT INTO kb.graph_template_packs (
                name, version, description, author,
                object_type_schemas, relationship_type_schemas, ui_configs,
                source, discovery_job_id, pending_review
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            RETURNING id`,
            [
                packName,
                '1.0.0',
                `Auto-discovered types from ${types.length} entities`,
                'Auto-Discovery System',
                JSON.stringify(objectTypeSchemas),
                JSON.stringify(relationshipTypeSchemas),
                JSON.stringify(uiConfigs),
                'discovered',
                jobId,
                true // Needs review before installation
            ]
        );

        return packResult.rows[0].id;
    }

    /**
     * Suggest an icon for a type based on its name
     */
    private suggestIconForType(typeName: string): string {
        const lower = typeName.toLowerCase();
        
        if (lower.includes('decision')) return 'check-circle';
        if (lower.includes('requirement')) return 'file-text';
        if (lower.includes('task')) return 'check-square';
        if (lower.includes('issue')) return 'alert-circle';
        if (lower.includes('risk')) return 'alert-triangle';
        if (lower.includes('person') || lower.includes('user')) return 'user';
        if (lower.includes('team') || lower.includes('group')) return 'users';
        if (lower.includes('component') || lower.includes('system')) return 'box';
        if (lower.includes('document')) return 'file';
        if (lower.includes('meeting')) return 'calendar';
        
        return 'circle'; // Default
    }

    /**
     * Generate a color for a type based on hash of name
     */
    private generateColorForType(typeName: string): string {
        const colors = [
            '#3B82F6', // Blue
            '#10B981', // Green
            '#F59E0B', // Amber
            '#EF4444', // Red
            '#8B5CF6', // Purple
            '#EC4899', // Pink
            '#06B6D4', // Cyan
            '#84CC16', // Lime
        ];

        let hash = 0;
        for (let i = 0; i < typeName.length; i++) {
            hash = typeName.charCodeAt(i) + ((hash << 5) - hash);
        }

        return colors[Math.abs(hash) % colors.length];
    }

    /**
     * Update job status
     */
    private async updateJobStatus(
        jobId: string,
        status: string,
        errorMessage: string | null
    ): Promise<void> {
        await this.db.query(
            `UPDATE kb.discovery_jobs 
             SET status = $1, error_message = $2, updated_at = now()
             WHERE id = $3`,
            [status, errorMessage, jobId]
        );
    }

    /**
     * Update job progress
     */
    private async updateProgress(
        jobId: string,
        progress: { current_step: number; total_steps: number; message: string }
    ): Promise<void> {
        await this.db.query(
            'UPDATE kb.discovery_jobs SET progress = $1, updated_at = now() WHERE id = $2',
            [JSON.stringify(progress), jobId]
        );
    }

    /**
     * Calculate total steps for progress tracking
     */
    private calculateTotalSteps(config: DiscoveryJobConfig): number {
        const numBatches = Math.ceil(config.document_ids.length / config.batch_size);
        return numBatches + 2; // batches + refinement + pack creation
    }

    /**
     * Get discovery job status
     */
    async getJobStatus(jobId: string): Promise<any> {
        const result = await this.db.query(
            `SELECT 
                id, status, progress, created_at, started_at, completed_at,
                error_message, discovered_types, discovered_relationships,
                template_pack_id
             FROM kb.discovery_jobs
             WHERE id = $1`,
            [jobId]
        );

        if (!result.rows.length) {
            throw new Error('Discovery job not found');
        }

        return result.rows[0];
    }

    /**
     * List discovery jobs for a project
     */
    async listJobsForProject(projectId: string): Promise<any[]> {
        const result = await this.db.query(
            `SELECT 
                id, status, progress, created_at, completed_at,
                template_pack_id
             FROM kb.discovery_jobs
             WHERE project_id = $1
             ORDER BY created_at DESC
             LIMIT 20`,
            [projectId]
        );

        return result.rows;
    }

    /**
     * Cancel a discovery job
     */
    async cancelJob(jobId: string): Promise<void> {
        await this.db.query(
            `UPDATE kb.discovery_jobs 
             SET status = 'cancelled', updated_at = now()
             WHERE id = $1 AND status IN ('pending', 'analyzing_documents', 'extracting_types', 'refining_schemas')`,
            [jobId]
        );
    }
}
```

### 2. LLM Provider Extensions

**File**: `apps/server/src/modules/extraction-jobs/llm/langchain-gemini.provider.ts`

Add these methods to the existing `LangChainGeminiProvider` class:

```typescript
/**
 * Discover types from document content
 */
async discoverTypes(
    prompt: string,
    content: string
): Promise<{ discovered_types: any[] }> {
    // Define schema for type discovery output
    const discoverySchema = z.object({
        discovered_types: z.array(z.object({
            type_name: z.string(),
            description: z.string(),
            confidence: z.number().min(0).max(1),
            schema: z.object({
                properties: z.record(z.any()),
                required: z.array(z.string()).optional()
            }),
            examples: z.array(z.any()),
            frequency: z.number(),
            context: z.string()
        }))
    });

    const structuredModel = this.model!.withStructuredOutput(discoverySchema as any, {
        name: 'discover_types',
    });

    const fullPrompt = `${prompt}\n\n**Documents to Analyze:**\n\n${content}`;

    const result = await structuredModel.invoke(fullPrompt);

    return result;
}

/**
 * Discover relationships between types
 */
async discoverRelationships(
    prompt: string,
    types: any[]
): Promise<{ relationships: any[] }> {
    const relationshipSchema = z.object({
        relationships: z.array(z.object({
            source_type: z.string(),
            target_type: z.string(),
            relation_type: z.string(),
            description: z.string(),
            confidence: z.number().min(0).max(1),
            cardinality: z.enum(['one-to-one', 'one-to-many', 'many-to-many'])
        }))
    });

    const structuredModel = this.model!.withStructuredOutput(relationshipSchema as any, {
        name: 'discover_relationships',
    });

    const typeContext = JSON.stringify(types, null, 2);
    const fullPrompt = `${prompt}\n\n**Type Definitions:**\n\n${typeContext}`;

    const result = await structuredModel.invoke(fullPrompt);

    return result;
}
```

### 3. Discovery Controller

**File**: `apps/server/src/modules/discovery-jobs/discovery-job.controller.ts`

```typescript
import { 
    Controller, Post, Get, Patch, Delete, Body, Param, Query, 
    Req, Logger, UseGuards 
} from '@nestjs/common';
import { Request } from 'express';
import { DiscoveryJobService, DiscoveryJobConfig } from './discovery-job.service';
import { JwtAuthGuard } from '@/modules/auth/jwt-auth.guard';
import { ScopesGuard } from '@/modules/auth/scopes.guard';
import { RequireScopes } from '@/modules/auth/scopes.decorator';

@Controller('discovery-jobs')
@UseGuards(JwtAuthGuard, ScopesGuard)
export class DiscoveryJobController {
    private readonly logger = new Logger(DiscoveryJobController.name);

    constructor(private readonly discoveryService: DiscoveryJobService) {}

    /**
     * Start a new discovery job
     * POST /discovery-jobs/projects/:projectId/start
     */
    @Post('projects/:projectId/start')
    @RequireScopes('discovery:write')
    async startDiscovery(
        @Req() req: Request,
        @Param('projectId') projectId: string,
        @Body() config: DiscoveryJobConfig
    ) {
        const orgId = req.headers['x-org-id'] as string;
        const tenantId = req.headers['x-tenant-id'] as string;

        this.logger.log(`[START DISCOVERY] Project ${projectId}, docs: ${config.document_ids.length}`);

        const result = await this.discoveryService.startDiscovery(
            projectId,
            orgId,
            tenantId,
            config
        );

        return result;
    }

    /**
     * Get discovery job status
     * GET /discovery-jobs/:jobId
     */
    @Get(':jobId')
    @RequireScopes('discovery:read')
    async getJobStatus(@Param('jobId') jobId: string) {
        return this.discoveryService.getJobStatus(jobId);
    }

    /**
     * List discovery jobs for a project
     * GET /discovery-jobs/projects/:projectId
     */
    @Get('projects/:projectId')
    @RequireScopes('discovery:read')
    async listJobs(@Param('projectId') projectId: string) {
        return this.discoveryService.listJobsForProject(projectId);
    }

    /**
     * Cancel a discovery job
     * DELETE /discovery-jobs/:jobId
     */
    @Delete(':jobId')
    @RequireScopes('discovery:write')
    async cancelJob(@Param('jobId') jobId: string) {
        await this.discoveryService.cancelJob(jobId);
        return { message: 'Discovery job cancelled' };
    }
}
```

### 4. Module Registration

**File**: `apps/server/src/modules/discovery-jobs/discovery-job.module.ts`

```typescript
import { Module } from '@nestjs/common';
import { DiscoveryJobService } from './discovery-job.service';
import { DiscoveryJobController } from './discovery-job.controller';
import { DatabaseModule } from '@/common/database/database.module';
import { ConfigModule } from '@/common/config/config.module';
import { ExtractionJobsModule } from '@/modules/extraction-jobs/extraction-jobs.module';
import { TemplatePacksModule } from '@/modules/template-packs/template-packs.module';

@Module({
    imports: [
        DatabaseModule,
        ConfigModule,
        ExtractionJobsModule,
        TemplatePacksModule
    ],
    providers: [DiscoveryJobService],
    controllers: [DiscoveryJobController],
    exports: [DiscoveryJobService]
})
export class DiscoveryJobModule {}
```

Add to `app.module.ts`:

```typescript
import { DiscoveryJobModule } from './modules/discovery-jobs/discovery-job.module';

@Module({
    imports: [
        // ... other modules
        DiscoveryJobModule,
    ],
})
export class AppModule {}
```

## Frontend Implementation

### 1. KB Purpose Editor in Auto-Extraction Settings

**File**: `apps/admin/src/pages/admin/pages/settings/project/auto-extraction.tsx`

Add after imports:

```typescript
import ReactMarkdown from 'react-markdown';
import { useState } from 'react';
```

Add state variable (around line 47):

```typescript
const [kbPurpose, setKbPurpose] = useState<string>('');
const [isEditingPurpose, setIsEditingPurpose] = useState(false);
const [showDiscoveryWizard, setShowDiscoveryWizard] = useState(false);
```

Add KB purpose card (insert around line 220, before the auto-extraction toggle):

```tsx
{/* KB Purpose Section */}
<div className="card bg-base-100 shadow-sm border border-base-300">
    <div className="card-body">
        <div className="flex items-center justify-between">
            <div>
                <h3 className="card-title text-lg">Knowledge Base Purpose</h3>
                <p className="text-sm text-base-content/70 mt-1">
                    Describe the domain, scope, and purpose of this knowledge base. 
                    Used by auto-discovery to understand context.
                </p>
            </div>
            <button
                className="btn btn-sm btn-ghost"
                onClick={() => setIsEditingPurpose(!isEditingPurpose)}
            >
                <Icon icon={isEditingPurpose ? 'lucide--x' : 'lucide--edit-2'} className="w-4 h-4" />
                {isEditingPurpose ? 'Cancel' : 'Edit'}
            </button>
        </div>

        {isEditingPurpose ? (
            <div className="mt-4">
                <textarea
                    className="textarea textarea-bordered w-full h-40 font-mono text-sm"
                    placeholder="Example:

This knowledge base tracks software architecture decisions, technical debt, and system components for our microservices platform. 

Key areas:
- Architecture Decision Records (ADRs)
- System components and dependencies
- Technical debt items
- Integration patterns
- Deployment configurations"
                    value={kbPurpose}
                    onChange={(e) => setKbPurpose(e.target.value)}
                />
                <div className="flex gap-2 mt-2">
                    <button
                        className="btn btn-primary btn-sm"
                        onClick={handleSaveKbPurpose}
                    >
                        <Icon icon="lucide--save" className="w-4 h-4" />
                        Save Purpose
                    </button>
                    <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => setIsEditingPurpose(false)}
                    >
                        Cancel
                    </button>
                </div>
            </div>
        ) : (
            <div className="prose prose-sm mt-4">
                {kbPurpose ? (
                    <ReactMarkdown>{kbPurpose}</ReactMarkdown>
                ) : (
                    <p className="text-base-content/50 italic">
                        No purpose defined yet. Click Edit to add one.
                    </p>
                )}
            </div>
        )}
    </div>
</div>
```

Add discovery button section (insert before "Additional Settings" section):

```tsx
{/* Auto-Discovery Section */}
<div className="card bg-base-100 shadow-sm border border-base-300">
    <div className="card-body">
        <h3 className="card-title text-lg">Auto-Discovery</h3>
        <p className="text-sm text-base-content/70 mt-1">
            Automatically discover object types and relationships from your documents 
            using AI analysis. Creates a custom template pack for review.
        </p>

        <div className="alert alert-info mt-4">
            <Icon icon="lucide--info" className="w-5 h-5" />
            <div className="text-sm">
                <strong>How it works:</strong>
                <ul className="mt-2 ml-4 list-disc">
                    <li>Analyzes multiple documents along with KB purpose</li>
                    <li>Identifies patterns and common entity types</li>
                    <li>Generates JSON schemas and relationships</li>
                    <li>Creates a template pack for your review</li>
                </ul>
            </div>
        </div>

        <button
            className="btn btn-primary mt-4"
            onClick={() => setShowDiscoveryWizard(true)}
            disabled={!kbPurpose}
        >
            <Icon icon="lucide--wand-2" className="w-4 h-4" />
            Run Auto-Discovery
        </button>

        {!kbPurpose && (
            <p className="text-sm text-warning mt-2">
                <Icon icon="lucide--alert-triangle" className="w-4 h-4 inline mr-1" />
                Please define KB Purpose first to enable auto-discovery
            </p>
        )}
    </div>
</div>
```

Add save handler:

```typescript
const handleSaveKbPurpose = async () => {
    try {
        await fetchJson(`/projects/${activeProjectId}`, {
            method: 'PATCH',
            body: JSON.stringify({ kb_purpose: kbPurpose })
        });

        setIsEditingPurpose(false);
        // Show success toast
    } catch (error) {
        console.error('Failed to save KB purpose:', error);
        // Show error toast
    }
};
```

### 2. Discovery Wizard Component

**File**: `apps/admin/src/components/organisms/DiscoveryWizard/DiscoveryWizard.tsx`

```typescript
import React, { useState, useEffect } from 'react';
import { Icon } from '@/components/atoms/Icon';
import { useApi } from '@/hooks/use-api';
import { useConfig } from '@/contexts/config';

interface DiscoveryWizardProps {
    isOpen: boolean;
    onClose: () => void;
    projectId: string;
    kbPurpose: string;
}

type WizardStep = 'select' | 'configure' | 'processing' | 'review' | 'complete';

export function DiscoveryWizard({ isOpen, onClose, projectId, kbPurpose }: DiscoveryWizardProps) {
    const { fetchJson } = useApi();
    const { activeProjectId } = useConfig();

    const [currentStep, setCurrentStep] = useState<WizardStep>('select');
    const [selectedDocuments, setSelectedDocuments] = useState<string[]>([]);
    const [config, setConfig] = useState({
        batch_size: 5,
        min_confidence: 0.7,
        include_relationships: true,
        max_iterations: 3
    });
    const [jobId, setJobId] = useState<string | null>(null);
    const [jobStatus, setJobStatus] = useState<any>(null);
    const [discoveredTypes, setDiscoveredTypes] = useState<any[]>([]);

    // Polling for job status
    useEffect(() => {
        if (jobId && currentStep === 'processing') {
            const interval = setInterval(async () => {
                try {
                    const status = await fetchJson(`/discovery-jobs/${jobId}`);
                    setJobStatus(status);

                    if (status.status === 'completed') {
                        setDiscoveredTypes(JSON.parse(status.discovered_types || '[]'));
                        setCurrentStep('review');
                        clearInterval(interval);
                    } else if (status.status === 'failed') {
                        clearInterval(interval);
                        // Show error
                    }
                } catch (error) {
                    console.error('Failed to fetch job status:', error);
                }
            }, 2000);

            return () => clearInterval(interval);
        }
    }, [jobId, currentStep, fetchJson]);

    const handleStartDiscovery = async () => {
        try {
            setCurrentStep('processing');

            const result = await fetchJson(`/discovery-jobs/projects/${projectId}/start`, {
                method: 'POST',
                body: JSON.stringify({
                    document_ids: selectedDocuments,
                    ...config
                })
            });

            setJobId(result.job_id);
        } catch (error) {
            console.error('Failed to start discovery:', error);
            setCurrentStep('configure');
        }
    };

    const renderStep = () => {
        switch (currentStep) {
            case 'select':
                return <SelectDocumentsStep 
                    selectedDocuments={selectedDocuments}
                    onSelect={setSelectedDocuments}
                    onNext={() => setCurrentStep('configure')}
                />;

            case 'configure':
                return <ConfigureStep
                    config={config}
                    onChange={setConfig}
                    onBack={() => setCurrentStep('select')}
                    onStart={handleStartDiscovery}
                />;

            case 'processing':
                return <ProcessingStep
                    jobStatus={jobStatus}
                />;

            case 'review':
                return <ReviewStep
                    discoveredTypes={discoveredTypes}
                    onEdit={(types) => setDiscoveredTypes(types)}
                    onComplete={() => setCurrentStep('complete')}
                />;

            case 'complete':
                return <CompleteStep
                    templatePackId={jobStatus?.template_pack_id}
                    onClose={onClose}
                />;
        }
    };

    if (!isOpen) return null;

    return (
        <div className="modal modal-open">
            <div className="modal-box max-w-4xl">
                <h3 className="font-bold text-lg flex items-center gap-2">
                    <Icon icon="lucide--wand-2" className="w-5 h-5" />
                    Auto-Discovery Wizard
                </h3>

                {/* Progress Steps */}
                <div className="steps steps-horizontal w-full mt-6">
                    <div className={`step ${currentStep !== 'select' ? 'step-primary' : ''}`}>
                        Select Documents
                    </div>
                    <div className={`step ${['configure', 'processing', 'review', 'complete'].includes(currentStep) ? 'step-primary' : ''}`}>
                        Configure
                    </div>
                    <div className={`step ${['processing', 'review', 'complete'].includes(currentStep) ? 'step-primary' : ''}`}>
                        Processing
                    </div>
                    <div className={`step ${['review', 'complete'].includes(currentStep) ? 'step-primary' : ''}`}>
                        Review
                    </div>
                    <div className={`step ${currentStep === 'complete' ? 'step-primary' : ''}`}>
                        Complete
                    </div>
                </div>

                {/* Step Content */}
                <div className="mt-8">
                    {renderStep()}
                </div>

                {/* Close Button */}
                {currentStep !== 'processing' && (
                    <button
                        className="btn btn-sm btn-circle btn-ghost absolute right-2 top-2"
                        onClick={onClose}
                    >
                        ✕
                    </button>
                )}
            </div>
        </div>
    );
}

// Sub-components for each step would go here...
// SelectDocumentsStep, ConfigureStep, ProcessingStep, ReviewStep, CompleteStep
```

## Configuration

### Environment Variables

Add to `.env`:

```bash
# Auto-Discovery Settings
DISCOVERY_ENABLED=true
DISCOVERY_MAX_DOCUMENTS=100
DISCOVERY_DEFAULT_BATCH_SIZE=5
DISCOVERY_MIN_CONFIDENCE=0.7
DISCOVERY_MAX_CONCURRENT_JOBS=3
```

### Security Scopes

Add to `SECURITY_SCOPES.md` and implement in `ScopesGuard`:

- `discovery:read` - View discovery jobs and results
- `discovery:write` - Start discovery jobs, edit discovered types
- `discovery:admin` - Cancel jobs, manage discovery settings

## Testing Strategy

### Unit Tests

1. **DiscoveryJobService**:
   - Test type extraction from documents
   - Test type merging and deduplication
   - Test schema inference
   - Test relationship discovery
   - Test template pack creation

2. **LLM Provider**:
   - Test `discoverTypes()` method
   - Test `discoverRelationships()` method
   - Test prompt construction

### Integration Tests

1. **End-to-End Discovery Flow**:
   - Create project with KB purpose
   - Upload test documents
   - Start discovery job
   - Wait for completion
   - Verify template pack created
   - Install pack
   - Verify types registered

2. **Discovery Job Lifecycle**:
   - Test job cancellation
   - Test error handling
   - Test progress tracking

### E2E Tests (Playwright)

1. **Discovery Wizard Flow**:
   - Open settings
   - Enter KB purpose
   - Click "Run Auto-Discovery"
   - Select documents
   - Configure parameters
   - Wait for processing
   - Review discovered types
   - Edit types
   - Create pack
   - Install pack

## User Documentation

### User Guide

**Title**: "Automatic Type Discovery - Quick Start"

**Content**:

1. **Define Your KB Purpose**
   - Go to Settings → Auto-Extraction
   - Click "Edit" on KB Purpose section
   - Describe your knowledge base domain and scope
   - Click "Save Purpose"

2. **Upload Documents**
   - Upload at least 5-10 documents that represent your domain
   - More documents = better discovery results

3. **Run Discovery**
   - Click "Run Auto-Discovery" button
   - Select which documents to analyze (or use all)
   - Configure:
     - Batch Size: How many docs to process at once (default: 5)
     - Min Confidence: Threshold for accepting types (default: 0.7)
     - Include Relationships: Also discover connections between types
   - Click "Start Discovery"

4. **Review Results**
   - Wait for processing (may take several minutes)
   - Review discovered types:
     - Type name
     - Description
     - Properties
     - Confidence score
     - Example instances
   - Edit types as needed:
     - Rename types
     - Add/remove properties
     - Adjust required fields
     - Edit descriptions

5. **Install Template Pack**
   - Click "Create Template Pack"
   - Pack appears in Template Packs tab with "Pending Review" badge
   - Preview pack details
   - Click "Install" to activate types
   - Types are now available for extraction and manual creation

### Tips for Best Results

- **Be Specific**: Write a detailed KB purpose with key concepts
- **Quality Over Quantity**: 10-20 high-quality documents better than 100 generic ones
- **Consistency**: Documents should use consistent terminology
- **Review Carefully**: LLM may suggest types you don't need - edit freely
- **Iterate**: You can run discovery multiple times as you add more documents

## Success Metrics

- **Discovery Accuracy**: % of discovered types that user keeps after review
- **Time Saved**: Compare manual type creation vs auto-discovery time
- **Template Pack Installations**: # of discovered packs actually installed
- **User Satisfaction**: Survey ratings after using discovery feature
- **Error Rate**: % of discovery jobs that fail vs complete successfully

## Future Enhancements

### Phase 2
- **Incremental Discovery**: Update existing packs with new types
- **Type Suggestions**: Suggest types during document upload
- **Cross-Project Learning**: Use discovered types from similar projects
- **Confidence Visualization**: Show evidence and reasoning for each type

### Phase 3
- **Active Learning**: Ask user questions to refine types
- **Type Hierarchies**: Discover inheritance relationships
- **Validation Rules**: Infer business rules from examples
- **Sample Data Generation**: Generate test data for discovered types

## Open Questions

1. **Handling Large Document Sets**: What if user wants to analyze 1000+ documents?
   - **Answer**: Implement sampling strategy, analyze representative subset

2. **Type Name Conflicts**: What if discovered type name already exists?
   - **Answer**: Append suffix like "(Discovered)", allow user to rename or merge

3. **Multi-Language Support**: How to handle documents in multiple languages?
   - **Answer**: Phase 2 - use multi-lingual LLM models

4. **Domain-Specific Templates**: Should we provide domain-specific discovery prompts?
   - **Answer**: Yes - create specialized prompts for common domains (software, legal, medical, etc.)

## Conclusion

The Auto-Discovery System represents a major productivity enhancement, reducing the time to set up a knowledge base from hours to minutes. By leveraging LLM capabilities, we can intelligently analyze documents and propose domain-specific schemas while keeping the user in control through review and editing workflows.

The phased approach ensures we can deliver core functionality quickly while planning for future sophistication.
