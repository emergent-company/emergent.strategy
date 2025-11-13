import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';

/**
 * E2E Test: Auto-Extraction and Notifications Flow
 * 
 * This test verifies the complete flow:
 * 1. Document ingestion triggers extraction job (when auto_extract_objects = true)
 * 2. Extraction job processes and creates objects
 * 3. Notification is created on job completion
 * 4. Notification includes detailed summary and action buttons
 * 5. User can dismiss notification
 */
describe('Auto-Extraction and Notifications Flow (e2e)', () => {
    let app: INestApplication;
    let authToken: string;
    let userId: string;
    let tenantId: string;
    let orgId: string;
    let projectId: string;

    beforeAll(async () => {
        const moduleFixture: TestingModule = await Test.createTestingModule({
            imports: [AppModule],
        }).compile();

        app = moduleFixture.createNestApplication();
        await app.init();

        // TODO: Set up authentication and get token
        // This will depend on your auth implementation
        // For now, assume we have a test user and token
        authToken = process.env.TEST_AUTH_TOKEN || 'test-token';
        userId = 'test-user-uuid';
        tenantId = 'test-tenant-uuid';
        orgId = 'test-org-uuid';
    });

    afterAll(async () => {
        await app.close();
    });

    describe('Project with auto-extraction enabled', () => {
        beforeAll(async () => {
            // Create test project with auto-extraction enabled
            const response = await request(app.getHttpServer())
                .post('/projects')
                .set('Authorization', `Bearer ${authToken}`)
                .send({
                    name: 'Test Auto-Extraction Project',
                    org_id: orgId,
                    auto_extract_objects: true,
                    auto_extract_config: {
                        enabled_types: null,
                        min_confidence: 0.7,
                        require_review: false,
                        notify_on_complete: true,
                        notification_channels: ['inbox'],
                    },
                });

            expect(response.status).toBe(201);
            projectId = response.body.id;
        });

        it('should create extraction job when document is ingested', async () => {
            const response = await request(app.getHttpServer())
                .post('/ingestion/text')
                .set('Authorization', `Bearer ${authToken}`)
                .send({
                    projectId: projectId,
                    text: 'This is a test document containing requirements and features.',
                    filename: 'test-doc.txt',
                });

            expect(response.status).toBe(201);
            expect(response.body).toHaveProperty('documentId');
            expect(response.body).toHaveProperty('extractionJobId');
            expect(response.body.extractionJobId).toBeTruthy();

            // Store for next tests
            const { extractionJobId } = response.body;

            // Verify job was created
            const jobResponse = await request(app.getHttpServer())
                .get(`/extraction-jobs/${extractionJobId}`)
                .set('Authorization', `Bearer ${authToken}`);

            expect(jobResponse.status).toBe(200);
            expect(jobResponse.body.status).toMatch(/pending|processing/);
        });

        it('should create notification after extraction completes', async () => {
            // This test assumes the extraction job completes quickly
            // In a real scenario, you might need to poll or use a longer timeout

            // Wait for job to complete (simple polling)
            // TODO: Replace with proper job status polling or test queue
            await new Promise((resolve) => setTimeout(resolve, 5000));

            // Check for notifications
            const response = await request(app.getHttpServer())
                .get('/notifications')
                .set('Authorization', `Bearer ${authToken}`)
                .query({ category: 'extraction.completed' });

            expect(response.status).toBe(200);
            expect(response.body.data).toBeDefined();
            expect(response.body.data.length).toBeGreaterThan(0);

            const notification = response.body.data.find(
                (n: any) => n.related_resource_type === 'extraction_job',
            );

            expect(notification).toBeDefined();
            expect(notification.type).toBe('extraction_complete');
            expect(notification.severity).toMatch(/success|warning/);
            expect(notification.message).toContain('Extracted');
            expect(notification.details).toHaveProperty('summary');
            expect(notification.details.summary).toHaveProperty('objects_created');
            expect(notification.actions).toBeDefined();
            expect(notification.actions.length).toBeGreaterThan(0);
        });

        it('should return correct notification counts', async () => {
            const response = await request(app.getHttpServer())
                .get('/notifications/stats')
                .set('Authorization', `Bearer ${authToken}`);

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('unread');
            expect(response.body).toHaveProperty('dismissed');
            expect(response.body).toHaveProperty('total');
            expect(typeof response.body.unread).toBe('number');
            expect(typeof response.body.dismissed).toBe('number');
            expect(typeof response.body.total).toBe('number');
        });

        it('should allow user to dismiss notification', async () => {
            // Get a notification to dismiss
            const listResponse = await request(app.getHttpServer())
                .get('/notifications')
                .set('Authorization', `Bearer ${authToken}`)
                .query({ category: 'extraction.completed' });

            const notification = listResponse.body.data[0];
            expect(notification).toBeDefined();

            // Dismiss it
            const dismissResponse = await request(app.getHttpServer())
                .post(`/notifications/${notification.id}/dismiss`)
                .set('Authorization', `Bearer ${authToken}`);

            expect(dismissResponse.status).toBe(200);

            // Verify it's dismissed
            const checkResponse = await request(app.getHttpServer())
                .get(`/notifications/${notification.id}`)
                .set('Authorization', `Bearer ${authToken}`);

            expect(checkResponse.body.dismissed).toBe(true);
            expect(checkResponse.body.dismissed_at).toBeDefined();
        });
    });

    describe('Project with auto-extraction disabled', () => {
        let disabledProjectId: string;

        beforeAll(async () => {
            // Create test project with auto-extraction disabled
            const response = await request(app.getHttpServer())
                .post('/projects')
                .set('Authorization', `Bearer ${authToken}`)
                .send({
                    name: 'Test No Auto-Extraction Project',
                    org_id: orgId,
                    auto_extract_objects: false,
                });

            expect(response.status).toBe(201);
            disabledProjectId = response.body.id;
        });

        it('should NOT create extraction job when auto-extraction is disabled', async () => {
            const response = await request(app.getHttpServer())
                .post('/ingestion/text')
                .set('Authorization', `Bearer ${authToken}`)
                .send({
                    projectId: disabledProjectId,
                    text: 'This document should not trigger auto-extraction.',
                    filename: 'no-extraction.txt',
                });

            expect(response.status).toBe(201);
            expect(response.body).toHaveProperty('documentId');
            expect(response.body.extractionJobId).toBeUndefined();
        });
    });

    describe('Extraction failure handling', () => {
        it('should create failure notification when extraction fails', async () => {
            // This test is harder to implement without a way to force failure
            // You might need to:
            // 1. Mock the LLM service to fail
            // 2. Use a test document that causes failure
            // 3. Directly trigger a job with invalid config

            // For now, this is a placeholder test
            // TODO: Implement failure scenario test
        });
    });
});
