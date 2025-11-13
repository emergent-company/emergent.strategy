import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';

// Guard test: ensure top-level tags array is populated and contains critical domain tags.
// This complements the hash regression test by providing a clearer failure message
// if tag aggregation disappears again.

describe('OpenAPI top-level tags presence', () => {
    it('has non-empty tags including Graph', () => {
        const specPath = join(process.cwd(), 'openapi.json');
        const raw = readFileSync(specPath, 'utf-8');
        const spec = JSON.parse(raw);
        expect(Array.isArray(spec.tags)).toBe(true);
        expect(spec.tags.length).toBeGreaterThan(0);
        const tagNames = spec.tags.map((t: any) => t.name);
        expect(tagNames).toContain('Graph');
        // Basic sanity: ensure every tag object has a string name.
        for (const t of spec.tags) {
            expect(typeof t.name).toBe('string');
            expect(t.name.length).toBeGreaterThan(0);
        }
    });
});
