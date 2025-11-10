import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { DatabaseService } from '../../common/database/database.service';
import { AppConfigService } from '../../common/config/config.service';
import { DiscoveryLLMProvider } from './discovery-llm.provider';

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

interface TypeCandidate {
  id: string;
  type_name: string;
  description: string;
  confidence: number;
  inferred_schema: any; // jsonb - auto-parsed by PostgreSQL driver
  example_instances: any[]; // jsonb - auto-parsed by PostgreSQL driver
  frequency: number;
}

@Injectable()
export class DiscoveryJobService {
  private readonly logger = new Logger(DiscoveryJobService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly config: AppConfigService,
    private readonly llmProvider: DiscoveryLLMProvider
  ) {}
  /**
   * Start a new discovery job
   */
  async startDiscovery(
    projectId: string,
    orgId: string,
    config: DiscoveryJobConfig
  ): Promise<{ job_id: string }> {
    // Get KB purpose
    const projectResult = await this.db.query(
      'SELECT kb_purpose FROM kb.projects WHERE id = $1',
      [projectId]
    );

    if (!projectResult.rows.length) {
      throw new Error('Project not found');
    }

    const kbPurpose =
      projectResult.rows[0].kb_purpose ||
      'General purpose knowledge base for project documentation and knowledge management.';

    // Create discovery job
    const jobResult = await this.db.query(
      `INSERT INTO kb.discovery_jobs (
                organization_id, project_id,
                status, config, kb_purpose, progress
            ) VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING id`,
      [
        orgId,
        projectId,
        'pending',
        JSON.stringify(config),
        kbPurpose,
        JSON.stringify({
          current_step: 0,
          total_steps: this.calculateTotalSteps(config),
          message: 'Discovery job created, waiting to start...',
        }),
      ]
    );

    const jobId = jobResult.rows[0].id;

    // Start processing asynchronously
    this.processDiscoveryJob(jobId, projectId).catch((error) => {
      this.logger.error(
        `Discovery job ${jobId} failed: ${error.message}`,
        error.stack
      );
      this.updateJobStatus(jobId, 'failed', error.message);
    });

    return { job_id: jobId };
  }

