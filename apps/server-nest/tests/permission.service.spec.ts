import { describe, it, expect, beforeAll, vi } from 'vitest';
import { PermissionService } from '../src/modules/auth/permission.service';
import { DatabaseService } from '../src/common/database/database.service';

// Lightweight mock DatabaseService focusing on query() & isOnline()
class MockDb extends DatabaseService {
    constructor(private fixtures: { org?: any[]; project?: any[] }) { // eslint-disable-line @typescript-eslint/no-explicit-any
        // @ts-expect-error intentional bare super with dummy config
        super({} as any);
    }
    isOnline() { return true; }
    async query(text: string, params?: any[]) { // eslint-disable-line @typescript-eslint/no-explicit-any
        if (text.includes('FROM kb.organization_memberships')) {
            return { rows: this.fixtures.org || [], rowCount: (this.fixtures.org || []).length } as any;
        }
        if (text.includes('FROM kb.project_memberships')) {
            return { rows: this.fixtures.project || [], rowCount: (this.fixtures.project || []).length } as any;
        }
        throw new Error('Unexpected query: ' + text + ' params=' + JSON.stringify(params));
    }
}

describe('PermissionService', () => {
    it('grants org_admin full mapped scopes including chat:admin/documents:delete', async () => {
        const db = new MockDb({ org: [{ org_id: 'o1', role: 'org_admin' }] });
        const svc = new PermissionService(db as any);
        const perms = await svc.compute('user-1');
        expect(perms.scopes).toContain('chat:admin');
        expect(perms.scopes).toContain('documents:delete');
        expect(perms.scopes).toContain('org:project:create');
    });

    it('project_admin inherits project + documents full but not project creation/delete', async () => {
        const db = new MockDb({ project: [{ project_id: 'p1', role: 'project_admin' }] });
        const svc = new PermissionService(db as any);
        const perms = await svc.compute('user-2');
        expect(perms.scopes).toContain('project:read');
        expect(perms.scopes).toContain('documents:write');
        expect(perms.scopes).not.toContain('org:project:create');
    });

    it('project_user has read-only docs & chat:use', async () => {
        const db = new MockDb({ project: [{ project_id: 'p1', role: 'project_user' }] });
        const svc = new PermissionService(db as any);
        const perms = await svc.compute('user-3');
        expect(perms.scopes).toContain('documents:read');
        expect(perms.scopes).toContain('chat:use');
        expect(perms.scopes).not.toContain('documents:delete');
    });

    it('offline DB fallback returns minimal org:read only', async () => {
        const offline = new MockDb({});
        // override isOnline
        vi.spyOn(offline, 'isOnline').mockReturnValue(false);
        const svc = new PermissionService(offline as any);
        const perms = await svc.compute('user-x');
        expect(perms.scopes).toEqual(['org:read']);
    });
});
