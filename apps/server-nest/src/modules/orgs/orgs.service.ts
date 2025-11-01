import { ConflictException, Injectable, BadRequestException } from '@nestjs/common';
import { DatabaseService } from '../../common/database/database.service';
import { AppConfigService } from '../../common/config/config.service';
import { OrgDto } from './dto/org.dto';

interface OrgRow { id: string; name: string; created_at: string; updated_at: string }

@Injectable()
export class OrgsService {
    // In-process authoritative data (offline fallback only; stripped example seeds)
    private data: OrgDto[] = [];
    // Track when the backing tables are unavailable (42P01) so we can serve in-memory cache even while DB reports online
    private tableMissing = false;

    constructor(private readonly db: DatabaseService, private readonly cfg: AppConfigService) { }

    async list(userId?: string): Promise<OrgDto[]> {
        if (!this.db.isOnline()) return this.cloneData();

        const runQuery = async (): Promise<OrgDto[]> => {
            // SECURITY: Only return organizations the user is a member of when DB is available
            if (!userId) return [];
            const res = await this.db.query<OrgRow>(
                `SELECT o.id, o.name, o.created_at, o.updated_at 
                 FROM kb.orgs o
                 INNER JOIN kb.organization_memberships om ON o.id = om.organization_id
                 WHERE om.user_id = $1
                 ORDER BY o.created_at DESC`,
                [userId]
            );
            if (!res.rowCount) return [];
            return res.rows.map((r: any) => ({ id: r.id, name: r.name }));
        };

        if (this.tableMissing) {
            try {
                const rows = await runQuery();
                if (rows.length) {
                    this.tableMissing = false;
                    return rows;
                }
                return this.cloneData();
            } catch (e: any) {
                if (e && e.code === '42P01') return this.cloneData();
                throw e;
            }
        }

        try {
            const rows = await runQuery();
            this.tableMissing = false;
            return rows;
        } catch (e: any) {
            if (e && e.code === '42P01') {
                this.tableMissing = true;
                return this.cloneData();
            }
            throw e;
        }
    }

    async get(id: string): Promise<OrgDto | null> {
        if (!this.db.isOnline()) return this.findInMemory(id);

        const runQuery = async () => {
            const res = await this.db.query<OrgRow>('SELECT id, name, created_at, updated_at FROM kb.orgs WHERE id = $1 LIMIT 1', [id]);
            if (!res.rowCount) return null;
            const r = res.rows[0];
            return { id: r.id, name: r.name };
        };

        if (this.tableMissing) {
            try {
                const result = await runQuery();
                if (result) {
                    this.tableMissing = false;
                    return result;
                }
                return this.findInMemory(id);
            } catch (e: any) {
                if (e && e.code === '42P01') return this.findInMemory(id);
                throw e;
            }
        }

        try {
            const result = await runQuery();
            this.tableMissing = false;
            return result;
        } catch (e: any) {
            if (e && e.code === '42P01') {
                this.tableMissing = true;
                return this.findInMemory(id);
            }
            throw e;
        }
    }

    async create(name: string, userId?: string): Promise<OrgDto> {
        if (!this.db.isOnline() || this.tableMissing) {
            return this.createInMemory(name);
        }
        // Count user's existing orgs (per-user limit, not global)
        try {
            if (userId) {
                const countRes = await this.db.query<{ count: string }>(
                    `SELECT COUNT(*)::text as count 
                     FROM kb.orgs o
                     INNER JOIN kb.organization_memberships om ON o.id = om.organization_id
                     WHERE om.user_id = $1`,
                    [userId],
                );
                const count = parseInt(countRes.rows[0]?.count || '0', 10);
                if (count >= 100) {
                    throw new ConflictException('Organization limit reached (100). You can create up to 100 organizations.');
                }
            }

            let client;
            try {
                client = await this.db.getClient();
                await client.query('BEGIN');
                const res = await client.query<OrgRow>('INSERT INTO kb.orgs(name) VALUES($1) RETURNING id, name, created_at, updated_at', [name]);
                const r = res.rows[0];
                if (userId) {
                    // Auto-assign creator as org_admin
                    // Note: user profile must already exist in core.user_profiles (created during authentication)
                    // The FK constraint will enforce this and fail with a meaningful error if missing
                    await client.query(`INSERT INTO kb.organization_memberships(organization_id, user_id, role) VALUES($1,$2,'org_admin') ON CONFLICT (organization_id, user_id) DO NOTHING`, [r.id, userId]);
                }
                await client.query('COMMIT');
                this.tableMissing = false;
                return { id: r.id, name: r.name };
            } catch (err: any) {
                if (client) {
                    try { await client.query('ROLLBACK'); } catch { /* ignore */ }
                }
                if (err && err.code === '23505') { // unique_violation
                    throw new ConflictException({ message: 'Organization name already exists', details: { name: ['already exists'] } });
                }
                if (err && err.code === '23503') { // foreign_key_violation
                    // This should be rare - ScopesGuard should ensure profile exists
                    throw new BadRequestException({
                        message: 'User profile initialization failed. Please try logging out and back in.',
                        details: { userId: ['User profile not properly initialized'] }
                    });
                }
                throw err;
            } finally {
                if (client) client.release();
            }
        } catch (e: any) {
            if (e && e.code === '42P01') {
                this.tableMissing = true;
                return this.createInMemory(name);
            }
            throw e;
        }
    }

    async delete(id: string): Promise<boolean> {
        if (!this.db.isOnline() || this.tableMissing) {
            const before = this.data.length;
            this.data = this.data.filter(o => o.id !== id);
            return this.data.length !== before;
        }
        try {
            const res = await this.db.query('DELETE FROM kb.orgs WHERE id = $1 RETURNING id', [id]);
            this.tableMissing = false;
            return (res.rowCount || 0) > 0;
        } catch (e: any) {
            if (e && e.code === '42P01') {
                this.tableMissing = true;
                const before = this.data.length;
                this.data = this.data.filter(o => o.id !== id);
                return this.data.length !== before;
            }
            throw e;
        }
    }

    private cloneData(): OrgDto[] {
        return this.data.map(o => ({ ...o }));
    }

    private findInMemory(id: string): OrgDto | null {
        return this.data.find(o => o.id === id) || null;
    }

    private createInMemory(name: string): OrgDto {
        if (this.data.some(o => o.name.toLowerCase() === name.toLowerCase())) {
            throw new ConflictException({ message: 'Organization name already exists', details: { name: ['already exists'] } });
        }
        if (this.data.length >= 100) throw new ConflictException('Organization limit reached (100)');
        const id = `mem_${Math.random().toString(36).slice(2, 10)}`;
        const org = { id, name };
        this.data.push(org);
        return org;
    }
}
