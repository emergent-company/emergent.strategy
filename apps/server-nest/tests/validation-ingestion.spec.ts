import 'reflect-metadata';
import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import type { BootstrappedApp } from './utils/test-app';
import { bootstrapTestApp } from './utils/test-app';

let ctx: BootstrappedApp;

interface ErrorEnvelope {
    error: {
        code: string;
        message: string;
        details?: Record<string, unknown>;
    };
}

describe('Validation - Ingestion endpoints', () => {
    beforeAll(async () => {
        ctx = await bootstrapTestApp();
    });
    afterAll(async () => {
        await ctx.close();
    });

    it('invalid upload payload returns 422 validation-failed with field details', async () => {
        const res = await fetch(`${ctx.baseUrl}/ingest/upload`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: 'Bearer e2e-all' },
            body: JSON.stringify({}), // missing required projectId & file
        });
        expect(res.status).toBe(422);
        const json: ErrorEnvelope = await res.json();
        expect(json.error.code).toBe('validation-failed');
        expect(json.error.details).toBeDefined();
        const details = json.error.details as Record<string, any>;
        expect(Object.keys(details)).toContain('projectId');
    });

    it('invalid url payload returns 422 validation-failed', async () => {
        const res = await fetch(`${ctx.baseUrl}/ingest/url`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: 'Bearer e2e-all' },
            body: JSON.stringify({ url: 'notaurl' }), // lacks protocol
        });
        expect(res.status).toBe(422);
        const json: ErrorEnvelope = await res.json();
        expect(json.error.code).toBe('validation-failed');
        expect(json.error.details).toBeDefined();
        const details = json.error.details as Record<string, any>;
        expect(Object.keys(details)).toContain('url');
    });
});
