import { describe, it, expect, beforeEach, vi } from 'vitest';
import { InvitesService } from '../src/modules/invites/invites.service';
import { BadRequestException, NotFoundException } from '@nestjs/common';

// Minimal mock DatabaseService
class MockDb {
    queries: any[] = [];
    // configurable responses
    insertResult: any;
    selectInvite: any;
    client: any;

    query<T = any>(sql: string, params: any[]) {
        this.queries.push({ sql, params });
        if (sql.startsWith('INSERT INTO kb.invites')) {
            return Promise.resolve({ rows: [this.insertResult], rowCount: 1 });
        }
        if (sql.startsWith('SELECT id, org_id, project_id, email, role, status, token FROM kb.invites')) {
            if (!this.selectInvite) return Promise.resolve({ rows: [], rowCount: 0 });
            return Promise.resolve({ rows: [this.selectInvite], rowCount: 1 });
        }
        if (sql.startsWith('UPDATE kb.invites')) {
            return Promise.resolve({ rowCount: 1 });
        }
        throw new Error('Unexpected query: ' + sql);
    }
    async getClient() {
        if (this.client) return this.client;
        const client = {
            queries: [] as any[],
            query: (sql: string, params?: any[]) => {
                client.queries.push({ sql, params });
                if (sql.startsWith('INSERT INTO kb.project_memberships')) return Promise.resolve({ rowCount: 1 });
                if (sql.startsWith('INSERT INTO kb.organization_memberships')) return Promise.resolve({ rowCount: 1 });
                if (sql.startsWith('UPDATE kb.invites')) return Promise.resolve({ rowCount: 1 });
                if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') return Promise.resolve();
                throw new Error('Unexpected tx query: ' + sql);
            },
            release: vi.fn(),
        };
        this.client = client;
        return client;
    }
}

describe('InvitesService', () => {
    let db: MockDb; let service: InvitesService;
    beforeEach(() => {
        db = new MockDb();
        service = new InvitesService(db as any);
    });

    it('creates invite with normalized email', async () => {
        db.insertResult = { id: 'i1', org_id: 'org1', project_id: null, email: 'user@example.com', role: 'org_admin', status: 'pending', token: 'tkn' };
        const res = await service.create('org1', 'org_admin', 'User@Example.COM', null);
        expect(res).toMatchObject({ id: 'i1', email: 'user@example.com', role: 'org_admin', status: 'pending' });
        // ensure insert recorded
        expect(db.queries[0].params[2]).toBe('user@example.com');
    });

    it('rejects invalid email', async () => {
        await expect(service.create('org1', 'org_admin', 'bad-email', null)).rejects.toBeInstanceOf(BadRequestException);
    });

    it('accepts org_admin invite and creates membership', async () => {
        db.selectInvite = { id: 'i1', org_id: 'org1', project_id: null, email: 'user@example.com', role: 'org_admin', status: 'pending', token: 'tok' };
        const out = await service.accept('tok', 'user1');
        expect(out).toEqual({ status: 'accepted' });
        const client = await db.getClient();
        const txSqls = client.queries.map(q => q.sql);
        expect(txSqls).toContain('BEGIN');
        expect(txSqls.some(s => s.startsWith('INSERT INTO kb.organization_memberships'))).toBe(true);
        expect(txSqls).toContain('COMMIT');
    });

    it('accepts project invite and inserts project membership', async () => {
        db.selectInvite = { id: 'i2', org_id: 'org1', project_id: 'proj1', email: 'user@example.com', role: 'project_user', status: 'pending', token: 'tok2' };
        const out = await service.accept('tok2', 'user2');
        expect(out).toEqual({ status: 'accepted' });
        const client = await db.getClient();
        expect(client.queries.some((q: any) => q.sql.startsWith('INSERT INTO kb.project_memberships'))).toBe(true);
    });

    it('rejects unsupported non-admin org invite without project', async () => {
        db.selectInvite = { id: 'i3', org_id: 'org1', project_id: null, email: 'user@example.com', role: 'project_user', status: 'pending', token: 'tok3' };
        await expect(service.accept('tok3', 'user3')).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects not found invite', async () => {
        db.selectInvite = null;
        await expect(service.accept('does-not-exist', 'userX')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejects already accepted invite', async () => {
        db.selectInvite = { id: 'i4', org_id: 'org1', project_id: null, email: 'user@example.com', role: 'org_admin', status: 'accepted', token: 'tok4' };
        await expect(service.accept('tok4', 'userZ')).rejects.toBeInstanceOf(BadRequestException);
    });
});
