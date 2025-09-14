import { authHeader } from '../auth-helpers';

/** Delete project via API (idempotent) */
export async function deleteProject(baseUrl: string, projectId: string, userSuffix: string): Promise<number> {
    const res = await fetch(`${baseUrl}/projects/${projectId}`, { method: 'DELETE', headers: authHeader('all', userSuffix) });
    return res.status; // caller can assert 200 or 404
}
