/**
 * Test User Helper Utilities
 * 
 * Provides functions for managing test user data in E2E tests:
 * - Credentials management
 * - User data cleanup
 * - Test org/project creation
 */

import { Page } from '@playwright/test';
import path from 'node:path';

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

    // Get auth token from localStorage (key is '__nexus_auth_v1__')
    const storageState = await page.context().storageState();
    const origin = new URL(baseUrl).origin;
    const localStorage = storageState.origins.find(o => o.origin === origin)?.localStorage || [];
    const authItem = localStorage.find(item => item.name === '__nexus_auth_v1__');

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

    // Get auth token (key is '__nexus_auth_v1__')
    const storageState = await page.context().storageState();
    const origin = new URL(baseUrl).origin;
    const localStorage = storageState.origins.find(o => o.origin === origin)?.localStorage || [];
    const authItem = localStorage.find(item => item.name === '__nexus_auth_v1__');

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

    console.log('[TEST] createTestProject START with:', { orgId, name });

    // Get auth token (key is '__nexus_auth_v1__')
    const storageState = await page.context().storageState();
    const origin = new URL(baseUrl).origin;
    const localStorage = storageState.origins.find(o => o.origin === origin)?.localStorage || [];
    const authItem = localStorage.find(item => item.name === '__nexus_auth_v1__');

    if (!authItem) {
        throw new Error('No auth token found. User must be logged in.');
    }

    const authData = JSON.parse(authItem.value);

    // Always prefer idToken because it contains user profile claims (email, name, etc.)
    const accessToken = authData.idToken || authData.accessToken;

    const projectName = name || `E2E Test Project ${Date.now()}`;

    console.log('[TEST] POST', apiUrl, 'with project name:', projectName);

    const response = await page.request.post(apiUrl, {
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
            'X-Org-ID': orgId,
        },
        data: {
            name: projectName,
            orgId: orgId  // Backend requires orgId in request body
        },
    });

    console.log('[TEST] POST /api/projects response:', {
        status: response.status(),
        statusText: response.statusText(),
        ok: response.ok()
    });

    if (!response.ok()) {
        const text = await response.text();
        console.error('[TEST] Project creation FAILED:', { status: response.status(), body: text });
        throw new Error(`Create project failed (${response.status()}): ${text}`);
    }

    const project = await response.json();
    console.log('[TEST] Created project SUCCESS:', { id: project.id, name: project.name, orgId });

    return project.id;
}

/**
 * Ensure org and project exist
 * 
 * This function ensures that at least one org and one project exist in the database
 * that the test user can access. It does NOT set localStorage - we rely on the
 * frontend's OrgAndProjectGate component to auto-select the first org/project.
 * 
 * Flow:
 * 1. Check if org/project already exist in database via API
 * 2. If not, create them
 * 3. Return the IDs (but don't set in localStorage - frontend will auto-select)
 * 
 * **Usage**: Call this in `test.beforeEach()` to ensure data exists:
 * ```ts
 * test.beforeEach(async ({ page }) => {
 *     await ensureOrgAndProject(page);
 * });
 * 
 * test('some test', async ({ page }) => {
 *     // Navigate to root first - triggers auto-selection
 *     await page.goto('http://localhost:5176/');
 *     
 *     // Wait for auto-selection
 *     await page.waitForFunction(() => {
 *         return window.localStorage.getItem('activeOrgId') && 
 *                window.localStorage.getItem('activeProjectId');
 *     }, { timeout: 10000 });
 *     
 *     // Now navigate to target page
 *     await page.goto('/admin/apps/documents');
 * });
 * ```
 * 
 * @param page - Playwright page (must have valid auth token)
 * @param orgName - Optional org name (defaults to timestamp-based)
 * @param projectName - Optional project name (defaults to timestamp-based)
 * @returns Object with orgId and projectId
 */
