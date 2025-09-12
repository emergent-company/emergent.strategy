import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * OpenAPI Scopes Completeness Test
 * Ensures that every operation declaring security requirements also includes a non-empty
 * x-required-scopes array. This guards against undocumented scope drift when new endpoints
 * are introduced or decorators forgotten.
 */

interface OpenApiOperation {
    operationId?: string;
    security?: Array<Record<string, unknown>>;
    ['x-required-scopes']?: unknown;
}

interface OpenApiDoc {
    paths: Record<string, Record<string, OpenApiOperation>>;
}

function isStringArray(value: unknown): value is string[] {
    return Array.isArray(value) && value.every(v => typeof v === 'string');
}

describe('OpenAPI scopes completeness', () => {
    it('all secured operations declare non-empty x-required-scopes', () => {
        const file = join(process.cwd(), 'openapi.json');
        const raw = readFileSync(file, 'utf8');
        const doc = JSON.parse(raw) as OpenApiDoc;
        const failures: string[] = [];

        for (const [pathKey, methods] of Object.entries(doc.paths)) {
            for (const [method, op] of Object.entries(methods)) {
                const operation = op as OpenApiOperation;
                const secured = Array.isArray(operation.security) && operation.security.length > 0;
                if (!secured) continue; // public endpoint
                const scopesRaw = operation['x-required-scopes'];
                if (!isStringArray(scopesRaw) || scopesRaw.length === 0) {
                    const id = operation.operationId || `${method.toUpperCase()} ${pathKey}`;
                    failures.push(`${id}: missing or empty x-required-scopes`);
                }
            }
        }

        if (failures.length) {
            // Provide a concise diff-like output.
            const message = ['Secured operations missing x-required-scopes:', ...failures].join('\n - ');
            throw new Error(message);
        }
        expect(failures.length).toBe(0);
    });
});
