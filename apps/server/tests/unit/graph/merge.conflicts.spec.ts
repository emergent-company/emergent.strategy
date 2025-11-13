import { describe, it, expect } from 'vitest';
import { GraphService } from '../../../src/modules/graph/graph.service';
import { DatabaseService } from '../../../src/common/database/database.service';
import { SchemaRegistryService } from '../../../src/modules/graph/schema-registry.service';
import { BranchMergeRequestDto, BranchMergeObjectStatus } from '../../../src/modules/graph/dto/merge.dto';
import { randomUUID } from 'node:crypto';

function buf(str: string) { return Buffer.from(str); }

describe('mergeBranchDryRun conflict details (objects + relationships)', () => {
    const targetBranch = randomUUID();
    const sourceBranch = randomUUID();
    // Objects: craft one conflict with overlapping path '/x' and differing hashes
    const conflictingObject = {
        canonical_id: randomUUID(),
        source_id: randomUUID(),
        target_id: randomUUID(),
        source_hash: buf('hash-a'),
        target_hash: buf('hash-b'),
        source_change: { paths: ['/x', '/y'] },
        target_change: { paths: ['/x'] },
        source_props: { x: 2, y: 1 },
        target_props: { x: 1 },
    };
    // A non-conflict fast-forward (subset) for control
    const fastForwardObject = {
        canonical_id: randomUUID(),
        source_id: randomUUID(),
        target_id: randomUUID(),
        source_hash: buf('ff-a'),
        target_hash: buf('ff-b'),
        source_change: { paths: ['/base', '/extra'] },
        target_change: { paths: ['/base'] },
        source_props: { base: 1, extra: 2 },
        target_props: { base: 1 },
    };
    const objectRows = [conflictingObject, fastForwardObject];

    // Relationships: craft conflict with overlapping '/rel' path
    const conflictingRel = {
        canonical_id: randomUUID(),
        source_id: randomUUID(),
        target_id: randomUUID(),
        source_hash: buf('r1'),
        target_hash: buf('r2'),
        source_change: { paths: ['/rel', '/other'] },
        target_change: { paths: ['/rel'] },
        source_props: { rel: 2, other: 3 },
        target_props: { rel: 1 },
        source_type: 'depends', target_type: 'depends',
        source_src_id: randomUUID(), source_dst_id: randomUUID(),
        target_src_id: randomUUID(), target_dst_id: randomUUID(),
    };
    const unchangedRel = {
        canonical_id: randomUUID(),
        source_id: randomUUID(),
        target_id: randomUUID(),
        source_hash: buf('same'),
        target_hash: buf('same'),
        source_change: { paths: ['/r'] },
        target_change: { paths: ['/r'] },
        source_props: { r: 1 },
        target_props: { r: 1 },
        source_type: 'peer', target_type: 'peer',
        source_src_id: randomUUID(), source_dst_id: randomUUID(),
        target_src_id: randomUUID(), target_dst_id: randomUUID(),
    };
    const relationshipRows = [conflictingRel, unchangedRel];

    const dbService: Partial<DatabaseService> = {
        query: async (text: string) => {
            if (/FROM kb\.branches/i.test(text)) return { rowCount: 2, rows: [{ id: targetBranch }, { id: sourceBranch }] } as any;
            if (/FROM kb\.graph_objects/i.test(text)) return { rowCount: objectRows.length, rows: objectRows } as any;
            if (/FROM kb\.graph_relationships/i.test(text)) return { rowCount: relationshipRows.length, rows: relationshipRows } as any;
            return { rowCount: 0, rows: [] } as any;
        },
        getClient: async () => ({ query: dbService.query }) as any,
    } as any;
    const schemaRegistry: Partial<SchemaRegistryService> = { getObjectValidator: async () => null, getRelationshipValidator: async () => null } as any;
    const service = new GraphService(dbService as DatabaseService, schemaRegistry as SchemaRegistryService);

    it('surfaces conflicts array with overlapping changed paths', async () => {
        const dto: BranchMergeRequestDto = { sourceBranchId: sourceBranch, execute: false };
        const summary = await service.mergeBranchDryRun(targetBranch, dto);
        const objConflict = summary.objects.find(o => o.status === BranchMergeObjectStatus.Conflict);
        expect(objConflict).toBeDefined();
        expect(objConflict?.conflicts).toEqual(['/x']);
        // Ensure fast-forward object has no conflicts field
        const objFF = summary.objects.find(o => o.status === BranchMergeObjectStatus.FastForward);
        expect(objFF).toBeDefined();
        expect(objFF?.conflicts).toBeUndefined();

        const relConflict = (summary.relationships || []).find(r => r.status === BranchMergeObjectStatus.Conflict);
        expect(relConflict).toBeDefined();
        expect(relConflict?.conflicts).toEqual(['/rel']);
        const relUnchanged = (summary.relationships || []).find(r => r.status === BranchMergeObjectStatus.Unchanged);
        expect(relUnchanged).toBeDefined();
        expect(relUnchanged?.conflicts).toBeUndefined();
    });
});
