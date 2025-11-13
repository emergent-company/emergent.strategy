import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';

interface OpenAPI {
    paths: Record<string, any>;
}

describe('OpenAPI extended contract assertions', () => {
    const specPath = join(process.cwd(), 'openapi.json');
    const spec: OpenAPI = JSON.parse(readFileSync(specPath, 'utf-8'));

    it('SSE stream endpoint exposes text/event-stream media type', () => {
        const op = spec.paths['/chat/{id}/stream']?.get;
        expect(op).toBeTruthy();
        const content = op.responses?.['200']?.content || {};
        expect(Object.keys(content)).toContain('text/event-stream');
    });

    it('Error envelope schema examples contain error.code fields', () => {
        const samplePaths = ['/auth/me', '/chat/{id}', '/settings/{key}'];
        for (const p of samplePaths) {
            const responses = spec.paths[p]?.get?.responses || {};
            for (const status of Object.keys(responses)) {
                if (status.startsWith('4')) {
                    const ex = responses[status].content?.['application/json']?.examples || responses[status].content?.['application/json']?.example;
                    // We only assert structural presence; simple heuristic
                    const raw = JSON.stringify(ex || responses[status]);
                    expect(raw).toMatch(/"code"/);
                }
            }
        }
    });
});
