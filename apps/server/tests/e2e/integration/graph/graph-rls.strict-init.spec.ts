import { beforeAll, describe, expect, it } from 'vitest';
import { Test } from '@nestjs/testing';
import { DatabaseService } from '../../../../src/common/database/database.service';
import { AppConfigService } from '../../../../src/common/config/config.service';
import { EnvVariables, validate } from '../../../../src/common/config/config.schema';
import { getTestDbConfig } from '../../e2e/test-db-config';

/**
 * Verifies server startup succeeds (and does not silently downgrade) when RLS_POLICY_STRICT is enabled
 * and canonical policy set is present. Acts as a fail-fast guard for regressions that would add/remove
 * policies outside the expected deterministic set.
 */

describe('RLS strict initialization', () => {
    let db: DatabaseService;

    beforeAll(async () => {
        process.env.RLS_POLICY_STRICT = 'true';
        process.env.DB_AUTOINIT = 'true';
        getTestDbConfig(); // Sets PG* env vars

        const moduleRef = await Test.createTestingModule({
            providers: [
                DatabaseService,
                AppConfigService,
                { provide: EnvVariables, useValue: validate(process.env as any) },
            ],
        }).compile();
        db = moduleRef.get(DatabaseService);
        const MAX_RETRIES = 3;
        for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
            try {
                await db.onModuleInit();
                break;
            } catch (error: any) {
                const message = typeof error?.message === 'string' ? error.message : '';
                if (message.includes('tuple concurrently updated') && attempt < MAX_RETRIES) {
                    await new Promise((resolve) => setTimeout(resolve, 50 * attempt));
                    continue;
                }
                throw error;
            }
        }
    }, 30000);

    it('comes online and reports canonical policies under strict mode', async () => {
        expect(db.isOnline()).toBe(true);
        const res = await db.query<{ policyname: string }>(`SELECT policyname FROM pg_policies WHERE schemaname='kb' AND tablename IN ('graph_objects','graph_relationships') ORDER BY policyname`);
        const names = res.rows.map(r => r.policyname).sort();
        const expected = [
            'graph_objects_delete', 'graph_objects_insert', 'graph_objects_select', 'graph_objects_update',
            'graph_relationships_delete', 'graph_relationships_insert', 'graph_relationships_select', 'graph_relationships_update'
        ].sort();
        expect(names).toEqual(expected);
    });
});

export const config = { mode: 'serial' };
