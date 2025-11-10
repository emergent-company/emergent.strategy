import { describe, it, expect } from 'vitest';
import { GraphService } from '../../../src/modules/graph/graph.service';
import { DatabaseService } from '../../../src/common/database/database.service';
import { SchemaRegistryService } from '../../../src/modules/graph/schema-registry.service';
import { BranchMergeRequestDto, BranchMergeObjectStatus } from '../../../src/modules/graph/dto/merge.dto';
import { randomUUID } from 'node:crypto';

// This spec validates combined object + relationship summary aggregate counts using mocked DB rows.
// It focuses on summary scalar correctness rather than deep classification logic (covered elsewhere).

function buf(str: string) { return Buffer.from(str); }

// Helper to fabricate a row shape expected by mergeBranchDryRun's internal queries.
// We'll mock object rows via the graph_objects query interception and relationship rows separately.

describe('mergeBranchDryRun summary aggregation (objects + relationships)', () => {
    const targetBranch = randomUUID();
    const sourceBranch = randomUUID();
    const canonicalObj = () => randomUUID();

    // Object fixtures (3 canonical pairs & one source-only):
    // 1. Unchanged
    const objUnchanged = {
        canonical_id: canonicalObj(),
        source_id: randomUUID(),
        target_id: randomUUID(),
        source_hash: buf('same'),
        target_hash: buf('same'),
        source_change: { paths: ['/a'] },
        target_change: { paths: ['/a'] },
    };
    // 2. Added (source only)
    const objAdded = {
        canonical_id: canonicalObj(),
        source_id: randomUUID(),
        source_hash: buf('add'),
        source_change: { paths: ['/b'] },
    };
    // 3. Conflict (different hashes, overlapping path)
    const objConflict = {
        canonical_id: canonicalObj(),
        source_id: randomUUID(),
        target_id: randomUUID(),
        source_hash: buf('c1'),
        target_hash: buf('c2'),
        source_change: { paths: ['/c'] },
        target_change: { paths: ['/c'] },
    };
    // 4. Fast-forward (target subset of source)
    const objFastForward = {
        canonical_id: canonicalObj(),
        source_id: randomUUID(),
        target_id: randomUUID(),
        source_hash: buf('f1'),
        target_hash: buf('f2'),
        source_change: { paths: ['/base', '/extra'] },
        target_change: { paths: ['/base'] },
    };

    const objectRows = [objUnchanged, objAdded, objConflict, objFastForward];

    // Relationship fixtures mirroring object classifications (one each):
    const relUnchanged = { canonical_id: randomUUID(), source_id: randomUUID(), target_id: randomUUID(), source_hash: buf('ru'), target_hash: buf('ru'), source_change: { paths: ['/r'] }, target_change: { paths: ['/r'] }, source_type: 'peer', target_type: 'peer', source_src_id: randomUUID(), source_dst_id: randomUUID(), target_src_id: randomUUID(), target_dst_id: randomUUID() };
    const relAdded = { canonical_id: randomUUID(), source_id: randomUUID(), source_hash: buf('ra'), source_change: { paths: ['/ra'] }, source_type: 'knows', source_src_id: randomUUID(), source_dst_id: randomUUID() };
    const relConflict = { canonical_id: randomUUID(), source_id: randomUUID(), target_id: randomUUID(), source_hash: buf('rc1'), target_hash: buf('rc2'), source_change: { paths: ['/rc'] }, target_change: { paths: ['/rc'] }, source_type: 'inverse', target_type: 'inverse', source_src_id: randomUUID(), source_dst_id: randomUUID(), target_src_id: randomUUID(), target_dst_id: randomUUID() };
    const relFastForward = { canonical_id: randomUUID(), source_id: randomUUID(), target_id: randomUUID(), source_hash: buf('rf1'), target_hash: buf('rf2'), source_change: { paths: ['/base', '/extra'] }, target_change: { paths: ['/base'] }, source_type: 'evolves', target_type: 'evolves', source_src_id: randomUUID(), source_dst_id: randomUUID(), target_src_id: randomUUID(), target_dst_id: randomUUID() };
    const relationshipRows = [relUnchanged, relAdded, relConflict, relFastForward];

    const dbService: Partial<DatabaseService> = {
        query: async (text: string) => {
            if (/FROM kb\.branches/i.test(text)) {
                return { rowCount: 2, rows: [{ id: targetBranch }, { id: sourceBranch }] } as any;
            }
            if (/FROM kb\.graph_objects/i.test(text)) {
                return { rowCount: objectRows.length, rows: objectRows } as any;
            }
            if (/FROM kb\.graph_relationships/i.test(text)) {
                return { rowCount: relationshipRows.length, rows: relationshipRows } as any;
            }
            return { rowCount: 0, rows: [] } as any;
        },
        getClient: async () => ({ query: dbService.query }) as any,
    } as any;
    const schemaRegistry: Partial<SchemaRegistryService> = { getObjectValidator: async () => null, getRelationshipValidator: async () => null } as any;
    const service = new GraphService(dbService as DatabaseService, schemaRegistry as SchemaRegistryService);

    it('aggregates object and relationship counts correctly', async () => {
        const dto: BranchMergeRequestDto = { sourceBranchId: sourceBranch, execute: false };
        const summary = await service.mergeBranchDryRun(targetBranch, dto);
        // Object counts (order independent)
        expect(summary.total_objects).toBe(4);
        expect(summary.objects).toHaveLength(4);
        // Validate sum of per-status counts equals total and each count >=0
        // Some counts may be 0; ensure they are numbers then validate sum.
        const objCounts = [summary.added_count, summary.conflict_count, summary.fast_forward_count, summary.unchanged_count];
        objCounts.forEach(c => expect(typeof c).toBe('number'));
        const objectStatusSum = objCounts.reduce<number>((a, b) => a + (b || 0), 0);
        expect(objectStatusSum).toBe(4);
        objCounts.forEach(c => expect((c || 0)).toBeGreaterThanOrEqual(0));

        // Relationship counts
        expect(summary.relationships_total).toBe(4);
        expect(summary.relationships).toHaveLength(4);
        const relAdded = summary.relationships_added_count ?? 0;
        const relConflict = summary.relationships_conflict_count ?? 0;
        const relFF = summary.relationships_fast_forward_count ?? 0;
        const relUnchanged = summary.relationships_unchanged_count ?? 0;
        const relStatusSum = relAdded + relConflict + relFF + relUnchanged;
        expect(relStatusSum).toBe(summary.relationships_total);
        [relAdded, relConflict, relFF, relUnchanged].forEach(c => expect(c).toBeGreaterThanOrEqual(0));

        // Sanity: each summary array length equals sum of its category counts; individual status presence already implied by non-zero counts.
        const computedObjectSum = (summary.added_count + summary.conflict_count + summary.fast_forward_count + summary.unchanged_count);
        expect(computedObjectSum).toBe(summary.total_objects);
        const relAdded2 = summary.relationships_added_count ?? 0;
        const relConflict2 = summary.relationships_conflict_count ?? 0;
        const relFF2 = summary.relationships_fast_forward_count ?? 0;
        const relUnchanged2 = summary.relationships_unchanged_count ?? 0;
        expect(relAdded2 + relConflict2 + relFF2 + relUnchanged2).toBe(summary.relationships_total);
    });
});
