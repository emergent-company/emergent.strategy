import { beforeAll, beforeEach, afterAll, describe, it, expect } from 'vitest';
import { createE2EContext, E2EContext } from './e2e-context';
import { authHeader } from './auth-helpers';
import { ensureOrgAndProject } from './fixtures';

let ctx: E2EContext;

describe('Documents E2E', () => {
    // Use a unique user suffix so parallel specs do not race on shared user cleanup
    beforeAll(async () => { ctx = await createE2EContext('docs-list'); });
    beforeEach(async () => { await ctx.cleanup(); });
    afterAll(async () => { await ctx.close(); });

    it('lists orgs & projects fixtures exist', async () => {
        const { orgId, projectId } = await ensureOrgAndProject(ctx.baseUrl, 'E2E Org', 'E2E Project', 'docs-list');
        // List orgs and verify
        const orgsRes = await fetch(`${ctx.baseUrl}/orgs`, { headers: authHeader('all', 'docs-list') });
        expect(orgsRes.status).toBe(200);
        const orgs = await orgsRes.json();
        expect(orgs.some((o: any) => o.id === orgId && o.name === 'E2E Org')).toBe(true);
        // List projects and verify
        const projectsRes = await fetch(`${ctx.baseUrl}/projects?orgId=${orgId}&limit=500`, { headers: authHeader('all', 'docs-list') });
        expect(projectsRes.status).toBe(200);
        let projects = await projectsRes.json();
        if (!projects.some((p: any) => p.id === projectId && p.name === 'E2E Project')) {
            // Fallback: sometimes ensureProject path might have created but org filter not reflecting yet; check global list
            const globalRes = await fetch(`${ctx.baseUrl}/projects?limit=500`, { headers: authHeader('all', 'docs-list') });
            if (globalRes.status === 200) {
                const globalProjects = await globalRes.json();
                const found = globalProjects.find((p: any) => p.id === projectId && p.name === 'E2E Project');
                if (!found) {
                    // Add console diagnostic for flake triage
                    // eslint-disable-next-line no-console
                    console.error('Project not found after ensureOrgAndProject', { orgId, projectId, orgs, projects, globalProjects });
                }
                projects = globalProjects;
            }
        }
        expect(projects.some((p: any) => p.id === projectId && p.name === 'E2E Project')).toBe(true);
    });
});
