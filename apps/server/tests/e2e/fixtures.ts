import { authHeader } from './auth-helpers';

/** Ensure an organization with given name exists; returns its id. */
export async function ensureOrg(baseUrl: string, name: string, userKey: string): Promise<string> {
    // List existing orgs first
    const listRes = await fetch(`${baseUrl}/orgs`, { headers: authHeader('all', userKey) });
    if (listRes.status === 200) {
        const orgs = await listRes.json() as { id: string; name: string }[];
        const existing = orgs.find(o => o.name === name);
        if (existing) return existing.id;
    }
    // Try create (ignore conflicts or validation diffs)
    await fetch(`${baseUrl}/orgs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeader('all', userKey) },
        body: JSON.stringify({ name })
    });
    // Re-list to capture id
    const relist = await fetch(`${baseUrl}/orgs`, { headers: authHeader('all', userKey) });
    if (relist.status !== 200) throw new Error('Failed to list orgs after creation attempt');
    const orgs2 = await relist.json() as { id: string; name: string }[];
    const found = orgs2.find(o => o.name === name);
    if (!found) throw new Error(`Org ${name} not found after ensure`);
    return found.id;
}

/** Ensure a project with given name exists under org; returns its id. */
export async function ensureProject(baseUrl: string, orgId: string, name: string, userKey: string): Promise<string> {
    const listRes = await fetch(`${baseUrl}/projects?orgId=${orgId}&limit=500`, { headers: authHeader('all', userKey) });
    if (listRes.status === 200) {
        const projects = await listRes.json() as { id: string; name: string }[];
        const existing = projects.find(p => p.name === name);
        if (existing) return existing.id;
    }
    // Fallback: project might exist but not yet visible due to eventual ordering; check global list
    const globalListRes = await fetch(`${baseUrl}/projects?limit=500`, { headers: authHeader('all', userKey) });
    if (globalListRes.status === 200) {
        const globalProjects = await globalListRes.json() as { id: string; name: string; orgId?: string }[];
        const globalExisting = globalProjects.find(p => p.name === name);
        if (globalExisting) return globalExisting.id;
    }
    const createRes = await fetch(`${baseUrl}/projects`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeader('all', userKey) },
        body: JSON.stringify({ name, orgId })
    });
    if (createRes.status >= 400) {
        // If duplicate (already exists but initial list missed due to race), re-list once.
        const retryList = await fetch(`${baseUrl}/projects?orgId=${orgId}&limit=500`, { headers: authHeader('all', userKey) });
        if (retryList.status === 200) {
            const again = await retryList.json() as { id: string; name: string }[];
            const dup = again.find(p => p.name === name);
            if (dup) return dup.id;
        }
        throw new Error(`Failed to create project ${name}: status ${createRes.status}`);
    }
    try {
        const created = await createRes.json() as { id?: string; name?: string; orgId?: string };
        if (created?.name === name && created?.id) return created.id;
    } catch {/* ignore json parse issues and fallback to list */ }
    const finalList = await fetch(`${baseUrl}/projects?orgId=${orgId}&limit=500`, { headers: authHeader('all', userKey) });
    if (finalList.status !== 200) throw new Error('Failed to list projects after creation');
    const finalProjects = await finalList.json() as { id: string; name: string }[];
    const createdMatch = finalProjects.find(p => p.name === name);
    if (!createdMatch) throw new Error(`Project ${name} not found after creation`);
    return createdMatch.id;
}

export async function ensureOrgAndProject(baseUrl: string, orgName: string, projectName: string, userKey: string): Promise<{ orgId: string; projectId: string; }> {
    const orgId = await ensureOrg(baseUrl, orgName, userKey);
    const projectId = await ensureProject(baseUrl, orgId, projectName, userKey);
    return { orgId, projectId };
}
