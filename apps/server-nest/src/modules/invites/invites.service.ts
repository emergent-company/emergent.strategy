import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../../common/database/database.service';
import crypto from 'crypto';

interface InviteRow { id: string; organization_id: string; project_id: string | null; email: string; role: string; status: string; token: string; }

@Injectable()
export class InvitesService {
    constructor(private readonly db: DatabaseService) { }

    private randomToken(): string { return crypto.randomBytes(24).toString('hex'); }

    async create(orgId: string, role: string, email: string, projectId?: string | null) {
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new BadRequestException({ error: { code: 'validation-failed', message: 'Invalid email' } });
        const token = this.randomToken();
        const res = await this.db.query<InviteRow>(
            `INSERT INTO kb.invites(organization_id, project_id, email, role, token) VALUES($1,$2,$3,$4,$5) RETURNING id, organization_id, project_id, email, role, status, token`,
            [orgId, projectId || null, email.toLowerCase(), role]
        );
        const r = res.rows[0];
        return { id: r.id, orgId: r.organization_id, projectId: r.project_id, email: r.email, role: r.role, status: r.status, token: r.token };
    }

    async accept(token: string, userId: string) {
        const res = await this.db.query<InviteRow>(`SELECT id, organization_id, project_id, email, role, status, token FROM kb.invites WHERE token = $1`, [token]);
        if (!res.rowCount) throw new NotFoundException({ error: { code: 'not-found', message: 'Invite not found' } });
        const invite = res.rows[0];
        if (invite.status !== 'pending') throw new BadRequestException({ error: { code: 'invalid-state', message: 'Invite not pending' } });
        const client = await this.db.getClient();
        try {
            await client.query('BEGIN');
            // userId is now the internal UUID from req.user.id
            if (invite.project_id) {
                await client.query(`INSERT INTO kb.project_memberships(project_id, user_id, role) VALUES($1,$2,$3) ON CONFLICT (project_id, user_id) DO NOTHING`, [invite.project_id, userId, invite.role]);
            } else if (invite.role === 'org_admin') {
                await client.query(`INSERT INTO kb.organization_memberships(organization_id, user_id, role) VALUES($1,$2,'org_admin') ON CONFLICT (organization_id, user_id) DO NOTHING`, [invite.organization_id, userId]);
            } else {
                // non-admin org-level roles not yet implemented, treat as project-level requirement missing
                throw new BadRequestException({ error: { code: 'unsupported', message: 'Non-admin org invite unsupported without project' } });
            }
            await client.query(`UPDATE kb.invites SET status='accepted', accepted_at = now() WHERE id = $1`, [invite.id]);
            await client.query('COMMIT');
        } catch (e) {
            try { await client.query('ROLLBACK'); } catch { /* ignore */ }
            throw e;
        } finally { client.release(); }
        return { status: 'accepted' };
    }
}
