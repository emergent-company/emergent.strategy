import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';

/**
 * Full golden scope contract test.
 * This locks the entire mapping of secured endpoints to their x-required-scopes.
 * If you intentionally change scopes, update EXPECTED below AND document in CHANGELOG.
 */

const EXPECTED: Record<string, string[]> = {
  'delete /admin/extraction-jobs/projects/{projectId}/bulk-delete': [
    'extraction:write',
  ],
  'delete /admin/extraction-jobs/{jobId}': ['extraction:write'],
  'delete /chat/{id}': ['chat:admin'],
  'delete /discovery-jobs/{jobId}': ['discovery:write'],
  'delete /documents': ['documents:delete'],
  'delete /documents/{id}': ['documents:delete'],
  'delete /integrations/{name}': ['integrations:write'],
  'delete /graph/embedding-policies/{id}': ['graph:write'],
  'delete /graph/objects/{id}': ['graph:write'],
  'delete /graph/relationships/{id}': ['graph:write'],
  'delete /notifications': ['notifications:write'],
  'delete /notifications/{id}': ['notifications:write'],
  'delete /projects/{id}': ['org:project:delete'],
  'delete /tags/{id}': ['graph:write'],
  'delete /template-packs/{id}': ['graph:write'],
  'delete /template-packs/projects/{projectId}/assignments/{assignmentId}': [
    'graph:write',
  ],
  'delete /type-registry/projects/{projectId}/types/{typeName}': [
    'graph:write',
  ],
  'get /auth/me': ['org:read'],
  'get /auth/test-passport': ['org:read'],
  'get /admin/extraction-jobs/_debug/available-models': ['extraction:read'],
  'get /admin/extraction-jobs/projects/{projectId}': ['extraction:read'],
  'get /admin/extraction-jobs/projects/{projectId}/statistics': [
    'extraction:read',
  ],
  'get /admin/extraction-jobs/{jobId}': ['extraction:read'],
  'get /admin/extraction-jobs/{jobId}/logs': ['extraction:read'],
  'get /chat/conversations': ['chat:use'],
  'get /chat/{id}': ['chat:use'],
  'get /chat/{id}/stream': ['chat:use'],
  'get /chunks': ['chunks:read'],
  'get /discovery-jobs/projects/{projectId}': ['discovery:read'],
  'get /discovery-jobs/{jobId}': ['discovery:read'],
  'get /documents': ['documents:read'],
  'get /documents/{id}': ['documents:read'],
  'get /documents/{id}/deletion-impact': ['documents:delete'],
  'get /graph/embedding-policies': ['graph:read'],
  'get /graph/embedding-policies/{id}': ['graph:read'],
  'get /graph/objects/fts': ['graph:read'],
  'get /graph/objects/search': ['graph:read'],
  'get /graph/objects/{id}': ['graph:read'],
  'get /graph/objects/{id}/edges': ['graph:read'],
  'get /graph/objects/{id}/history': ['graph:read'],
  'get /graph/objects/{id}/similar': ['graph:read'],
  'get /graph/objects/tags': ['graph:read'],
  'get /graph/relationships/search': ['graph:read'],
  'get /graph/relationships/{id}': ['graph:read'],
  'get /graph/relationships/{id}/history': ['graph:read'],
  'get /integrations': ['integrations:read'],
  'get /integrations/available': ['integrations:read'],
  'get /integrations/clickup/folders/{folderId}': ['integrations:read'],
  'get /integrations/clickup/spaces/{spaceId}': ['integrations:read'],
  'get /integrations/clickup/structure': ['integrations:read'],
  'get /integrations/{name}': ['integrations:read'],
  'get /integrations/{name}/public': ['integrations:read'],
  'get /integrations/{name}/sync/stream': ['integrations:write'],
  'get /mcp/schema/changelog': ['schema:read'],
  'get /mcp/schema/version': ['schema:read'],
  'get /monitoring/extraction-jobs': ['extraction:read'],
  'get /monitoring/extraction-jobs/{id}': ['extraction:read'],
  'get /monitoring/extraction-jobs/{id}/llm-calls': ['extraction:read'],
  'get /monitoring/extraction-jobs/{id}/logs': ['extraction:read'],
  'get /notifications': ['notifications:read'],
  'get /notifications/counts': ['notifications:read'],
  'get /notifications/stats': ['notifications:read'],
  'get /product-versions': ['graph:read'],
  'get /product-versions/{id}': ['graph:read'],
  'get /product-versions/{id}/diff/{otherId}': ['graph:read'],
  'get /projects': ['project:read'],
  'get /projects/{id}': ['project:read'],
  'get /search': ['search:read'],
  'get /tags': ['graph:read'],
  'get /tags/by-name/{name}': ['graph:read'],
  'get /tags/{id}': ['graph:read'],
  'get /template-packs': ['graph:read'],
  'get /template-packs/projects/{projectId}/available': ['graph:read'],
  'get /template-packs/projects/{projectId}/compiled-types': ['graph:read'],
  'get /template-packs/projects/{projectId}/installed': ['graph:read'],
  'get /template-packs/{id}': ['graph:read'],
  'get /type-registry/projects/{projectId}': ['graph:read'],
  'get /type-registry/projects/{projectId}/stats': ['graph:read'],
  'get /type-registry/projects/{projectId}/types/{typeName}': ['graph:read'],
  'get /type-registry/projects/{projectId}/types/{typeName}/schema': [
    'graph:read',
  ],
  'get /user/orgs-and-projects': ['orgs:read', 'project:read'],
  'patch /admin/extraction-jobs/{jobId}': ['extraction:write'],
  'patch /chat/{id}': ['chat:admin'],
  'patch /graph/embedding-policies/{id}': ['graph:write'],
  'patch /graph/objects/{id}': ['graph:write'],
  'patch /graph/relationships/{id}': ['graph:write'],
  'patch /projects/{id}': ['project:write'],
  'patch /template-packs/projects/{projectId}/assignments/{assignmentId}': [
    'graph:write',
  ],
  'patch /type-registry/projects/{projectId}/types/{typeName}': ['graph:write'],
  'patch /type-registry/projects/{projectId}/types/{typeName}/toggle': [
    'graph:write',
  ],
  'post /admin/extraction-jobs': ['extraction:write'],
  'post /admin/extraction-jobs/projects/{projectId}/bulk-cancel': [
    'extraction:write',
  ],
  'post /admin/extraction-jobs/projects/{projectId}/bulk-retry': [
    'extraction:write',
  ],
  'post /admin/extraction-jobs/{jobId}/cancel': ['extraction:write'],
  'post /admin/extraction-jobs/{jobId}/retry': ['extraction:write'],
  'post /chat/conversations': ['chat:use'],
  'post /chat/stream': ['chat:use'],
  'post /discovery-jobs/projects/{projectId}/start': ['discovery:write'],
  'post /discovery-jobs/{jobId}/finalize': ['discovery:write'],
  'post /documents': ['documents:write'],
  'post /documents/deletion-impact': ['documents:delete'],
  'post /graph/branches/{targetBranchId}/merge': ['graph:write'],
  'post /graph/embedding-policies': ['graph:write'],
  'post /graph/expand': ['graph:read'],
  'post /graph/objects': ['graph:write'],
  'post /graph/objects/bulk-update-status': ['graph:write'],
  'post /graph/objects/vector-search': ['graph:read'],
  'post /graph/objects/{id}/restore': ['graph:write'],
  'post /graph/relationships': ['graph:write'],
  'post /graph/relationships/{id}/restore': ['graph:write'],
  'post /graph/search': ['graph:search:read'],
  'post /graph/search-with-neighbors': ['graph:read'],
  'post /graph/traverse': ['graph:read'],
  'post /integrations': ['integrations:write'],
  'post /integrations/{name}/sync': ['integrations:write'],
  'post /integrations/{name}/test': ['integrations:write'],
  'post /ingest/upload': ['ingest:write'],
  'post /ingest/url': ['ingest:write'],
  'post /notifications/{id}/dismiss': ['notifications:write'],
  'post /notifications/{id}/read': ['notifications:write'],
  'post /notifications/{id}/snooze': ['notifications:write'],
  'post /notifications/{id}/unclear': ['notifications:write'],
  'post /notifications/{id}/unread': ['notifications:write'],
  'post /notifications/{id}/unsnooze': ['notifications:write'],
  'post /invites': ['org:invite:create', 'project:invite:create'],
  'post /invites/accept': ['org:read'],
  'post /invites/with-user': ['org:invite:create', 'project:invite:create'],
  'post /mcp/rpc': ['schema:read'],
  'post /product-versions': ['graph:write'],
  'post /projects': ['org:project:create'],
  'post /tags': ['graph:write'],
  'post /template-packs': ['admin:write'],
  'post /template-packs/projects/{projectId}/assign': ['graph:write'],
  'post /type-registry/projects/{projectId}/types': ['graph:write'],
  'post /type-registry/projects/{projectId}/validate': ['graph:read'],
  'post /user/delete-account': ['account:delete'],
  'post /user/test-cleanup': ['account:delete'],
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
