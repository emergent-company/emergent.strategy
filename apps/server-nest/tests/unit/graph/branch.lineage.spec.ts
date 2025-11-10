import { describe, it, expect, beforeEach } from 'vitest';
import { BranchService } from '../../../src/modules/graph/branch.service';
import { DatabaseService } from '../../../src/common/database/database.service';

/**
 * Lightweight in-memory mock of DatabaseService focusing on branches + branch_lineage tables.
 * We avoid bringing a real DB; only the query patterns used by BranchService are implemented.
 */
class MockDb implements Partial<DatabaseService> {
    branches: any[] = [];
    lineage: any[] = [];
    // Simulate pg query signature subset
    async query<T = any>(text: string, params: any[] = []): Promise<{ rows: T[]; rowCount: number; command: string; fields: any[]; oid: number }> {
        const norm = text.trim().toLowerCase();
        if (norm === 'begin' || norm === 'commit' || norm === 'rollback') {
            return { rows: [] as any, rowCount: 0, command: norm.toUpperCase(), fields: [], oid: 0 };
        }
        if (norm.startsWith('select id from kb.branches where project_id')) { // uniqueness check
            const projectId = params[0]; const name = params[1];
            const found = this.branches.filter(b => b.project_id === projectId && b.name === name).map(b => ({ id: b.id }));
            return { rows: found as any, rowCount: found.length, command: 'SELECT', fields: [], oid: 0 };
        }
        if (norm.startsWith('select id from kb.branches where id=')) { // parent existence
            const id = params[0]; const row = this.branches.find(b => b.id === id);
            return { rows: row ? [{ id: row.id }] as any : [], rowCount: row ? 1 : 0, command: 'SELECT', fields: [], oid: 0 };
        }
        if (norm.startsWith('insert into kb.branches')) {
            const row = { id: `b_${this.branches.length + 1}`, organization_id: params[0], project_id: params[1], name: params[2], parent_branch_id: params[3], created_at: new Date().toISOString() };
            this.branches.push(row);
            return { rows: [row] as any, rowCount: 1, command: 'INSERT', fields: [], oid: 0 };
        }
        if (norm.startsWith('insert into kb.branch_lineage')) {
            // Two patterns used in service:
            // 1) VALUES ($1,$1,0)  -> self row
            // 2) INSERT .. SELECT $1 as branch_id, ancestor_branch_id, depth + 1 FROM kb.branch_lineage WHERE branch_id=$2
            // 3) VALUES ($1,$2,1)  -> explicit direct parent depth=1
            if (norm.includes('select $1 as branch_id')) {
                // params: [childId, parentId]
                const childId = params[0];
                const parentId = params[1];
                const parentRows = this.lineage.filter(l => l.branch_id === parentId);
                for (const pr of parentRows) {
                    const newRow = { branch_id: childId, ancestor_branch_id: pr.ancestor_branch_id, depth: pr.depth + 1 };
                    if (!this.lineage.find(l => l.branch_id === newRow.branch_id && l.ancestor_branch_id === newRow.ancestor_branch_id)) {
                        this.lineage.push(newRow);
                    }
                }
                return { rows: [], rowCount: parentRows.length, command: 'INSERT', fields: [], oid: 0 };
            }
            // VALUES variants
            if (norm.includes('values ($1,$1,0')) {
                const row = { branch_id: params[0], ancestor_branch_id: params[0], depth: 0 };
                if (!this.lineage.find(l => l.branch_id === row.branch_id && l.ancestor_branch_id === row.ancestor_branch_id)) {
                    this.lineage.push(row);
                }
                return { rows: [], rowCount: 1, command: 'INSERT', fields: [], oid: 0 };
            }
            if (norm.includes('values ($1,$2,1')) {
                const row = { branch_id: params[0], ancestor_branch_id: params[1], depth: 1 };
                if (!this.lineage.find(l => l.branch_id === row.branch_id && l.ancestor_branch_id === row.ancestor_branch_id)) {
                    this.lineage.push(row);
                }
                return { rows: [], rowCount: 1, command: 'INSERT', fields: [], oid: 0 };
            }
            // Fallback generic (should not normally hit)
            const row = { branch_id: params[0], ancestor_branch_id: params[1] ?? params[0], depth: params[2] ?? 0 };
            if (!this.lineage.find(l => l.branch_id === row.branch_id && l.ancestor_branch_id === row.ancestor_branch_id)) {
                this.lineage.push(row);
            }
            return { rows: [], rowCount: 1, command: 'INSERT', fields: [], oid: 0 };
        }
        if (norm.startsWith('select id, parent_branch_id from kb.branches where id=')) {
            const id = params[0]; const row = this.branches.find(b => b.id === id);
            return { rows: row ? [{ id: row.id, parent_branch_id: row.parent_branch_id }] as any : [], rowCount: row ? 1 : 0, command: 'SELECT', fields: [], oid: 0 };
        }
        // We do not directly issue a SELECT for lineage copy in the service (it's an INSERT..SELECT handled server-side); skip.
        throw new Error('Unhandled SQL in mock: ' + text);
    }
    // getClient() minimal transactional shim just returning self with BEGIN/COMMIT no-ops
    async getClient(): Promise<any> {
        return {
            query: (text: string, params?: any[]) => this.query(text, params),
            release: () => { },
        };
    }
}

describe('BranchService lineage population', () => {
    let service: BranchService; let db: MockDb;

    beforeEach(() => {
        db = new MockDb();
        // Pattern 5: BranchService now uses TypeORM Repository + DataSource
        // Mock minimal Repository and DataSource to satisfy constructor
        const mockRepository = {} as any;
        const mockDataSource = {} as any;
        service = new BranchService(mockRepository, mockDataSource, db as any);
    });

    it('creates root branch with self lineage depth=0', async () => {
        const branch = await service.create({ name: 'main', project_id: 'p1', organization_id: 'o1' });
        expect(branch.id).toBeDefined();
        const self = db.lineage.find(l => l.branch_id === branch.id && l.ancestor_branch_id === branch.id && l.depth === 0);
        expect(self).toBeTruthy();
    });

    it('creates child branch copying parent lineage and adding parent depth=1', async () => {
        const parent = await service.create({ name: 'main', project_id: 'p1', organization_id: 'o1' });
        const child = await service.create({ name: 'feature', project_id: 'p1', organization_id: 'o1', parent_branch_id: parent.id });
        // Parent self lineage
        expect(db.lineage.find(l => l.branch_id === parent.id && l.ancestor_branch_id === parent.id && l.depth === 0)).toBeTruthy();
        // Child self lineage
        expect(db.lineage.find(l => l.branch_id === child.id && l.ancestor_branch_id === child.id && l.depth === 0)).toBeTruthy();
        // Child parent lineage depth=1
        expect(db.lineage.find(l => l.branch_id === child.id && l.ancestor_branch_id === parent.id && l.depth === 1)).toBeTruthy();
    });
});
