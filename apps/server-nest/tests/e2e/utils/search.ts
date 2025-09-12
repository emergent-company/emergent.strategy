import type { E2EContext } from '../e2e-context';
import { authHeader } from '../auth-helpers';

export interface SearchParams {
    q: string;
    mode?: 'lexical' | 'vector' | 'hybrid';
    limit?: number;
    offset?: number;
}

export interface SearchResultItem { id: string; snippet?: string; score?: number;[k: string]: any }
export interface SearchResponse { mode: string; results: SearchResultItem[]; warning?: string;[k: string]: any }

export async function search(ctx: E2EContext, params: SearchParams, opts?: { userSuffix?: string; headers?: Record<string, string>; includeOrg?: boolean }): Promise<{ status: number; json: SearchResponse }> {
    const q = encodeURIComponent(params.q);
    const qp: string[] = [`q=${q}`];
    if (params.mode) qp.push(`mode=${params.mode}`);
    if (params.limit !== undefined) qp.push(`limit=${params.limit}`);
    if (params.offset !== undefined) qp.push(`offset=${params.offset}`);
    const url = `${ctx.baseUrl}/search?${qp.join('&')}`;
    const headers: Record<string, string> = { ...authHeader('all', opts?.userSuffix), 'x-project-id': ctx.projectId };
    if (opts?.includeOrg) headers['x-org-id'] = ctx.orgId;
    Object.assign(headers, opts?.headers);
    const res = await fetch(url, { headers });
    const json = await res.json();
    return { status: res.status, json };
}

export async function lexicalSearch(ctx: E2EContext, q: string, limit = 5, offset?: number, opts?: { userSuffix?: string }) {
    return search(ctx, { q, mode: 'lexical', limit, offset }, opts);
}

export async function vectorSearch(ctx: E2EContext, q: string, limit = 5, opts?: { userSuffix?: string }) {
    return search(ctx, { q, mode: 'vector', limit }, opts);
}

export async function hybridSearch(ctx: E2EContext, q: string, limit = 5, opts?: { userSuffix?: string }) {
    return search(ctx, { q, limit }, opts); // omit mode -> hybrid default
}

export function expectResultsArray(resp: { status: number; json: SearchResponse }) {
    if (resp.status !== 200) throw new Error(`Search expected 200 got ${resp.status}`);
    if (!Array.isArray(resp.json.results)) throw new Error('results not array');
}
