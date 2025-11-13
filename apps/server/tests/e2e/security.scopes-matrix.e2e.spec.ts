import { describe, it, beforeAll, afterAll, expect } from 'vitest';
import { createE2EContext, E2EContext } from './e2e-context';
import { loadSecuredOperations, buildBodyFor, tokenHeaderFor, variantsFor } from './utils/scope-matrix';
import { join } from 'path';
import { expectStatusOneOf } from './utils';

// Dynamic scope matrix verifying secured endpoints reject insufficient tokens
// and accept full-scope token. This is a coarse matrix because current auth
// helper only differentiates: none -> [], userMinimal -> ['read:me'], all -> full.

// Root openapi.json (monorepo) may be a different build missing x-required-scopes. Use local snapshot.
const snapshotPath = join(process.cwd(), 'tests/e2e/openapi.snapshot.json');
const securedOps = loadSecuredOperations(snapshotPath);

// Scopes globally disabled; matrix test skipped to avoid meaningless assertions.
describe.skip('Security Scopes Matrix (disabled - scopes guard globally off)', () => {
    let ctx: E2EContext;
    beforeAll(async () => { ctx = await createE2EContext('scopes-matrix'); });
    afterAll(async () => { await ctx.close(); });

    for (const op of securedOps) {
        const title = `${op.method} ${op.path} requires [${op.requiredScopes.join(',')}]`;
        it(title, async () => {
            // Skip destructive / streaming operations for now (extend later)
            if (op.method === 'DELETE' || op.path.endsWith('/stream')) {
                // Keep heavy / streaming / destructive operations out of matrix for runtime speed.
                return;
            }
            for (const variant of variantsFor(op)) {
                const headers = tokenHeaderFor(variant, ctx.projectId);
                const url = `${ctx.baseUrl}${op.path}${op.method === 'GET' && op.path === '/documents' ? '?limit=1&cursor=0' : op.method === 'GET' && op.path === '/search' ? '?q=test' : ''}`;
                const body = op.hasRequestBody ? buildBodyFor(op) : undefined;
                const res = await fetch(url, { method: op.method, headers: body ? { 'content-type': 'application/json', ...headers } : headers, body: body ? JSON.stringify(body) : undefined });
                if (variant === 'all') {
                    // Authorization success is any status that is NOT 401/403. We intentionally
                    // accept 4xx like 400 (validation), 404 (missing resource), 422 (semantic
                    // validation) because the matrix focuses solely on auth gate behavior.
                    expect([401, 403]).not.toContain(res.status);
                } else if (variant === 'none') {
                    expect(res.status === 401 || res.status === 403).toBe(true);
                } else if (variant === 'userMinimal') {
                    // userMinimal only has read:me. Endpoints requiring any other scope should 403.
                    const requiresOther = op.requiredScopes.some(s => s !== 'read:me');
                    if (requiresOther) {
                        expect(res.status).toBe(403);
                    } else {
                        expect([401, 403]).not.toContain(res.status);
                    }
                }
            }
        });
    }
});
