import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';

/**
 * Golden contract test for a curated subset of secured endpoints. Ensures the
 * post-generation scope enrichment logic continues to map correct scope sets
 * to specific HTTP methods + paths. If this test fails due to an intentional
 * change, update the expectations below *and* document in CHANGELOG.
 */

interface ExpectedScopeEntry { method: string; path: string; scopes: string[]; }

// Keep list small & high-signal; we cover representative domains.
const EXPECTED: ExpectedScopeEntry[] = [
    { method: 'post', path: '/graph/objects', scopes: ['graph:write'] },
    { method: 'get', path: '/graph/objects/{id}', scopes: ['graph:read'] },
    { method: 'get', path: '/documents', scopes: ['documents:read'] },
    { method: 'post', path: '/chat/conversations', scopes: ['chat:use'] },
];

function loadSpec() {
    const specPath = join(process.cwd(), 'openapi.json');
    return JSON.parse(readFileSync(specPath, 'utf-8'));
}

describe('OpenAPI golden scopes (subset)', () => {
    const spec = loadSpec();
    const paths: Record<string, any> = spec.paths || {};

    for (const entry of EXPECTED) {
        const { method, path, scopes } = entry;
        it(`${method.toUpperCase()} ${path} has exact scopes [${scopes.join(',')}]`, () => {
            const p = paths[path];
            expect(p, `Path ${path} missing from OpenAPI`).toBeTruthy();
            const op = p?.[method];
            expect(op, `Operation ${method.toUpperCase()} ${path} missing`).toBeTruthy();
            const enriched = op['x-required-scopes'];
            expect(Array.isArray(enriched), 'x-required-scopes not an array').toBe(true);
            expect(enriched).toEqual(scopes);
            // Optional: ensure security entry exists when scopes present
            expect(op.security && op.security.length).toBeGreaterThan(0);
        });
    }
});
