import { authHeader } from '../auth-helpers';
import type { E2EContext } from '../e2e-context';

export interface HttpJson<T = unknown> { status: number; json: T; headers: Headers; raw: Response; }

async function parseJsonSafe<T>(res: Response): Promise<T> {
    try { return await res.json() as T; } catch { return undefined as unknown as T; }
}

export async function getJson<T = unknown>(url: string, init?: RequestInit): Promise<HttpJson<T>> {
    const res = await fetch(url, init);
    const json = await parseJsonSafe<T>(res);
    return { status: res.status, json, headers: res.headers, raw: res };
}

export async function postJson<TReq extends object, TRes = unknown>(url: string, body: TReq, init?: RequestInit): Promise<HttpJson<TRes>> {
    const res = await fetch(url, { ...init, method: 'POST', headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) }, body: JSON.stringify(body) });
    const json = await parseJsonSafe<TRes>(res);
    return { status: res.status, json, headers: res.headers, raw: res };
}

export async function del(url: string, init?: RequestInit): Promise<{ status: number; raw: Response }> {
    const res = await fetch(url, { ...init, method: 'DELETE' });
    return { status: res.status, raw: res };
}

// Convenience wrappers with context + auth
export function authHeaders(scope: 'default' | 'none' | 'all' = 'default', userSuffix?: string): Record<string, string> {
    return authHeader(scope, userSuffix);
}

export async function authedGet<T = unknown>(ctx: E2EContext, path: string, opts?: { scope?: 'default' | 'none' | 'all'; userSuffix?: string; project?: boolean; org?: boolean }): Promise<HttpJson<T>> {
    const h: Record<string, string> = { ...authHeaders(opts?.scope || 'all', opts?.userSuffix) };
    if (opts?.project !== false) h['x-project-id'] = ctx.projectId;
    if (opts?.org) h['x-org-id'] = ctx.orgId;
    return getJson<T>(`${ctx.baseUrl}${path}`, { headers: h });
}
