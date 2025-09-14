import { BadRequestException, Injectable } from '@nestjs/common';
import { DatabaseService } from '../../common/database/database.service';
import { ProjectDto } from './dto/project.dto';

interface ProjectRow { id: string; name: string; org_id: string; created_at?: string; updated_at?: string; }

@Injectable()
export class ProjectsService {
    constructor(private readonly db: DatabaseService) { }

    async list(limit = 100, orgId?: string): Promise<ProjectDto[]> {
        if (orgId) {
            // Guard: if orgId isn't a UUID, return empty list (prevents invalid uuid 22P02 errors)
            if (!/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(orgId)) {
                return [];
            }
            const res = await this.db.query<ProjectRow>(
                `SELECT id, name, org_id FROM kb.projects WHERE org_id = $1 ORDER BY created_at DESC LIMIT $2`,
                [orgId, limit],
            );
            return res.rows.map(r => ({ id: r.id, name: r.name, orgId: r.org_id }));
        }
        const res = await this.db.query<ProjectRow>(
            `SELECT id, name, org_id FROM kb.projects ORDER BY created_at DESC LIMIT $1`,
            [limit],
        );
        return res.rows.map(r => ({ id: r.id, name: r.name, orgId: r.org_id }));
    }

    async create(name: string, orgId?: string): Promise<ProjectDto> {
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
        const chk = await this.db.query('SELECT 1 FROM kb.orgs WHERE id = $1 LIMIT 1', [orgId]);
        if (!chk.rowCount) {
            throw new BadRequestException({ error: { code: 'org-not-found', message: 'Organization not found' } });
        }
        try {
            const insProj = await this.db.query<{ id: string; name: string; org_id: string }>(
                `INSERT INTO kb.projects(org_id, name) VALUES($1,$2) RETURNING id, name, org_id`,
                [orgId, name.trim()],
            );
            const p = insProj.rows[0];
            return { id: p.id, name: p.name, orgId: p.org_id };
        } catch (e) {
            const msg = (e as Error).message;
            if (msg.includes('duplicate')) throw new BadRequestException({ error: { code: 'duplicate', message: 'Project with this name exists in org' } });
            throw e;
        }
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
}
