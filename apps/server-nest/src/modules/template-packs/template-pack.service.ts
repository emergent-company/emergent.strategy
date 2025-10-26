import { Injectable, Logger, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
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
import { createHash } from 'crypto';

@Injectable()
export class TemplatePackService {
    private readonly logger = new Logger(TemplatePackService.name);

    constructor(private readonly db: DatabaseService) { }

    /**
     * Create a new template pack in the global registry
     */
    async createTemplatePack(dto: CreateTemplatePackDto): Promise<TemplatePackRow> {
        // Calculate checksum if not provided
        const checksum = dto.checksum || this.calculateChecksum(dto);

        const result = await this.db.query<TemplatePackRow>(
            `INSERT INTO kb.graph_template_packs (
                name, version, description, author, license,
                repository_url, documentation_url,
                object_type_schemas, relationship_type_schemas,
                ui_configs, extraction_prompts, sql_views,
                signature, checksum
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
            RETURNING *`,
            [
                dto.name,
                dto.version,
                dto.description || null,
                dto.author || null,
                dto.license || null,
                dto.repository_url || null,
                dto.documentation_url || null,
                JSON.stringify(dto.object_type_schemas),
                JSON.stringify(dto.relationship_type_schemas || {}),
                JSON.stringify(dto.ui_configs || {}),
                JSON.stringify(dto.extraction_prompts || {}),
                JSON.stringify(dto.sql_views || []),
                dto.signature || null,
                checksum,
            ]
        );

        this.logger.log(`Created template pack: ${dto.name}@${dto.version} (${result.rows[0].id})`);
        return result.rows[0];
    }

    /**
     * Get template pack by ID
     */
    async getTemplatePackById(id: string): Promise<TemplatePackRow> {
        const result = await this.db.query<TemplatePackRow>(
            `SELECT * FROM kb.graph_template_packs WHERE id = $1`,
            [id]
        );

        if (result.rows.length === 0) {
            throw new NotFoundException(`Template pack not found: ${id}`);
        }

        return result.rows[0];
    }

    /**
     * Get template pack by name and version
     */
    async getTemplatePackByNameVersion(name: string, version: string): Promise<TemplatePackRow> {
        const result = await this.db.query<TemplatePackRow>(
            `SELECT * FROM kb.graph_template_packs WHERE name = $1 AND version = $2`,
            [name, version]
        );

        if (result.rows.length === 0) {
            throw new NotFoundException(`Template pack not found: ${name}@${version}`);
        }

        return result.rows[0];
    }

    /**
     * List all available template packs
     */
    async listTemplatePacks(query: ListTemplatePacksQueryDto): Promise<{
        packs: TemplatePackRow[];
        total: number;
        page: number;
        limit: number;
    }> {
        const offset = (query.page! - 1) * query.limit!;
        let whereClause = '';
        const params: any[] = [];

        if (!query.include_deprecated) {
            whereClause = 'WHERE deprecated_at IS NULL';
        }

        if (query.search) {
            whereClause += (whereClause ? ' AND ' : 'WHERE ') +
                `(name ILIKE $${params.length + 1} OR description ILIKE $${params.length + 1})`;
            params.push(`%${query.search}%`);
        }

        // Get total count
        const countResult = await this.db.query<{ count: string }>(
            `SELECT COUNT(*) as count FROM kb.graph_template_packs ${whereClause}`,
            params
        );
        const total = parseInt(countResult.rows[0].count);

        // Get packs
        params.push(query.limit, offset);
        const result = await this.db.query<TemplatePackRow>(
            `SELECT * FROM kb.graph_template_packs ${whereClause}
             ORDER BY published_at DESC
             LIMIT $${params.length - 1} OFFSET $${params.length}`,
            params
        );

        return {
            packs: result.rows,
            total,
            page: query.page!,
            limit: query.limit!,
        };
    }

    /**
     * Assign template pack to a project
     */
    async assignTemplatePackToProject(
        projectId: string,
        orgId: string,
        tenantId: string,
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
                const userResult = await this.db.query(
                    `SELECT id FROM core.user_profiles 
                     WHERE id = $1 OR zitadel_user_id = $1 
                     LIMIT 1`,
                    [userId]
                );
                if (userResult.rows.length > 0) {
                    actualUserId = userResult.rows[0].id;
                }
            } catch (err) {
                this.logger.warn(`Could not look up user ${userId}: ${err instanceof Error ? err.message : String(err)}`);
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
            typesToInstall = customizations.enabledTypes.filter(t => allTypes.includes(t));
        }

        if (customizations.disabledTypes && customizations.disabledTypes.length > 0) {
            typesToInstall = typesToInstall.filter(t => !customizations.disabledTypes!.includes(t));
        }

        // Check for conflicts with existing types
        const conflicts: AssignTemplatePackResponse['conflicts'] = [];
        const existingTypes = await this.db.query<{ type: string }>(
            `SELECT type_name AS type FROM kb.project_object_type_registry 
             WHERE project_id = $1 AND type_name = ANY($2)`,
            [projectId, typesToInstall]
        );

        if (existingTypes.rows.length > 0) {
            const conflictingTypes = existingTypes.rows.map(r => r.type);
            this.logger.warn(`Type conflicts detected for project ${projectId}: ${conflictingTypes.join(', ')}`);

            // For now, skip conflicting types
            for (const type of conflictingTypes) {
                conflicts.push({
                    type,
                    issue: 'Type already exists in project',
                    resolution: 'skipped',
                });
            }

            typesToInstall = typesToInstall.filter(t => !conflictingTypes.includes(t));
        }

        // Begin transaction
        const client = await this.db.getClient();
        try {
            await client.query('BEGIN');

            // Set RLS context
            await client.query(`SELECT set_config('app.current_organization_id', $1, true)`, [orgId]);
            await client.query(`SELECT set_config('app.current_project_id', $1, true)`, [projectId]);

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
            this.logger.error(`Failed to assign template pack to project ${projectId}:`, error);
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Get installed template packs for a project
     */
    async getProjectTemplatePacks(
        projectId: string,
        orgId: string
    ): Promise<Array<ProjectTemplatePackRow & { template_pack: TemplatePackRow }>> {
        const result = await this.db.query<ProjectTemplatePackRow & { template_pack: TemplatePackRow }>(
            `SELECT 
                ptp.*,
                row_to_json(tp.*) as template_pack
            FROM kb.project_template_packs ptp
            JOIN kb.graph_template_packs tp ON ptp.template_pack_id = tp.id
            WHERE ptp.project_id = $1
            ORDER BY ptp.installed_at DESC`,
            [projectId]
        );

        // Transform object_type_schemas object into object_types array for frontend
        return result.rows.map(row => ({
            ...row,
            template_pack: {
                ...row.template_pack,
                object_types: row.template_pack.object_type_schemas
                    ? Object.keys(row.template_pack.object_type_schemas)
                    : []
            }
        }));
    }

    /**
     * Get available templates for a project (with installation status)
     */
    async getAvailableTemplatesForProject(
        projectId: string,
        orgId: string
    ): Promise<AvailableTemplateDto[]> {
        // Get all template packs
        const packsResult = await this.db.query<TemplatePackRow>(
            `SELECT * FROM kb.graph_template_packs 
             WHERE deprecated_at IS NULL
             ORDER BY published_at DESC`
        );

        // Get installed packs for this project
        const installedResult = await this.db.query<{ template_pack_id: string }>(
            `SELECT template_pack_id FROM kb.project_template_packs 
             WHERE project_id = $1 AND active = true`,
            [projectId]
        );
        const installedIds = new Set(installedResult.rows.map(r => r.template_pack_id));

        // Get object counts per type for this project
        const countsResult = await this.db.query<{ type: string; count: string }>(
            `SELECT type, COUNT(*) as count 
             FROM kb.graph_objects 
             WHERE project_id = $1 AND deleted_at IS NULL
             GROUP BY type`,
            [projectId]
        );
        const typeCounts = new Map(countsResult.rows.map(r => [r.type, parseInt(r.count)]));

        // Build response
        return packsResult.rows.map(pack => {
            const relationshipTypes = Object.keys(pack.relationship_type_schemas || {});
            return {
                id: pack.id,
                name: pack.name,
                version: pack.version,
                description: pack.description,
                author: pack.author,
                source: pack.source,
                object_types: Object.entries(pack.object_type_schemas).map(([type, schema]: [string, any]) => ({
                    type,
                    description: schema.description,
                    sample_count: typeCounts.get(type) || 0,
                })),
                relationship_types: relationshipTypes,
                relationship_count: relationshipTypes.length,
                installed: installedIds.has(pack.id),
                compatible: true, // TODO: Add compatibility check
                published_at: pack.published_at,
                deprecated_at: pack.deprecated_at,
            };
        });
    }

    /**
     * Update template pack assignment
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
            await client.query(`SELECT set_config('app.current_organization_id', $1, true)`, [orgId]);
            await client.query(`SELECT set_config('app.current_project_id', $1, true)`, [projectId]);

            // Get current assignment
            const current = await client.query<ProjectTemplatePackRow>(
                `SELECT * FROM kb.project_template_packs WHERE id = $1`,
                [assignmentId]
            );

            if (current.rows.length === 0) {
                throw new NotFoundException(`Template pack assignment not found: ${assignmentId}`);
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
            await client.query(`SELECT set_config('app.current_organization_id', $1, true)`, [orgId]);
            await client.query(`SELECT set_config('app.current_project_id', $1, true)`, [projectId]);

            // Get assignment
            const assignmentResult = await client.query<ProjectTemplatePackRow>(
                `SELECT * FROM kb.project_template_packs WHERE id = $1`,
                [assignmentId]
            );

            if (assignmentResult.rows.length === 0) {
                throw new NotFoundException(`Template pack assignment not found: ${assignmentId}`);
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

            this.logger.log(`Uninstalled template pack assignment ${assignmentId} from project ${projectId}`);

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
     */
    async deleteTemplatePack(packId: string, orgId: string): Promise<void> {
        const client = await this.db.getClient();

        try {
            await client.query('BEGIN');

            // Set RLS context for checking project assignments
            await client.query(`SELECT set_config('app.current_organization_id', $1, true)`, [orgId]);

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
            await client.query(
                `DELETE FROM kb.graph_template_packs WHERE id = $1`,
                [packId]
            );

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
     */
    async getCompiledObjectTypesForProject(
        projectId: string,
        orgId: string
    ): Promise<Record<string, any>> {
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
        const packIds = assignmentsResult.rows.map(a => a.template_pack_id);
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
                            { pack: pack.name, version: pack.version }
                        ]
                    };
                } else {
                    compiledSchemas[typeName] = {
                        ...schema,
                        _sources: [{ pack: pack.name, version: pack.version }]
                    };
                }
            }
        }

        return compiledSchemas;
    }
}
