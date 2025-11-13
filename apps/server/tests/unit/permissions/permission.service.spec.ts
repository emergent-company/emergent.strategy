import { describe, it, expect, beforeAll, vi } from 'vitest';
import { PermissionService } from '../../../src/modules/auth/permission.service';
import { DatabaseService } from '../../../src/common/database/database.service';

// Mock repositories for TypeORM
function createMockRepo(fixtures: any[]) {
  // eslint-disable-line @typescript-eslint/no-explicit-any
  return {
    find: vi.fn(async (opts?: any) => {
      // eslint-disable-line @typescript-eslint/no-explicit-any
      if (!opts || !opts.where) return fixtures;
      const { userId } = opts.where;
      return fixtures.filter((f: any) => !f.user_id || f.user_id === userId); // eslint-disable-line @typescript-eslint/no-explicit-any
    }),
  };
}

// Lightweight mock DatabaseService for isOnline()
class MockDb extends DatabaseService {
  constructor() {
    super({} as any); // eslint-disable-line @typescript-eslint/no-explicit-any
  }
  isOnline() {
    return true;
  }
}

describe('PermissionService', () => {
  it('grants org_admin full mapped scopes including chat:admin/documents:delete', async () => {
    const orgRepo = createMockRepo([
      { user_id: 'user-1', organization_id: 'o1', role: 'org_admin' },
    ]);
    const projectRepo = createMockRepo([]);
    const db = new MockDb();
    const svc = new PermissionService(
      orgRepo as any,
      projectRepo as any,
      db as any
    );
    const perms = await svc.compute('user-1');
    expect(perms.scopes).toContain('chat:admin');
    expect(perms.scopes).toContain('documents:delete');
    expect(perms.scopes).toContain('org:project:create');
  });

  it('project_admin inherits project + documents full but not project creation/delete', async () => {
    const orgRepo = createMockRepo([]);
    const projectRepo = createMockRepo([
      { user_id: 'user-2', project_id: 'p1', role: 'project_admin' },
    ]);
    const db = new MockDb();
    const svc = new PermissionService(
      orgRepo as any,
      projectRepo as any,
      db as any
    );
    const perms = await svc.compute('user-2');
    expect(perms.scopes).toContain('project:read');
    expect(perms.scopes).toContain('documents:write');
    expect(perms.scopes).not.toContain('org:project:create');
  });

  it('project_user has read-only docs & chat:use', async () => {
    const orgRepo = createMockRepo([]);
    const projectRepo = createMockRepo([
      { user_id: 'user-3', project_id: 'p1', role: 'project_user' },
    ]);
    const db = new MockDb();
    const svc = new PermissionService(
      orgRepo as any,
      projectRepo as any,
      db as any
    );
    const perms = await svc.compute('user-3');
    expect(perms.scopes).toContain('documents:read');
    expect(perms.scopes).toContain('chat:use');
    expect(perms.scopes).not.toContain('documents:delete');
  });

  it('offline DB fallback returns minimal org:read only', async () => {
    const orgRepo = createMockRepo([]);
    const projectRepo = createMockRepo([]);
    const offline = new MockDb();
    // override isOnline
    vi.spyOn(offline, 'isOnline').mockReturnValue(false);
    const svc = new PermissionService(
      orgRepo as any,
      projectRepo as any,
      offline as any
    );
    const perms = await svc.compute('user-x');
    expect(perms.scopes).toEqual(['org:read']);
  });
});
