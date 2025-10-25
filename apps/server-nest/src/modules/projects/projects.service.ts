import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../../common/database/database.service';
import { ProjectDto } from './dto/project.dto';
import { TemplatePackService } from '../template-packs/template-pack.service';
import { AppConfigService } from '../../common/config/config.service';

const SYSTEM_USER_ID = '00000000-0000-0000-0000-000000000000';

interface ProjectRow {
    id: string;
    name: string;
    organization_id: string;
    kb_purpose?: string;
    chat_prompt_template?: string;
    auto_extract_objects?: boolean;
    auto_extract_config?: any;
    created_at?: string;
    updated_at?: string;
}

@Injectable()
export class ProjectsService {
    private readonly logger = new Logger(ProjectsService.name);

    constructor(
        private readonly db: DatabaseService,
        private readonly templatePacks: TemplatePackService,
        private readonly config: AppConfigService,
    ) { }

    async list(limit = 100, orgId?: string): Promise<ProjectDto[]> {
        if (orgId) {
            // Guard: if orgId isn't a UUID, return empty list (prevents invalid uuid 22P02 errors)
            if (!/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(orgId)) {
                return [];
            }
            const res = await this.db.query<ProjectRow>(
                `SELECT id, name, organization_id, kb_purpose FROM kb.projects WHERE organization_id = $1 ORDER BY created_at DESC LIMIT $2`,
                [orgId, limit],
            );
            return res.rows.map(r => ({ id: r.id, name: r.name, orgId: r.organization_id, kb_purpose: r.kb_purpose }));
        }
        const res = await this.db.query<ProjectRow>(
            `SELECT id, name, organization_id, kb_purpose FROM kb.projects ORDER BY created_at DESC LIMIT $1`,
            [limit],
        );
        return res.rows.map(r => ({ id: r.id, name: r.name, orgId: r.organization_id, kb_purpose: r.kb_purpose }));
    }

    async getById(id: string): Promise<ProjectDto | null> {
        const res = await this.db.query<ProjectRow>(
            `SELECT id, name, organization_id, kb_purpose, chat_prompt_template, auto_extract_objects, auto_extract_config FROM kb.projects WHERE id = $1`,
            [id],
        );
        if (res.rows.length === 0) {
            return null;
        }
        const r = res.rows[0];
        return {
            id: r.id,
            name: r.name,
            orgId: r.organization_id,
            kb_purpose: r.kb_purpose,
            chat_prompt_template: r.chat_prompt_template,
            auto_extract_objects: r.auto_extract_objects,
            auto_extract_config: r.auto_extract_config
        };
    }

    async create(name: string, orgId?: string, userId?: string): Promise<ProjectDto> {
        if (!name || !name.trim()) {
            throw new BadRequestException({
                error: { code: 'validation-failed', message: 'Name required', details: { name: ['must not be blank'] } },
            });
        }
        if (!orgId) {
            // New behavior: organization must be specified explicitly (no implicit default creation)
            throw new BadRequestException({
                error: { code: 'org-required', message: 'Organization id (orgId) is required to create a project' },
            });
        }
        // Race-hardened approach: perform org existence check and project insert in SAME transaction.
        // This prevents a concurrent org deletion (cascade) from occurring between the pre-check and insert,
        // which could surface as a transient FK 23503 even though the org existed milliseconds earlier.
        const client = await this.db.getClient();
        let project: ProjectDto | null = null;
        try {
            await client.query('BEGIN');
            const orgChk = await client.query('SELECT id FROM kb.orgs WHERE id = $1 LIMIT 1 FOR SHARE', [orgId]);
            if (!orgChk.rowCount) {
                await client.query('ROLLBACK');
                throw new BadRequestException({ error: { code: 'org-not-found', message: 'Organization not found' } });
            }
            const insProj = await client.query<{ id: string; name: string; organization_id: string }>(
                `INSERT INTO kb.projects(organization_id, name) VALUES($1,$2) RETURNING id, name, organization_id`,
                [orgId, name.trim()],
            );
            const p = insProj.rows[0];
            if (userId) {
                // userId is now the internal UUID from req.user.id
                // User profile already exists from auth flow, just insert membership
                await client.query(
                    `INSERT INTO kb.project_memberships(project_id, user_id, role) VALUES($1,$2,'project_admin')`,
                    [p.id, userId]
                ).catch(() => {
                    // Ignore duplicate membership errors
                });
            }
            await client.query('COMMIT');
            project = { id: p.id, name: p.name, orgId: p.organization_id };
        } catch (e) {
            try { await client.query('ROLLBACK'); } catch { /* ignore */ }
            const msg = (e as Error).message;
            // Translate FK org deletion race into stable org-not-found semantic
            if (msg.includes('projects_organization_id_fkey')) {
                throw new BadRequestException({ error: { code: 'org-not-found', message: 'Organization not found (possibly deleted concurrently)' } });
            }
            if (msg.includes('duplicate')) throw new BadRequestException({ error: { code: 'duplicate', message: 'Project with this name exists in org' } });
            throw e;
        } finally {
            client.release();
        }

        if (!project) {
            throw new BadRequestException({ error: { code: 'project-create-failed', message: 'Project creation failed unexpectedly' } });
        }

        await this.installDefaultTemplatePack(project, orgId, userId);

        return project;
    }

