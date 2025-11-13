import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';

/**
 * Ensures the OpenAPI generation step enriches secured operations with
 * `x-required-scopes` (added post-generation in openapi-generate.ts). This acts
 * as a focused guard so we catch regressions earlier than a broad hash change.
 */
describe('OpenAPI scopes enrichment', () => {
    it('has at least one operation with x-required-scopes and none are empty arrays', () => {
        const specPath = join(process.cwd(), 'openapi.json');
        const raw = readFileSync(specPath, 'utf-8');
        const spec = JSON.parse(raw);
        let enrichedCount = 0;
        for (const methods of Object.values<any>(spec.paths || {})) {
            for (const op of Object.values<any>(methods)) {
                if (op['x-required-scopes']) {
                    enrichedCount++;
                    expect(Array.isArray(op['x-required-scopes'])).toBe(true);
                    expect(op['x-required-scopes'].length).toBeGreaterThan(0);
                    for (const s of op['x-required-scopes']) {
                        expect(typeof s).toBe('string');
                        expect(s.length).toBeGreaterThan(0);
                    }
                }
            }
        }
        expect(enrichedCount).toBeGreaterThan(0);
    });
});
