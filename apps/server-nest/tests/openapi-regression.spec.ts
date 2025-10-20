import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import crypto from 'node:crypto';
import { describe, it, expect } from 'vitest';

// Simple regression test to ensure we don't accidentally drop or rename paths.
// Update EXPECTED_HASH only when deliberately changing the public API surface.

function hashSpecPaths(spec: any): string {
    const paths = Object.keys(spec.paths || {}).sort();
    const tags = (spec.tags || []).map((t: any) => t.name).sort();
    const payload = JSON.stringify({ paths, tags });
    return crypto.createHash('sha256').update(payload).digest('hex');
}

// Placeholder value: will be filled after first stable run.
// New hash after adding /chat/{id}/stream endpoint and error response decorators
// New hash after adding typed search response DTO
// Updated after adding /documents/{id} and enriching document schema & error responses
// Updated after adding /orgs/{id} endpoint
// Updated after adding chat streaming event component schemas & related endpoint refinements
// Updated after transactional project create race hardening (no path changes, but tag ordering may shift due to rebuild)
// Updated after restoring scope enrichment and associated tag ordering adjustments
// Updated after adding Knowledge Graph search endpoints
// Updated after adding traversal endpoint /graph/traverse
// Updated after adding object/relationship delete+restore endpoints & traversal 201->200 response adjustment
// Updated after adding pagination fields to graph search response DTO (meta.nextCursor/prevCursor/hasNext/hasPrev & item.cursor)
// Updated after adding ordering (order=asc|desc) query param annotations for object & relationship search endpoints
// Updated after restoring deterministic top-level tags (generation normalization fix)
// Updated after adding vector similarity + FTS endpoints (/graph/objects/vector-search, /graph/objects/{id}/similar, /graph/objects/fts)
// Updated after fixing predicate evaluation in graph.service.ts (no API changes, rebuild artifact)
// Updated after adding MCP authentication endpoints and Phase 4 security enhancements (GET /mcp/schema/version, GET /mcp/schema/changelog)
const EXPECTED_HASH = process.env.OPENAPI_EXPECTED_HASH || '0cbfe3a0a5a6e7cc3a9cc8b395995870a6bcac45b991aea7d5d492c01324919a';

describe('OpenAPI regression', () => {
    it('paths+tags hash matches expected (update EXPECTED_HASH intentionally if spec changed)', () => {
        const specPath = join(process.cwd(), 'openapi.json');
        const raw = readFileSync(specPath, 'utf-8');
        const spec = JSON.parse(raw);
        const hash = hashSpecPaths(spec);
        if (EXPECTED_HASH === 'TO_SET') {
            // eslint-disable-next-line no-console
            console.log('Computed hash (copy into EXPECTED_HASH when locking spec):', hash);
        } else {
            expect(hash).toBe(EXPECTED_HASH);
        }
    });
});
