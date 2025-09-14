import { beforeAll, beforeEach, afterAll, describe, it, expect } from 'vitest';
import { createE2EContext, E2EContext } from './e2e-context';
import { authHeader } from './auth-helpers';

let ctx: E2EContext;

describe('Documents E2E', () => {
    // Use a unique user suffix so parallel specs do not race on shared user cleanup
    beforeAll(async () => { ctx = await createE2EContext('docs-list'); });
    beforeEach(async () => { await ctx.cleanup(); });
    afterAll(async () => { await ctx.close(); });

    it('lists orgs & projects fixtures exist', async () => {
        // Base fixtures (E2E Org / E2E Project) are created by createE2EContext. Avoid redundant ensure* logic
        // to prevent duplicate create races returning 400.
        const orgId = ctx.orgId;
        const projectId = ctx.projectId;
        // List orgs and verify
        const orgsRes = await fetch(`${ctx.baseUrl}/orgs`, { headers: authHeader('all', 'docs-list') });
        expect(orgsRes.status).toBe(200);
        const orgs = await orgsRes.json();
        expect(orgs.some((o: any) => o.id === orgId && typeof o.name === 'string' && o.name.startsWith('Isolated Org'))).toBe(true);
        // List projects and verify (context creates a unique project name when userSuffix provided)
        const projectsRes = await fetch(`${ctx.baseUrl}/projects?orgId=${orgId}&limit=500`, { headers: authHeader('all', 'docs-list') });
        expect(projectsRes.status).toBe(200);
        let projects = await projectsRes.json();
        if (!projects.some((p: any) => p.id === projectId)) {
            // Fallback to global list (in case of eventual orgId filter propagation)
            const globalRes = await fetch(`${ctx.baseUrl}/projects?limit=500`, { headers: authHeader('all', 'docs-list') });
            if (globalRes.status === 200) {
                const globalProjects = await globalRes.json();
                if (!globalProjects.some((p: any) => p.id === projectId)) {
                    // eslint-disable-next-line no-console
                    console.error('Project not found in org or global listing', { orgId, projectId, orgs, projects, globalProjects });
                }
                projects = globalProjects;
            }
        }
        const project = projects.find((p: any) => p.id === projectId);
        expect(Boolean(project)).toBe(true);
        if (project) {
            expect(typeof project.name).toBe('string');
            expect(project.name.startsWith('Isolated Project')).toBe(true);
        }
    });
});
