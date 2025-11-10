import { describe, it, expect } from 'vitest';
import { GraphService } from '../../../src/modules/graph/graph.service';
import { DatabaseService } from '../../../src/common/database/database.service';
import { SchemaRegistryService } from '../../../src/modules/graph/schema-registry.service';
import { BranchMergeRequestDto } from '../../../src/modules/graph/dto/merge.dto';
import { randomUUID } from 'node:crypto';

function makeRow(idx: number) {
    return {
        canonical_id: `canon-${idx}`,
        source_id: `src-${idx}`,
        target_id: null,
        source_hash: Buffer.from(`hash-${idx}`),
        target_hash: null,
        source_change: { paths: [`/p${idx}`] },
        target_change: null,
        source_props: { [`p${idx}`]: idx },
        target_props: null,
        source_type: 't', target_type: null,
        source_key: `k${idx}`, target_key: null,
    };
}

function makeRel(idx: number) {
    return {
        canonical_id: `rel-canon-${idx}`,
        source_id: `rel-src-${idx}`,
        target_id: null,
        source_hash: Buffer.from(`rhash-${idx}`),
        target_hash: null,
        source_change: { paths: [`/r${idx}`] },
        target_change: null,
        source_props: { [`r${idx}`]: idx },
        target_props: null,
        source_type: 'rel', target_type: null,
        source_src_id: `os-${idx}`, source_dst_id: `od-${idx}`,
        target_src_id: null, target_dst_id: null,
    };
}

describe('mergeBranchDryRun truncation behavior', () => {
    const targetBranch = randomUUID();
    const sourceBranch = randomUUID();

    const dbService: Partial<DatabaseService> = {
        query: async (text: string, params?: any[]) => {
            if (/FROM kb\.branches/i.test(text)) return { rowCount: 2, rows: [{ id: targetBranch }, { id: sourceBranch }] } as any;
            if (/FROM kb\.graph_objects/i.test(text)) {
                const limitPlus = params?.[2]; // requestedLimit + 1 passed from service
                const requestedLimit = limitPlus - 1;
                // create more than requested: requestedLimit + 5 to ensure truncation
                const rows = Array.from({ length: requestedLimit + 5 }, (_, i) => makeRow(i));
                return { rowCount: rows.length, rows } as any;
            }
            if (/FROM kb\.graph_relationships/i.test(text)) {
                const limitPlus = params?.[2];
                const requestedLimit = limitPlus - 1;
                const rows = Array.from({ length: requestedLimit + 3 }, (_, i) => makeRel(i));
                return { rowCount: rows.length, rows } as any;
            }
            return { rowCount: 0, rows: [] } as any;
        },
        getClient: async () => ({ query: dbService.query }) as any,
    } as any;
    const schemaRegistry: Partial<SchemaRegistryService> = { getObjectValidator: async () => null, getRelationshipValidator: async () => null } as any;
    const service = new GraphService(dbService as DatabaseService, schemaRegistry as SchemaRegistryService);

    it('sets truncated flag and enforces limit for objects & relationships', async () => {
        const dto: BranchMergeRequestDto = { sourceBranchId: sourceBranch, execute: false, limit: 10 };
        const summary = await service.mergeBranchDryRun(targetBranch, dto);
        expect(summary.hard_limit).toBeGreaterThanOrEqual(10);
        expect(summary.total_objects).toBe(10); // enforced
        expect(summary.truncated).toBe(true);
        expect(summary.objects.length).toBe(10);
        // relationship parity
        expect(summary.relationships_total).toBe(10);
        expect(summary.relationships?.length).toBe(10);
    });
});
