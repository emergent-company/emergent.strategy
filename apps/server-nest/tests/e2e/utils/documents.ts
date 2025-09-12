import type { E2EContext } from '../e2e-context';
import { authHeader } from '../auth-helpers';
import { expectStatusOneOf } from '../utils';

export interface CreatedDocument { id: string; filename: string; }

export async function createDocument(ctx: E2EContext, filename: string, content: string, opts?: { userSuffix?: string }): Promise<CreatedDocument> {
    const res = await fetch(`${ctx.baseUrl}/documents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeader('all', opts?.userSuffix), 'x-project-id': ctx.projectId, 'x-org-id': ctx.orgId },
        body: JSON.stringify({ filename, content, projectId: ctx.projectId })
    });
    expectStatusOneOf(res.status, [200, 201], 'createDocument');
    return res.json();
}

export async function getDocument(ctx: E2EContext, id: string, opts?: { userSuffix?: string }): Promise<any> {
    const res = await fetch(`${ctx.baseUrl}/documents/${id}`, { headers: { ...authHeader('all', opts?.userSuffix), 'x-project-id': ctx.projectId, 'x-org-id': ctx.orgId } });
    if (res.status !== 200) throw new Error(`getDocument failed status=${res.status}`);
    return res.json();
}
