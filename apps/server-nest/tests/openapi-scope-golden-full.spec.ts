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
    'delete /integrations/{name}': ['integrations:write'],
    'delete /graph/embedding-policies/{id}': ['graph:write'],
    'delete /graph/objects/{id}': ['graph:write'],
    'delete /graph/relationships/{id}': ['graph:write'],
    'delete /projects/{id}': ['org:project:delete'],
    'delete /tags/{id}': ['graph:write'],
    'delete /template-packs/projects/{projectId}/assignments/{assignmentId}': ['graph:write'],
    'delete /type-registry/projects/{projectId}/types/{typeName}': ['graph:write'],
    'get /auth/me': ['org:read'],
    'get /chat/conversations': ['chat:use'],
    'get /chat/{id}': ['chat:use'],
    'get /chat/{id}/stream': ['chat:use'],
    'get /chunks': ['documents:read'],
    'get /documents': ['documents:read'],
    'get /documents/{id}': ['documents:read'],
    'get /graph/embedding-policies': ['graph:read'],
    'get /graph/embedding-policies/{id}': ['graph:read'],
    'get /graph/objects/fts': ['graph:read'],
    'get /graph/objects/search': ['graph:read'],
    'get /graph/objects/{id}': ['graph:read'],
    'get /graph/objects/{id}/edges': ['graph:read'],
    'get /graph/objects/{id}/history': ['graph:read'],
    'get /graph/objects/{id}/similar': ['graph:read'],
    'get /graph/relationships/search': ['graph:read'],
    'get /graph/relationships/{id}': ['graph:read'],
    'get /graph/relationships/{id}/history': ['graph:read'],
    'get /integrations': ['integrations:read'],
    'get /integrations/available': ['integrations:read'],
    'get /integrations/clickup/structure': ['integrations:read'],
    'get /integrations/{name}': ['integrations:read'],
    'get /integrations/{name}/public': ['integrations:read'],
    'get /product-versions': ['graph:read'],
    'get /product-versions/{id}': ['graph:read'],
    'get /product-versions/{id}/diff/{otherId}': ['graph:read'],
    'get /projects': ['project:read'],
    'get /search': ['documents:read'],
    'get /tags': ['graph:read'],
    'get /tags/by-name/{name}': ['graph:read'],
    'get /tags/{id}': ['graph:read'],
    'get /template-packs': ['graph:read'],
    'get /template-packs/projects/{projectId}/available': ['graph:read'],
    'get /template-packs/projects/{projectId}/installed': ['graph:read'],
    'get /template-packs/{id}': ['graph:read'],
    'get /type-registry/projects/{projectId}': ['graph:read'],
    'get /type-registry/projects/{projectId}/stats': ['graph:read'],
    'get /type-registry/projects/{projectId}/types/{typeName}': ['graph:read'],
    'get /type-registry/projects/{projectId}/types/{typeName}/schema': ['graph:read'],
    'patch /chat/{id}': ['chat:admin'],
    'patch /graph/embedding-policies/{id}': ['graph:write'],
    'patch /graph/objects/{id}': ['graph:write'],
    'patch /graph/relationships/{id}': ['graph:write'],
    'patch /template-packs/projects/{projectId}/assignments/{assignmentId}': ['graph:write'],
    'patch /type-registry/projects/{projectId}/types/{typeName}': ['graph:write'],
    'patch /type-registry/projects/{projectId}/types/{typeName}/toggle': ['graph:write'],
    'post /chat/conversations': ['chat:use'],
    'post /chat/stream': ['chat:use'],
    'post /documents': ['documents:write'],
    'post /graph/branches/{targetBranchId}/merge': ['graph:write'],
    'post /graph/embedding-policies': ['graph:write'],
    'post /graph/expand': ['graph:read'],
    'post /graph/objects': ['graph:write'],
    'post /graph/objects/vector-search': ['graph:read'],
    'post /graph/objects/{id}/restore': ['graph:write'],
    'post /graph/relationships': ['graph:write'],
    'post /graph/relationships/{id}/restore': ['graph:write'],
    'post /graph/search': ['graph:search:read'],
    'post /graph/traverse': ['graph:read'],
    'post /integrations': ['integrations:write'],
    'post /integrations/{name}/sync': ['integrations:write'],
    'post /integrations/{name}/test': ['integrations:write'],
    'post /ingest/upload': ['documents:write'],
    'post /ingest/url': ['documents:write'],
    'post /invites': ['org:invite:create', 'project:invite:create'],
    'post /invites/accept': ['org:read'],
    'post /product-versions': ['graph:write'],
    'post /projects': ['org:project:create'],
    'post /tags': ['graph:write'],
    'post /template-packs': ['admin:write'],
    'post /template-packs/projects/{projectId}/assign': ['graph:write'],
    'post /type-registry/projects/{projectId}/types': ['graph:write'],
    'post /type-registry/projects/{projectId}/validate': ['graph:read'],
    'put /integrations/{name}': ['integrations:write'],
    'put /tags/{id}': ['graph:write'],
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
