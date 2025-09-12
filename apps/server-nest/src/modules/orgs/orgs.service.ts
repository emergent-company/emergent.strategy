import { ConflictException, Injectable } from '@nestjs/common';
import { DatabaseService } from '../../common/database/database.service';
import { AppConfigService } from '../../common/config/config.service';
import { OrgDto } from './dto/org.dto';

interface OrgRow { id: string; name: string; created_at: string; updated_at: string }

@Injectable()
export class OrgsService {
    // In-process authoritative data (offline fallback / initial seed)
    private data: OrgDto[] = [
        { id: 'org_1', name: 'Example Org' },
        { id: 'org_2', name: 'Second Org' },
    ];

    constructor(private readonly db: DatabaseService, private readonly cfg: AppConfigService) { }

    async list(): Promise<OrgDto[]> {
        if (!this.db.isOnline()) {
            return this.cfg.demoSeedOrgs ? [...this.data] : [];
        }
        try {
            const res = await this.db.query<OrgRow>('SELECT id, name, created_at, updated_at FROM kb.orgs ORDER BY created_at DESC');
            if (!res.rowCount) {
                // Return demo seed only if flag enabled
                return this.cfg.demoSeedOrgs ? [...this.data] : [];
            }
            return res.rows.map(r => ({ id: r.id, name: r.name }));
        } catch (e: any) {
            if (e && e.code === '42P01') { // relation does not exist -> fallback to memory
                return this.cfg.demoSeedOrgs ? [...this.data] : [];
            }
            throw e;
        }
    }

    async get(id: string): Promise<OrgDto | null> {
        if (!this.db.isOnline()) return this.cfg.demoSeedOrgs ? this.data.find(o => o.id === id) || null : null;
        try {
            const res = await this.db.query<OrgRow>('SELECT id, name, created_at, updated_at FROM kb.orgs WHERE id = $1 LIMIT 1', [id]);
            if (!res.rowCount) return null;
            const r = res.rows[0];
            return { id: r.id, name: r.name };
        } catch (e: any) {
            if (e && e.code === '42P01') { // table missing
                return this.cfg.demoSeedOrgs ? this.data.find(o => o.id === id) || null : null;
            }
            throw e;
        }
    }

    async create(name: string): Promise<OrgDto> {
        if (!this.db.isOnline()) {
            // Duplicate name check (offline data array)
            if (this.cfg.demoSeedOrgs && this.data.some(o => o.name.toLowerCase() === name.toLowerCase())) {
                throw new ConflictException({ message: 'Organization name already exists', details: { name: ['already exists'] } });
            }
            if (this.data.length >= 10) {
                throw new ConflictException('Organization limit reached (10)');
            }
            if (!this.cfg.demoSeedOrgs) {
                // When demo seed disabled and DB offline, creating orgs is unsupported -> simulate minimal create
                const id = `mem_${Math.random().toString(36).slice(2, 10)}`;
                return { id, name };
            }
            const id = `mem_${Math.random().toString(36).slice(2, 10)}`;
            const org = { id, name };
            this.data.push(org);
            return org;
        }
        // Count existing orgs
        try {
            const countRes = await this.db.query<{ count: string }>('SELECT COUNT(*)::text as count FROM kb.orgs');
            const count = parseInt(countRes.rows[0]?.count || '0', 10);
            if (count >= 10) {
                throw new ConflictException('Organization limit reached (10)');
            }
            try {
                const res = await this.db.query<OrgRow>('INSERT INTO kb.orgs(name) VALUES($1) RETURNING id, name, created_at, updated_at', [name]);
                const r = res.rows[0];
                return { id: r.id, name: r.name };
            } catch (err: any) {
                if (err && err.code === '23505') { // unique_violation
                    throw new ConflictException({ message: 'Organization name already exists', details: { name: ['already exists'] } });
                }
                throw err;
            }
        } catch (e: any) {
            if (e && e.code === '42P01') { // missing table fallback to memory creation
                if (this.cfg.demoSeedOrgs && this.data.some(o => o.name.toLowerCase() === name.toLowerCase())) {
                    throw new ConflictException({ message: 'Organization name already exists', details: { name: ['already exists'] } });
                }
                if (this.data.length >= 10) {
                    throw new ConflictException('Organization limit reached (10)');
                }
                if (!this.cfg.demoSeedOrgs) {
                    const id = `mem_${Math.random().toString(36).slice(2, 10)}`;
                    return { id, name };
                }
                const id = `mem_${Math.random().toString(36).slice(2, 10)}`;
                const org = { id, name };
                this.data.push(org);
                return org;
            }
            throw e;
        }
    }
}
