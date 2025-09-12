import 'reflect-metadata';
import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import type { BootstrappedApp } from '../utils/test-app';
import { bootstrapTestApp } from '../utils/test-app';

let ctx: BootstrappedApp;

interface OpenAPIDoc { openapi: string; paths: Record<string, any>; }

function hasAllPaths(doc: OpenAPIDoc, expected: string[]) {
    const docPaths = Object.keys(doc.paths);
    return expected.every(p => docPaths.includes(p));
}

function methodsFor(doc: OpenAPIDoc, path: string): string[] { const entry = doc.paths[path] || {}; return Object.keys(entry).map(k => k.toUpperCase()).sort(); }

describe('OpenAPI path coverage', () => {
    beforeAll(async () => { ctx = await bootstrapTestApp(); });
    afterAll(async () => { await ctx.close(); });

    it('contains all registered public GET endpoints', async () => {
        const res = await fetch(`${ctx.baseUrl}/openapi`);
        expect(res.status).toBe(200);
        const doc: OpenAPIDoc = await res.json();
        expect(doc.openapi).toBeDefined();

        const expectedGetPaths = [
            '/health',
            '/auth/me',
            '/settings',
            '/settings/{key}',
            '/orgs',
            '/projects',
            '/documents',
            '/documents/{id}',
            '/chunks',
            '/search',
            '/chat/conversations',
            '/chat/{id}',
            '/chat/{id}/stream',
        ];

        const missing = expectedGetPaths.filter(p => !Object.keys(doc.paths).includes(p));
        expect(missing).toStrictEqual([]);
        expect(hasAllPaths(doc, expectedGetPaths)).toBe(true);

        for (const p of expectedGetPaths) {
            const methods = methodsFor(doc, p);
            expect(methods).toContain('GET');
        }
    });

    it('contains ingestion POST endpoints with POST method', async () => {
        const res = await fetch(`${ctx.baseUrl}/openapi`);
        expect(res.status).toBe(200);
        const doc: OpenAPIDoc = await res.json();

        const expectedPostPaths = ['/ingest/upload', '/ingest/url', '/orgs', '/chat/conversations'];
        const missing = expectedPostPaths.filter(p => !Object.keys(doc.paths).includes(p));
        expect(missing).toStrictEqual([]);

        for (const p of expectedPostPaths) {
            const methods = methodsFor(doc, p);
            expect(methods).toContain('POST');
            expect(methods.filter(m => !['POST', 'GET'].includes(m))).toStrictEqual([]);
        }
    });

    it('path-method matrix matches expectation (future non-GET/POST coverage)', async () => {
        const res = await fetch(`${ctx.baseUrl}/openapi`);
        expect(res.status).toBe(200);
        const doc: OpenAPIDoc = await res.json();

        // Define expected HTTP methods per path. Extend this map when adding PUT/PATCH/DELETE in future.
        const expected: Record<string, string[]> = {
            '/health': ['GET'],
            '/auth/me': ['GET'],
            '/settings': ['GET'],
            '/settings/{key}': ['GET'],
            '/orgs': ['GET', 'POST'],
            '/orgs/{id}': ['GET'],
            '/projects': ['GET', 'POST'],
            '/documents': ['GET'],
            '/documents/{id}': ['GET'],
            '/chunks': ['GET'],
            '/search': ['GET'],
            '/chat/conversations': ['GET', 'POST'],
            '/chat/{id}': ['GET', 'PATCH', 'DELETE'],
            '/chat/{id}/stream': ['GET'],
            '/ingest/upload': ['POST'],
            '/ingest/url': ['POST'],
        };

        // Assert every expected path exists with exactly the expected set (order-insensitive)
        for (const [path, methods] of Object.entries(expected)) {
            expect(doc.paths, `Missing path ${path}`).toHaveProperty(path);
            const actual = methodsFor(doc, path);
            expect(actual).toStrictEqual([...methods].sort());
        }

        // Optionally ensure no undocumented methods exist on known paths
        for (const path of Object.keys(expected)) {
            const actual = methodsFor(doc, path);
            const allowed = new Set(expected[path]);
            const unexpected = actual.filter(m => !allowed.has(m));
            expect(unexpected, `Unexpected methods on ${path}: ${unexpected.join(',')}`).toStrictEqual([]);
        }

        // If new paths appear, encourage updating expected map (fail fast)
        const extraPaths = Object.keys(doc.paths).filter(p => !expected[p]);
        expect(extraPaths, `New paths detected without expectations: ${extraPaths.join(', ')}`).toStrictEqual([]);
    });
});