export async function ensureOrgAndProject(
    page: Page,
    orgName?: string,
    projectName?: string
): Promise<{ orgId: string; projectId: string }> {
    const baseUrl = process.env.E2E_BASE_URL || 'http://localhost:5176';

    // Get auth token from storage state
    const storageState = await page.context().storageState();
    const origin = new URL(baseUrl).origin;
    const localStorage = storageState.origins.find(o => o.origin === origin)?.localStorage || [];

    // Get auth token for API calls
    const authItem = localStorage.find(item => item.name === '__nexus_auth_v1__');

    if (!authItem) {
        throw new Error('No auth token found. User must be logged in.');
    }

    const authData = JSON.parse(authItem.value);
    const accessToken = authData.idToken || authData.accessToken;

    // Check if org/project exist in DATABASE (via API call)
    console.log('[TEST] Fetching orgs from API...');
    const orgsResponse = await page.request.get(`${baseUrl}/api/orgs`, {
        headers: { 'Authorization': `Bearer ${accessToken}` },
    });

    let orgId: string;
    let projectId: string;

    if (!orgsResponse.ok()) {
        throw new Error(`Failed to fetch orgs: ${orgsResponse.status()} ${await orgsResponse.text()}`);
    }

    const orgs = await orgsResponse.json();
    console.log('[TEST] Orgs API returned:', orgs);
    let projects: any[] = [];

    if (orgs.length > 0) {
        // Use existing org
        orgId = orgs[0].id;
        console.log('[TEST] Using existing org:', { id: orgId, name: orgs[0].name });

        // Check for projects
        console.log('[TEST] Fetching projects from API...');
        const projectsResponse = await page.request.get(`${baseUrl}/api/projects`, {
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'X-Org-ID': orgId,
            },
        });

        console.log('[TEST] Projects API response status:', projectsResponse.status());

        if (!projectsResponse.ok()) {
            const errorText = await projectsResponse.text();
            console.error('[TEST] Projects API failed:', errorText);
            throw new Error(`Failed to fetch projects: ${projectsResponse.status()} ${errorText}`);
        }

        projects = await projectsResponse.json();
        console.log('[TEST] Projects API returned array length:', projects.length);
        console.log('[TEST] Projects API returned data:', JSON.stringify(projects, null, 2));

        // CRITICAL FIX: Filter projects to only those belonging to the current org
        // The backend returns all projects but we need to use one that belongs to this org
        const projectsInOrg = projects.filter((p: any) => p.orgId === orgId);
        console.log('[TEST] Projects filtered by orgId:', { total: projects.length, inOrg: projectsInOrg.length });

        if (projectsInOrg.length > 0) {
            // Use existing project from THIS org
            projectId = projectsInOrg[0].id;
            console.log('[TEST] Using existing project from org:', { id: projectId, name: projectsInOrg[0].name, orgId: projectsInOrg[0].orgId });
        } else {
            // Create project for THIS org
            console.log('[TEST] No projects found for this org (filtered array is empty), creating one');
            projectId = await createTestProject(page, orgId, projectName || `E2E Test Project ${Date.now()}`);
            console.log('[TEST] createTestProject returned projectId:', projectId);
        }
    } else {
        // Create org and project
        console.log('[TEST] No orgs found, creating org and project');
        orgId = await createTestOrg(page, orgName || `E2E Test Org ${Date.now()}`);
        projectId = await createTestProject(page, orgId, projectName || `E2E Test Project ${Date.now()}`);
    }

    console.log('[TEST] Org/project ready in database:', { orgId, projectId });

    // Set config in localStorage via init script so it's available immediately on first page load
    // This avoids timing issues with SetupGuard checking before OrgAndProjectGate can auto-select
    await page.context().addInitScript(({ orgId, projectId, orgName, projectName }) => {
        // Get existing config from localStorage
        const existingConfig = window.localStorage.getItem('spec-server');
        const config = existingConfig ? JSON.parse(existingConfig) : {};

        // Merge with new org/project IDs
        const updatedConfig = {
            ...config,
            activeOrgId: orgId,
            activeProjectId: projectId,
            activeOrgName: orgName || 'Test Org',
            activeProjectName: projectName || 'Test Project',
        };

        window.localStorage.setItem('spec-server', JSON.stringify(updatedConfig));
    }, {
        orgId,
        projectId,
        orgName: orgs.length > 0 ? orgs[0].name : orgName || `E2E Test Org ${Date.now()}`,
        projectName: orgs.length > 0 && projects ? projects[0].name : projectName || `E2E Test Project ${Date.now()}`
    });

    console.log('[TEST] Init script added - config will be set on page load');

    return { orgId, projectId };
}
