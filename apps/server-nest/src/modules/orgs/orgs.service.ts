import { ConflictException, Injectable } from '@nestjs/common';
import { DatabaseService } from '../../common/database/database.service';
import { AppConfigService } from '../../common/config/config.service';
import { OrgDto } from './dto/org.dto';

interface OrgRow { id: string; name: string; created_at: string; updated_at: string }

@Injectable()
export class OrgsService {
    // In-process authoritative data (offline fallback only; stripped example seeds)
    private data: OrgDto[] = [];

    constructor(private readonly db: DatabaseService, private readonly cfg: AppConfigService) { }

    async list(): Promise<OrgDto[]> {
        if (!this.db.isOnline()) return [...this.data];
        try {
            const res = await this.db.query<OrgRow>('SELECT id, name, created_at, updated_at FROM kb.orgs ORDER BY created_at DESC');
            if (!res.rowCount) return [];
            return res.rows.map(r => ({ id: r.id, name: r.name }));
        } catch (e: any) {
            if (e && e.code === '42P01') return [...this.data];
            throw e;
        }
    }

    async get(id: string): Promise<OrgDto | null> {
        if (!this.db.isOnline()) return this.data.find(o => o.id === id) || null;
        try {
            const res = await this.db.query<OrgRow>('SELECT id, name, created_at, updated_at FROM kb.orgs WHERE id = $1 LIMIT 1', [id]);
            if (!res.rowCount) return null;
            const r = res.rows[0];
            return { id: r.id, name: r.name };
        } catch (e: any) {
            if (e && e.code === '42P01') return this.data.find(o => o.id === id) || null;
            throw e;
        }
    }

    async create(name: string, userId?: string): Promise<OrgDto> {
        if (!this.db.isOnline()) {
            if (this.data.some(o => o.name.toLowerCase() === name.toLowerCase())) {
                throw new ConflictException({ message: 'Organization name already exists', details: { name: ['already exists'] } });
            }
            if (this.data.length >= 100) throw new ConflictException('Organization limit reached (100)');
            const id = `mem_${Math.random().toString(36).slice(2, 10)}`;
            const org = { id, name };
            this.data.push(org);
            return org;
        }
        // Count existing orgs
        try {
            const countRes = await this.db.query<{ count: string }>('SELECT COUNT(*)::text as count FROM kb.orgs');
            const count = parseInt(countRes.rows[0]?.count || '0', 10);
            if (count >= 100) {
                throw new ConflictException('Organization limit reached (100)');
            }
            try {
                const client = await this.db.getClient();
                try {
                    await client.query('BEGIN');
                    const res = await client.query<OrgRow>('INSERT INTO kb.orgs(name) VALUES($1) RETURNING id, name, created_at, updated_at', [name]);
                    const r = res.rows[0];
                    if (userId) {
                        // Ensure user profile row exists to satisfy FK for organization_memberships (idempotent)
                        await client.query(`INSERT INTO core.user_profiles(subject_id) VALUES($1) ON CONFLICT (subject_id) DO NOTHING`, [userId]);
                        // Auto-assign creator as org_admin (idempotent)
                        await client.query(`INSERT INTO kb.organization_memberships(org_id, subject_id, role) VALUES($1,$2,'org_admin') ON CONFLICT (org_id, subject_id) DO NOTHING`, [r.id, userId]);
                    }
                    await client.query('COMMIT');
                    return { id: r.id, name: r.name };
                } catch (err: any) {
                    try { await client.query('ROLLBACK'); } catch { /* ignore */ }
                    if (err && err.code === '23505') { // unique_violation
                        throw new ConflictException({ message: 'Organization name already exists', details: { name: ['already exists'] } });
                    }
                    throw err;
                } finally {
                    client.release();
                }
            } catch (err: any) {
                if (err && err.code === '23505') { // unique_violation
                    throw new ConflictException({ message: 'Organization name already exists', details: { name: ['already exists'] } });
                }
                throw err;
            }
        } catch (e: any) {
            if (e && e.code === '42P01') {
                if (this.data.some(o => o.name.toLowerCase() === name.toLowerCase())) {
                    throw new ConflictException({ message: 'Organization name already exists', details: { name: ['already exists'] } });
                }
                if (this.data.length >= 100) throw new ConflictException('Organization limit reached (100)');
                const id = `mem_${Math.random().toString(36).slice(2, 10)}`;
                const org = { id, name };
                this.data.push(org);
                return org;
            }
            throw e;
        }
    }

    async delete(id: string): Promise<boolean> {
        if (!this.db.isOnline()) {
            const before = this.data.length;
            this.data = this.data.filter(o => o.id !== id);
            return this.data.length !== before;
        }
        try {
            const res = await this.db.query('DELETE FROM kb.orgs WHERE id = $1 RETURNING id', [id]);
            return (res.rowCount || 0) > 0;
        } catch (e: any) {
            if (e && e.code === '42P01') return false; // table missing
            throw e;
        }
    }
}
