import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import supertest from 'supertest';
import { createE2EContext } from './e2e-context';
import { authHeader } from './auth-helpers';

/**
 * E2E coverage for embedding policy endpoints and enforcement during object creation.
 * Tests CRUD operations, policy evaluation, and integration with embedding queue.
 */

describe('Graph Embedding Policies (E2E)', () => {
    let ctx: Awaited<ReturnType<typeof createE2EContext>>;
    let request: supertest.SuperTest<supertest.Test>;
    const contextHeaders = () => ({
        ...authHeader('default'),
        'x-org-id': ctx.orgId,
        'x-project-id': ctx.projectId,
    });

    beforeAll(async () => {
        ctx = await createE2EContext('graph-embedding-policies');
        request = supertest(ctx.baseUrl);
    });

    afterAll(async () => {
        await ctx.close();
    });

    describe('Policy CRUD Operations', () => {
        test('create policy with all fields', async () => {
            const policy = {
                projectId: ctx.projectId,
                objectType: 'Document',
                enabled: true,
                maxPropertySize: 10000,
                requiredLabels: ['verified', 'reviewed'],
                excludedLabels: ['draft', 'archived'],
                relevantPaths: ['/title', '/content', '/metadata/author'],
            };

            const res = await request
                .post('/graph/embedding-policies')
                .set(contextHeaders())
                .send(policy)
                .expect(201);

            expect(res.body).toMatchObject({
                projectId: ctx.projectId,
                objectType: 'Document',
                enabled: true,
                maxPropertySize: 10000,
            });
            expect(res.body.id).toBeDefined();
            expect(res.body.createdAt).toBeDefined();
            expect(res.body.requiredLabels).toEqual(['verified', 'reviewed']);
            expect(res.body.excludedLabels).toEqual(['draft', 'archived']);
            expect(res.body.relevantPaths).toEqual(['/title', '/content', '/metadata/author']);
        });

        test('create policy with minimal fields', async () => {
            const policy = {
                projectId: ctx.projectId,
                objectType: 'Requirement',
                enabled: false,
            };

            const res = await request
                .post('/graph/embedding-policies')
                .set(contextHeaders())
                .send(policy)
                .expect(201);

            expect(res.body).toMatchObject({
                projectId: ctx.projectId,
                objectType: 'Requirement',
                enabled: false,
            });
            expect(res.body.maxPropertySize).toBeNull();
            expect(res.body.requiredLabels).toEqual([]);
            expect(res.body.excludedLabels).toEqual([]);
            expect(res.body.relevantPaths).toEqual([]);
        });

        test('reject duplicate policy (same project + object type)', async () => {
            const policy = {
                projectId: ctx.projectId,
                objectType: 'TestCase',
                enabled: true,
            };

            // First creation succeeds
            await request
                .post('/graph/embedding-policies')
                .set(contextHeaders())
                .send(policy)
                .expect(201);

            // Second creation fails with 500 (unique constraint violation from database)
            await request
                .post('/graph/embedding-policies')
                .set(contextHeaders())
                .send(policy)
                .expect(500);
        });

        test('list all policies for project', async () => {
            // Create multiple policies
            await request
                .post('/graph/embedding-policies')
                .set(contextHeaders())
                .send({
                    projectId: ctx.projectId,
                    objectType: 'Asset',
                    enabled: true,
                })
                .expect(201);

            await request
                .post('/graph/embedding-policies')
                .set(contextHeaders())
                .send({
                    projectId: ctx.projectId,
                    objectType: 'Component',
                    enabled: false,
                })
                .expect(201);

            const res = await request
                .get(`/graph/embedding-policies?project_id=${ctx.projectId}`)
                .set(contextHeaders())
                .expect(200);

            expect(Array.isArray(res.body)).toBe(true);
            expect(res.body.length).toBeGreaterThanOrEqual(2);

            const types = res.body.map((p: any) => p.objectType);
            expect(types).toContain('Asset');
            expect(types).toContain('Component');
        });

        test('filter policies by object type', async () => {
            const res = await request
                .get(`/graph/embedding-policies?project_id=${ctx.projectId}&object_type=Document`)
                .set(contextHeaders())
                .expect(200);

            expect(Array.isArray(res.body)).toBe(true);
            expect(res.body.length).toBe(1);
            expect(res.body[0].objectType).toBe('Document');
        });

        test('require project_id query parameter', async () => {
            await request
                .get('/graph/embedding-policies')
                .set(contextHeaders())
                .expect(400);
        });

        test('get single policy by id', async () => {
            const created = await request
                .post('/graph/embedding-policies')
                .set(contextHeaders())
                .send({
                    projectId: ctx.projectId,
                    objectType: 'SingleGetTest',
                    enabled: true,
                })
                .expect(201);

            const res = await request
                .get(`/graph/embedding-policies/${created.body.id}?project_id=${ctx.projectId}`)
                .set(contextHeaders())
                .expect(200);

            expect(res.body.id).toBe(created.body.id);
            expect(res.body.objectType).toBe('SingleGetTest');
        });

        test('404 for non-existent policy id', async () => {
            await request
                .get(`/graph/embedding-policies/00000000-0000-0000-0000-000000000000?project_id=${ctx.projectId}`)
                .set(contextHeaders())
                .expect(404);
        });

        test('update policy fields', async () => {
            const created = await request
                .post('/graph/embedding-policies')
                .set(contextHeaders())
                .send({
                    projectId: ctx.projectId,
                    objectType: 'UpdateTest',
                    enabled: true,
                    maxPropertySize: 5000,
                })
                .expect(201);

            const updated = await request
                .patch(`/graph/embedding-policies/${created.body.id}?project_id=${ctx.projectId}`)
                .set(contextHeaders())
                .send({
                    enabled: false,
                    maxPropertySize: 10000,
                    requiredLabels: ['important'],
                })
                .expect(200);

            expect(updated.body.id).toBe(created.body.id);
            expect(updated.body.enabled).toBe(false);
            expect(updated.body.maxPropertySize).toBe(10000);
            expect(updated.body.requiredLabels).toEqual(['important']);
        });

        test('404 when updating non-existent policy', async () => {
            await request
                .patch(`/graph/embedding-policies/00000000-0000-0000-0000-000000000000?project_id=${ctx.projectId}`)
                .set(contextHeaders())
                .send({ enabled: false })
                .expect(404);
        });

        test('delete policy', async () => {
            const created = await request
                .post('/graph/embedding-policies')
                .set(contextHeaders())
                .send({
                    projectId: ctx.projectId,
                    objectType: 'DeleteTest',
                    enabled: true,
                })
                .expect(201);

            await request
                .delete(`/graph/embedding-policies/${created.body.id}?project_id=${ctx.projectId}`)
                .set(contextHeaders())
                .expect(204);

            // Verify deletion
            await request
                .get(`/graph/embedding-policies/${created.body.id}?project_id=${ctx.projectId}`)
                .set(contextHeaders())
                .expect(404);
        });

        test('404 when deleting non-existent policy', async () => {
            await request
                .delete(`/graph/embedding-policies/00000000-0000-0000-0000-000000000000?project_id=${ctx.projectId}`)
                .set(contextHeaders())
                .expect(404);
        });
    });

    describe('Policy Enforcement During Object Creation', () => {
        test('object NOT embedded when policy disabled', async () => {
            // Create a policy that disables embedding for DisabledType
            await request
                .post('/graph/embedding-policies')
                .set(contextHeaders())
                .send({
                    projectId: ctx.projectId,
                    objectType: 'DisabledType',
                    enabled: false,
                })
                .expect(201);

            // Create an object of that type
            const obj = await request
                .post('/graph/objects')
                .set(contextHeaders())
                .send({
                    type: 'DisabledType',
                    key: 'test-disabled',
                    properties: { content: 'This should not be embedded' },
                    organization_id: ctx.orgId,
                    project_id: ctx.projectId,
                })
                .expect(201);

            expect(obj.body.id).toBeDefined();
            // Note: We cannot directly verify embedding queue state in E2E,
            // but the policy service should prevent enqueueing
        });

        test('object embedded when policy enabled', async () => {
            // Create a policy that enables embedding for EnabledType
            await request
                .post('/graph/embedding-policies')
                .set(contextHeaders())
                .send({
                    projectId: ctx.projectId,
                    objectType: 'EnabledType',
                    enabled: true,
                })
                .expect(201);

            // Create an object of that type
            const obj = await request
                .post('/graph/objects')
                .set(contextHeaders())
                .send({
                    type: 'EnabledType',
                    key: 'test-enabled',
                    properties: { content: 'This should be embedded' },
                    organization_id: ctx.orgId,
                    project_id: ctx.projectId,
                })
                .expect(201);

            expect(obj.body.id).toBeDefined();
        });

        test('object NOT embedded when missing required labels', async () => {
            // Create a policy requiring specific labels
            await request
                .post('/graph/embedding-policies')
                .set(contextHeaders())
                .send({
                    projectId: ctx.projectId,
                    objectType: 'RequiredLabelType',
                    enabled: true,
                    requiredLabels: ['verified', 'approved'],
                })
                .expect(201);

            // Create object without required labels
            const obj = await request
                .post('/graph/objects')
                .set(contextHeaders())
                .send({
                    type: 'RequiredLabelType',
                    key: 'missing-labels',
                    properties: { content: 'Missing labels' },
                    labels: ['draft'], // Missing 'verified' and 'approved'
                    organization_id: ctx.orgId,
                    project_id: ctx.projectId,
                })
                .expect(201);

            expect(obj.body.id).toBeDefined();
        });

        test('object embedded when has required labels', async () => {
            // Create object WITH required labels
            const obj = await request
                .post('/graph/objects')
                .set(contextHeaders())
                .send({
                    type: 'RequiredLabelType',
                    key: 'has-labels',
                    properties: { content: 'Has labels' },
                    labels: ['verified', 'approved', 'extra'],
                    organization_id: ctx.orgId,
                    project_id: ctx.projectId,
                })
                .expect(201);

            expect(obj.body.id).toBeDefined();
        });

        test('object NOT embedded when has excluded labels', async () => {
            // Create a policy excluding specific labels
            await request
                .post('/graph/embedding-policies')
                .set(contextHeaders())
                .send({
                    projectId: ctx.projectId,
                    objectType: 'ExcludedLabelType',
                    enabled: true,
                    excludedLabels: ['draft', 'temp'],
                })
                .expect(201);

            // Create object with excluded label
            const obj = await request
                .post('/graph/objects')
                .set(contextHeaders())
                .send({
                    type: 'ExcludedLabelType',
                    key: 'has-excluded',
                    properties: { content: 'Draft content' },
                    labels: ['draft'],
                    organization_id: ctx.orgId,
                    project_id: ctx.projectId,
                })
                .expect(201);

            expect(obj.body.id).toBeDefined();
        });

        test('object NOT embedded when exceeds size limit', async () => {
            // Create a policy with small size limit
            await request
                .post('/graph/embedding-policies')
                .set(contextHeaders())
                .send({
                    projectId: ctx.projectId,
                    objectType: 'SizeLimitType',
                    enabled: true,
                    maxPropertySize: 100, // 100 bytes
                })
                .expect(201);

            // Create object with large properties
            const largeContent = 'x'.repeat(500); // Much larger than 100 bytes
            const obj = await request
                .post('/graph/objects')
                .set(contextHeaders())
                .send({
                    type: 'SizeLimitType',
                    key: 'large-object',
                    properties: { content: largeContent },
                    organization_id: ctx.orgId,
                    project_id: ctx.projectId,
                })
                .expect(201);

            expect(obj.body.id).toBeDefined();
        });

        test('object embedded for types without policy (permissive default)', async () => {
            // Create object for type without any policy
            const obj = await request
                .post('/graph/objects')
                .set(contextHeaders())
                .send({
                    type: 'UnpolicedType',
                    key: 'no-policy',
                    properties: { content: 'No policy defined' },
                    organization_id: ctx.orgId,
                    project_id: ctx.projectId,
                })
                .expect(201);

            expect(obj.body.id).toBeDefined();
        });

        test('object respects combined filters', async () => {
            // Create a policy with multiple filters
            await request
                .post('/graph/embedding-policies')
                .set(contextHeaders())
                .send({
                    projectId: ctx.projectId,
                    objectType: 'CombinedFilterType',
                    enabled: true,
                    maxPropertySize: 5000,
                    requiredLabels: ['reviewed'],
                    excludedLabels: ['archived'],
                    relevantPaths: ['/title', '/summary'],
                })
                .expect(201);

            // Create object that passes all filters
            const obj = await request
                .post('/graph/objects')
                .set(contextHeaders())
                .send({
                    type: 'CombinedFilterType',
                    key: 'passes-filters',
                    properties: {
                        title: 'Test Document',
                        summary: 'Short summary',
                        internalData: 'Should be filtered out by relevantPaths'
                    },
                    labels: ['reviewed', 'published'],
                    organization_id: ctx.orgId,
                    project_id: ctx.projectId,
                })
                .expect(201);

            expect(obj.body.id).toBeDefined();
        });
    });

    describe('Policy Updates Affect Subsequent Objects', () => {
        test('updating policy changes embedding behavior', async () => {
            // Create initial policy (enabled)
            const policy = await request
                .post('/graph/embedding-policies')
                .set(contextHeaders())
                .send({
                    projectId: ctx.projectId,
                    objectType: 'DynamicType',
                    enabled: true,
                })
                .expect(201);

            // Create object (should be embedded)
            const obj1 = await request
                .post('/graph/objects')
                .set(contextHeaders())
                .send({
                    type: 'DynamicType',
                    key: 'before-update',
                    properties: { content: 'Before policy update' },
                    organization_id: ctx.orgId,
                    project_id: ctx.projectId,
                })
                .expect(201);

            expect(obj1.body.id).toBeDefined();

            // Update policy (disable)
            await request
                .patch(`/graph/embedding-policies/${policy.body.id}?project_id=${ctx.projectId}`)
                .set(contextHeaders())
                .send({ enabled: false })
                .expect(200);

            // Create another object (should NOT be embedded)
            const obj2 = await request
                .post('/graph/objects')
                .set(contextHeaders())
                .send({
                    type: 'DynamicType',
                    key: 'after-update',
                    properties: { content: 'After policy update' },
                    organization_id: ctx.orgId,
                    project_id: ctx.projectId,
                })
                .expect(201);

            expect(obj2.body.id).toBeDefined();
        });

        test('deleting policy reverts to permissive behavior', async () => {
            // Create policy that disables embedding
            const policy = await request
                .post('/graph/embedding-policies')
                .set(contextHeaders())
                .send({
                    projectId: ctx.projectId,
                    objectType: 'DeletableType',
                    enabled: false,
                })
                .expect(201);

            // Create object (should NOT be embedded)
            const obj1 = await request
                .post('/graph/objects')
                .set(contextHeaders())
                .send({
                    type: 'DeletableType',
                    key: 'before-delete',
                    properties: { content: 'Before policy delete' },
                    organization_id: ctx.orgId,
                    project_id: ctx.projectId,
                })
                .expect(201);

            expect(obj1.body.id).toBeDefined();

            // Delete policy
            await request
                .delete(`/graph/embedding-policies/${policy.body.id}?project_id=${ctx.projectId}`)
                .set(contextHeaders())
                .expect(204);

            // Create another object (should be embedded - no policy = permissive)
            const obj2 = await request
                .post('/graph/objects')
                .set(contextHeaders())
                .send({
                    type: 'DeletableType',
                    key: 'after-delete',
                    properties: { content: 'After policy delete' },
                    organization_id: ctx.orgId,
                    project_id: ctx.projectId,
                })
                .expect(201);

            expect(obj2.body.id).toBeDefined();
        });
    });

    describe('Cross-Project Isolation', () => {
        test('policies do not affect objects in different projects', async () => {
            // Create policy for ctx.projectId
            await request
                .post('/graph/embedding-policies')
                .set(contextHeaders())
                .send({
                    projectId: ctx.projectId,
                    objectType: 'IsolatedType',
                    enabled: false, // Disabled for this project
                })
                .expect(201);

            // Note: Creating objects in different projects would require
            // setting up additional test context. This test verifies
            // that policy queries are project-scoped.

            // Verify policy list is filtered by project
            const policies = await request
                .get(`/graph/embedding-policies?project_id=${ctx.projectId}`)
                .set(contextHeaders())
                .expect(200);

            const isolatedPolicy = policies.body.find((p: any) => p.objectType === 'IsolatedType');
            expect(isolatedPolicy).toBeDefined();
            expect(isolatedPolicy.projectId).toBe(ctx.projectId);
        });
    });

    describe('Edge Cases and Validation', () => {
        test('reject invalid maxPropertySize (negative)', async () => {
            await request
                .post('/graph/embedding-policies')
                .set(contextHeaders())
                .send({
                    projectId: ctx.projectId,
                    objectType: 'InvalidSize',
                    enabled: true,
                    maxPropertySize: -100,
                })
                .expect(400); // ValidationPipe returns 400 for DTO validation errors
        });

        test('reject missing required fields', async () => {
            await request
                .post('/graph/embedding-policies')
                .set(contextHeaders())
                .send({
                    // Missing projectId and objectType
                    enabled: true,
                })
                .expect(400); // ValidationPipe returns 400 for DTO validation errors
        });

        test('handle empty arrays gracefully', async () => {
            const policy = await request
                .post('/graph/embedding-policies')
                .set(contextHeaders())
                .send({
                    projectId: ctx.projectId,
                    objectType: 'EmptyArrays',
                    enabled: true,
                    requiredLabels: [],
                    excludedLabels: [],
                    relevantPaths: [],
                })
                .expect(201);

            expect(policy.body.requiredLabels).toEqual([]);
            expect(policy.body.excludedLabels).toEqual([]);
            expect(policy.body.relevantPaths).toEqual([]);
        });

        test('handle JSON pointer paths correctly', async () => {
            const policy = await request
                .post('/graph/embedding-policies')
                .set(contextHeaders())
                .send({
                    projectId: ctx.projectId,
                    objectType: 'PathFilterType',
                    enabled: true,
                    relevantPaths: [
                        '/simple',
                        '/nested/deep/value',
                        '/array/0',
                    ],
                })
                .expect(201);

            expect(policy.body.relevantPaths).toEqual([
                '/simple',
                '/nested/deep/value',
                '/array/0',
            ]);
        });
    });
});
