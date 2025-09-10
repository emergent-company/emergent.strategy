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
const EXPECTED_HASH = process.env.OPENAPI_EXPECTED_HASH || '2dbbe9d3b58dfcc260d20ba9deb883ef9b059961fa5d78f0990a257ace7a2eb6';

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
