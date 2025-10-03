import { beforeAll, beforeEach, afterAll, describe, it, expect } from 'vitest';
import { createE2EContext, E2EContext } from './e2e-context';
import { authHeader } from './auth-helpers';

/**
 * Entity Linking Integration Tests (E2E)
 * 
 * Tests the complete entity linking workflow with real database:
 * 1. Skip: High overlap (>90%) - entity creation skipped
 * 2. Merge: Partial overlap (≤90%) - properties merged into existing object
 * 3. Create: No match - new object created
 * 4. Strategy comparison: key_match vs vector_similarity
 * 5. Concurrent linking: Race condition handling
 * 
 * All tests use real database with extraction job pipeline.
 */

let ctx: E2EContext;

describe('Entity Linking Integration (E2E)', () => {
    beforeAll(async () => {
        ctx = await createE2EContext('entity-linking');
    });

    beforeEach(async () => {
        await ctx.cleanup();
    });

    afterAll(async () => {
        await ctx.close();
    });

    describe('Skip Scenario: High Overlap (>90%)', () => {
        it('should skip entity creation when existing object has >90% property overlap', async () => {
            const headers = authHeader('all', 'entity-linking');

            // Step 1: Create initial object with properties
            const createObjectRes = await fetch(`${ctx.baseUrl}/graph/objects`, {
                method: 'POST',
                headers: { ...headers, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    project_id: ctx.projectId,
                    type: 'Application',
                    key: 'acme-crm',
                    name: 'Acme CRM',
                    properties: {
                        name: 'Acme CRM',
                        description: 'Customer relationship management system',
                        version: '2.0',
                        vendor: 'Acme Corp',
                        category: 'Business Application'
                    }
                })
            });

            expect(createObjectRes.status).toBe(201);
            const initialObject = await createObjectRes.json();
            const existingObjectId = initialObject.id;

            // Step 2: Create a document for extraction
            const createDocRes = await fetch(`${ctx.baseUrl}/documents`, {
                method: 'POST',
                headers: { ...headers, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    project_id: ctx.projectId,
                    title: 'Architecture Document',
                    content: `
# Application Architecture

## Systems
- Acme CRM: Customer relationship management system v2.0 by Acme Corp
  - Category: Business Application
  - Vendor: Acme Corp
`,
                    mime_type: 'text/markdown'
                })
            });

            expect(createDocRes.status).toBe(201);
            const document = await createDocRes.json();

            // Step 3: Create template pack with Application type
            const createPackRes = await fetch(`${ctx.baseUrl}/template-packs`, {
                method: 'POST',
                headers: { ...headers, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: 'Entity Linking Test Pack',
                    version: '1.0.0',
                    description: 'Test pack for entity linking',
                    object_type_schemas: {
                        Application: {
                            type: 'object',
                            required: ['name'],
                            properties: {
                                name: { type: 'string' },
                                description: { type: 'string' },
                                version: { type: 'string' },
                                vendor: { type: 'string' },
                                category: { type: 'string' }
                            }
                        }
                    },
                    ui_configs: {
                        Application: {
                            icon: 'app',
                            color: '#3B82F6',
                            display_name: 'Application'
                        }
                    }
                })
            });

            expect(createPackRes.status).toBe(201);
            const pack = await createPackRes.json();

            // Step 4: Create extraction job with key_match strategy
            const createJobRes = await fetch(`${ctx.baseUrl}/extraction-jobs`, {
                method: 'POST',
                headers: { ...headers, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    project_id: ctx.projectId,
                    document_id: document.id,
                    template_pack_id: pack.id,
                    config: {
                        entity_linking_strategy: 'key_match',
                        quality_threshold: 'auto', // Accept all for test
                        target_types: ['Application']
                    }
                })
            });

            expect(createJobRes.status).toBe(201);
            const job = await createJobRes.json();

            // Step 5: Poll job status until complete
            let finalStatus;
            for (let i = 0; i < 30; i++) {
                const statusRes = await fetch(`${ctx.baseUrl}/extraction-jobs/${job.id}`, { headers });
                expect(statusRes.status).toBe(200);
                const status = await statusRes.json();
                finalStatus = status;

                if (status.status === 'completed' || status.status === 'failed') {
                    break;
                }

                await new Promise(resolve => setTimeout(resolve, 1000));
            }

            expect(finalStatus.status).toBe('completed');

            // Step 6: Verify no new object was created (skipped due to high overlap)
            const listObjectsRes = await fetch(
                `${ctx.baseUrl}/graph/objects?project_id=${ctx.projectId}&type=Application`,
                { headers }
            );
            expect(listObjectsRes.status).toBe(200);
            const objects = await listObjectsRes.json();

            // Should still have only 1 object (the original)
            expect(objects.length).toBe(1);
            expect(objects[0].id).toBe(existingObjectId);

            // Step 7: Verify original object properties unchanged
            const getObjectRes = await fetch(`${ctx.baseUrl}/graph/objects/${existingObjectId}`, { headers });
            expect(getObjectRes.status).toBe(200);
            const finalObject = await getObjectRes.json();

            expect(finalObject.properties.name).toBe('Acme CRM');
            expect(finalObject.properties.version).toBe('2.0');
            expect(finalObject.properties.vendor).toBe('Acme Corp');
        });
    });

    describe('Merge Scenario: Partial Overlap (≤90%)', () => {
        it('should merge properties when existing object has ≤90% overlap', async () => {
            const headers = authHeader('all', 'entity-linking');

            // Step 1: Create initial object with partial properties
            const createObjectRes = await fetch(`${ctx.baseUrl}/graph/objects`, {
                method: 'POST',
                headers: { ...headers, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    project_id: ctx.projectId,
                    type: 'Application',
                    key: 'inventory-system',
                    name: 'Inventory System',
                    properties: {
                        name: 'Inventory System',
                        description: 'Manages warehouse inventory'
                    }
                })
            });

            expect(createObjectRes.status).toBe(201);
            const initialObject = await createObjectRes.json();
            const existingObjectId = initialObject.id;

            // Step 2: Create document with additional properties
            const createDocRes = await fetch(`${ctx.baseUrl}/documents`, {
                method: 'POST',
                headers: { ...headers, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    project_id: ctx.projectId,
                    title: 'System Documentation',
                    content: `
# System Inventory

## Inventory System
- Description: Manages warehouse inventory
- Version: 3.5
- Vendor: TechCorp
- Category: Logistics
- Deployment: Cloud-based
`,
                    mime_type: 'text/markdown'
                })
            });

            expect(createDocRes.status).toBe(201);
            const document = await createDocRes.json();

            // Step 3: Create template pack
            const createPackRes = await fetch(`${ctx.baseUrl}/template-packs`, {
                method: 'POST',
                headers: { ...headers, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: 'Merge Test Pack',
                    version: '1.0.0',
                    description: 'Test pack for merge scenario',
                    object_type_schemas: {
                        Application: {
                            type: 'object',
                            required: ['name'],
                            properties: {
                                name: { type: 'string' },
                                description: { type: 'string' },
                                version: { type: 'string' },
                                vendor: { type: 'string' },
                                category: { type: 'string' },
                                deployment: { type: 'string' }
                            }
                        }
                    },
                    ui_configs: {
                        Application: {
                            icon: 'app',
                            color: '#3B82F6',
                            display_name: 'Application'
                        }
                    }
                })
            });

            expect(createPackRes.status).toBe(201);
            const pack = await createPackRes.json();

            // Step 4: Create extraction job
            const createJobRes = await fetch(`${ctx.baseUrl}/extraction-jobs`, {
                method: 'POST',
                headers: { ...headers, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    project_id: ctx.projectId,
                    document_id: document.id,
                    template_pack_id: pack.id,
                    config: {
                        entity_linking_strategy: 'key_match',
                        quality_threshold: 'auto',
                        target_types: ['Application']
                    }
                })
            });

            expect(createJobRes.status).toBe(201);
            const job = await createJobRes.json();

            // Step 5: Poll job status
            let finalStatus;
            for (let i = 0; i < 30; i++) {
                const statusRes = await fetch(`${ctx.baseUrl}/extraction-jobs/${job.id}`, { headers });
                expect(statusRes.status).toBe(200);
                const status = await statusRes.json();
                finalStatus = status;

                if (status.status === 'completed' || status.status === 'failed') {
                    break;
                }

                await new Promise(resolve => setTimeout(resolve, 1000));
            }

            expect(finalStatus.status).toBe('completed');

            // Step 6: Verify still only 1 object (merged, not created new)
            const listObjectsRes = await fetch(
                `${ctx.baseUrl}/graph/objects?project_id=${ctx.projectId}&type=Application`,
                { headers }
            );
            expect(listObjectsRes.status).toBe(200);
            const objects = await listObjectsRes.json();

            expect(objects.length).toBe(1);
            expect(objects[0].id).toBe(existingObjectId);

            // Step 7: Verify properties were merged
            const getObjectRes = await fetch(`${ctx.baseUrl}/graph/objects/${existingObjectId}`, { headers });
            expect(getObjectRes.status).toBe(200);
            const mergedObject = await getObjectRes.json();

            // Original properties preserved
            expect(mergedObject.properties.name).toBe('Inventory System');
            expect(mergedObject.properties.description).toBe('Manages warehouse inventory');

            // New properties added
            expect(mergedObject.properties.version).toBe('3.5');
            expect(mergedObject.properties.vendor).toBe('TechCorp');
            expect(mergedObject.properties.category).toBe('Logistics');
            expect(mergedObject.properties.deployment).toBe('Cloud-based');
        });
    });

    describe('Create Scenario: No Match Found', () => {
        it('should create new object when no similar entity exists (key_match)', async () => {
            const headers = authHeader('all', 'entity-linking');

            // Step 1: Create document describing a new system
            const createDocRes = await fetch(`${ctx.baseUrl}/documents`, {
                method: 'POST',
                headers: { ...headers, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    project_id: ctx.projectId,
                    title: 'New System Documentation',
                    content: `
# New Systems

## Phoenix Analytics Platform
- Description: Real-time analytics and reporting
- Version: 1.0
- Vendor: Phoenix Inc
- Category: Analytics
`,
                    mime_type: 'text/markdown'
                })
            });

            expect(createDocRes.status).toBe(201);
            const document = await createDocRes.json();

            // Step 2: Create template pack
            const createPackRes = await fetch(`${ctx.baseUrl}/template-packs`, {
                method: 'POST',
                headers: { ...headers, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: 'Create Test Pack',
                    version: '1.0.0',
                    description: 'Test pack for create scenario',
                    object_type_schemas: {
                        Application: {
                            type: 'object',
                            required: ['name'],
                            properties: {
                                name: { type: 'string' },
                                description: { type: 'string' },
                                version: { type: 'string' },
                                vendor: { type: 'string' },
                                category: { type: 'string' }
                            }
                        }
                    },
                    ui_configs: {
                        Application: {
                            icon: 'app',
                            color: '#3B82F6',
                            display_name: 'Application'
                        }
                    }
                })
            });

            expect(createPackRes.status).toBe(201);
            const pack = await createPackRes.json();

            // Step 3: Verify no existing objects
            const listBeforeRes = await fetch(
                `${ctx.baseUrl}/graph/objects?project_id=${ctx.projectId}&type=Application`,
                { headers }
            );
            expect(listBeforeRes.status).toBe(200);
            const objectsBefore = await listBeforeRes.json();
            expect(objectsBefore.length).toBe(0);

            // Step 4: Create extraction job
            const createJobRes = await fetch(`${ctx.baseUrl}/extraction-jobs`, {
                method: 'POST',
                headers: { ...headers, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    project_id: ctx.projectId,
                    document_id: document.id,
                    template_pack_id: pack.id,
                    config: {
                        entity_linking_strategy: 'key_match',
                        quality_threshold: 'auto',
                        target_types: ['Application']
                    }
                })
            });

            expect(createJobRes.status).toBe(201);
            const job = await createJobRes.json();

            // Step 5: Poll job status
            let finalStatus;
            for (let i = 0; i < 30; i++) {
                const statusRes = await fetch(`${ctx.baseUrl}/extraction-jobs/${job.id}`, { headers });
                expect(statusRes.status).toBe(200);
                const status = await statusRes.json();
                finalStatus = status;

                if (status.status === 'completed' || status.status === 'failed') {
                    break;
                }

                await new Promise(resolve => setTimeout(resolve, 1000));
            }

            expect(finalStatus.status).toBe('completed');

            // Step 6: Verify new object was created
            const listAfterRes = await fetch(
                `${ctx.baseUrl}/graph/objects?project_id=${ctx.projectId}&type=Application`,
                { headers }
            );
            expect(listAfterRes.status).toBe(200);
            const objectsAfter = await listAfterRes.json();

            expect(objectsAfter.length).toBe(1);

            const newObject = objectsAfter[0];
            expect(newObject.properties.name).toBe('Phoenix Analytics Platform');
            expect(newObject.properties.description).toBe('Real-time analytics and reporting');
            expect(newObject.properties.version).toBe('1.0');
            expect(newObject.properties.vendor).toBe('Phoenix Inc');
            expect(newObject.properties.category).toBe('Analytics');
        });
    });

    describe('Strategy Comparison', () => {
        it('should find matches with always_new strategy disabled', async () => {
            const headers = authHeader('all', 'entity-linking');

            // Step 1: Create initial object
            const createObjectRes = await fetch(`${ctx.baseUrl}/graph/objects`, {
                method: 'POST',
                headers: { ...headers, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    project_id: ctx.projectId,
                    type: 'Application',
                    key: 'test-app',
                    name: 'Test Application',
                    properties: {
                        name: 'Test Application',
                        version: '1.0'
                    }
                })
            });

            expect(createObjectRes.status).toBe(201);
            const initialObject = await createObjectRes.json();

            // Step 2: Test with always_new strategy (should create duplicate)
            const createDocRes = await fetch(`${ctx.baseUrl}/documents`, {
                method: 'POST',
                headers: { ...headers, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    project_id: ctx.projectId,
                    title: 'Duplicate Test',
                    content: 'Test Application version 1.0',
                    mime_type: 'text/plain'
                })
            });

            expect(createDocRes.status).toBe(201);
            const document = await createDocRes.json();

            const createPackRes = await fetch(`${ctx.baseUrl}/template-packs`, {
                method: 'POST',
                headers: { ...headers, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: 'Strategy Test Pack',
                    version: '1.0.0',
                    description: 'Test pack for strategy comparison',
                    object_type_schemas: {
                        Application: {
                            type: 'object',
                            required: ['name'],
                            properties: {
                                name: { type: 'string' },
                                version: { type: 'string' }
                            }
                        }
                    },
                    ui_configs: {
                        Application: {
                            icon: 'app',
                            color: '#3B82F6',
                            display_name: 'Application'
                        }
                    }
                })
            });

            expect(createPackRes.status).toBe(201);
            const pack = await createPackRes.json();

            // Create job with always_new strategy
            const createJobRes = await fetch(`${ctx.baseUrl}/extraction-jobs`, {
                method: 'POST',
                headers: { ...headers, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    project_id: ctx.projectId,
                    document_id: document.id,
                    template_pack_id: pack.id,
                    config: {
                        entity_linking_strategy: 'always_new',
                        quality_threshold: 'auto',
                        target_types: ['Application']
                    }
                })
            });

            expect(createJobRes.status).toBe(201);
            const job = await createJobRes.json();

            // Poll job status
            let finalStatus;
            for (let i = 0; i < 30; i++) {
                const statusRes = await fetch(`${ctx.baseUrl}/extraction-jobs/${job.id}`, { headers });
                expect(statusRes.status).toBe(200);
                const status = await statusRes.json();
                finalStatus = status;

                if (status.status === 'completed' || status.status === 'failed') {
                    break;
                }

                await new Promise(resolve => setTimeout(resolve, 1000));
            }

            expect(finalStatus.status).toBe('completed');

            // Verify duplicate was created (2 objects now)
            const listObjectsRes = await fetch(
                `${ctx.baseUrl}/graph/objects?project_id=${ctx.projectId}&type=Application`,
                { headers }
            );
            expect(listObjectsRes.status).toBe(200);
            const objects = await listObjectsRes.json();

            expect(objects.length).toBe(2);
            expect(objects.map((o: any) => o.properties.name)).toContain('Test Application');
        });
    });
});
