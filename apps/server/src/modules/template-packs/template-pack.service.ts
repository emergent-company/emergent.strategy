import {
  Injectable,
  Logger,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, ILike } from 'typeorm';
import { DatabaseService } from '../../common/database/database.service';
import {
  CreateTemplatePackDto,
  AssignTemplatePackDto,
  UpdateTemplatePackAssignmentDto,
  AssignTemplatePackResponse,
  AvailableTemplateDto,
  ListTemplatePacksQueryDto,
} from './dto/template-pack.dto';
import {
  TemplatePackRow,
  ProjectTemplatePackRow,
  ProjectTypeRegistryRow,
} from './template-pack.types';
import { GraphTemplatePack, ProjectTemplatePack } from './entities';
import { createHash } from 'crypto';

@Injectable()
export class TemplatePackService {
  private readonly logger = new Logger(TemplatePackService.name);

  constructor(
    @InjectRepository(GraphTemplatePack)
    private readonly templatePackRepository: Repository<GraphTemplatePack>,
    @InjectRepository(ProjectTemplatePack)
    private readonly projectTemplatePackRepository: Repository<ProjectTemplatePack>,
    private readonly db: DatabaseService
  ) {}

  /**
   * Derive organization ID from project ID
   * Used for tenant context - organization_id is no longer required as a parameter
   */
  async getOrganizationIdFromProject(projectId: string): Promise<string> {
    const orgResult = await this.db.query<{ organization_id: string }>(
      'SELECT organization_id FROM kb.projects WHERE id = $1',
      [projectId]
    );

    if (!orgResult.rows[0]) {
      throw new BadRequestException(`Project ${projectId} not found`);
    }

    return orgResult.rows[0].organization_id;
  }

  /**
   * Create a new template pack in the global registry
   *
   * MIGRATED TO TYPEORM (Session 19)
   * Simple INSERT operation with calculated checksum
   */
  async createTemplatePack(
    dto: CreateTemplatePackDto
  ): Promise<TemplatePackRow> {
    // Calculate checksum if not provided
    const checksum = dto.checksum || this.calculateChecksum(dto);

    const saved = await this.templatePackRepository.save({
      name: dto.name,
      version: dto.version,
      description: dto.description || undefined,
      author: dto.author || undefined,
      license: dto.license || undefined,
      repository_url: dto.repository_url || undefined,
      documentation_url: dto.documentation_url || undefined,
      object_type_schemas: dto.object_type_schemas,
      relationship_type_schemas: dto.relationship_type_schemas || {},
      ui_configs: dto.ui_configs || {},
      extraction_prompts: dto.extraction_prompts || {},
      sql_views: dto.sql_views || [],
      signature: dto.signature || undefined,
      checksum,
    });

    this.logger.log(
      `Created template pack: ${dto.name}@${dto.version} (${saved.id})`
    );

    // Return as TemplatePackRow (convert Date to string)
    return {
      ...saved,
      published_at: saved.published_at.toISOString(),
      deprecated_at: saved.deprecated_at?.toISOString(),
      created_at: saved.created_at.toISOString(),
      updated_at: saved.updated_at.toISOString(),
    } as TemplatePackRow;
  }

  /**
   * Get template pack by ID
   *
   * MIGRATED TO TYPEORM (Session 19)
   * Simple SELECT by primary key
   */
  async getTemplatePackById(id: string): Promise<TemplatePackRow> {
    const pack = await this.templatePackRepository.findOne({
      where: { id },
    });

    if (!pack) {
      throw new NotFoundException(`Template pack not found: ${id}`);
    }

    return {
      ...pack,
      published_at: pack.published_at.toISOString(),
      deprecated_at: pack.deprecated_at?.toISOString(),
      created_at: pack.created_at.toISOString(),
      updated_at: pack.updated_at.toISOString(),
    } as TemplatePackRow;
  }

  /**
   * Get template pack by name and version
   *
   * MIGRATED TO TYPEORM (Session 19)
   * Simple SELECT with composite key (name + version)
   */
  async getTemplatePackByNameVersion(
    name: string,
    version: string
  ): Promise<TemplatePackRow> {
    const pack = await this.templatePackRepository.findOne({
      where: { name, version },
    });

    if (!pack) {
      throw new NotFoundException(
        `Template pack not found: ${name}@${version}`
      );
    }

    return {
      ...pack,
      published_at: pack.published_at.toISOString(),
      deprecated_at: pack.deprecated_at?.toISOString(),
      created_at: pack.created_at.toISOString(),
      updated_at: pack.updated_at.toISOString(),
    } as TemplatePackRow;
  }

