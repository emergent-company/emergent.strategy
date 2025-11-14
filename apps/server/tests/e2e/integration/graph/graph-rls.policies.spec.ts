import { describe, it, expect, beforeAll } from 'vitest';
import { Test } from '@nestjs/testing';
import { DatabaseService } from '../../../../src/common/database/database.service';
import { AppConfigService } from '../../../../src/common/config/config.service';
import { EnvVariables, validate } from '../../../../src/common/config/config.schema';

// Minimal lightweight testing module to access DatabaseService
async function createModule() {
    const moduleRef = await Test.createTestingModule({
        providers: [
            DatabaseService,
            AppConfigService,
            { provide: EnvVariables, useValue: validate(process.env as any) },
        ],
    }).compile();
    return moduleRef;
}

describe('RLS policy set (regression guard)', () => {
    let db: DatabaseService;

    beforeAll(async () => {
        const moduleRef = await createModule();
        db = moduleRef.get(DatabaseService);
        await db.onModuleInit();
        if (!db.isOnline()) {
            throw new Error('Database offline for RLS policy test');
        }
    });

    it('has the exact expected policy names on graph tables', async () => {
        const res = await db.query<{ policyname: string; tablename: string }>(
            `SELECT policyname, tablename FROM pg_policies WHERE schemaname='kb' AND tablename IN ('graph_objects','graph_relationships') ORDER BY tablename, policyname`);
        const names = res.rows.map(r => `${r.tablename}:${r.policyname}`);
        // Expect exactly 8 policies across each table (select/insert/update/delete)
        const expected = [
            'graph_objects:graph_objects_delete',
            'graph_objects:graph_objects_insert',
            'graph_objects:graph_objects_select',
            'graph_objects:graph_objects_update',
            'graph_relationships:graph_relationships_delete',
            'graph_relationships:graph_relationships_insert',
            'graph_relationships:graph_relationships_select',
            'graph_relationships:graph_relationships_update',
        ];
        expect(names).toEqual(expected);
    });
});