    /**
     * Update a project's properties (name, kb_purpose, chat_prompt_template, auto_extract_objects, auto_extract_config, etc.)
     * Returns the updated project or null if not found.
     */
    async update(projectId: string, updates: {
        name?: string;
        kb_purpose?: string;
        chat_prompt_template?: string;
        auto_extract_objects?: boolean;
        auto_extract_config?: any;
    }): Promise<ProjectDto | null> {
        // Validate UUID shape
        if (!/^[0-9a-fA-F-]{36}$/.test(projectId)) return null;

        const fields: string[] = [];
        const values: any[] = [];
        let paramIndex = 1;

        if (updates.name !== undefined) {
            fields.push(`name = $${paramIndex++}`);
            values.push(updates.name);
        }

        if (updates.kb_purpose !== undefined) {
            fields.push(`kb_purpose = $${paramIndex++}`);
            values.push(updates.kb_purpose);
        }

        if (updates.chat_prompt_template !== undefined) {
            fields.push(`chat_prompt_template = $${paramIndex++}`);
            values.push(updates.chat_prompt_template);
        }

        if (updates.auto_extract_objects !== undefined) {
            fields.push(`auto_extract_objects = $${paramIndex++}`);
            values.push(updates.auto_extract_objects);
        }

        if (updates.auto_extract_config !== undefined) {
            fields.push(`auto_extract_config = $${paramIndex++}`);
            values.push(JSON.stringify(updates.auto_extract_config));
        }

        // If no fields to update, just return current project
        if (fields.length === 0) {
            return this.getById(projectId);
        }

        values.push(projectId);

        const result = await this.db.query<{
            id: string;
            name: string;
            organization_id: string;
            kb_purpose?: string;
            chat_prompt_template?: string;
            auto_extract_objects?: boolean;
            auto_extract_config?: any;
        }>(
            `UPDATE kb.projects 
             SET ${fields.join(', ')}, updated_at = now()
             WHERE id = $${paramIndex}
             RETURNING id, name, organization_id, kb_purpose, chat_prompt_template, auto_extract_objects, auto_extract_config`,
            values
        );

        if (result.rowCount === 0) {
            return null;
        }

        const row = result.rows[0];
        return {
            id: row.id,
            name: row.name,
            orgId: row.organization_id,
            kb_purpose: row.kb_purpose,
            chat_prompt_template: row.chat_prompt_template,
            auto_extract_objects: row.auto_extract_objects,
            auto_extract_config: row.auto_extract_config
        };
    }

    /**
     * Delete a project and cascade-remove associated artifacts (documents, chunks, chat conversations/messages).
     * We cannot rely solely on FK ON DELETE CASCADE because current minimal schema uses ON DELETE SET NULL for project_id on documents/chat tables.
     * Returns true if the project existed and was deleted.
     */
    async delete(projectId: string): Promise<boolean> {
        // Validate UUID shape quickly to avoid errors from invalid input.
        if (!/^[0-9a-fA-F-]{36}$/.test(projectId)) return false;
        // FKs with ON DELETE CASCADE now remove dependent rows (documents -> chunks, chat_conversations -> chat_messages).
        const res = await this.db.query<{ id: string }>(`DELETE FROM kb.projects WHERE id = $1 RETURNING id`, [projectId]);
        return (res.rowCount ?? 0) > 0;
    }

    private async installDefaultTemplatePack(project: ProjectDto, orgId: string, userId?: string): Promise<void> {
        const defaultPackId = this.config.extractionDefaultTemplatePackId;
        if (!defaultPackId) {
            this.logger.debug(`No default template pack configured; skipping auto-install for project ${project.id}`);
            return;
        }

        try {
            await this.templatePacks.assignTemplatePackToProject(
                project.id,
                orgId,
                orgId,
                userId ?? SYSTEM_USER_ID,
                { template_pack_id: defaultPackId }
            );
            this.logger.log(`Installed default template pack ${defaultPackId} for project ${project.id}`);
        } catch (error) {
            if (error instanceof ConflictException) {
                this.logger.debug(`Default template pack already installed for project ${project.id}`);
                return;
            }

            if (error instanceof NotFoundException) {
                this.logger.error(`Default template pack ${defaultPackId} not found; project ${project.id} will require manual assignment`);
                return;
            }

            this.logger.error(
                `Failed to install default template pack ${defaultPackId} for project ${project.id}: ${(error as Error).message}`,
                error as Error,
            );
        }
    }
}
