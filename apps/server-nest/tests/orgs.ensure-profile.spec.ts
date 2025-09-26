import { describe, expect, test } from 'vitest';
import { OrgsService } from '../src/modules/orgs/orgs.service';
import { AppConfigService } from '../src/common/config/config.service';

// Fake DatabaseService capturing executed SQL
class FakeDb {
    public online = true;
    public queries: { sql: string; params?: any[] }[] = [];
    async query(sql: string, params?: any[]) {
        this.queries.push({ sql: typeof sql === 'string' ? sql : String(sql), params });
        // Simulate COUNT(*) query
        if (/SELECT COUNT\(\*\)::text as count FROM kb\.orgs/i.test(sql)) {
            return { rows: [{ count: '0' }], rowCount: 1 } as any;
        }
        // Simulate INSERT org
        if (/INSERT INTO kb\.orgs\(name\)/i.test(sql)) {
            return { rows: [{ id: '11111111-1111-1111-1111-111111111111', name: params?.[0], created_at: new Date().toISOString(), updated_at: new Date().toISOString() }], rowCount: 1 } as any;
        }
        return { rows: [], rowCount: 0 } as any;
    }
    async getClient() {
        const self = this;
        return {
            query: (sql: string, params?: any[]) => self.query(sql, params),
            release: () => { /* noop */ }
        };
    }
    isOnline() { return this.online; }
}

// Minimal AppConfig stub
class FakeConfig extends AppConfigService {
    constructor() { super({} as any); }
}

describe('OrgsService.create ensures user profile before membership insert', () => {
    test('inserts user profile row before organization_memberships', async () => {
        const db = new FakeDb();
        const cfg = new FakeConfig();
        const service = new OrgsService(db as any, cfg as any);
        await service.create('Test Org', '00000000-0000-0000-0000-000000000001');

        const insertProfileIdx = db.queries.findIndex(q => /INSERT INTO core\.user_profiles\(subject_id\)/i.test(q.sql));
        const membershipIdx = db.queries.findIndex(q => /INSERT INTO kb\.organization_memberships/i.test(q.sql));
        expect(insertProfileIdx).toBeGreaterThanOrEqual(0);
        expect(membershipIdx).toBeGreaterThanOrEqual(0);
        expect(insertProfileIdx).toBeLessThan(membershipIdx); // order matters
    });
});
