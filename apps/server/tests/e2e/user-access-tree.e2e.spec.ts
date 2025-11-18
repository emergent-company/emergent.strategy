import { beforeAll, afterAll, beforeEach, describe, it, expect } from 'vitest';
import { createE2EContext, E2EContext } from './e2e-context';
import { authHeader } from './auth-helpers';

/**
 * E2E test for GET /user/orgs-and-projects endpoint
 * Verifies the hierarchical access tree returns organizations with nested projects and roles
 */

describe('User Access Tree (GET /user/orgs-and-projects)', () => {
  let ctx: E2EContext;

  beforeAll(async () => {
    ctx = await createE2EContext('user-access');
  });

  beforeEach(async () => {
    await ctx.cleanup();
  });

  afterAll(async () => {
    await ctx.close();
  });

  async function createOrg(baseUrl: string, name: string, userSuffix: string) {
    const res = await fetch(`${baseUrl}/orgs`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeader('all', userSuffix),
      },
      body: JSON.stringify({ name }),
    });
    expect(res.status).toBe(201);
    return res.json() as Promise<{ id: string; name: string }>;
  }

  async function createProject(
    baseUrl: string,
    name: string,
    orgId: string,
    userSuffix: string
  ) {
    const res = await fetch(`${baseUrl}/projects`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeader('all', userSuffix),
      },
      body: JSON.stringify({ name, orgId }),
    });
    expect(res.status).toBe(201);
    return res.json() as Promise<{ id: string; name: string; orgId: string }>;
  }

  it('returns 401 when not authenticated', async () => {
    const res = await fetch(`${ctx.baseUrl}/user/orgs-and-projects`);
    expect(res.status).toBe(401);
  });

  it('returns empty array when user has no org memberships', async () => {
    // Use a fresh user sub that has no memberships
    const res = await fetch(`${ctx.baseUrl}/user/orgs-and-projects`, {
      headers: authHeader('all', 'user-no-memberships'),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body).toHaveLength(0);
  });

  it('returns org with empty projects array when org exists but has no projects', async () => {
    // Create a new org (which will have no projects initially)
    const org = await createOrg(
      ctx.baseUrl,
      `Org-No-Proj-${Date.now()}`,
      'user-access'
    );

    const res = await fetch(`${ctx.baseUrl}/user/orgs-and-projects`, {
      headers: authHeader('all', 'user-access'),
    });
    expect(res.status).toBe(200);
    const body = await res.json();

    const foundOrg = body.find((o: any) => o.id === org.id);
    expect(foundOrg).toBeDefined();
    expect(foundOrg.name).toBe(org.name);
    expect(foundOrg.role).toBe('org_admin'); // Creator gets org_admin role
    expect(Array.isArray(foundOrg.projects)).toBe(true);
    expect(foundOrg.projects).toHaveLength(0);

    // Cleanup
    await ctx.cleanupExternalOrg(org.id);
  });

  it('returns hierarchical structure with org and nested projects', async () => {
    // Create org and projects
    const org = await createOrg(
      ctx.baseUrl,
      `Org-Hierarchy-${Date.now()}`,
      'user-access'
    );
    const proj1 = await createProject(
      ctx.baseUrl,
      'Project Alpha',
      org.id,
      'user-access'
    );
    const proj2 = await createProject(
      ctx.baseUrl,
      'Project Beta',
      org.id,
      'user-access'
    );

    const res = await fetch(`${ctx.baseUrl}/user/orgs-and-projects`, {
      headers: authHeader('all', 'user-access'),
    });
    expect(res.status).toBe(200);
    const body = await res.json();

    const foundOrg = body.find((o: any) => o.id === org.id);
    expect(foundOrg).toBeDefined();
    expect(foundOrg.name).toBe(org.name);
    expect(foundOrg.role).toBe('org_admin');
    expect(foundOrg.projects).toHaveLength(2);

    const foundProj1 = foundOrg.projects.find((p: any) => p.id === proj1.id);
    expect(foundProj1).toBeDefined();
    expect(foundProj1.name).toBe('Project Alpha');
    expect(foundProj1.orgId).toBe(org.id);
    expect(foundProj1.role).toBe('project_admin'); // Creator gets project_admin role in project

    const foundProj2 = foundOrg.projects.find((p: any) => p.id === proj2.id);
    expect(foundProj2).toBeDefined();
    expect(foundProj2.name).toBe('Project Beta');
    expect(foundProj2.orgId).toBe(org.id);
    expect(foundProj2.role).toBe('project_admin');

    // Cleanup
    await ctx.cleanupExternalOrg(org.id);
  });

  it('returns multiple orgs with their respective projects', async () => {
    // Create two separate orgs with projects
    const org1 = await createOrg(
      ctx.baseUrl,
      `Org-Multi-1-${Date.now()}`,
      'user-access'
    );
    const org2 = await createOrg(
      ctx.baseUrl,
      `Org-Multi-2-${Date.now()}`,
      'user-access'
    );
    const proj1 = await createProject(
      ctx.baseUrl,
      'Proj in Org 1',
      org1.id,
      'user-access'
    );
    const proj2 = await createProject(
      ctx.baseUrl,
      'Proj in Org 2',
      org2.id,
      'user-access'
    );

    const res = await fetch(`${ctx.baseUrl}/user/orgs-and-projects`, {
      headers: authHeader('all', 'user-access'),
    });
    expect(res.status).toBe(200);
    const body = await res.json();

    // Verify org1 structure
    const foundOrg1 = body.find((o: any) => o.id === org1.id);
    expect(foundOrg1).toBeDefined();
    expect(foundOrg1.projects).toHaveLength(1);
    expect(foundOrg1.projects[0].id).toBe(proj1.id);
    expect(foundOrg1.projects[0].name).toBe('Proj in Org 1');

    // Verify org2 structure
    const foundOrg2 = body.find((o: any) => o.id === org2.id);
    expect(foundOrg2).toBeDefined();
    expect(foundOrg2.projects).toHaveLength(1);
    expect(foundOrg2.projects[0].id).toBe(proj2.id);
    expect(foundOrg2.projects[0].name).toBe('Proj in Org 2');

    // Verify projects are NOT mixed between orgs
    expect(foundOrg1.projects.some((p: any) => p.id === proj2.id)).toBe(false);
    expect(foundOrg2.projects.some((p: any) => p.id === proj1.id)).toBe(false);

    // Cleanup
    await ctx.cleanupExternalOrg(org1.id);
    await ctx.cleanupExternalOrg(org2.id);
  });

  it('includes base context org and project from E2E setup', async () => {
    const res = await fetch(`${ctx.baseUrl}/user/orgs-and-projects`, {
      headers: authHeader('all', 'user-access'),
    });
    expect(res.status).toBe(200);
    const body = await res.json();

    // Should include the base E2E org and project
    expect(body.length).toBeGreaterThan(0);
    const hasBaseOrg = body.some((o: any) => o.id === ctx.orgId);
    expect(hasBaseOrg).toBe(true);

    if (hasBaseOrg) {
      const baseOrg = body.find((o: any) => o.id === ctx.orgId);
      const hasBaseProject = baseOrg.projects.some(
        (p: any) => p.id === ctx.projectId
      );
      expect(hasBaseProject).toBe(true);
    }
  });

  it('response includes required fields for org and project', async () => {
    const org = await createOrg(
      ctx.baseUrl,
      `Org-Fields-${Date.now()}`,
      'user-access'
    );
    const proj = await createProject(
      ctx.baseUrl,
      'Test Project',
      org.id,
      'user-access'
    );

    const res = await fetch(`${ctx.baseUrl}/user/orgs-and-projects`, {
      headers: authHeader('all', 'user-access'),
    });
    expect(res.status).toBe(200);
    const body = await res.json();

    const foundOrg = body.find((o: any) => o.id === org.id);

    // Verify org has required fields
    expect(foundOrg).toHaveProperty('id');
    expect(foundOrg).toHaveProperty('name');
    expect(foundOrg).toHaveProperty('role');
    expect(foundOrg).toHaveProperty('projects');
    expect(typeof foundOrg.id).toBe('string');
    expect(typeof foundOrg.name).toBe('string');
    expect(typeof foundOrg.role).toBe('string');
    expect(Array.isArray(foundOrg.projects)).toBe(true);

    // Verify project has required fields
    const foundProj = foundOrg.projects.find((p: any) => p.id === proj.id);
    expect(foundProj).toHaveProperty('id');
    expect(foundProj).toHaveProperty('name');
    expect(foundProj).toHaveProperty('orgId');
    expect(foundProj).toHaveProperty('role');
    expect(typeof foundProj.id).toBe('string');
    expect(typeof foundProj.name).toBe('string');
    expect(typeof foundProj.orgId).toBe('string');
    expect(typeof foundProj.role).toBe('string');

    // Cleanup
    await ctx.cleanupExternalOrg(org.id);
  });

  it('returns 200 with proper content-type header', async () => {
    const res = await fetch(`${ctx.baseUrl}/user/orgs-and-projects`, {
      headers: authHeader('all', 'user-access'),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('application/json');
  });
});
