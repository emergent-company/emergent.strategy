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
        if (!name || !name.trim()) throw new BadRequestException({ error: { code: 'validation-failed', message: 'Name required', details: { name: ['must not be blank'] } } });
        let targetOrg = orgId;
        if (!targetOrg) {
            // get or create default org
            const orgRes = await this.db.query<{ id: string }>('SELECT id FROM kb.orgs ORDER BY created_at ASC LIMIT 1');
            if (orgRes.rowCount) targetOrg = orgRes.rows[0].id; else {
                const ins = await this.db.query<{ id: string }>(`INSERT INTO kb.orgs(name) VALUES($1) RETURNING id`, ['Default Org']);
                targetOrg = ins.rows[0].id;
            }
        } else {
            const chk = await this.db.query('SELECT 1 FROM kb.orgs WHERE id = $1 LIMIT 1', [targetOrg]);
            if (!chk.rowCount) throw new BadRequestException({ error: { code: 'org-not-found', message: 'Organization not found' } });
        }
        try {
            const insProj = await this.db.query<{ id: string; name: string; org_id: string }>(`INSERT INTO kb.projects(org_id, name) VALUES($1,$2) RETURNING id, name, org_id`, [targetOrg, name.trim()]);
            const p = insProj.rows[0];
            return { id: p.id, name: p.name, orgId: p.org_id };
        } catch (e) {
            const msg = (e as Error).message;
            if (msg.includes('duplicate')) throw new BadRequestException({ error: { code: 'duplicate', message: 'Project with this name exists in org' } });
            throw e;
        }
    }
}
