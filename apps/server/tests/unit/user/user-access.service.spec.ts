import { describe, it, expect, vi } from 'vitest';
import { UserAccessService } from '../../../src/modules/user/user-access.service';

/**
 * Unit tests for UserAccessService
 * Covers getAccessTree() method with various scenarios
 */

class FakeDataSource {
  constructor(private orgRows: any[] = [], private projectRows: any[] = []) {}

  async query(sql: string, _params?: any[]): Promise<any[]> {
    const lowerSql = sql.toLowerCase().replace(/\s+/g, ' ');

    // Org query
    if (
      lowerSql.includes('from kb.orgs') &&
      lowerSql.includes('organization_memberships')
    ) {
      return this.orgRows;
    }

    // Project query
    if (
      lowerSql.includes('from kb.projects') &&
      lowerSql.includes('project_memberships')
    ) {
      return this.projectRows;
    }

    return [];
  }
}

describe('UserAccessService', () => {
  it('returns empty array when userId is not provided', async () => {
    const dataSource = new FakeDataSource();
    const service = new UserAccessService(dataSource as any);

    const result = await service.getAccessTree('');
    expect(result).toEqual([]);
  });

  it('returns empty array when user has no memberships', async () => {
    const dataSource = new FakeDataSource([], []);
    const service = new UserAccessService(dataSource as any);

    const result = await service.getAccessTree('user-123');
    expect(result).toEqual([]);
  });

  it('returns orgs without projects when user has org memberships but no project memberships', async () => {
    const orgRows = [
      { org_id: 'org-1', org_name: 'Acme Corp', role: 'owner' },
      { org_id: 'org-2', org_name: 'Beta Inc', role: 'member' },
    ];
    const projectRows: any[] = [];

    const dataSource = new FakeDataSource(orgRows, projectRows);
    const service = new UserAccessService(dataSource as any);

    const result = await service.getAccessTree('user-123');

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      id: 'org-1',
      name: 'Acme Corp',
      role: 'owner',
      projects: [],
    });
    expect(result[1]).toEqual({
      id: 'org-2',
      name: 'Beta Inc',
      role: 'member',
      projects: [],
    });
  });

  it('returns hierarchical structure with orgs and nested projects', async () => {
    const orgRows = [
      { org_id: 'org-1', org_name: 'Acme Corp', role: 'owner' },
      { org_id: 'org-2', org_name: 'Beta Inc', role: 'member' },
    ];
    const projectRows = [
      {
        project_id: 'proj-1',
        project_name: 'Project Alpha',
        org_id: 'org-1',
        role: 'admin',
        kb_purpose: 'Documentation',
        auto_extract_objects: true,
        auto_extract_config: { enabled: true },
      },
      {
        project_id: 'proj-2',
        project_name: 'Project Beta',
        org_id: 'org-1',
        role: 'viewer',
        kb_purpose: null,
        auto_extract_objects: false,
        auto_extract_config: null,
      },
      {
        project_id: 'proj-3',
        project_name: 'Project Gamma',
        org_id: 'org-2',
        role: 'editor',
        kb_purpose: 'Research',
        auto_extract_objects: null,
        auto_extract_config: null,
      },
    ];

    const dataSource = new FakeDataSource(orgRows, projectRows);
    const service = new UserAccessService(dataSource as any);

    const result = await service.getAccessTree('user-123');

    expect(result).toHaveLength(2);

    // Org 1 with 2 projects
    expect(result[0].id).toBe('org-1');
    expect(result[0].name).toBe('Acme Corp');
    expect(result[0].role).toBe('owner');
    expect(result[0].projects).toHaveLength(2);

    expect(result[0].projects[0]).toEqual({
      id: 'proj-1',
      name: 'Project Alpha',
      orgId: 'org-1',
      role: 'admin',
      kb_purpose: 'Documentation',
      auto_extract_objects: true,
      auto_extract_config: { enabled: true },
    });

    expect(result[0].projects[1]).toEqual({
      id: 'proj-2',
      name: 'Project Beta',
      orgId: 'org-1',
      role: 'viewer',
      auto_extract_objects: false, // false is included (not null)
    });

    // Org 2 with 1 project
    expect(result[1].id).toBe('org-2');
    expect(result[1].name).toBe('Beta Inc');
    expect(result[1].role).toBe('member');
    expect(result[1].projects).toHaveLength(1);

    expect(result[1].projects[0]).toEqual({
      id: 'proj-3',
      name: 'Project Gamma',
      orgId: 'org-2',
      role: 'editor',
      kb_purpose: 'Research',
    });
  });

  it('handles projects with null optional fields correctly', async () => {
    const orgRows = [{ org_id: 'org-1', org_name: 'Test Org', role: 'owner' }];
    const projectRows = [
      {
        project_id: 'proj-1',
        project_name: 'Minimal Project',
        org_id: 'org-1',
        role: 'admin',
        kb_purpose: null,
        auto_extract_objects: null,
        auto_extract_config: null,
      },
    ];

    const dataSource = new FakeDataSource(orgRows, projectRows);
    const service = new UserAccessService(dataSource as any);

    const result = await service.getAccessTree('user-123');

    expect(result[0].projects[0]).toEqual({
      id: 'proj-1',
      name: 'Minimal Project',
      orgId: 'org-1',
      role: 'admin',
    });

    // Ensure optional fields are not included
    expect(result[0].projects[0]).not.toHaveProperty('kb_purpose');
    expect(result[0].projects[0]).not.toHaveProperty('auto_extract_objects');
    expect(result[0].projects[0]).not.toHaveProperty('auto_extract_config');
  });

  it('only includes projects under their parent organization', async () => {
    const orgRows = [
      { org_id: 'org-1', org_name: 'Org One', role: 'owner' },
      { org_id: 'org-2', org_name: 'Org Two', role: 'member' },
    ];
    const projectRows = [
      {
        project_id: 'proj-1',
        project_name: 'Project in Org 1',
        org_id: 'org-1',
        role: 'admin',
        kb_purpose: null,
        auto_extract_objects: false,
        auto_extract_config: null,
      },
      {
        project_id: 'proj-orphan',
        project_name: 'Orphan Project',
        org_id: 'org-999', // Organization user is not a member of
        role: 'viewer',
        kb_purpose: null,
        auto_extract_objects: false,
        auto_extract_config: null,
      },
    ];

    const dataSource = new FakeDataSource(orgRows, projectRows);
    const service = new UserAccessService(dataSource as any);

    const result = await service.getAccessTree('user-123');

    expect(result).toHaveLength(2);
    expect(result[0].projects).toHaveLength(1);
    expect(result[0].projects[0].id).toBe('proj-1');
    expect(result[1].projects).toHaveLength(0);

    // Verify orphan project is not included anywhere
    const allProjects = result.flatMap((org) => org.projects);
    expect(allProjects.some((p) => p.id === 'proj-orphan')).toBe(false);
  });

  it('maintains org order from query (most recent first)', async () => {
    const orgRows = [
      { org_id: 'org-3', org_name: 'Newest Org', role: 'owner' },
      { org_id: 'org-2', org_name: 'Middle Org', role: 'member' },
      { org_id: 'org-1', org_name: 'Oldest Org', role: 'viewer' },
    ];
    const projectRows: any[] = [];

    const dataSource = new FakeDataSource(orgRows, projectRows);
    const service = new UserAccessService(dataSource as any);

    const result = await service.getAccessTree('user-123');

    expect(result[0].id).toBe('org-3');
    expect(result[1].id).toBe('org-2');
    expect(result[2].id).toBe('org-1');
  });

  it('handles auto_extract_objects as false (not null)', async () => {
    const orgRows = [{ org_id: 'org-1', org_name: 'Test Org', role: 'owner' }];
    const projectRows = [
      {
        project_id: 'proj-1',
        project_name: 'Project with false flag',
        org_id: 'org-1',
        role: 'admin',
        kb_purpose: 'Testing',
        auto_extract_objects: false, // Explicitly false, not null
        auto_extract_config: { some: 'config' },
      },
    ];

    const dataSource = new FakeDataSource(orgRows, projectRows);
    const service = new UserAccessService(dataSource as any);

    const result = await service.getAccessTree('user-123');

    expect(result[0].projects[0]).toEqual({
      id: 'proj-1',
      name: 'Project with false flag',
      orgId: 'org-1',
      role: 'admin',
      kb_purpose: 'Testing',
      auto_extract_objects: false,
      auto_extract_config: { some: 'config' },
    });
  });

  it('makes exactly 2 database queries (orgs + projects)', async () => {
    const querySpy = vi.fn().mockResolvedValue([]);
    const dataSource = {
      query: querySpy,
    };

    const service = new UserAccessService(dataSource as any);
    await service.getAccessTree('user-123');

    expect(querySpy).toHaveBeenCalledTimes(2);
  });
});
