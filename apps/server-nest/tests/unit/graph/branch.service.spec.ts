import { describe, it, expect, beforeEach } from 'vitest';
import { BranchService } from '../../../src/modules/graph/branch.service';
import { DatabaseService } from '../../../src/common/database/database.service';
import { BadRequestException, NotFoundException } from '@nestjs/common';

// Lightweight in-memory mock of DatabaseService focusing on the small subset of
// SQL used by BranchService. Updated to handle transactional lineage population.
class MockDatabaseService implements Partial<DatabaseService> {
    branches: any[] = [];
    lineage: any[] = [];

    async query<T = any>(sql: string, params: any[] = []): Promise<any> {
        const norm = sql.replace(/\s+/g, ' ').toLowerCase();
        if (norm === 'begin' || norm === 'commit' || norm === 'rollback') {
            return { rows: [], rowCount: 0, command: norm.toUpperCase(), fields: [], oid: 0 };
        }
        if (norm.startsWith('select id from kb.branches')) { // uniqueness check or parent lookup
            if (norm.includes('where id=$1')) {
                const id = params[0];
                const row = this.branches.find(b => b.id === id);
                const rows: any[] = row ? [{ id: row.id }] : [];
                return { rows, rowCount: rows.length, command: 'SELECT', fields: [], oid: 0 };
            }
            // uniqueness by project + name (project_id IS NOT DISTINCT FROM $1 AND name=$2)
            const [projectId, name] = params;
            const found = this.branches.filter(b => b.project_id === projectId && b.name === name).map(b => ({ id: b.id }));
            return { rows: found as any, rowCount: found.length, command: 'SELECT', fields: [], oid: 0 };
        }
        if (norm.startsWith('insert into kb.branches')) {
            const [project_id, name, parent_branch_id] = params;
            const id = `b_${this.branches.length + 1}`;
            const row = { id, project_id, name, parent_branch_id, created_at: new Date().toISOString() };
            this.branches.push(row);
            return { rows: [row] as any, rowCount: 1, command: 'INSERT', fields: [], oid: 0 };
        }
        // lineage inserts
        if (norm.startsWith('insert into kb.branch_lineage')) {
            // Patterns used by service:
            // VALUES ($1,$1,0) self
            // INSERT .. SELECT $1 as branch_id, ancestor_branch_id, depth + 1 FROM kb.branch_lineage WHERE branch_id=$2
            // VALUES ($1,$2,1) direct parent
            if (norm.includes('values ($1,$1,0')) {
                const id = params[0];
                if (!this.lineage.find(l => l.branch_id === id && l.ancestor_branch_id === id)) {
                    this.lineage.push({ branch_id: id, ancestor_branch_id: id, depth: 0 });
                }
                return { rows: [], rowCount: 1, command: 'INSERT', fields: [], oid: 0 };
            }
            if (norm.includes('select $1 as branch_id')) {
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
            if (norm.includes('values ($1,$2,1')) {
                const childId = params[0];
                const parentId = params[1];
                if (!this.lineage.find(l => l.branch_id === childId && l.ancestor_branch_id === parentId)) {
                    this.lineage.push({ branch_id: childId, ancestor_branch_id: parentId, depth: 1 });
                }
                return { rows: [], rowCount: 1, command: 'INSERT', fields: [], oid: 0 };
            }
        }
        if (norm.startsWith('select id, project_id')) { // list queries
            if (norm.includes('where project_id is not distinct from $1')) {
                const [projectId] = params;
                const rows = this.branches.filter(b => b.project_id === projectId);
                return { rows: rows as any, rowCount: rows.length, command: 'SELECT', fields: [], oid: 0 };
            }
            return { rows: this.branches as any, rowCount: this.branches.length, command: 'SELECT', fields: [], oid: 0 };
        }
        throw new Error('Unexpected SQL in mock: ' + sql);
    }

    async getClient(): Promise<any> { return { query: (s: string, p?: any[]) => this.query(s, p), release: () => { } }; }
}

describe('BranchService', () => {
    let service: BranchService;
    let db: MockDatabaseService;

    beforeEach(() => {
        db = new MockDatabaseService();

        // Create mock repository that reads from db.branches
        const mockRepository = {
            save: () => Promise.resolve(null),
            findOne: () => Promise.resolve(null),
            find: async (options?: any) => {
                // If options.where.projectId is provided, filter by project
                if (options?.where?.projectId) {
                    return db.branches.filter(b => b.project_id === options.where.projectId)
                        .map(b => ({
                            id: b.id,
                            projectId: b.project_id,
                            name: b.name,
                            parentBranchId: b.parent_branch_id,
                            createdAt: new Date(b.created_at)
                        }));
                }
                // Return all branches
                return db.branches.map(b => ({
                    id: b.id,
                    projectId: b.project_id,
                    name: b.name,
                    parentBranchId: b.parent_branch_id,
                    createdAt: new Date(b.created_at)
                }));
            },
            create: () => ({}),
            update: () => Promise.resolve(null),
            delete: () => Promise.resolve(null),
        } as any;

        // Create mock DataSource
        const mockDataSource = {
            query: (sql: string, params?: any[]) => db.query(sql, params),
            createQueryRunner: () => ({
                connect: () => Promise.resolve(),
                startTransaction: () => Promise.resolve(),
                commitTransaction: () => Promise.resolve(),
                rollbackTransaction: () => Promise.resolve(),
                release: () => Promise.resolve(),
            }),
        } as any;

        // Constructor expects: (branchRepository, dataSource, db)
        // @ts-expect-error partial mock injection
        service = new BranchService(mockRepository, mockDataSource, db as DatabaseService);
    });

    it('creates a branch successfully', async () => {
        const created = await service.create({ name: 'main', project_id: 'p1' });
        expect(created.name).toBe('main');
        expect(created.project_id).toBe('p1');
        expect(created.id).toMatch(/^b_/);
        const list = await service.list('p1');
        expect(list).toHaveLength(1);
        // lineage self row
        expect(db.lineage.find(l => l.branch_id === created.id && l.ancestor_branch_id === created.id && l.depth === 0)).toBeTruthy();
    });

    it('rejects blank / whitespace branch name', async () => {
        await expect(service.create({ name: '   ', project_id: 'p1' })).rejects.toThrow(BadRequestException);
    });

    it('rejects duplicate branch name within same project', async () => {
        await service.create({ name: 'main', project_id: 'p1' });
        await expect(service.create({ name: 'main', project_id: 'p1' })).rejects.toThrow(BadRequestException);
    });

    it('allows same branch name across different projects', async () => {
        await service.create({ name: 'main', project_id: 'p1' });
        await service.create({ name: 'main', project_id: 'p2' });
        const listP1 = await service.list('p1');
        const listP2 = await service.list('p2');
        expect(listP1).toHaveLength(1);
        expect(listP2).toHaveLength(1);
    });

    it('throws when parent branch does not exist', async () => {
        await expect(service.create({ name: 'feature', project_id: 'p1', parent_branch_id: 'missing' }))
            .rejects.toThrow(NotFoundException);
    });

    it('creates with existing parent branch id', async () => {
        const parent = await service.create({ name: 'main', project_id: 'p1' });
        const child = await service.create({ name: 'feature', project_id: 'p1', parent_branch_id: parent.id });
        expect(child.parent_branch_id).toBe(parent.id);
        const list = await service.list('p1');
        expect(list.map(b => b.name)).toEqual(['main', 'feature']);
        // lineage: child self + parent depth=1
        expect(db.lineage.find(l => l.branch_id === child.id && l.ancestor_branch_id === child.id && l.depth === 0)).toBeTruthy();
        expect(db.lineage.find(l => l.branch_id === child.id && l.ancestor_branch_id === parent.id && l.depth === 1)).toBeTruthy();
    });
});
