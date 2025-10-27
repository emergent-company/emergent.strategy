/**
 * Test User Helper Utilities
 * 
 * Provides functions for managing test user data in E2E tests:
 * - Credentials management
 * - User data cleanup
 * - Test org/project creation
 */

import { Page } from '@playwright/test';

/**
 * Test user credentials
 * These should match a user created manually in Zitadel
 */
export interface TestUserCredentials {
    email: string;
    password: string;
}

/**
 * Get test user credentials
 * Reads from environment variables - fails if not set
 */
export function getTestUserCredentials(): TestUserCredentials {
    const email = process.env.E2E_TEST_USER_EMAIL;
    const password = process.env.E2E_TEST_USER_PASSWORD;

    if (!email) {
        throw new Error('E2E_TEST_USER_EMAIL environment variable is required. Check apps/admin/.env.e2e');
    }

    if (!password) {
        throw new Error('E2E_TEST_USER_PASSWORD environment variable is required. Check apps/admin/.env.e2e');
    }

    return { email, password };
}

/**
 * Cleanup statistics returned from the cleanup endpoint
 */
export interface CleanupStats {
    message: string;
    deleted: {
        organizations: number;
        projects: number;
        documents: number;
        chunks: number;
        embeddings: number;
        extraction_jobs: number;
        graph_objects: number;
        integrations: number;
    };
    duration_ms: number;
}

/**
 * Clean up all data for the test user
 * Calls POST /user/test-cleanup with authentication
 * 
 * @param page - Playwright page (must have valid auth token in storage)
 * @returns Cleanup statistics
 */
export async function cleanupTestUser(page: Page): Promise<CleanupStats> {
    const baseUrl = process.env.E2E_BASE_URL || 'http://localhost:5176';
    const apiUrl = `${baseUrl}/api/user/test-cleanup`;

    // Get auth token from localStorage (key is 'spec-server-auth')
    const storageState = await page.context().storageState();
    const origin = new URL(baseUrl).origin;
    const localStorage = storageState.origins.find(o => o.origin === origin)?.localStorage || [];
    const authItem = localStorage.find(item => item.name === 'spec-server-auth');

    if (!authItem) {
        throw new Error('No auth token found in localStorage. User must be logged in before cleanup.');
    }

    const authData = JSON.parse(authItem.value);
    
    // Always prefer idToken because it contains user profile claims (email, name, etc.)
    // The accessToken may be a JWT but typically doesn't include profile information
    const accessToken = authData.idToken || authData.accessToken;

    if (!accessToken) {
        throw new Error('No accessToken or idToken in auth data. User must be logged in before cleanup.');
    }
    
    console.log('[TEST] Calling cleanup with token:', accessToken.substring(0, 20) + '...');

    // Call cleanup endpoint
    const response = await page.request.post(apiUrl, {
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
        },
    });

    if (!response.ok()) {
        const text = await response.text();
        throw new Error(`Cleanup failed (${response.status()}): ${text}`);
    }

    const stats = await response.json() as CleanupStats;
    console.log('[TEST] Cleanup complete:', stats);
    return stats;
}

/**
 * Create a test organization
 * 
 * @param page - Playwright page (must have valid auth)
 * @param name - Optional org name (defaults to timestamp-based)
 * @returns Organization ID
 */
export async function createTestOrg(page: Page, name?: string): Promise<string> {
    const baseUrl = process.env.E2E_BASE_URL || 'http://localhost:5176';
    const apiUrl = `${baseUrl}/api/orgs`;

    // Get auth token (key is 'spec-server-auth')
    const storageState = await page.context().storageState();
    const origin = new URL(baseUrl).origin;
    const localStorage = storageState.origins.find(o => o.origin === origin)?.localStorage || [];
    const authItem = localStorage.find(item => item.name === 'spec-server-auth');

    if (!authItem) {
        throw new Error('No auth token found. User must be logged in.');
    }

    const authData = JSON.parse(authItem.value);
    
    // Always prefer idToken because it contains user profile claims (email, name, etc.)
    const accessToken = authData.idToken || authData.accessToken;

    const orgName = name || `E2E Test Org ${Date.now()}`;

    const response = await page.request.post(apiUrl, {
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
        },
        data: { name: orgName },
    });

    if (!response.ok()) {
        const text = await response.text();
        throw new Error(`Create org failed (${response.status()}): ${text}`);
    }

    const org = await response.json();
    console.log('[TEST] Created org:', { id: org.id, name: org.name });
    return org.id;
}

/**
 * Create a test project
 * 
 * @param page - Playwright page (must have valid auth)
 * @param orgId - Organization ID (will be set as active org)
 * @param name - Optional project name (defaults to timestamp-based)
 * @returns Project ID
 */
export async function createTestProject(page: Page, orgId: string, name?: string): Promise<string> {
    const baseUrl = process.env.E2E_BASE_URL || 'http://localhost:5176';
    const apiUrl = `${baseUrl}/api/projects`;

    // Get auth token (key is 'spec-server-auth')
    const storageState = await page.context().storageState();
    const origin = new URL(baseUrl).origin;
    const localStorage = storageState.origins.find(o => o.origin === origin)?.localStorage || [];
    const authItem = localStorage.find(item => item.name === 'spec-server-auth');

    if (!authItem) {
        throw new Error('No auth token found. User must be logged in.');
    }

    const authData = JSON.parse(authItem.value);
    
    // Always prefer idToken because it contains user profile claims (email, name, etc.)
    const accessToken = authData.idToken || authData.accessToken;

    const projectName = name || `E2E Test Project ${Date.now()}`;


    const response = await page.request.post(apiUrl, {
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
            'X-Org-ID': orgId,
        },
        data: { name: projectName },
    });

    if (!response.ok()) {
        const text = await response.text();
        throw new Error(`Create project failed (${response.status()}): ${text}`);
    }

    const project = await response.json();
    console.log('[TEST] Created project:', { id: project.id, name: project.name, orgId });
    
    // Set active org and project in localStorage for subsequent requests
    // Note: This runs in browser context, not Node.js
    await page.addInitScript(({ orgId, projectId }) => {
        window.localStorage.setItem('activeOrgId', orgId);
        window.localStorage.setItem('activeProjectId', projectId);
    }, { orgId, projectId: project.id });

    // Also set immediately in current page
    await page.evaluate(({ orgId, projectId }) => {
        window.localStorage.setItem('activeOrgId', orgId);
        window.localStorage.setItem('activeProjectId', projectId);
    }, { orgId, projectId: project.id });

    return project.id;
}
