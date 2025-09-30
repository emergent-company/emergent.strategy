import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';

/**
 * Full golden scope contract test.
 * This locks the entire mapping of secured endpoints to their x-required-scopes.
 * If you intentionally change scopes, update EXPECTED below AND document in CHANGELOG.
 */

const EXPECTED: Record<string, string[]> = {
    'delete /chat/{id}': ['chat:admin'],
    'delete /documents/{id}': ['documents:delete'],
    'delete /graph/objects/{id}': ['graph:write'],
    'delete /graph/relationships/{id}': ['graph:write'],
    'delete /projects/{id}': ['org:project:delete'],
    'get /auth/me': ['org:read'],
    'get /chat/{id}': ['chat:use'],
    'get /chat/{id}/stream': ['chat:use'],
    'get /chat/conversations': ['chat:use'],
    'get /chunks': ['documents:read'],
    'get /documents': ['documents:read'],
    'get /documents/{id}': ['documents:read'],
    'get /graph/objects/fts': ['graph:read'],
    'get /graph/objects/{id}': ['graph:read'],
    'get /graph/objects/{id}/edges': ['graph:read'],
    'get /graph/objects/{id}/history': ['graph:read'],
    'get /graph/objects/{id}/similar': ['graph:read'],
    'get /graph/objects/search': ['graph:read'],
    'get /graph/relationships/{id}': ['graph:read'],
    'get /graph/relationships/{id}/history': ['graph:read'],
    'get /graph/relationships/search': ['graph:read'],
    'get /projects': ['project:read'],
    'get /search': ['documents:read'],
    'patch /chat/{id}': ['chat:admin'],
    'patch /graph/objects/{id}': ['graph:write'],
    'patch /graph/relationships/{id}': ['graph:write'],
    'post /chat/conversations': ['chat:use'],
    'post /chat/stream': ['chat:use'],
    'post /documents': ['documents:write'],
    'post /graph/branches/{targetBranchId}/merge': ['graph:write'],
    'post /graph/expand': ['graph:read'],
    'post /graph/objects': ['graph:write'],
    'post /graph/objects/vector-search': ['graph:read'],
    'post /graph/objects/{id}/restore': ['graph:write'],
    'post /graph/relationships': ['graph:write'],
    'post /graph/relationships/{id}/restore': ['graph:write'],
    'post /graph/search': ['graph:search:read'],
    'post /graph/traverse': ['graph:read'],
    'post /ingest/upload': ['documents:write'],
    'post /ingest/url': ['documents:write'],
    'post /invites': ['org:invite:create', 'project:invite:create'],
    'post /invites/accept': ['org:read'],
    'post /projects': ['org:project:create'],
};

function loadSpec() {
    const specPath = join(process.cwd(), 'openapi.json');
    return JSON.parse(readFileSync(specPath, 'utf-8'));
}

describe('OpenAPI full golden scopes (ENTIRE CONTRACT)', () => {
    const spec = loadSpec();
    const paths: Record<string, any> = spec.paths || {};

    // Build actual mapping
    const actual: Record<string, string[]> = {};
    for (const [p, ops] of Object.entries(paths)) {
        for (const [method, opAny] of Object.entries(ops as Record<string, any>)) {
            if (!['get', 'post', 'put', 'patch', 'delete'].includes(method)) continue;
            const scopes = opAny['x-required-scopes'];
            if (Array.isArray(scopes) && scopes.length) {
                actual[`${method} ${p}`] = scopes.slice();
            }
        }
    }

    it('no missing or extra secured endpoints in contract', () => {
        const expectedKeys = Object.keys(EXPECTED).sort();
        const actualKeys = Object.keys(actual).sort();
        expect(actualKeys).toEqual(expectedKeys);
    });

    for (const [key, scopes] of Object.entries(EXPECTED)) {
        it(`${key} has exact scopes [${scopes.join(',')}]`, () => {
            expect(actual[key]).toBeTruthy();
            expect(actual[key]).toEqual(scopes);
        });
    }
});
