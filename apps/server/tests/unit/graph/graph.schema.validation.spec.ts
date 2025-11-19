/// <reference types="vitest" />
import { describe, it, expect } from 'vitest';
import { GraphService } from '../../../src/modules/graph/graph.service';

// Minimal shape needed from a DB client used inside GraphService.createObject
interface MockDbClient {
    query: (sql: string, params?: any[]) => Promise<any>;
    release: () => void;
}

class MockDatabaseService {
    private insertCounter = 0;
    private currentOrgId: string | null = null;
    private currentProjectId: string | null = null;
    async getClient(): Promise<MockDbClient> {
        return {
            query: async (sql: string) => {
                if (sql.startsWith('BEGIN') || sql.startsWith('COMMIT') || sql.startsWith('ROLLBACK')) {
                    return { rows: [], rowCount: 0 };
                }
                if (sql.startsWith('INSERT INTO kb.graph_objects')) {
                    this.insertCounter++;
                    // Return a single row mimicking the real graph_objects RETURNING clause
                    return {
                        rows: [
                            {
                                id: `obj-${this.insertCounter}`,
                                organization_id: null,
                                project_id: null,
                                canonical_id: 'can-1',
                                supersedes_id: null,
                                version: 1,
                                type: 'doc',
                                key: null,
                                properties: { title: 'Hello' },
                                labels: [],
                                deleted_at: null,
                                created_at: new Date().toISOString(),
                            },
                        ],
                        rowCount: 1,
                    };
                }
                // SELECT head (when key provided) not hit in these tests since we omit key
                return { rows: [], rowCount: 0 };
            },
            release: () => { /* no-op */ },
        };
    }

    async setTenantContext(orgId?: string | null, projectId?: string | null) {
        this.currentOrgId = orgId ?? null;
        this.currentProjectId = projectId ?? null;
    }

    async runWithTenantContext<T>(projectId: string | null, fn: () => Promise<T>): Promise<T> {
        const previousProject = this.currentProjectId;
        // Mock: projectId parameter accepted but not used for actual tenant isolation
        // Real implementation derives orgId from projectId automatically
        this.currentProjectId = projectId ?? null;
        try {
            return await fn();
        } finally {
            this.currentProjectId = previousProject;
        }
    }
}

type ValidatorFn = ((data: any) => boolean) & { errors?: any };

class MockSchemaRegistryService {
    private validator: ValidatorFn;
    constructor(required: string[]) {
        this.validator = ((data: any) => {
            const missing = required.filter(r => data[r] === undefined);
            if (missing.length) {
                this.validator.errors = missing.map(m => ({ instancePath: '/' + m, message: 'is required' }));
                return false;
            }
            this.validator.errors = undefined;
            return true;
        }) as ValidatorFn;
    }
    async getObjectValidator(): Promise<ValidatorFn | undefined> { return this.validator; }
    async getRelationshipValidator(): Promise<ValidatorFn | undefined> { return undefined; }
}

describe('Graph schema validation (object create)', () => {
    it('rejects object missing required property', async () => {
        const db: any = new MockDatabaseService();
        const schemaRegistry: any = new MockSchemaRegistryService(['title']);
        const graph = new GraphService(db, schemaRegistry);
        await expect(graph.createObject({ type: 'doc', properties: {} } as any))
            .rejects.toMatchObject({ response: { code: 'object_schema_validation_failed' } });
    });

    it('accepts object with required property', async () => {
        const db: any = new MockDatabaseService();
        const schemaRegistry: any = new MockSchemaRegistryService(['title']);
        const graph = new GraphService(db, schemaRegistry);
        const obj = await graph.createObject({ type: 'doc', properties: { title: 'Hello' } } as any);
        expect(obj.properties.title).toBe('Hello');
        expect(obj.version).toBe(1);
    });
});