  /**
   * Main discovery processing loop
   */
  private async processDiscoveryJob(
    jobId: string,
    projectId: string
  ): Promise<void> {
    this.logger.log(
      `[DISCOVERY] Starting job ${jobId} for project ${projectId}`
    );

    // Update status
    await this.updateJobStatus(jobId, 'analyzing_documents', null);
    await this.db.query(
      'UPDATE kb.discovery_jobs SET started_at = now() WHERE id = $1',
      [jobId]
    );

    // Get job config
    const jobResult = await this.db.query(
      'SELECT config, kb_purpose FROM kb.discovery_jobs WHERE id = $1',
      [jobId]
    );
    // Note: config is jsonb, so it's already parsed by PostgreSQL driver
    const config: DiscoveryJobConfig = jobResult.rows[0].config;
    const kbPurpose: string = jobResult.rows[0].kb_purpose;

    // Step 1: Batch documents
    const batches = await this.batchDocuments(
      config.document_ids,
      config.batch_size
    );
    this.logger.log(`[DISCOVERY] Processing ${batches.length} batches`);

    // Step 2: Extract types from each batch
    await this.updateJobStatus(jobId, 'extracting_types', null);
    let batchNumber = 1;
    let successfulBatches = 0;
    let failedBatches = 0;
    const batchErrors: string[] = [];

    for (const batch of batches) {
      await this.updateProgress(jobId, {
        current_step: batchNumber,
        total_steps: batches.length + 2, // batches + refinement + pack creation
        message: `Analyzing batch ${batchNumber}/${batches.length}...`,
      });

      try {
        await this.extractTypesFromBatch(jobId, batch, batchNumber, kbPurpose);
        successfulBatches++;
      } catch (error: any) {
        failedBatches++;
        const errorMsg = `Batch ${batchNumber}: ${error.message}`;
        batchErrors.push(errorMsg);
        this.logger.error(`[DISCOVERY] ${errorMsg}`, error.stack);
        // Continue with other batches
      }

      batchNumber++;
    }

    // If ALL batches failed, fail the entire discovery job
    if (failedBatches > 0 && successfulBatches === 0) {
      const errorSummary = `All ${failedBatches} batches failed. Errors:\n${batchErrors.join(
        '\n'
      )}`;
      this.logger.error(`[DISCOVERY] Job ${jobId} failed: ${errorSummary}`);
      await this.updateJobStatus(jobId, 'failed', errorSummary);
      throw new Error(`Discovery failed: ${errorSummary}`);
    }

    // Log partial success if some batches failed
    if (failedBatches > 0) {
      this.logger.warn(
        `[DISCOVERY] Job ${jobId}: ${successfulBatches}/${batches.length} batches succeeded, ` +
          `${failedBatches} failed: ${batchErrors.join('; ')}`
      );
    }

    // Step 3: Refine and merge types
    await this.updateJobStatus(jobId, 'refining_schemas', null);
    await this.updateProgress(jobId, {
      current_step: batches.length + 1,
      total_steps: batches.length + 2,
      message: 'Refining discovered types and merging duplicates...',
    });

    const refinedTypes = await this.refineAndMergeTypes(jobId, config);

    // Step 4: Discover relationships
    if (config.include_relationships && refinedTypes.length > 0) {
      const relationships = await this.discoverRelationships(
        jobId,
        refinedTypes
      );
      await this.db.query(
        'UPDATE kb.discovery_jobs SET discovered_relationships = $1 WHERE id = $2',
        [JSON.stringify(relationships), jobId]
      );
    }

    // Step 5: Create template pack
    if (refinedTypes.length === 0) {
      throw new Error(
        'Discovery completed but found no entity types. Cannot create template pack.'
      );
    }

    await this.updateJobStatus(jobId, 'creating_pack', null);
    await this.updateProgress(jobId, {
      current_step: batches.length + 2,
      total_steps: batches.length + 2,
      message: 'Creating template pack from discovered types...',
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

    this.logger.log(
      `[DISCOVERY] Job ${jobId} completed, pack ${templatePackId} created`
    );
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
    this.logger.log(
      `[DISCOVERY] Batch ${batchNumber}: Analyzing ${documentIds.length} documents`
    );

    // Get document content
    const docsResult = await this.db.query(
      'SELECT id, content, filename FROM kb.documents WHERE id = ANY($1)',
      [documentIds]
    );

    if (docsResult.rows.length === 0) {
      this.logger.warn(`[DISCOVERY] Batch ${batchNumber}: No documents found`);
      return;
    }

    const combinedContent = docsResult.rows
      .map((doc: any) => `### ${doc.filename || 'Untitled'}\n\n${doc.content}`)
      .join('\n\n---\n\n');

    // LLM prompt for type discovery
    const prompt = this.buildTypeDiscoveryPrompt(kbPurpose);

    this.logger.debug(
      `[DISCOVERY] Batch ${batchNumber}: Combined content length: ${combinedContent.length} chars`
    );

    // Call LLM provider to discover types from documents
    const documents = docsResult.rows.map((doc: any) => ({
      content: doc.content,
      filename: doc.filename || 'Untitled',
    }));

    this.logger.debug(
      `[DISCOVERY] Batch ${batchNumber}: Calling LLM with ${documents.length} documents`
    );
    this.logger.debug(
      `[DISCOVERY] Batch ${batchNumber}: KB Purpose: ${kbPurpose}`
    );

    const discoveredTypes = await this.llmProvider.discoverTypes({
      documents,
      kbPurpose,
    });

    this.logger.log(
      `[DISCOVERY] Batch ${batchNumber}: LLM discovered ${discoveredTypes.length} types`
    );

    if (discoveredTypes.length === 0) {
      this.logger.warn(
        `[DISCOVERY] Batch ${batchNumber}: No types discovered by LLM!`
      );
    } else {
      this.logger.debug(
        `[DISCOVERY] Batch ${batchNumber}: Discovered types: ${discoveredTypes
          .map((t) => t.type_name)
          .join(', ')}`
      );
    }

    // Store candidates in database
    for (const type of discoveredTypes) {
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
          JSON.stringify(type.inferred_schema),
          JSON.stringify(type.example_instances),
          type.example_instances.length, // Use example count as frequency estimate
          documentIds, // All documents in this batch contributed to discovery
          `Batch ${batchNumber}: Discovered from ${documents.length} documents`,
        ]
      );
    }

    this.logger.log(
      `[DISCOVERY] Batch ${batchNumber}: Stored ${discoveredTypes.length} type candidates`
    );
  }

