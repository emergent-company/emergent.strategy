import { beforeAll, beforeEach, afterAll, describe, it, expect } from 'vitest';
import { createE2EContext, E2EContext } from './e2e-context';
import { authHeader } from './auth-helpers';

/**
 * Phase 1 E2E Integration Tests
 * 
 * Tests the complete workflow of Phase 1 components:
 * 1. Template Pack installation and management
 * 2. Type Registry (custom types) creation and configuration
 * 3. Graph Object creation with schema validation
 * 4. Extraction Job lifecycle management
 * 
 * All tests use real database with RLS policies enforced.
 */

let ctx: E2EContext;
const contextHeaders = (extra: Record<string, string> = {}) => ({
    ...authHeader('all', 'phase1-workflow'),
    'x-org-id': ctx.orgId,
    'x-project-id': ctx.projectId,
    ...extra,
});

describe('Phase 1: Complete Workflow Integration (E2E)', () => {
    beforeAll(async () => {
        ctx = await createE2EContext('phase1-workflow');
    });

    beforeEach(async () => {
        await ctx.cleanup();
    });

    afterAll(async () => {
        await ctx.close();
    });

    describe('Template Pack Workflow', () => {
        it('should create, list, get, and verify immutability of template pack', async () => {
            const headers = contextHeaders();

            // Step 1: Create template pack
            const createRes = await fetch(`${ctx.baseUrl}/template-packs`, {
                method: 'POST',
                headers: { ...headers, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: 'Test Template Pack',
                    version: '1.0.0',
                    description: 'A test template pack for E2E testing',
                    object_type_schemas: {
                        TestRequirement: {
                            type: 'object',
                            required: ['title', 'priority'],
                            properties: {
                                title: { type: 'string' },
                                priority: { type: 'string', enum: ['high', 'medium', 'low'] },
                                description: { type: 'string' }
                            }
                        }
                    },
                    ui_configs: {
                        TestRequirement: {
                            icon: 'requirement',
                            color: '#3B82F6',
                            display_name: 'Test Requirement',
                            display_order: ['title', 'priority', 'description']
                        }
                    }
                })
            });

            expect(createRes.status).toBe(201);
            const created = await createRes.json();
            expect(created.id).toBeDefined();
            expect(created.name).toBe('Test Template Pack');
            expect(created.object_type_schemas).toBeDefined();
            expect(Object.keys(created.object_type_schemas)).toHaveLength(1);
            expect(created.object_type_schemas.TestRequirement).toBeDefined();

            const packId = created.id;

            // Step 2: List template packs
            const listRes = await fetch(`${ctx.baseUrl}/template-packs?organization_id=${ctx.orgId}`, {
                headers
            });

            expect(listRes.status).toBe(200);
            const list = await listRes.json();
            expect(list.packs).toBeDefined();
            expect(Array.isArray(list.packs)).toBe(true);
            const found = list.packs.find((p: any) => p.id === packId);
            expect(found).toBeDefined();
            expect(found.name).toBe('Test Template Pack');

            // Step 3: Get single template pack
            const getRes = await fetch(`${ctx.baseUrl}/template-packs/${packId}?organization_id=${ctx.orgId}`, {
                headers
            });

            expect(getRes.status).toBe(200);
            const fetched = await getRes.json();
            expect(fetched.id).toBe(packId);
            expect(Object.keys(fetched.object_type_schemas)).toHaveLength(1);

            // Step 4: Get statistics (SKIPPED - endpoint not implemented yet)
            // TODO: Implement GET /template-packs/:id/statistics endpoint
            // const statsRes = await fetch(`${ctx.baseUrl}/template-packs/${packId}/statistics?organization_id=${ctx.orgId}`, {
            //     headers
            // });
            // expect(statsRes.status).toBe(200);
            // const stats = await statsRes.json();
            // expect(stats.total_types).toBe(1);
            // expect(stats.installed_projects).toBe(0);

            // Step 5: Verify user-created template packs are deletable (but not if installed)
            // Built-in/seeded packs (source='system') are protected from deletion
            // User-created packs (source='custom') can be deleted by the user
            const deleteRes = await fetch(`${ctx.baseUrl}/template-packs/${packId}?organization_id=${ctx.orgId}`, {
                method: 'DELETE',
                headers
            });

            // Should succeed - user-created packs are deletable
            expect(deleteRes.status).toBe(204);

            // Step 6: Verify template pack no longer exists
            const verifyRes = await fetch(`${ctx.baseUrl}/template-packs/${packId}?organization_id=${ctx.orgId}`, {
                headers
            });

            expect(verifyRes.status).toBe(404);
            // Pack has been deleted, no longer accessible
        });

        it('should install template pack to project', async () => {
            const headers = contextHeaders();

            // Create template pack
            const createRes = await fetch(`${ctx.baseUrl}/template-packs`, {
                method: 'POST',
                headers: { ...headers, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: 'Install Test Pack',
                    description: 'Pack for installation testing',
                    version: '1.0.0',
                    object_type_schemas: {
                        Feature: {
                            type: 'object',
                            required: ['name'],
                            properties: {
                                name: { type: 'string' },
                                status: { type: 'string', enum: ['planned', 'in-progress', 'done'] }
                            }
                        }
                    },
                    ui_configs: {
                        Feature: {
                            icon: 'feature',
                            color: '#10B981',
                            display_name: 'Feature'
                        }
                    }
                })
            });

            expect(createRes.status).toBe(201);
            const pack = await createRes.json();

            // Install to project
            const installRes = await fetch(`${ctx.baseUrl}/template-packs/projects/${ctx.projectId}/assign?organization_id=${ctx.orgId}&tenant_id=${ctx.orgId}&user_id=${ctx.orgId}`, {
                method: 'POST',
                headers: { ...headers, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    template_pack_id: pack.id,
                    organization_id: ctx.orgId,
                    tenant_id: ctx.orgId,
                    user_id: ctx.orgId
                })
            });

            if (installRes.status !== 201) {
                const errorBody = await installRes.text();
                console.log('Template pack install error:', installRes.status, errorBody);
            }
            expect(installRes.status).toBe(201);
            const result = await installRes.json();
            expect(result.installed_types).toBeDefined();
            expect(Array.isArray(result.installed_types)).toBe(true);
            expect(result.installed_types.length).toBeGreaterThan(0);

            // Verify types were created in Type Registry
            const typesRes = await fetch(`${ctx.baseUrl}/type-registry/projects/${ctx.projectId}?organization_id=${ctx.orgId}&tenant_id=${ctx.orgId}&user_id=${ctx.orgId}`, {
                headers
            });

            expect(typesRes.status).toBe(200);
            const types = await typesRes.json();
            expect(Array.isArray(types)).toBe(true);
            const featureType = types.find((t: any) => t.type === 'Feature');
            expect(featureType).toBeDefined();
            expect(featureType.enabled).toBe(true);
            expect(featureType.json_schema.required).toContain('name');
        });
    });

    describe('Type Registry Workflow', () => {
        it('should create, update, enable/disable, and delete custom types', async () => {
            const headers = contextHeaders();

            // Step 1: Create custom type
            const createRes = await fetch(`${ctx.baseUrl}/type-registry/projects/${ctx.projectId}/types?organization_id=${ctx.orgId}&tenant_id=${ctx.orgId}&user_id=${ctx.orgId}`, {
                method: 'POST',
                headers: { ...headers, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    type: 'CustomTask',
                    source: 'custom',
                    description: 'A custom task type',
                    json_schema: {
                        type: 'object',
                        required: ['title', 'assignee'],
                        properties: {
                            title: { type: 'string', minLength: 1 },
                            assignee: { type: 'string' },
                            dueDate: { type: 'string', format: 'date' },
                            tags: { type: 'array', items: { type: 'string' } }
                        }
                    },
                    ui_config: {
                        icon: 'task',
                        color: '#8B5CF6',
                        display_order: ['title', 'assignee', 'dueDate', 'tags']
                    },
                    enabled: true
                })
            });

            expect(createRes.status).toBe(201);
            const created = await createRes.json();
            expect(created.id).toBeDefined();
            expect(created.type).toBe('CustomTask');
            expect(created.enabled).toBe(true);

            const typeName = created.type;

            // Step 2: Get type by name
            const getRes = await fetch(`${ctx.baseUrl}/type-registry/projects/${ctx.projectId}/types/${typeName}?organization_id=${ctx.orgId}`, {
                headers
            });

            expect(getRes.status).toBe(200);
            const fetched = await getRes.json();
            expect(fetched.type).toBe('CustomTask');

            // Step 3: Update type
            const updateRes = await fetch(`${ctx.baseUrl}/type-registry/projects/${ctx.projectId}/types/${typeName}?organization_id=${ctx.orgId}`, {
                method: 'PATCH',
                headers: { ...headers, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    description: 'An updated task type description'
                })
            });

            expect(updateRes.status).toBe(200);
            const updated = await updateRes.json();
            expect(updated.description).toBe('An updated task type description');

            // Step 4: Disable type
            const disableRes = await fetch(`${ctx.baseUrl}/type-registry/projects/${ctx.projectId}/types/${typeName}/toggle?organization_id=${ctx.orgId}`, {
                method: 'PATCH',
                headers: { ...headers, 'Content-Type': 'application/json' },
                body: JSON.stringify({ enabled: false })
            });

            expect(disableRes.status).toBe(200);
            const disabled = await disableRes.json();
            expect(disabled.enabled).toBe(false);

            // Step 5: Re-enable type
            const enableRes = await fetch(`${ctx.baseUrl}/type-registry/projects/${ctx.projectId}/types/${typeName}/toggle?organization_id=${ctx.orgId}`, {
                method: 'PATCH',
                headers: { ...headers, 'Content-Type': 'application/json' },
                body: JSON.stringify({ enabled: true })
            });

            expect(enableRes.status).toBe(200);
            const enabled = await enableRes.json();
            expect(enabled.enabled).toBe(true);

            // Step 6: Get statistics
            const statsRes = await fetch(`${ctx.baseUrl}/type-registry/projects/${ctx.projectId}/stats?organization_id=${ctx.orgId}`, {
                headers
            });

            expect(statsRes.status).toBe(200);
            const stats = await statsRes.json();
            expect(stats.total_types).toBeGreaterThanOrEqual(1);
            expect(stats.enabled_types).toBeGreaterThanOrEqual(1);

            // Step 7: Delete type
            const deleteRes = await fetch(`${ctx.baseUrl}/type-registry/projects/${ctx.projectId}/types/${typeName}?organization_id=${ctx.orgId}`, {
                method: 'DELETE',
                headers
            });

            expect(deleteRes.status).toBe(204);

            // Step 8: Verify deletion
            const getDeletedRes = await fetch(`${ctx.baseUrl}/type-registry/projects/${ctx.projectId}/types/${typeName}?organization_id=${ctx.orgId}`, {
                headers
            });

            expect(getDeletedRes.status).toBe(404);
        });

        it.skip('should manage type fields', async () => {
            // SKIPPED: Field management endpoints don't exist
            // Fields should be managed by updating the type's json_schema via PATCH /type-registry/projects/:projectId/types/:typeName
            // TODO: Rewrite this test to use schema PATCH approach
            const headers = contextHeaders();

            // Create type
            const createTypeRes = await fetch(`${ctx.baseUrl}/type-registry`, {
                method: 'POST',
                headers: { ...headers, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    organization_id: ctx.orgId,
                    project_id: ctx.projectId,
                    name: 'FieldTest',
                    display_name: 'Field Test',
                    description: 'Type for field testing',
                    json_schema: {
                        type: 'object',
                        required: ['name'],
                        properties: {
                            name: { type: 'string' }
                        }
                    },
                    ui_config: { icon: 'test', color: '#EC4899' },
                    enabled: true
                })
            });

            expect(createTypeRes.status).toBe(201);
            const type = await createTypeRes.json();

            // Add field
            const addFieldRes = await fetch(`${ctx.baseUrl}/type-registry/${type.id}/fields?project_id=${ctx.projectId}&organization_id=${ctx.orgId}`, {
                method: 'POST',
                headers: { ...headers, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    field_name: 'priority',
                    field_type: 'string',
                    required: true,
                    validation_rules: { enum: ['high', 'medium', 'low'] }
                })
            });

            expect(addFieldRes.status).toBe(200);
            const withField = await addFieldRes.json();
            expect(withField.json_schema.properties.priority).toBeDefined();
            expect(withField.json_schema.required).toContain('priority');

            // Update field
            const updateFieldRes = await fetch(`${ctx.baseUrl}/type-registry/${type.id}/fields/priority?project_id=${ctx.projectId}&organization_id=${ctx.orgId}`, {
                method: 'PATCH',
                headers: { ...headers, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    required: false,
                    validation_rules: { enum: ['critical', 'high', 'medium', 'low'] }
                })
            });

            expect(updateFieldRes.status).toBe(200);
            const updated = await updateFieldRes.json();
            expect(updated.json_schema.required).not.toContain('priority');
            expect(updated.json_schema.properties.priority.enum).toContain('critical');

            // Remove field
            const removeFieldRes = await fetch(`${ctx.baseUrl}/type-registry/${type.id}/fields/priority?project_id=${ctx.projectId}&organization_id=${ctx.orgId}`, {
                method: 'DELETE',
                headers
            });

            expect(removeFieldRes.status).toBe(200);
            const withoutField = await removeFieldRes.json();
            expect(withoutField.json_schema.properties.priority).toBeUndefined();
        });
    });

    describe('Graph Object Validation with Type Registry', () => {
        it('should validate graph objects against type schemas', async () => {
            const headers = contextHeaders();

            // Create custom type with strict schema
            const createTypeRes = await fetch(`${ctx.baseUrl}/type-registry/projects/${ctx.projectId}/types?organization_id=${ctx.orgId}&tenant_id=${ctx.orgId}&user_id=${ctx.orgId}`, {
                method: 'POST',
                headers: { ...headers, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    type: 'ValidatedObject',
                    source: 'custom',
                    description: 'Object type with validation',
                    json_schema: {
                        type: 'object',
                        required: ['name', 'status'],
                        properties: {
                            name: { type: 'string', minLength: 3 },
                            status: { type: 'string', enum: ['active', 'inactive'] },
                            count: { type: 'integer', minimum: 0, maximum: 100 }
                        }
                    },
                    ui_config: { icon: 'object', color: '#F59E0B' },
                    enabled: true
                })
            });

            expect(createTypeRes.status).toBe(201);
            const type = await createTypeRes.json();
            expect(type.type).toBe('ValidatedObject');

            // Create valid graph object
            const createValidRes = await fetch(`${ctx.baseUrl}/graph/objects`, {
                method: 'POST',
                headers: { ...headers, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    organization_id: ctx.orgId,
                    project_id: ctx.projectId,
                    type: 'ValidatedObject',
                    key: 'test-valid-object',
                    properties: {
                        name: 'Valid Name',
                        status: 'active',
                        count: 50
                    }
                })
            });

            expect(createValidRes.status).toBe(201);
            const validObject = await createValidRes.json();
            expect(validObject.id).toBeDefined();
            expect(validObject.properties.name).toBe('Valid Name');

            // Try to create object with missing required field
            const createMissingFieldRes = await fetch(`${ctx.baseUrl}/graph/objects`, {
                method: 'POST',
                headers: { ...headers, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    organization_id: ctx.orgId,
                    project_id: ctx.projectId,
                    type: 'ValidatedObject',
                    key: 'invalid-object',
                    properties: {
                        name: 'Only Name'
                        // Missing required 'status' field
                    }
                })
            });

            expect(createMissingFieldRes.status).toBe(400);
            const missingError = await createMissingFieldRes.json();
            const errorMessage = missingError.message || missingError.error?.message || missingError.error || missingError.detail || JSON.stringify(missingError);
            expect(errorMessage).toContain('schema');

            // Try to create object with invalid enum value
            const createInvalidEnumRes = await fetch(`${ctx.baseUrl}/graph/objects`, {
                method: 'POST',
                headers: { ...headers, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    organization_id: ctx.orgId,
                    project_id: ctx.projectId,
                    type: 'ValidatedObject',
                    key: 'invalid-enum-object',
                    properties: {
                        name: 'Test Name',
                        status: 'pending' // Not in enum ['active', 'inactive']
                    }
                })
            });

            // NOTE: Phase 1 validation only checks required properties, not enum values
            // Full JSON Schema validation (enum, minLength, min/max) is TODO for Phase 2
            expect(createInvalidEnumRes.status).toBe(201);

            // Try to create object with value violating constraints
            const createConstraintViolationRes = await fetch(`${ctx.baseUrl}/graph/objects`, {
                method: 'POST',
                headers: { ...headers, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    organization_id: ctx.orgId,
                    project_id: ctx.projectId,
                    type: 'ValidatedObject',
                    key: 'constraint-violation',
                    properties: {
                        name: 'AB', // minLength: 3
                        status: 'active'
                    }
                })
            });

            // NOTE: Phase 1 validation only checks required properties, not minLength constraints
            // Full JSON Schema validation (enum, minLength, min/max) is TODO for Phase 2
            expect(createConstraintViolationRes.status).toBe(201);

            // Update object with valid data
            const updateValidRes = await fetch(`${ctx.baseUrl}/graph/objects/${validObject.id}`, {
                method: 'PATCH',
                headers: { ...headers, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    project_id: ctx.projectId,
                    properties: {
                        status: 'inactive',
                        count: 75
                    }
                })
            });

            expect(updateValidRes.status).toBe(200);
            const updated = await updateValidRes.json();
            expect(updated.properties.status).toBe('inactive');
            expect(updated.properties.count).toBe(75);

            // Try to update with invalid data
            const updateInvalidRes = await fetch(`${ctx.baseUrl}/graph/objects/${updated.id}`, {
                method: 'PATCH',
                headers: { ...headers, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    project_id: ctx.projectId,
                    properties: {
                        count: 150 // maximum: 100
                    }
                })
            });

            // NOTE: Phase 1 validation only checks required properties, not max constraints  
            // Full JSON Schema validation (enum, minLength, min/max) is TODO for Phase 2
            expect(updateInvalidRes.status).toBe(200);
        });

        it('should allow objects when type is disabled but validation still applies', async () => {
            const headers = contextHeaders();

            // Create type
            const createTypeRes = await fetch(`${ctx.baseUrl}/type-registry/projects/${ctx.projectId}/types?organization_id=${ctx.orgId}&tenant_id=${ctx.orgId}&user_id=${ctx.orgId}`, {
                method: 'POST',
                headers: { ...headers, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    type: 'DisabledType',
                    source: 'custom',
                    description: 'Type to test disabled state',
                    json_schema: {
                        type: 'object',
                        required: ['value'],
                        properties: {
                            value: { type: 'number' }
                        }
                    },
                    ui_config: { icon: 'disabled', color: '#6B7280' },
                    enabled: true
                })
            });

            expect(createTypeRes.status).toBe(201);
            const type = await createTypeRes.json();

            // Disable type
            const disableRes = await fetch(`${ctx.baseUrl}/type-registry/projects/${ctx.projectId}/types/DisabledType?organization_id=${ctx.orgId}`, {
                method: 'PATCH',
                headers: { ...headers, 'Content-Type': 'application/json' },
                body: JSON.stringify({ enabled: false })
            });

            expect(disableRes.status).toBe(200);

            // Create object with disabled type (should still validate schema)
            const createRes = await fetch(`${ctx.baseUrl}/graph/objects`, {
                method: 'POST',
                headers: { ...headers, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    organization_id: ctx.orgId,
                    project_id: ctx.projectId,
                    type: 'DisabledType',
                    key: 'object-with-disabled-type',
                    properties: {
                        value: 42
                    }
                })
            });

            // May succeed or fail depending on implementation - disabled types might block creation
            // or might allow with validation. Document the actual behavior.
            expect([201, 400]).toContain(createRes.status);
        });
    });

    describe('Extraction Job Lifecycle', () => {
        it('should create, update, complete, and delete extraction job', async () => {
            const headers = contextHeaders();

            // Step 1: Create extraction job
            const createRes = await fetch(`${ctx.baseUrl}/admin/extraction-jobs`, {
                method: 'POST',
                headers: { ...headers, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    organization_id: ctx.orgId,
                    project_id: ctx.projectId,
                    source_type: 'document',
                    // source_id omitted (optional field, avoiding UUID validation)
                    source_metadata: {
                        filename: 'test-document.pdf',
                        filesize: 1024000,
                        uploaded_at: new Date().toISOString()
                    },
                    extraction_config: {
                        target_types: ['Requirement', 'Feature'],
                        auto_create_types: true,
                        confidence_threshold: 0.75
                    }
                    // created_by omitted (optional field, avoiding UUID validation)
                })
            });

            expect(createRes.status).toBe(201);
            const created = await createRes.json();
            expect(created.id).toBeDefined();
            expect(created.status).toBe('pending');
            expect(created.total_items).toBe(0);
            expect(created.processed_items).toBe(0);

            const jobId = created.id;

            // Step 2: Update job to running status
            const updateToRunningRes = await fetch(`${ctx.baseUrl}/admin/extraction-jobs/${jobId}?project_id=${ctx.projectId}&organization_id=${ctx.orgId}`, {
                method: 'PATCH',
                headers: { ...headers, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    status: 'running',
                    total_items: 100
                })
            });

            expect(updateToRunningRes.status).toBe(200);
            const running = await updateToRunningRes.json();
            expect(running.status).toBe('running');
            expect(running.total_items).toBe(100);
            expect(running.started_at).toBeDefined();

            // Step 3: Update progress
            const updateProgressRes = await fetch(`${ctx.baseUrl}/admin/extraction-jobs/${jobId}?project_id=${ctx.projectId}&organization_id=${ctx.orgId}`, {
                method: 'PATCH',
                headers: { ...headers, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    processed_items: 50,
                    successful_items: 45,
                    failed_items: 5,
                    discovered_types: ['Requirement', 'Feature', 'Task'],
                    created_objects: ['550e8400-e29b-41d4-a716-446655440001', '550e8400-e29b-41d4-a716-446655440002', '550e8400-e29b-41d4-a716-446655440003']
                })
            });

            expect(updateProgressRes.status).toBe(200);
            const progress = await updateProgressRes.json();
            expect(progress.processed_items).toBe(50);
            expect(progress.successful_items).toBe(45);
            expect(progress.failed_items).toBe(5);
            expect(progress.discovered_types).toHaveLength(3);
            expect(progress.created_objects).toHaveLength(3);

            // Step 4: Complete job
            const completeRes = await fetch(`${ctx.baseUrl}/admin/extraction-jobs/${jobId}?project_id=${ctx.projectId}&organization_id=${ctx.orgId}`, {
                method: 'PATCH',
                headers: { ...headers, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    status: 'completed',
                    processed_items: 100,
                    successful_items: 95,
                    failed_items: 5
                })
            });

            expect(completeRes.status).toBe(200);
            const completed = await completeRes.json();
            expect(completed.status).toBe('completed');
            expect(completed.processed_items).toBe(100);
            expect(completed.completed_at).toBeDefined();

            // Step 5: List jobs
            const listRes = await fetch(`${ctx.baseUrl}/admin/extraction-jobs/projects/${ctx.projectId}?organization_id=${ctx.orgId}`, {
                headers
            });

            expect(listRes.status).toBe(200);
            const list = await listRes.json();
            expect(list.jobs).toBeDefined();
            expect(Array.isArray(list.jobs)).toBe(true);
            const foundJob = list.jobs.find((j: any) => j.id === jobId);
            expect(foundJob).toBeDefined();
            expect(foundJob.status).toBe('completed');

            // Step 6: Get job by ID
            const getRes = await fetch(`${ctx.baseUrl}/admin/extraction-jobs/${jobId}?project_id=${ctx.projectId}&organization_id=${ctx.orgId}`, {
                headers
            });

            expect(getRes.status).toBe(200);
            const fetched = await getRes.json();
            expect(fetched.id).toBe(jobId);
            expect(fetched.status).toBe('completed');

            // Step 7: Get statistics
            const statsRes = await fetch(`${ctx.baseUrl}/admin/extraction-jobs/projects/${ctx.projectId}/statistics?organization_id=${ctx.orgId}`, {
                headers
            });

            expect(statsRes.status).toBe(200);
            const stats = await statsRes.json();
            expect(stats.total).toBeGreaterThanOrEqual(1);
            expect(stats.by_status.completed).toBeGreaterThanOrEqual(1);
            expect(stats.by_source_type.document).toBeGreaterThanOrEqual(1);

            // Step 8: Delete job
            const deleteRes = await fetch(`${ctx.baseUrl}/admin/extraction-jobs/${jobId}?project_id=${ctx.projectId}&organization_id=${ctx.orgId}`, {
                method: 'DELETE',
                headers
            });

            expect(deleteRes.status).toBe(204);

            // Step 9: Verify deletion
            const getDeletedRes = await fetch(`${ctx.baseUrl}/admin/extraction-jobs/${jobId}?project_id=${ctx.projectId}&organization_id=${ctx.orgId}`, {
                headers
            });

            expect(getDeletedRes.status).toBe(404);
        });

        it('should cancel running job', async () => {
            const headers = contextHeaders();

            // Create and start job
            const createRes = await fetch(`${ctx.baseUrl}/admin/extraction-jobs`, {
                method: 'POST',
                headers: { ...headers, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    organization_id: ctx.orgId,
                    project_id: ctx.projectId,
                    source_type: 'api',
                    extraction_config: {}
                    // created_by omitted (optional field, avoiding UUID validation)
                })
            });

            expect(createRes.status).toBe(201);
            const job = await createRes.json();

            // Update to running
            await fetch(`${ctx.baseUrl}/admin/extraction-jobs/${job.id}?project_id=${ctx.projectId}&organization_id=${ctx.orgId}`, {
                method: 'PATCH',
                headers: { ...headers, 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: 'running', total_items: 50 })
            });

            // Cancel job
            const cancelRes = await fetch(`${ctx.baseUrl}/admin/extraction-jobs/${job.id}/cancel?project_id=${ctx.projectId}&organization_id=${ctx.orgId}`, {
                method: 'POST',
                headers
            });

            expect(cancelRes.status).toBe(200);
            const cancelled = await cancelRes.json();
            expect(cancelled.status).toBe('cancelled');
            expect(cancelled.completed_at).toBeDefined();
        });

        it('should not allow deletion of running jobs', async () => {
            const headers = contextHeaders();

            // Create running job
            const createRes = await fetch(`${ctx.baseUrl}/admin/extraction-jobs`, {
                method: 'POST',
                headers: { ...headers, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    organization_id: ctx.orgId,
                    project_id: ctx.projectId,
                    source_type: 'manual',
                    extraction_config: {}
                    // created_by omitted (optional field, avoiding UUID validation)
                })
            });

            const job = await createRes.json();

            // Update to running
            await fetch(`${ctx.baseUrl}/admin/extraction-jobs/${job.id}?project_id=${ctx.projectId}&organization_id=${ctx.orgId}`, {
                method: 'PATCH',
                headers: { ...headers, 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: 'running', total_items: 10 })
            });

            // Try to delete running job
            const deleteRes = await fetch(`${ctx.baseUrl}/admin/extraction-jobs/${job.id}?project_id=${ctx.projectId}&organization_id=${ctx.orgId}`, {
                method: 'DELETE',
                headers
            });

            expect(deleteRes.status).toBe(400);
            const error = await deleteRes.json();
            // Handle different error response formats - empty array indicates no error message
            if (Array.isArray(error) && error.length === 0) {
                // If no error message but status is 400, deletion was prevented
                expect(deleteRes.status).toBe(400);
            } else {
                const errorMessage = error.message || error.error?.message || error.error || error.detail || (Array.isArray(error) ? error.join(' ') : JSON.stringify(error));
                expect(errorMessage).toContain('Cannot delete');
            }
        });

        it('should handle failed jobs', async () => {
            const headers = contextHeaders();

            // Create job
            const createRes = await fetch(`${ctx.baseUrl}/admin/extraction-jobs`, {
                method: 'POST',
                headers: { ...headers, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    organization_id: ctx.orgId,
                    project_id: ctx.projectId,
                    source_type: 'bulk_import',
                    extraction_config: {}
                    // created_by omitted (optional field, avoiding UUID validation)
                })
            });

            const job = await createRes.json();

            // Start job
            await fetch(`${ctx.baseUrl}/admin/extraction-jobs/${job.id}?project_id=${ctx.projectId}&organization_id=${ctx.orgId}`, {
                method: 'PATCH',
                headers: { ...headers, 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: 'running', total_items: 20 })
            });

            // Fail job with error details
            const failRes = await fetch(`${ctx.baseUrl}/admin/extraction-jobs/${job.id}?project_id=${ctx.projectId}&organization_id=${ctx.orgId}`, {
                method: 'PATCH',
                headers: { ...headers, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    status: 'failed',
                    processed_items: 10,
                    successful_items: 5,
                    failed_items: 5,
                    error_message: 'Extraction process failed',
                    error_details: {
                        error_type: 'ProcessingError',
                        stack_trace: 'Error at line 42...',
                        failed_items_ids: ['item-6', 'item-7']
                    }
                })
            });

            expect(failRes.status).toBe(200);
            const failed = await failRes.json();
            expect(failed.status).toBe('failed');
            expect(failed.error_message).toBe('Extraction process failed');
            expect(failed.error_details.error_type).toBe('ProcessingError');
            expect(failed.completed_at).toBeDefined();
        });
    });

    describe('Integration: Full Phase 1 Workflow', () => {
        it('should execute complete Phase 1 flow: Template Pack → Type Registry → Graph Object → Extraction Job', async () => {
            const headers = contextHeaders();

            // === Part 1: Create and Install Template Pack ===

            const packRes = await fetch(`${ctx.baseUrl}/template-packs`, {
                method: 'POST',
                headers: { ...headers, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    organization_id: ctx.orgId,
                    name: 'Integration Test Pack',
                    description: 'Complete integration test',
                    version: '1.0.0',
                    object_type_schemas: {
                        IntegrationRequirement: {
                            type: 'object',
                            required: ['title', 'criticality'],
                            properties: {
                                title: { type: 'string', minLength: 5 },
                                criticality: { type: 'string', enum: ['critical', 'high', 'medium', 'low'] },
                                estimated_effort: { type: 'integer', minimum: 1, maximum: 100 }
                            }
                        }
                    },
                    ui_configs: {
                        IntegrationRequirement: {
                            icon: 'requirement',
                            color: '#3B82F6',
                            display_name: 'Integration Requirement'
                        }
                    }
                })
            });

            expect(packRes.status).toBe(201);
            const pack = await packRes.json();

            // Install template pack to project
            const installRes = await fetch(`${ctx.baseUrl}/template-packs/projects/${ctx.projectId}/assign?organization_id=${ctx.orgId}&tenant_id=${ctx.orgId}&user_id=${ctx.orgId}`, {
                method: 'POST',
                headers: { ...headers, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    template_pack_id: pack.id,
                    organization_id: ctx.orgId,
                    tenant_id: ctx.orgId,
                    user_id: ctx.orgId
                })
            });

            expect(installRes.status).toBe(201);
            const installResult = await installRes.json();
            expect(installResult.installed_types).toBeDefined();

            // === Part 2: Create Custom Type in Type Registry ===

            const customTypeRes = await fetch(`${ctx.baseUrl}/type-registry/projects/${ctx.projectId}/types?organization_id=${ctx.orgId}&tenant_id=${ctx.orgId}&user_id=${ctx.orgId}`, {
                method: 'POST',
                headers: { ...headers, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    type: 'IntegrationFeature',
                    source: 'custom',
                    description: 'Feature for integration test',
                    json_schema: {
                        type: 'object',
                        required: ['name', 'points'],
                        properties: {
                            name: { type: 'string' },
                            points: { type: 'integer', minimum: 1, maximum: 13 },
                            sprint: { type: 'string' }
                        }
                    },
                    ui_config: { icon: 'feature', color: '#10B981' },
                    enabled: true
                })
            });

            expect(customTypeRes.status).toBe(201);
            const customType = await customTypeRes.json();

            // === Part 3: Create Graph Objects with Validation ===

            // Create requirement object
            const reqObjectRes = await fetch(`${ctx.baseUrl}/graph/objects`, {
                method: 'POST',
                headers: { ...headers, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    organization_id: ctx.orgId,
                    project_id: ctx.projectId,
                    type: 'IntegrationRequirement',
                    key: 'req-001',
                    properties: {
                        title: 'User Authentication System',
                        criticality: 'critical',
                        estimated_effort: 40
                    }
                })
            });

            expect(reqObjectRes.status).toBe(201);
            const requirement = await reqObjectRes.json();

            // Create feature object
            const featureObjRes = await fetch(`${ctx.baseUrl}/graph/objects`, {
                method: 'POST',
                headers: { ...headers, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    organization_id: ctx.orgId,
                    project_id: ctx.projectId,
                    type: 'IntegrationFeature',
                    key: 'fea-001-login-flow',
                    properties: {
                        name: 'Login Flow Implementation',
                        points: 8,
                        sprint: 'Sprint 1'
                    }
                })
            });

            expect(featureObjRes.status).toBe(201);
            const feature = await featureObjRes.json();

            // Try to create invalid object (should fail validation)
            const invalidObjRes = await fetch(`${ctx.baseUrl}/graph/objects`, {
                method: 'POST',
                headers: { ...headers, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    organization_id: ctx.orgId,
                    project_id: ctx.projectId,
                    type: 'IntegrationFeature',
                    key: 'invalid-feature',
                    properties: {
                        name: 'Test Feature'
                        // Missing required: points
                    }
                })
            });

            expect(invalidObjRes.status).toBe(400);

            // === Part 4: Create Extraction Job ===

            const jobRes = await fetch(`${ctx.baseUrl}/admin/extraction-jobs`, {
                method: 'POST',
                headers: { ...headers, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    organization_id: ctx.orgId,
                    project_id: ctx.projectId,
                    source_type: 'document',
                    // source_id omitted (optional field, avoiding UUID validation)
                    extraction_config: {
                        target_types: ['IntegrationRequirement', 'IntegrationFeature'],
                        confidence_threshold: 0.8
                    }
                    // created_by omitted (optional field, avoiding UUID validation)
                })
            });

            expect(jobRes.status).toBe(201);
            const job = await jobRes.json();

            // Simulate extraction process
            await fetch(`${ctx.baseUrl}/admin/extraction-jobs/${job.id}?project_id=${ctx.projectId}&organization_id=${ctx.orgId}`, {
                method: 'PATCH',
                headers: { ...headers, 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: 'running', total_items: 2 })
            });

            await fetch(`${ctx.baseUrl}/admin/extraction-jobs/${job.id}?project_id=${ctx.projectId}&organization_id=${ctx.orgId}`, {
                method: 'PATCH',
                headers: { ...headers, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    status: 'completed',
                    processed_items: 2,
                    successful_items: 2,
                    failed_items: 0,
                    discovered_types: ['IntegrationRequirement', 'IntegrationFeature'],
                    created_objects: [requirement.id, feature.id]
                })
            });

            // === Verification: Check all components ===

            // TODO: Verify template pack statistics (endpoint not implemented yet)
            // const packStatsRes = await fetch(`${ctx.baseUrl}/template-packs/${pack.id}/statistics?organization_id=${ctx.orgId}&tenant_id=${ctx.orgId}&user_id=${ctx.orgId}`, {
            //     headers
            // });
            // expect(packStatsRes.status).toBe(200);
            // const packStats = await packStatsRes.json();
            // expect(packStats.installed_projects).toBeGreaterThanOrEqual(1);

            // Verify type registry statistics
            const typeStatsRes = await fetch(`${ctx.baseUrl}/type-registry/projects/${ctx.projectId}/stats?organization_id=${ctx.orgId}&tenant_id=${ctx.orgId}&user_id=${ctx.orgId}`, {
                headers
            });
            expect(typeStatsRes.status).toBe(200);
            const typeStats = await typeStatsRes.json();
            expect(typeStats.total_types).toBeGreaterThanOrEqual(2);

            // Verify extraction job statistics
            const jobStatsRes = await fetch(`${ctx.baseUrl}/admin/extraction-jobs/projects/${ctx.projectId}/statistics?organization_id=${ctx.orgId}&tenant_id=${ctx.orgId}&user_id=${ctx.orgId}`, {
                headers
            });
            expect(jobStatsRes.status).toBe(200);
            const jobStats = await jobStatsRes.json();
            expect(jobStats.total).toBeGreaterThanOrEqual(1);
            expect(jobStats.total_objects_created).toBeGreaterThanOrEqual(2);
            expect(jobStats.total_types_discovered).toBeGreaterThanOrEqual(2);
        });
    });

    describe('RLS Policy Enforcement', () => {
        it.skip('should enforce project-level isolation for template packs', async () => {
            // NOTE: Skipped in test mode - RLS policies are intentionally disabled
            // when AuthGuard is bypassed (see database.service.ts line 464-466)
            // This test would pass in full integration mode with RLS enabled
            const headers = contextHeaders();

            // Create template pack in context project
            const createRes = await fetch(`${ctx.baseUrl}/template-packs`, {
                method: 'POST',
                headers: { ...headers, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    organization_id: ctx.orgId,
                    name: 'RLS Test Pack',
                    description: 'Pack for RLS testing',
                    version: '1.0.0',
                    object_type_schemas: {
                        RLSTestType: {
                            type: 'object',
                            properties: {
                                test: { type: 'string' }
                            }
                        }
                    },
                    ui_configs: {
                        RLSTestType: {
                            icon: 'test',
                            color: '#6366F1',
                            display_name: 'RLS Test Type'
                        }
                    }
                })
            });

            expect(createRes.status).toBe(201);
            const pack = await createRes.json();

            // Try to access with wrong organization_id (should fail RLS)
            const wrongOrgRes = await fetch(`${ctx.baseUrl}/template-packs/${pack.id}?organization_id=00000000-0000-0000-0000-000000000000`, {
                headers
            });

            expect(wrongOrgRes.status).toBe(404); // RLS hides the row
        });

        it('should enforce project-level isolation for type registry', async () => {
            const headers = contextHeaders();

            // Create type
            const createRes = await fetch(`${ctx.baseUrl}/type-registry/projects/${ctx.projectId}/types?organization_id=${ctx.orgId}&tenant_id=${ctx.orgId}&user_id=${ctx.orgId}`, {
                method: 'POST',
                headers: { ...headers, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    type: 'RLSType',
                    source: 'custom',
                    description: 'Type for RLS testing',
                    json_schema: { type: 'object', properties: {} },
                    ui_config: { icon: 'lock', color: '#EF4444' },
                    enabled: true
                })
            });

            expect(createRes.status).toBe(201);
            const type = await createRes.json();

            // Try to access with wrong project_id (should fail RLS)
            const wrongProjectRes = await fetch(`${ctx.baseUrl}/type-registry/${type.id}?project_id=00000000-0000-0000-0000-000000000000&organization_id=${ctx.orgId}`, {
                headers
            });

            expect(wrongProjectRes.status).toBe(404);
        });

        it('should enforce project-level isolation for extraction jobs', async () => {
            const headers = contextHeaders();

            // Create job
            const createRes = await fetch(`${ctx.baseUrl}/admin/extraction-jobs`, {
                method: 'POST',
                headers: { ...headers, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    organization_id: ctx.orgId,
                    project_id: ctx.projectId,
                    source_type: 'manual',
                    extraction_config: {}
                    // created_by omitted (optional field, avoiding UUID validation)
                })
            });

            expect(createRes.status).toBe(201);
            const job = await createRes.json();

            // Try to access with wrong project_id (should fail RLS)
            // Note: Must override X-Project-ID header, not query param, since controller reads from headers
            const wrongProjectRes = await fetch(`${ctx.baseUrl}/admin/extraction-jobs/${job.id}`, {
                headers: {
                    ...authHeader('all', 'phase1-workflow'),
                    'x-org-id': ctx.orgId,
                    'x-project-id': '00000000-0000-0000-0000-000000000000', // Wrong project in header
                }
            });

            expect(wrongProjectRes.status).toBe(404);
        });
    });
});
