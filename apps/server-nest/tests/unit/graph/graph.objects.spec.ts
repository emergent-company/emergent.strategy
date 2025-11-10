import { describe, expect, test } from 'vitest';
import { GraphService } from '../../../src/modules/graph/graph.service';
import { makeFakeGraphDb } from '../helpers/fake-graph-db';

describe('GraphService object versioning', () => {
    test('create + patch increments version and returns diff', async () => {
        const db = makeFakeGraphDb({ enableHistory: true });
        const schemaRegistryStub = { getObjectValidator: async () => null, getRelationshipValidator: async () => null } as any;
        const svc = new GraphService(db as any, schemaRegistryStub as any);
        const created = await svc.createObject({ type: 'Asset', properties: { name: 'A' }, labels: ['root'] });
        expect(created.version).toBe(1);
        const patched = await svc.patchObject(created.id, { properties: { desc: 'x' } });
        expect(patched.version).toBe(2);
        expect(patched.diff).toBeTruthy();
        expect(patched.diff?.added || patched.diff?.updated).toBeTruthy();
    });

    test('idempotent patch (no change) rejected', async () => {
        const db = makeFakeGraphDb({ enableHistory: true });
        const schemaRegistryStub = { getObjectValidator: async () => null, getRelationshipValidator: async () => null } as any;
        const svc = new GraphService(db as any, schemaRegistryStub as any);
        const created = await svc.createObject({ type: 'Asset', properties: { name: 'A' } });
        let err: any; try { await svc.patchObject(created.id, {}); } catch (e) { err = e; }
        expect(err).toBeTruthy();
    });
});