  /**
   * Build LLM prompt for type discovery
   */
  private buildTypeDiscoveryPrompt(kbPurpose: string): string {
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
    const result = await this.db.query<TypeCandidate>(
      `SELECT * FROM kb.discovery_type_candidates 
             WHERE job_id = $1 AND status = 'candidate'
             ORDER BY confidence DESC`,
      [jobId]
    );

    const candidates = result.rows;

    if (candidates.length === 0) {
      this.logger.warn(`[DISCOVERY] No type candidates found for job ${jobId}`);
      return [];
    }

    this.logger.log(
      `[DISCOVERY] Refining ${candidates.length} type candidates`
    );

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

    this.logger.log(
      `[DISCOVERY] Refined to ${refinedTypes.length} final types`
    );

    return refinedTypes;
  }

  /**
   * Group similar type candidates using fuzzy matching
   */
  private groupSimilarTypes(candidates: TypeCandidate[]): TypeCandidate[][] {
    const groups: TypeCandidate[][] = [];
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
    const n1 = name1.toLowerCase().replace(/[^a-z]/g, '');
    const n2 = name2.toLowerCase().replace(/[^a-z]/g, '');

    if (n1 === n2) return 1.0;

    const maxLen = Math.max(n1.length, n2.length);
    if (maxLen === 0) return 0.0;

    const distance = this.levenshteinDistance(n1, n2);
    return 1 - distance / maxLen;
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
  private async mergeTypeSchemas(
    candidates: TypeCandidate[]
  ): Promise<DiscoveredType> {
    // Use the highest confidence name
    const bestCandidate = candidates.reduce((best, curr) =>
      curr.confidence > best.confidence ? curr : best
    );

    // Merge properties from all schemas
    const allProperties: Record<string, any> = {};
    const allRequired = new Set<string>();
    const allExamples: any[] = [];

    for (const candidate of candidates) {
      // Note: inferred_schema is jsonb, already parsed by PostgreSQL driver
      const schema = candidate.inferred_schema;
      Object.assign(allProperties, schema.properties || {});

      if (schema.required) {
        schema.required.forEach((prop: string) => allRequired.add(prop));
      }

      // Note: example_instances is jsonb, already parsed by PostgreSQL driver
      const examples = candidate.example_instances;
      allExamples.push(...examples);
    }

    // Calculate aggregate confidence (weighted average)
    const avgConfidence =
      candidates.reduce((sum, c) => sum + c.confidence, 0) / candidates.length;

    // Sum frequencies
    const totalFrequency = candidates.reduce(
      (sum, c) => sum + (c.frequency || 1),
      0
    );

    return {
      type_name: bestCandidate.type_name,
      description: bestCandidate.description || '',
      confidence: avgConfidence,
      properties: allProperties,
      required_properties: Array.from(allRequired),
      example_instances: allExamples.slice(0, 5), // Keep top 5 examples
      frequency: totalFrequency,
    };
  }

  /**
   * Discover relationships between types
   */
  private async discoverRelationships(
    jobId: string,
    types: DiscoveredType[]
  ): Promise<DiscoveredRelationship[]> {
    this.logger.log(
      `[DISCOVERY] Discovering relationships for ${types.length} types`
    );

    if (types.length < 2) {
      this.logger.log(
        '[DISCOVERY] Need at least 2 types to discover relationships'
      );
      return [];
    }

    try {
      // Get KB purpose from job
      const jobResult = await this.db.query(
        'SELECT kb_purpose FROM kb.discovery_jobs WHERE id = $1',
        [jobId]
      );

      const kbPurpose =
        jobResult.rows[0]?.kb_purpose || 'General knowledge base';

      // Get sample documents for context
      const docsResult = await this.db.query(
        'SELECT id, content, filename FROM kb.documents WHERE project_id = (SELECT project_id FROM kb.discovery_jobs WHERE id = $1) LIMIT 5',
        [jobId]
      );

      // Call LLM provider to discover relationships
      const discoveredRelationships =
        await this.llmProvider.discoverRelationships({
          types: types.map((t) => ({
            name: t.type_name,
            description: t.description,
          })),
          documents: docsResult.rows.map((doc: any) => ({
            content: doc.content,
            filename: doc.filename || 'Untitled',
          })),
          kbPurpose,
        });

      this.logger.log(
        `[DISCOVERY] LLM discovered ${discoveredRelationships.length} relationships`
      );

      // Transform to DiscoveredRelationship format
      const relationships: DiscoveredRelationship[] =
        discoveredRelationships.map((rel) => ({
          source_type: rel.from_type,
          target_type: rel.to_type,
          relation_type: rel.relationship_name,
          description: rel.description,
          confidence: rel.confidence,
          cardinality: 'one-to-many', // Default, could be enhanced in future
        }));

      return relationships;
    } catch (error: any) {
      this.logger.error(
        `[DISCOVERY] Relationship discovery failed: ${error.message}`,
        error.stack
      );
      // Return empty array on failure, don't block pack creation
      return [];
    }
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
    this.logger.log(
      `[DISCOVERY] Creating template pack from ${types.length} discovered types`
    );

    // Convert discovered types to template pack format
    const objectTypeSchemas: Record<string, any> = {};
    const uiConfigs: Record<string, any> = {};

    for (const type of types) {
      objectTypeSchemas[type.type_name] = {
        type: 'object',
        required: type.required_properties,
        properties: type.properties,
      };

      uiConfigs[type.type_name] = {
        icon: this.suggestIconForType(type.type_name),
        color: this.generateColorForType(type.type_name),
        displayName: type.type_name,
        description: type.description,
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
        // Note: discovered_relationships is jsonb, already parsed by PostgreSQL driver
        const relationships: DiscoveredRelationship[] =
          jobResult.rows[0].discovered_relationships;

        for (const rel of relationships) {
          relationshipTypeSchemas[rel.relation_type] = {
            sourceTypes: [rel.source_type],
            targetTypes: [rel.target_type],
            cardinality: rel.cardinality,
            description: rel.description,
          };
        }
      }
    }

    // Create template pack with unique name (include timestamp to avoid duplicates)
    const timestamp = new Date()
      .toISOString()
      .replace(/[:.]/g, '-')
      .slice(0, -5);
    const packName = `Discovered Types - ${timestamp}`;

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
        true, // Needs review before installation
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
    const numBatches = Math.ceil(
      config.document_ids.length / config.batch_size
    );
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
                discovered_types, discovered_relationships,
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

  /**
   * Finalize discovery and create/extend template pack
   */
  async finalizeDiscoveryAndCreatePack(
    jobId: string,
    projectId: string,
    orgId: string,
    packName: string,
    mode: 'create' | 'extend',
    existingPackId: string | undefined,
    includedTypes: Array<{
      type_name: string;
      description: string;
      properties: Record<string, any>;
      required_properties: string[];
      example_instances: any[];
      frequency: number;
    }>,
    includedRelationships: Array<{
      source_type: string;
      target_type: string;
      relation_type: string;
      description: string;
      cardinality: string;
    }>
  ): Promise<{ template_pack_id: string; message: string }> {
    this.logger.log(
      `[FINALIZE] Job ${jobId}, mode: ${mode}, types: ${includedTypes.length}, rels: ${includedRelationships.length}`
    );

    // Convert types and relationships to template pack format
    const objectTypeSchemas: Record<string, any> = {};
    const uiConfigs: Record<string, any> = {};

    for (const type of includedTypes) {
      objectTypeSchemas[type.type_name] = {
        type: 'object',
        required: type.required_properties || [],
        properties: type.properties || {},
      };

      uiConfigs[type.type_name] = {
        icon: this.suggestIconForType(type.type_name),
        color: this.generateColorForType(type.type_name),
        displayName: type.type_name,
        description: type.description,
      };
    }

    const relationshipTypeSchemas: Record<string, any> = {};
    for (const rel of includedRelationships) {
      relationshipTypeSchemas[rel.relation_type] = {
        sourceTypes: [rel.source_type],
        targetTypes: [rel.target_type],
        cardinality: rel.cardinality,
        description: rel.description,
      };
    }

    let templatePackId: string;

    if (mode === 'create') {
      // Create new template pack
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
          `Discovery pack with ${includedTypes.length} types and ${includedRelationships.length} relationships`,
          'Auto-Discovery System',
          JSON.stringify(objectTypeSchemas),
          JSON.stringify(relationshipTypeSchemas),
          JSON.stringify(uiConfigs),
          'discovered',
          jobId,
          false, // Ready to use immediately
        ]
      );
      templatePackId = packResult.rows[0].id;
      this.logger.log(`[FINALIZE] Created new pack: ${templatePackId}`);
    } else {
      // Extend existing pack
      if (!existingPackId) {
        throw new BadRequestException(
          'existingPackId is required for extend mode'
        );
      }

      // Get existing pack
      const existingPack = await this.db.query(
        'SELECT object_type_schemas, relationship_type_schemas, ui_configs FROM kb.graph_template_packs WHERE id = $1',
        [existingPackId]
      );

      if (!existingPack.rows.length) {
        throw new NotFoundException(
          `Template pack not found: ${existingPackId}`
        );
      }

      // Merge schemas
      const mergedObjectSchemas = {
        ...existingPack.rows[0].object_type_schemas,
        ...objectTypeSchemas,
      };
      const mergedRelSchemas = {
        ...existingPack.rows[0].relationship_type_schemas,
        ...relationshipTypeSchemas,
      };
      const mergedUiConfigs = {
        ...existingPack.rows[0].ui_configs,
        ...uiConfigs,
      };

      // Update existing pack
      await this.db.query(
        `UPDATE kb.graph_template_packs 
                 SET object_type_schemas = $1,
                     relationship_type_schemas = $2,
                     ui_configs = $3,
                     updated_at = now()
                 WHERE id = $4`,
        [
          JSON.stringify(mergedObjectSchemas),
          JSON.stringify(mergedRelSchemas),
          JSON.stringify(mergedUiConfigs),
          existingPackId,
        ]
      );
      templatePackId = existingPackId;
      this.logger.log(`[FINALIZE] Extended pack: ${templatePackId}`);
    }

    // Update discovery job with template pack ID
    await this.db.query(
      `UPDATE kb.discovery_jobs 
             SET template_pack_id = $1, 
                 status = 'completed',
                 completed_at = now(),
                 updated_at = now()
             WHERE id = $2`,
      [templatePackId, jobId]
    );

    return {
      template_pack_id: templatePackId,
      message:
        mode === 'create'
          ? `Created new template pack "${packName}" with ${includedTypes.length} types`
          : `Extended template pack with ${includedTypes.length} additional types`,
    };
  }
}