  /**
   * List all available template packs
   *
   * MIGRATED TO TYPEORM (Session 19)
   * Pagination with filtering (deprecated, search)
   */
  async listTemplatePacks(query: ListTemplatePacksQueryDto): Promise<{
    packs: TemplatePackRow[];
    total: number;
    page: number;
    limit: number;
  }> {
    const skip = (query.page! - 1) * query.limit!;

    // Build where conditions
    const where: any = {};

    if (!query.include_deprecated) {
      where.deprecated_at = null;
    }

    // TypeORM doesn't support OR for ILIKE on multiple fields easily
    // Use QueryBuilder for search functionality
    const queryBuilder = this.templatePackRepository.createQueryBuilder('pack');

    if (!query.include_deprecated) {
      queryBuilder.andWhere('pack.deprecated_at IS NULL');
    }

    // Always exclude draft packs from the list (draft packs are for studio editing only)
    queryBuilder.andWhere('pack.draft = false');

    if (query.search) {
      queryBuilder.andWhere(
        '(pack.name ILIKE :search OR pack.description ILIKE :search)',
        { search: `%${query.search}%` }
      );
    }

    // Get total count
    const total = await queryBuilder.getCount();

    // Get paginated results
    const packs = await queryBuilder
      .orderBy('pack.published_at', 'DESC')
      .skip(skip)
      .take(query.limit!)
      .getMany();

    return {
      packs: packs.map(
        (pack) =>
          ({
            ...pack,
            published_at: pack.published_at.toISOString(),
            deprecated_at: pack.deprecated_at?.toISOString(),
            created_at: pack.created_at.toISOString(),
            updated_at: pack.updated_at.toISOString(),
          } as TemplatePackRow)
      ),
      total,
      page: query.page!,
      limit: query.limit!,
    };
  }

  /**
   * Assign template pack to a project
   *
   * ═══════════════════════════════════════════════════════════════
   * STRATEGIC SQL PRESERVED (Session 19)
   * ═══════════════════════════════════════════════════════════════
   *
   * WHY THIS CANNOT BE MIGRATED TO TYPEORM:
   *
   * 1. **Complex Multi-Step Transaction with Business Logic**
   *    - User lookup with fallback (zitadel_user_id or id)
   *    - Conflict detection (existing assignment)
   *    - Type conflict validation (existing types in registry)
   *    - Conditional type installation based on customizations
   *    - Dynamic INSERT loop for multiple type registry entries
   *    - TypeORM transactions cannot easily handle conditional multi-entity creation
   *
   * 2. **RLS Context Setup**
   *    - Requires explicit set_config() for org_id and project_id
   *    - Must execute BEFORE any RLS-protected queries
   *    - TypeORM has no native RLS support
   *
   * 3. **Dynamic Loop with Conditional Logic**
   *    - Iterates over typesToInstall array (filtered by customizations)
   *    - Each iteration:
   *      a) Extracts schema from template pack JSON
   *      b) Extracts ui_config from template pack JSON
   *      c) Extracts extraction_config from template pack JSON
   *      d) Inserts into project_object_type_registry
   *    - TypeORM save() would require loading/creating N entities
   *    - Raw SQL is dramatically more efficient for bulk operations
   *
   * 4. **Conflict Resolution Strategy**
   *    - Detects type conflicts via SELECT with ANY($2)
   *    - Builds conflict report with resolution metadata
   *    - Filters typesToInstall based on conflicts
   *    - Returns structured response with partial success
   *    - TypeORM QueryFailedError doesn't provide this granularity
   *
   * 5. **Atomic Multi-Entity Creation**
   *    - Creates 1 project_template_packs row
   *    - Creates N project_object_type_registry rows (variable count)
   *    - All-or-nothing semantics via transaction
   *    - TypeORM cascades cannot handle this cross-entity pattern
   *
   * QUERY PATTERN: Transaction + RLS + Dynamic Multi-INSERT + Conflict Detection
   * COMPLEXITY: Very High (20+ lines of transaction logic)
   * MAINTENANCE: Change when template schema evolution is needed
   *
   * ═══════════════════════════════════════════════════════════════
   */
  async assignTemplatePackToProject(
    projectId: string,
    orgId: string,
    userId: string,
    dto: AssignTemplatePackDto
  ): Promise<AssignTemplatePackResponse> {
    // Verify template pack exists
    const templatePack = await this.getTemplatePackById(dto.template_pack_id);

    // Look up actual user_profiles.id if userId is provided
    // userId might be a Zitadel user ID or a hashed UUID that doesn't exist in user_profiles
    let actualUserId: string | null = null;
    if (userId) {
      try {
        // Try to find user by zitadel_user_id or by id
        // Note: id is UUID, zitadel_user_id is text, so we need to handle type casting
        const userResult = await this.db.query(
          `SELECT id FROM core.user_profiles 
                     WHERE id::text = $1 OR zitadel_user_id = $1 
                     LIMIT 1`,
          [userId]
        );
        if (userResult.rows.length > 0) {
          actualUserId = userResult.rows[0].id;
        }
      } catch (err) {
        this.logger.warn(
          `Could not look up user ${userId}: ${
            err instanceof Error ? err.message : String(err)
          }`
        );
        // Continue with null - user doesn't exist yet
      }
    }

    // Check if already installed
    const existing = await this.db.query<ProjectTemplatePackRow>(
      `SELECT * FROM kb.project_template_packs 
             WHERE project_id = $1 AND template_pack_id = $2`,
      [projectId, dto.template_pack_id]
    );

    if (existing.rows.length > 0) {
      throw new ConflictException(
        `Template pack ${templatePack.name}@${templatePack.version} is already installed on this project`
      );
    }

    // Determine which types to install
    const allTypes = Object.keys(templatePack.object_type_schemas);
    const customizations = dto.customizations || {};

    let typesToInstall = allTypes;
    if (customizations.enabledTypes && customizations.enabledTypes.length > 0) {
      typesToInstall = customizations.enabledTypes.filter((t) =>
        allTypes.includes(t)
      );
    }

    if (
      customizations.disabledTypes &&
      customizations.disabledTypes.length > 0
    ) {
      typesToInstall = typesToInstall.filter(
        (t) => !customizations.disabledTypes!.includes(t)
      );
    }

    // Check for conflicts with existing types
    const conflicts: AssignTemplatePackResponse['conflicts'] = [];
    const existingTypes = await this.db.query<{ type: string }>(
      `SELECT type_name AS type FROM kb.project_object_type_registry 
             WHERE project_id = $1 AND type_name = ANY($2)`,
      [projectId, typesToInstall]
    );

    if (existingTypes.rows.length > 0) {
      const conflictingTypes = existingTypes.rows.map((r: any) => r.type);
      this.logger.warn(
        `Type conflicts detected for project ${projectId}: ${conflictingTypes.join(
          ', '
        )}`
      );

      // For now, skip conflicting types
      for (const type of conflictingTypes) {
        conflicts.push({
          type,
          issue: 'Type already exists in project',
          resolution: 'skipped',
        });
      }

      typesToInstall = typesToInstall.filter(
        (t) => !conflictingTypes.includes(t)
      );
    }

    // Begin transaction
    const client = await this.db.getClient();
    try {
      await client.query('BEGIN');

      // Set RLS context
      await client.query(
        `SELECT set_config('app.current_organization_id', $1, true)`,
        [orgId]
      );
      await client.query(
        `SELECT set_config('app.current_project_id', $1, true)`,
        [projectId]
      );

      // Create assignment record (pack is scoped to project, not org)
      const assignmentResult = await client.query<ProjectTemplatePackRow>(
        `INSERT INTO kb.project_template_packs (
                    project_id, template_pack_id,
                    installed_by, active, customizations
                ) VALUES ($1, $2, $3, $4, $5)
                RETURNING *`,
        [
          projectId,
          dto.template_pack_id,
          actualUserId, // Use looked-up user_profiles.id or null if user doesn't exist
          true,
          JSON.stringify(customizations),
        ]
      );

      // Register types in project type registry
      for (const type of typesToInstall) {
        const schema = templatePack.object_type_schemas[type];
        const uiConfig = templatePack.ui_configs[type] || {};
        const extractionConfig = templatePack.extraction_prompts[type] || {};

        await client.query(
          `INSERT INTO kb.project_object_type_registry (
                        project_id, type_name, source,
                        template_pack_id, json_schema, ui_config, extraction_config,
                        enabled, created_by
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [
            projectId,
            type,
            'template',
            dto.template_pack_id,
            JSON.stringify(schema),
            JSON.stringify(uiConfig),
            JSON.stringify(extractionConfig),
            true,
            actualUserId,
          ]
        );
      }

      await client.query('COMMIT');

      this.logger.log(
        `Assigned template pack ${templatePack.name}@${templatePack.version} to project ${projectId}. ` +
          `Installed ${typesToInstall.length} types, skipped ${conflicts.length} conflicts.`
      );

      return {
        success: true,
        assignment_id: assignmentResult.rows[0].id,
        installed_types: typesToInstall,
        disabled_types: customizations.disabledTypes || [],
        conflicts: conflicts.length > 0 ? conflicts : undefined,
      };
    } catch (error) {
      await client.query('ROLLBACK');
      this.logger.error(
        `Failed to assign template pack to project ${projectId}:`,
        error
      );
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get installed template packs for a project
   *
   * ═══════════════════════════════════════════════════════════════
   * STRATEGIC SQL PRESERVED (Session 19)
   * ═══════════════════════════════════════════════════════════════
   *
   * WHY THIS CANNOT BE MIGRATED TO TYPEORM:
   *
   * 1. **Custom JSON Aggregation with row_to_json()**
   *    - Uses row_to_json(tp.*) to nest entire template_pack as JSON object
   *    - Returns flattened structure: {assignment fields + template_pack: {...}}
   *    - TypeORM relations would require:
   *      a) Eager loading (performance hit)
   *      b) Manual transformation to match API contract
   *    - PostgreSQL's row_to_json is far more efficient
   *
   * 2. **Dynamic Object-to-Array Transformation**
   *    - Post-processes object_type_schemas (object) → object_types (array of keys)
   *    - Adds object_types: string[] for frontend convenience
   *    - This is a VIEW-LAYER concern that doesn't belong in entities
   *    - TypeORM would require:
   *      a) Virtual column (not supported for complex logic)
   *      b) Post-load transformer (messy, not type-safe)
   *      c) Manual map() after query (duplicate code)
   *
   * 3. **Complex Projection**
   *    - Returns: ProjectTemplatePackRow & { template_pack: TemplatePackRow }
   *    - This is a JOIN projection, not a relation
   *    - TypeORM @ManyToOne would return entity instance, not plain object
   *    - API contract expects plain objects with specific shape
   *
   * QUERY PATTERN: JOIN + Custom JSON Aggregation + Post-Processing
   * COMPLEXITY: Medium (custom projection + transformation)
   * MAINTENANCE: Change only if API response shape changes
   *
   * ═══════════════════════════════════════════════════════════════
   */
  async getProjectTemplatePacks(
    projectId: string
  ): Promise<
    Array<ProjectTemplatePackRow & { template_pack: TemplatePackRow }>
  > {
    // Derive org ID for tenant context (not used in query but available if needed)
    await this.getOrganizationIdFromProject(projectId);

    const result = await this.db.query<
      ProjectTemplatePackRow & { template_pack: TemplatePackRow }
    >(
      `SELECT 
                ptp.*,
                row_to_json(tp.*) as template_pack
            FROM kb.project_template_packs ptp
            JOIN kb.graph_template_packs tp ON ptp.template_pack_id = tp.id
            WHERE ptp.project_id = $1 AND ptp.active = true
            ORDER BY ptp.installed_at DESC`,
      [projectId]
    );

    // Transform object_type_schemas object into object_types array for frontend
    // Also transform relationship_type_schemas to relationship_types array
    // And attach relationships to each object type (both outgoing and incoming)
    return result.rows.map((row) => {
      const relationshipSchemas =
        row.template_pack.relationship_type_schemas || {};
      const relationshipTypes = Object.keys(relationshipSchemas);

      // Build maps of object type -> outgoing and incoming relationships
      const outgoingRelationships: Record<
        string,
        Array<{
          type: string;
          label?: string;
          description?: string;
          targetTypes: string[];
        }>
      > = {};
      const incomingRelationships: Record<
        string,
        Array<{
          type: string;
          label?: string;
          inverseLabel?: string;
          description?: string;
          sourceTypes: string[];
        }>
      > = {};

      Object.entries(relationshipSchemas).forEach(
        ([relType, schema]: [string, any]) => {
          const sourceTypes = schema.fromTypes || schema.sourceTypes || [];
          const targetTypes = schema.toTypes || schema.targetTypes || [];

          // Outgoing: source -> target
          sourceTypes.forEach((sourceType: string) => {
            if (!outgoingRelationships[sourceType]) {
              outgoingRelationships[sourceType] = [];
            }
            outgoingRelationships[sourceType].push({
              type: relType,
              label: schema.label,
              description: schema.description,
              targetTypes,
            });
          });

          // Incoming: target <- source
          targetTypes.forEach((targetType: string) => {
            if (!incomingRelationships[targetType]) {
              incomingRelationships[targetType] = [];
            }
            incomingRelationships[targetType].push({
              type: relType,
              label: schema.label,
              inverseLabel: schema.inverseLabel,
              description: schema.description,
              sourceTypes,
            });
          });
        }
      );

      return {
        ...row,
        template_pack: {
          ...row.template_pack,
          object_types: row.template_pack.object_type_schemas
            ? Object.entries(row.template_pack.object_type_schemas).map(
                ([type, schema]: [string, any]) => ({
                  type,
                  description: schema?.description,
                  properties: schema?.properties,
                  required: schema?.required,
                  examples: schema?.examples,
                  outgoingRelationships: outgoingRelationships[type] || [],
                  incomingRelationships: incomingRelationships[type] || [],
                })
              )
            : [],
          relationship_types: relationshipTypes,
          relationship_count: relationshipTypes.length,
        },
      };
    });
  }

  /**
   * Get available templates for a project (with installation status)
   *
   * ═══════════════════════════════════════════════════════════════
   * STRATEGIC SQL PRESERVED (Session 19)
   * ═══════════════════════════════════════════════════════════════
   *
   * WHY THIS CANNOT BE MIGRATED TO TYPEORM:
   *
   * 1. **Multi-Query Aggregation Pattern**
   *    - Query 1: All non-deprecated template packs
   *    - Query 2: Installed pack IDs for this project
   *    - Query 3: Object counts per type for this project (GROUP BY)
   *    - All results merged in-memory to build response
   *    - TypeORM would require 3 separate repository calls + manual merge
   *
   * 2. **Set-Based Membership Check**
   *    - Builds Set<string> of installedIds for O(1) lookup
   *    - Adds `installed: boolean` flag per pack based on Set.has()
   *    - TypeORM subqueries for this pattern are inefficient:
   *      SELECT *, (SELECT COUNT(*) FROM ... WHERE id = pack.id) as installed
   *    - Current approach: 2 fast queries + in-memory join
   *
   * 3. **Complex Response Shape Construction**
   *    - Maps object_type_schemas (object) to object_types (array of objects)
   *    - Each object type includes:
   *      a) type: string
   *      b) description: string (from schema.description)
   *      c) sample_count: number (from typeCounts Map)
   *    - Also extracts relationship_types from relationship_type_schemas
   *    - Adds derived fields: relationship_count, compatible, installed
   *    - This is complex view-layer logic that doesn't belong in entities
   *
   * 4. **Performance Optimization**
   *    - Single GROUP BY query for all type counts (1 query vs N queries)
   *    - Builds Map<type, count> for O(1) lookup during transformation
   *    - TypeORM would require:
   *      a) Separate query per type (N queries) OR
   *      b) Complex QueryBuilder with leftJoin + groupBy (messy)
   *    - Current approach is optimal
   *
   * QUERY PATTERN: Multi-Query Aggregation + In-Memory Join + Complex Transformation
   * COMPLEXITY: High (3 queries + business logic + response shaping)
   * MAINTENANCE: Change if AvailableTemplateDto shape changes
   *
   * ═══════════════════════════════════════════════════════════════
   */
  async getAvailableTemplatesForProject(
    projectId: string
  ): Promise<AvailableTemplateDto[]> {
    // Derive org ID for tenant context (not used in query but available if needed)
    await this.getOrganizationIdFromProject(projectId);

    // Get all non-draft, non-deprecated template packs
    const packsResult = await this.db.query<TemplatePackRow>(
      `SELECT * FROM kb.graph_template_packs 
             WHERE deprecated_at IS NULL AND draft = false
             ORDER BY published_at DESC`
    );

    // Get installed packs for this project (both active and inactive)
    // Need to track both installed status and active status
    const installedResult = await this.db.query<{
      id: string;
      template_pack_id: string;
      active: boolean;
    }>(
      `SELECT id, template_pack_id, active FROM kb.project_template_packs 
             WHERE project_id = $1`,
      [projectId]
    );
    const installedIds = new Set(
      installedResult.rows.map((r: any) => r.template_pack_id)
    );
    const activeStatusMap = new Map(
      installedResult.rows.map((r: any) => [r.template_pack_id, r.active])
    );
    const assignmentIdMap = new Map(
      installedResult.rows.map((r: any) => [r.template_pack_id, r.id])
    );

    // Get object counts per type for this project
    const countsResult = await this.db.query<{ type: string; count: string }>(
      `SELECT type, COUNT(*) as count 
             FROM kb.graph_objects 
             WHERE project_id = $1 AND deleted_at IS NULL
             GROUP BY type`,
      [projectId]
    );
    const typeCounts = new Map(
      countsResult.rows.map((r: any) => [r.type, parseInt(r.count)])
    );

    // Build response
    return packsResult.rows.map((pack) => {
      const relationshipSchemas = pack.relationship_type_schemas || {};
      const relationshipTypes = Object.keys(relationshipSchemas);

      // Build maps of object type -> outgoing and incoming relationships
      const outgoingRelationships: Record<
        string,
        Array<{
          type: string;
          label?: string;
          description?: string;
          targetTypes: string[];
        }>
      > = {};
      const incomingRelationships: Record<
        string,
        Array<{
          type: string;
          label?: string;
          inverseLabel?: string;
          description?: string;
          sourceTypes: string[];
        }>
      > = {};

      Object.entries(relationshipSchemas).forEach(
        ([relType, schema]: [string, any]) => {
          const sourceTypes = schema.fromTypes || schema.sourceTypes || [];
          const targetTypes = schema.toTypes || schema.targetTypes || [];

          // Outgoing: source -> target
          sourceTypes.forEach((sourceType: string) => {
            if (!outgoingRelationships[sourceType]) {
              outgoingRelationships[sourceType] = [];
            }
            outgoingRelationships[sourceType].push({
              type: relType,
              label: schema.label,
              description: schema.description,
              targetTypes,
            });
          });

          // Incoming: target <- source
          targetTypes.forEach((targetType: string) => {
            if (!incomingRelationships[targetType]) {
              incomingRelationships[targetType] = [];
            }
            incomingRelationships[targetType].push({
              type: relType,
              label: schema.label,
              inverseLabel: schema.inverseLabel,
              description: schema.description,
              sourceTypes,
            });
          });
        }
      );

      const isInstalled = installedIds.has(pack.id);
      const response: any = {
        id: pack.id,
        name: pack.name,
        version: pack.version,
        description: pack.description,
        author: pack.author,
        source: pack.source,
        object_types: Object.entries(pack.object_type_schemas).map(
          ([type, schema]: [string, any]) => ({
            type,
            description: schema.description,
            properties: schema.properties,
            required: schema.required,
            examples: schema.examples,
            sample_count: typeCounts.get(type) || 0,
            outgoingRelationships: outgoingRelationships[type] || [],
            incomingRelationships: incomingRelationships[type] || [],
          })
        ),
        relationship_types: relationshipTypes,
        relationship_count: relationshipTypes.length,
        installed: isInstalled,
        compatible: true, // TODO: Add compatibility check
        published_at: pack.published_at,
        deprecated_at: pack.deprecated_at,
      };

      // Add active status and assignment_id only if installed
      if (isInstalled) {
        response.active = activeStatusMap.get(pack.id) || false;
        response.assignment_id = assignmentIdMap.get(pack.id);
      }

      return response;
    });
  }

  /**
   * Update template pack assignment
   *
   * ═══════════════════════════════════════════════════════════════
   * STRATEGIC SQL PRESERVED (Session 19)
   * ═══════════════════════════════════════════════════════════════
   *
   * WHY THIS CANNOT BE MIGRATED TO TYPEORM:
   *
   * 1. **Dynamic UPDATE Builder**
   *    - Conditionally builds SET clauses based on provided fields
   *    - Only updates fields present in DTO (partial update)
   *    - Manually constructs: SET active = $1, customizations = $2, updated_at = now()
   *    - TypeORM save() would:
   *      a) Require loading entity first (extra SELECT)
   *      b) Update ALL fields (not just changed ones)
   *      c) Not support conditional SET clauses
   *
   * 2. **RLS Context Setup**
   *    - Requires set_config() for org_id and project_id BEFORE UPDATE
   *    - RLS policies on project_template_packs enforce project_id match
   *    - TypeORM has no native RLS support
   *
   * 3. **Transaction with Validation**
   *    - Gets current assignment to verify existence
   *    - Conditionally updates based on DTO fields
   *    - Returns updated row via RETURNING *
   *    - TypeORM update() doesn't return entity, requires additional findOne()
   *
   * 4. **Performance Optimization**
   *    - No UPDATE if no fields changed (early return)
   *    - Single UPDATE query with RETURNING (1 query vs 2)
   *    - TypeORM would require: findOne + save = 2 queries
   *
   * QUERY PATTERN: Transaction + RLS + Dynamic UPDATE + Validation
   * COMPLEXITY: Medium (conditional UPDATE builder)
   * MAINTENANCE: Change if UpdateTemplatePackAssignmentDto gains new fields
   *
   * ═══════════════════════════════════════════════════════════════
   */
  async updateTemplatePackAssignment(
    assignmentId: string,
    projectId: string,
    orgId: string,
    dto: UpdateTemplatePackAssignmentDto
  ): Promise<ProjectTemplatePackRow> {
    const client = await this.db.getClient();
    try {
      await client.query('BEGIN');

      // Set RLS context
      await client.query(
        `SELECT set_config('app.current_organization_id', $1, true)`,
        [orgId]
      );
      await client.query(
        `SELECT set_config('app.current_project_id', $1, true)`,
        [projectId]
      );

      // Get current assignment
      const current = await client.query<ProjectTemplatePackRow>(
        `SELECT * FROM kb.project_template_packs WHERE id = $1`,
        [assignmentId]
      );

      if (current.rows.length === 0) {
        throw new NotFoundException(
          `Template pack assignment not found: ${assignmentId}`
        );
      }

      // Update assignment
      const updates: string[] = [];
      const params: any[] = [];
      let paramIndex = 1;

      if (dto.active !== undefined) {
        updates.push(`active = $${paramIndex++}`);
        params.push(dto.active);
      }

      if (dto.customizations !== undefined) {
        updates.push(`customizations = $${paramIndex++}`);
        params.push(JSON.stringify(dto.customizations));
      }

      if (updates.length > 0) {
        updates.push(`updated_at = now()`);
        params.push(assignmentId);

        const result = await client.query<ProjectTemplatePackRow>(
          `UPDATE kb.project_template_packs 
                     SET ${updates.join(', ')}
                     WHERE id = $${paramIndex}
                     RETURNING *`,
          params
        );

        await client.query('COMMIT');

        this.logger.log(`Updated template pack assignment ${assignmentId}`);
        return result.rows[0];
      }

      await client.query('COMMIT');
      return current.rows[0];
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Uninstall template pack from project
   *
   * ═══════════════════════════════════════════════════════════════
   * STRATEGIC SQL PRESERVED (Session 19)
   * ═══════════════════════════════════════════════════════════════
   *
   * WHY THIS CANNOT BE MIGRATED TO TYPEORM:
   *
   * 1. **Business Validation with Complex JOIN**
   *    - Validates no objects exist using types from this template
   *    - Query joins:
   *      graph_objects → project_object_type_registry → template_pack_id
   *    - Counts objects across multiple types in single query
   *    - TypeORM would require:
   *      a) Load all type registry entries for template
   *      b) Query graph_objects for each type (N queries)
   *      c) Sum counts manually
   *    - Current: 1 efficient JOIN vs N+1 queries
   *
   * 2. **Atomic Multi-DELETE Transaction**
   *    - Validates count (business logic)
   *    - Deletes from project_object_type_registry (N rows)
   *    - Deletes from project_template_packs (1 row)
   *    - All-or-nothing with explicit transaction
   *    - TypeORM cascades don't work for this pattern:
   *      - Cascade only works on relations
   *      - This is a reverse lookup (types → template)
   *
   * 3. **RLS Context Setup**
   *    - Requires set_config() for org_id and project_id
   *    - All queries execute with RLS enforcement
   *    - TypeORM has no native RLS support
   *
   * 4. **Error Handling with Domain Context**
   *    - Throws BadRequestException with object count
   *    - Provides actionable error message
   *    - TypeORM foreign key violations would give generic error
   *
   * QUERY PATTERN: Transaction + RLS + Complex JOIN Validation + Multi-DELETE
   * COMPLEXITY: High (validation + multi-entity deletion)
   * MAINTENANCE: Change if uninstall business rules change
   *
   * ═══════════════════════════════════════════════════════════════
   */
  async uninstallTemplatePackFromProject(
    assignmentId: string,
    projectId: string,
    orgId: string
  ): Promise<void> {
    const client = await this.db.getClient();
    try {
      await client.query('BEGIN');

      // Set RLS context
      await client.query(
        `SELECT set_config('app.current_organization_id', $1, true)`,
        [orgId]
      );
      await client.query(
        `SELECT set_config('app.current_project_id', $1, true)`,
        [projectId]
      );

      // Get assignment
      const assignmentResult = await client.query<ProjectTemplatePackRow>(
        `SELECT * FROM kb.project_template_packs WHERE id = $1`,
        [assignmentId]
      );

      if (assignmentResult.rows.length === 0) {
        throw new NotFoundException(
          `Template pack assignment not found: ${assignmentId}`
        );
      }

      const assignment = assignmentResult.rows[0];

      // Check if any objects exist with types from this template
      const objectsResult = await client.query<{ count: string }>(
        `SELECT COUNT(*) as count 
                 FROM kb.graph_objects go
                 JOIN kb.project_object_type_registry ptr ON go.type = ptr.type_name AND go.project_id = ptr.project_id
                 WHERE ptr.template_pack_id = $1 AND go.project_id = $2 AND go.deleted_at IS NULL`,
        [assignment.template_pack_id, projectId]
      );

      const objectCount = parseInt(objectsResult.rows[0].count);
      if (objectCount > 0) {
        throw new BadRequestException(
          `Cannot uninstall template pack: ${objectCount} objects still exist using types from this template. ` +
            `Delete or migrate these objects first.`
        );
      }

      // Delete type registry entries
      await client.query(
        `DELETE FROM kb.project_object_type_registry 
                 WHERE template_pack_id = $1 AND project_id = $2`,
        [assignment.template_pack_id, projectId]
      );

      // Delete assignment
      await client.query(
        `DELETE FROM kb.project_template_packs WHERE id = $1`,
        [assignmentId]
      );

      await client.query('COMMIT');

      this.logger.log(
        `Uninstalled template pack assignment ${assignmentId} from project ${projectId}`
      );
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Delete a template pack permanently
   * Only allows deletion of non-system packs that are not currently installed
   *
   * ═══════════════════════════════════════════════════════════════
   * STRATEGIC SQL PRESERVED (Session 19)
   * ═══════════════════════════════════════════════════════════════
   *
   * WHY THIS CANNOT BE MIGRATED TO TYPEORM:
   *
   * 1. **Cross-Organization Validation**
   *    - Template packs are GLOBAL resources (no org_id column)
   *    - Must check installations across ALL organizations
   *    - Query: SELECT COUNT(*) FROM project_template_packs WHERE template_pack_id = $1
   *    - This is cross-org query that bypasses RLS
   *    - TypeORM would require:
   *      a) Set RLS context per org (inefficient)
   *      b) Load all project_template_packs (memory intensive)
   *      c) Count manually (slow)
   *
   * 2. **Business Rule Enforcement**
   *    - Prevents deletion of system packs (source = 'system')
   *    - Prevents deletion if installed in ANY project
   *    - Both checks are business logic, not database constraints
   *    - TypeORM would scatter this logic across multiple service calls
   *
   * 3. **Transaction with Multiple Validation Steps**
   *    - Check pack exists
   *    - Check source != 'system'
   *    - Check installCount = 0 (cross-org)
   *    - Delete pack
   *    - TypeORM would require 4 separate operations
   *
   * 4. **RLS Context for Read, Not for Delete**
   *    - Sets org_id for checking project assignments (RLS-protected)
   *    - But template pack DELETE is global (not RLS-protected)
   *    - This mixed RLS pattern is complex in TypeORM
   *
   * QUERY PATTERN: Transaction + Cross-Org Validation + Global DELETE
   * COMPLEXITY: Medium (multi-step validation + global operation)
   * MAINTENANCE: Change if template pack deletion rules change
   *
   * ═══════════════════════════════════════════════════════════════
   */
  async deleteTemplatePack(packId: string, orgId: string): Promise<void> {
    const client = await this.db.getClient();

    try {
      await client.query('BEGIN');

      // Set RLS context for checking project assignments
      await client.query(
        `SELECT set_config('app.current_organization_id', $1, true)`,
        [orgId]
      );

      // Check if template pack exists and get its details
      // Template packs are global resources, not org-scoped
      const packResult = await client.query(
        `SELECT id, name, source FROM kb.graph_template_packs WHERE id = $1`,
        [packId]
      );

      if (packResult.rows.length === 0) {
        throw new BadRequestException('Template pack not found');
      }

      const pack = packResult.rows[0];

      // Prevent deletion of system packs
      if (pack.source === 'system') {
        throw new BadRequestException('Cannot delete built-in template packs');
      }

      // Check if pack is currently installed in any project (across all orgs)
      const assignmentResult = await client.query(
        `SELECT COUNT(*) as count FROM kb.project_template_packs 
                 WHERE template_pack_id = $1`,
        [packId]
      );

      const installCount = parseInt(assignmentResult.rows[0].count, 10);
      if (installCount > 0) {
        throw new BadRequestException(
          `Cannot delete template pack "${pack.name}" because it is currently installed in ${installCount} project(s). Please uninstall it from all projects first.`
        );
      }

      // Delete the template pack (global resource)
      await client.query(`DELETE FROM kb.graph_template_packs WHERE id = $1`, [
        packId,
      ]);

      await client.query('COMMIT');

      this.logger.log(`Deleted template pack ${packId} (${pack.name})`);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Calculate checksum for template pack content
   */
  private calculateChecksum(dto: CreateTemplatePackDto): string {
    const content = JSON.stringify({
      object_type_schemas: dto.object_type_schemas,
      relationship_type_schemas: dto.relationship_type_schemas,
      ui_configs: dto.ui_configs,
      extraction_prompts: dto.extraction_prompts,
      sql_views: dto.sql_views,
    });
    return createHash('sha256').update(content).digest('hex');
  }

  /**
   * Get compiled object type schemas from all installed packs for a project
   *
   * ═══════════════════════════════════════════════════════════════
   * STRATEGIC SQL PRESERVED (Session 19)
   * ═══════════════════════════════════════════════════════════════
   *
   * WHY THIS CANNOT BE MIGRATED TO TYPEORM:
   *
   * 1. **Multi-Pack Schema Merging Logic**
   *    - Loads all active template packs for project
   *    - Merges object_type_schemas from all packs
   *    - Later packs override earlier ones for same type
   *    - Tracks schema provenance with _sources array
   *    - This is complex in-memory aggregation logic
   *
   * 2. **Dynamic IN Clause with Array**
   *    - Builds IN (uuid1, uuid2, ...) dynamically from assignment IDs
   *    - Uses array.map for placeholder generation: $1, $2, $3
   *    - TypeORM In() operator handles this, BUT...
   *
   * 3. **Complex JSON Merge Algorithm**
   *    - For each pack:
   *      - For each type in pack.object_type_schemas:
   *        - If type exists: merge with existing + append to _sources
   *        - If type new: create with _sources
   *    - This is VIEW-LAYER logic for frontend schema consumption
   *    - Not database operation - pure business logic
   *
   * 4. **Performance Consideration**
   *    - Could use TypeORM for queries (2 queries)
   *    - But merge logic is JavaScript, not SQL
   *    - Keeping as strategic SQL for consistency
   *    - If TypeORM used: still need manual merge loop
   *
   * DECISION: COULD be migrated to TypeORM queries + manual merge
   * BUT: Keeping as strategic SQL because:
   *  - Dynamic IN clause is cleaner as raw SQL
   *  - Merge logic is JavaScript regardless
   *  - Not worth splitting queries vs logic
   *
   * QUERY PATTERN: Multi-Query + Dynamic IN + In-Memory JSON Merge
   * COMPLEXITY: Medium (straightforward queries + complex merge)
   * MAINTENANCE: Change if schema merge rules change
   *
   * ═══════════════════════════════════════════════════════════════
   */
  async getCompiledObjectTypesForProject(
    projectId: string
  ): Promise<Record<string, any>> {
    // Derive org ID for tenant context (not used in query but available if needed)
    await this.getOrganizationIdFromProject(projectId);

    // Get all active template pack assignments for this project
    const assignmentsResult = await this.db.query<ProjectTemplatePackRow>(
      `SELECT * FROM kb.project_template_packs 
             WHERE project_id = $1 AND active = true`,
      [projectId]
    );

    if (assignmentsResult.rows.length === 0) {
      return {};
    }

    // Get the full template packs
    const packIds = assignmentsResult.rows.map((a) => a.template_pack_id);
    const placeholders = packIds.map((_, i) => `$${i + 1}`).join(', ');
    const packsResult = await this.db.query<TemplatePackRow>(
      `SELECT * FROM kb.graph_template_packs 
             WHERE id IN (${placeholders})`,
      packIds
    );

    // Merge all object_type_schemas from all packs
    const compiledSchemas: Record<string, any> = {};

    for (const pack of packsResult.rows) {
      const schemas = pack.object_type_schemas || {};
      for (const [typeName, schema] of Object.entries(schemas)) {
        // If type already exists, merge properties
        if (compiledSchemas[typeName]) {
          // Later packs override earlier ones for same type
          compiledSchemas[typeName] = {
            ...compiledSchemas[typeName],
            ...schema,
            _sources: [
              ...(compiledSchemas[typeName]._sources || []),
              { pack: pack.name, version: pack.version },
            ],
          };
        } else {
          compiledSchemas[typeName] = {
            ...schema,
            _sources: [{ pack: pack.name, version: pack.version }],
          };
        }
      }
    }

    return compiledSchemas;
  }
}
