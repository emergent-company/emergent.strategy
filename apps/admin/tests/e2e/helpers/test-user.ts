/**
 * Test User Helper Utilities
 *
 * Provides functions for managing test user data in E2E tests:
 * - Credentials management
 * - User data cleanup
 * - Test org/project creation
 * - Conditional auth/setup based on page state
 */

import { Page, expect } from '@playwright/test';
import path from 'node:path';
import { AUTH_STORAGE_KEY, BASE_URL } from '../constants/storage';

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
    throw new Error(
      'E2E_TEST_USER_EMAIL environment variable is required. Check apps/admin/.env.e2e'
    );
  }

  if (!password) {
    throw new Error(
      'E2E_TEST_USER_PASSWORD environment variable is required. Check apps/admin/.env.e2e'
    );
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
  const baseUrl = BASE_URL;
  const apiUrl = `${baseUrl}/api/user/test-cleanup`;

  // Get auth token from localStorage
  const storageState = await page.context().storageState();
  const origin = new URL(baseUrl).origin;
  const localStorage =
    storageState.origins.find((o) => o.origin === origin)?.localStorage || [];
  const authItem = localStorage.find((item) => item.name === AUTH_STORAGE_KEY);

  if (!authItem) {
    throw new Error(
      'No auth token found in localStorage. User must be logged in before cleanup.'
    );
  }

  const authData = JSON.parse(authItem.value);

  // Always prefer idToken because it contains user profile claims (email, name, etc.)
  // The accessToken may be a JWT but typically doesn't include profile information
  const accessToken = authData.idToken || authData.accessToken;

  if (!accessToken) {
    throw new Error(
      'No accessToken or idToken in auth data. User must be logged in before cleanup.'
    );
  }

  console.log(
    '[TEST] Calling cleanup with token:',
    accessToken.substring(0, 20) + '...'
  );

  // Call cleanup endpoint
  const response = await page.request.post(apiUrl, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok()) {
    const text = await response.text();
    throw new Error(`Cleanup failed (${response.status()}): ${text}`);
  }

  const stats = (await response.json()) as CleanupStats;
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
export async function createTestOrg(
  page: Page,
  name?: string
): Promise<string> {
  const baseUrl = BASE_URL;
  const apiUrl = `${baseUrl}/api/orgs`;

  // Get auth token (key is AUTH_STORAGE_KEY)
  const storageState = await page.context().storageState();
  const origin = new URL(baseUrl).origin;
  const localStorage =
    storageState.origins.find((o) => o.origin === origin)?.localStorage || [];
  const authItem = localStorage.find((item) => item.name === AUTH_STORAGE_KEY);

  if (!authItem) {
    throw new Error('No auth token found. User must be logged in.');
  }

  const authData = JSON.parse(authItem.value);

  // Always prefer idToken because it contains user profile claims (email, name, etc.)
  const accessToken = authData.idToken || authData.accessToken;

  const orgName = name || `E2E Test Org ${Date.now()}`;

  const response = await page.request.post(apiUrl, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
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
export async function createTestProject(
  page: Page,
  orgId: string,
  name?: string
): Promise<string> {
  const baseUrl = BASE_URL;
  const apiUrl = `${baseUrl}/api/projects`;

  console.log('[TEST] createTestProject START with:', { orgId, name });

  // Get auth token (key is AUTH_STORAGE_KEY)
  const storageState = await page.context().storageState();
  const origin = new URL(baseUrl).origin;
  const localStorage =
    storageState.origins.find((o) => o.origin === origin)?.localStorage || [];
  const authItem = localStorage.find((item) => item.name === AUTH_STORAGE_KEY);

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
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'X-Org-ID': orgId,
    },
    data: {
      name: projectName,
      orgId: orgId, // Backend requires orgId in request body
    },
  });

  console.log('[TEST] POST /api/projects response:', {
    status: response.status(),
    statusText: response.statusText(),
    ok: response.ok(),
  });

  if (!response.ok()) {
    const text = await response.text();
    console.error('[TEST] Project creation FAILED:', {
      status: response.status(),
      body: text,
    });
    throw new Error(`Create project failed (${response.status()}): ${text}`);
  }

  const project = await response.json();
  console.log('[TEST] Created project SUCCESS:', {
    id: project.id,
    name: project.name,
    orgId,
  });

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
  const baseUrl = BASE_URL;

  // Get auth token from storage state
  const storageState = await page.context().storageState();
  const origin = new URL(baseUrl).origin;
  const localStorage =
    storageState.origins.find((o) => o.origin === origin)?.localStorage || [];

  // Get auth token for API calls
  const authItem = localStorage.find((item) => item.name === AUTH_STORAGE_KEY);

  if (!authItem) {
    throw new Error('No auth token found. User must be logged in.');
  }

  const authData = JSON.parse(authItem.value);
  const accessToken = authData.idToken || authData.accessToken;

  // Check if org/project exist in DATABASE (via API call)
  console.log('[TEST] Fetching orgs from API...');
  console.log('[TEST] Using token:', accessToken.substring(0, 30) + '...');
  console.log('[TEST] API URL:', `${baseUrl}/api/orgs`);
  const orgsResponse = await page.request.get(`${baseUrl}/api/orgs`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  let orgId: string;
  let projectId: string;

  console.log('[TEST] Orgs API response status:', orgsResponse.status());
  if (!orgsResponse.ok()) {
    const errorText = await orgsResponse.text();
    console.error('[TEST] Orgs API error response:', errorText);
    throw new Error(
      `Failed to fetch orgs: ${orgsResponse.status()} ${errorText}`
    );
  }

  const orgs = await orgsResponse.json();
  console.log('[TEST] Orgs API returned:', orgs);
  let projects: any[] = [];

  if (orgs.length > 0) {
    // Use existing org
    orgId = orgs[0].id;
    console.log('[TEST] Using existing org:', {
      id: orgId,
      name: orgs[0].name,
    });

    // Check for projects
    console.log('[TEST] Fetching projects from API...');
    const projectsResponse = await page.request.get(`${baseUrl}/api/projects`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'X-Org-ID': orgId,
      },
    });

    console.log(
      '[TEST] Projects API response status:',
      projectsResponse.status()
    );

    if (!projectsResponse.ok()) {
      const errorText = await projectsResponse.text();
      console.error('[TEST] Projects API failed:', errorText);
      throw new Error(
        `Failed to fetch projects: ${projectsResponse.status()} ${errorText}`
      );
    }

    projects = await projectsResponse.json();
    console.log('[TEST] Projects API returned array length:', projects.length);
    console.log(
      '[TEST] Projects API returned data:',
      JSON.stringify(projects, null, 2)
    );

    // CRITICAL FIX: Filter projects to only those belonging to the current org
    // The backend returns all projects but we need to use one that belongs to this org
    const projectsInOrg = projects.filter((p: any) => p.orgId === orgId);
    console.log('[TEST] Projects filtered by orgId:', {
      total: projects.length,
      inOrg: projectsInOrg.length,
    });

    if (projectsInOrg.length > 0) {
      // Use existing project from THIS org
      projectId = projectsInOrg[0].id;
      console.log('[TEST] Using existing project from org:', {
        id: projectId,
        name: projectsInOrg[0].name,
        orgId: projectsInOrg[0].orgId,
      });
    } else {
      // Create project for THIS org
      console.log(
        '[TEST] No projects found for this org (filtered array is empty), creating one'
      );
      projectId = await createTestProject(
        page,
        orgId,
        projectName || `E2E Test Project ${Date.now()}`
      );
      console.log('[TEST] createTestProject returned projectId:', projectId);
    }
  } else {
    // Create org and project
    console.log('[TEST] No orgs found, creating org and project');
    orgId = await createTestOrg(page, orgName || `E2E Test Org ${Date.now()}`);
    projectId = await createTestProject(
      page,
      orgId,
      projectName || `E2E Test Project ${Date.now()}`
    );
  }

  console.log('[TEST] Org/project ready in database:', { orgId, projectId });

  // Set config in localStorage via init script so it's available immediately on first page load
  // This avoids timing issues with SetupGuard checking before OrgAndProjectGate can auto-select
  await page.context().addInitScript(
    ({ orgId, projectId, orgName, projectName }) => {
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
    },
    {
      orgId,
      projectId,
      orgName:
        orgs.length > 0
          ? orgs[0].name
          : orgName || `E2E Test Org ${Date.now()}`,
      projectName:
        orgs.length > 0 && projects
          ? projects[0].name
          : projectName || `E2E Test Project ${Date.now()}`,
    }
  );

  console.log('[TEST] Init script added - config will be set on page load');

  return { orgId, projectId };
}

/**
 * Ensure the test is ready to proceed by checking for auth/org/project guards
 * This function checks what's on screen and handles it conditionally:
 * - If login page → perform login
 * - If org creation guard → create org
 * - If project creation guard → create project
 * - Otherwise → proceed (already authenticated and set up)
 *
 * @param page - Playwright Page object
 * @param options - Optional test IDs to check for specific guards
 * @returns Promise that resolves when ready to proceed
 */
export async function ensureReadyToTest(
  page: Page,
  options?: {
    loginTestId?: string;
    orgFormTestId?: string;
    projectFormTestId?: string;
    maxRetries?: number;
  }
): Promise<void> {
  const {
    loginTestId = 'login-form',
    orgFormTestId = 'setup-org-form',
    projectFormTestId = 'setup-project-form',
    maxRetries = 5, // Increased to handle org + project + navigation checks
  } = options || {};

  const baseUrl = BASE_URL;
  let retries = 0;

  // FIRST: Check if already authenticated by looking for auth token in localStorage
  const hasAuth = await page
    .evaluate(() => {
      try {
        const raw = localStorage.getItem(AUTH_STORAGE_KEY);
        if (!raw) return false;
        const authData = JSON.parse(raw);
        return !!(authData.idToken || authData.accessToken);
      } catch {
        return false;
      }
    })
    .catch(() => false);

  console.log(
    '[ensureReadyToTest] Auth check:',
    hasAuth ? '✅ Already authenticated' : '❌ Not authenticated'
  );

  // If page is on about:blank (fresh context), navigate to trigger auth/setup flow
  if (page.url() === 'about:blank') {
    console.log(
      '[ensureReadyToTest] Starting on about:blank, navigating to /admin/apps/documents to trigger guards...'
    );
    await page.goto(`${baseUrl}/admin/apps/documents`);
    await page.waitForLoadState('domcontentloaded');
  }

  while (retries < maxRetries) {
    // Wait for page to be stable
    await page.waitForLoadState('domcontentloaded');

    // Check what's on screen
    const url = page.url();
    console.log('[ensureReadyToTest] Current URL:', url);

    // Success case: We're on an admin page (not setup/onboarding/login)
    if (
      url.includes('/admin/apps/') &&
      !url.includes('/setup') &&
      !url.includes('/onboarding') &&
      !url.includes('oauth')
    ) {
      console.log(
        '[ensureReadyToTest] On admin page, verifying state persistence...'
      );

      // Verify localStorage has org and project set
      const hasState = await page.evaluate(() => {
        try {
          const raw = localStorage.getItem('spec-server');
          if (!raw) return false;
          const config = JSON.parse(raw);
          return !!(config.activeOrgId && config.activeProjectId);
        } catch {
          return false;
        }
      });

      if (!hasState) {
        console.log(
          '[ensureReadyToTest] ⚠️  No org/project in localStorage, continuing setup...'
        );
        retries++;
        continue;
      }

      // Additional safety: Navigate to a different admin route to verify state persists across routes
      // This ensures SetupGuard won't redirect when tests navigate to their target routes
      console.log(
        '[ensureReadyToTest] State found, testing navigation to different route...'
      );
      const testUrl = `${baseUrl}/admin/apps/templates`;
      await page.goto(testUrl);
      await page.waitForTimeout(1000);

      const finalUrl = page.url();
      if (finalUrl.includes('/setup')) {
        console.log(
          '[ensureReadyToTest] ⚠️  Redirected to setup on navigation test, state not persisting'
        );
        retries++;
        continue;
      }

      console.log(
        '[ensureReadyToTest] ✅ State verified and persists across routes!'
      );
      return;
    }

    // Check for login page (Zitadel or app login) - ONLY if not already authenticated
    if (
      !hasAuth &&
      (url.includes('oauth/authorize') || url.includes('login'))
    ) {
      console.log(
        '[ensureReadyToTest] Login page detected, performing login...'
      );
      const credentials = getTestUserCredentials();

      // Try to find and fill login form
      const emailInput = page
        .locator('input[name="loginName"], input[type="email"]')
        .first();
      if (await emailInput.isVisible({ timeout: 2000 }).catch(() => false)) {
        await emailInput.fill(credentials.email);
        await page
          .locator('button:has-text("Next"), button[type="submit"]')
          .first()
          .click();
        await page.waitForTimeout(1000);
      }

      const passwordInput = page
        .locator('input[name="password"], input[type="password"]')
        .first();
      if (await passwordInput.isVisible({ timeout: 2000 }).catch(() => false)) {
        await passwordInput.fill(credentials.password);
        await page
          .locator(
            'button:has-text("Next"), button:has-text("Sign in"), button[type="submit"]'
          )
          .first()
          .click();
        await page.waitForTimeout(2000);
      }

      retries++;
      continue;
    }

    // If already authenticated but on login/oauth page, just navigate away
    if (hasAuth && (url.includes('oauth/authorize') || url.includes('login'))) {
      console.log(
        '[ensureReadyToTest] Already authenticated but on login page, navigating to admin...'
      );
      await page.goto(`${baseUrl}/admin/apps/documents`);
      await page.waitForTimeout(1000);
      retries++;
      continue;
    }

    // Check for org creation guard
    const orgForm = page.getByTestId(orgFormTestId);
    if (await orgForm.isVisible({ timeout: 1000 }).catch(() => false)) {
      console.log('[ensureReadyToTest] Org creation form detected');

      // Check if we have orgs but no active org selected (409 conflict scenario)
      // Try to get the first org from API and set it as active
      const orgsFromAPI = await page.evaluate(async () => {
        try {
          const response = await fetch('/api/orgs');
          if (response.ok) {
            const orgs = await response.json();
            return orgs;
          }
        } catch (e) {
          console.log('[E2E] Failed to fetch orgs:', e);
        }
        return null;
      });

      if (orgsFromAPI && orgsFromAPI.length > 0) {
        console.log(
          '[ensureReadyToTest] Found existing orgs, selecting first one instead of creating new'
        );
        const firstOrg = orgsFromAPI[0];

        // Set active org properly - merge with existing config
        await page.evaluate(
          ({ orgId, orgName }) => {
            try {
              const defaultConfig = {
                theme: 'system',
                direction: 'ltr',
                fontFamily: 'default',
                sidebarTheme: 'light',
                fullscreen: false,
              };

              const raw = localStorage.getItem('spec-server');
              const existingConfig = raw ? JSON.parse(raw) : {};

              // Merge: defaults <- existing <- new org selection
              const newConfig = {
                ...defaultConfig,
                ...existingConfig,
                activeOrgId: orgId,
                activeOrgName: orgName,
                // Clear project when changing org
                activeProjectId: undefined,
                activeProjectName: undefined,
              };

              localStorage.setItem('spec-server', JSON.stringify(newConfig));
              console.log('[E2E] Set activeOrgId:', orgId);
            } catch (e) {
              console.log('[E2E] Error setting org:', e);
            }
          },
          { orgId: firstOrg.id, orgName: firstOrg.name }
        );

        // Navigate to project setup instead of reloading
        // Since we have an org now, skip to project setup
        console.log(
          '[ensureReadyToTest] Active org set, navigating to project setup...'
        );
        await page.goto('/setup/project');
        await page.waitForTimeout(1000);

        retries++;
        continue;
      }

      console.log('[ensureReadyToTest] No existing orgs, creating new one...');
      // Fill org creation form
      const orgNameInput = page.getByTestId('setup-org-name-input');
      await orgNameInput.fill(`E2E Test Org ${Date.now()}`);

      // Wait for button to become enabled
      const createButton = page.getByTestId('setup-org-create-button');
      await expect(createButton).toBeEnabled({ timeout: 3000 });

      await createButton.click();

      await page.waitForTimeout(2000);
      retries++;
      continue;
    }

    // Check for project creation guard
    const projectForm = page.getByTestId(projectFormTestId);
    if (await projectForm.isVisible({ timeout: 1000 }).catch(() => false)) {
      console.log(
        '[ensureReadyToTest] Project creation form detected, creating project...'
      );

      // Fill project creation form
      const projectNameInput = page.getByTestId('setup-project-name-input');
      const projectName = `E2E Test Project ${Date.now()}`;
      console.log('[ensureReadyToTest] Filling project name:', projectName);
      await projectNameInput.fill(projectName);

      // Verify the value was set
      const inputValue = await projectNameInput.inputValue();
      console.log(
        '[ensureReadyToTest] Project name input value after fill:',
        inputValue
      );

      // Wait for button to become enabled (button is disabled when name.trim().length < 2)
      const createButton = page.getByTestId('setup-project-create-button');
      const isDisabled = await createButton.isDisabled();
      console.log('[ensureReadyToTest] Create button disabled?', isDisabled);

      if (isDisabled) {
        console.log(
          '[ensureReadyToTest] Button still disabled after fill, checking why...'
        );
        // Check if there's an error message
        const errorAlert = page.getByTestId('setup-project-error');
        const hasError = await errorAlert.isVisible().catch(() => false);
        if (hasError) {
          const errorText = await errorAlert.textContent();
          console.log('[ensureReadyToTest] Error alert visible:', errorText);
        }
      }

      await expect(createButton).toBeEnabled({ timeout: 3000 });

      console.log(
        '[ensureReadyToTest] Triggering form submission via JavaScript...'
      );
      // Use JavaScript to submit the form directly as Playwright clicks aren't working
      await page.evaluate(() => {
        const form = document.querySelector(
          '[data-testid="setup-project-form"]'
        ) as HTMLFormElement;
        if (form) {
          console.log('[E2E] Found form, submitting...');
          form.requestSubmit(); // Triggers onSubmit handler
        } else {
          console.error('[E2E] Form not found!');
        }
      });

      // Also wait for URL change or timeout
      console.log(
        '[ensureReadyToTest] Waiting for navigation after project creation...'
      );
      try {
        // Wait for URL to change away from setup/project (max 5 seconds)
        await page.waitForURL(
          (url) => !url.toString().includes('/setup/project'),
          { timeout: 5000 }
        );
        console.log('[ensureReadyToTest] Navigation detected!');

        // window.location causes full page reload - wait for it
        console.log('[ensureReadyToTest] Waiting for page to fully load...');
        await page.waitForLoadState('domcontentloaded', { timeout: 10000 });
        await page.waitForLoadState('load', { timeout: 10000 });
        console.log('[ensureReadyToTest] Page loaded');

        // Wait for React to mount
        console.log('[ensureReadyToTest] Waiting for React to mount...');
        await page
          .waitForSelector('#root:not(:empty)', { timeout: 10000 })
          .catch(() => {
            console.log(
              '[ensureReadyToTest] Warning: Root still empty after 10s wait'
            );
          });

        // Give React a moment to settle
        await page.waitForTimeout(1000);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.log('[ensureReadyToTest] Navigation/load error:', msg);
      }

      await page.waitForTimeout(500);

      const newUrl = page.url();
      console.log('[ensureReadyToTest] URL after project creation:', newUrl);

      // Check for error after submit
      const errorAlert = page.getByTestId('setup-project-error');
      const hasError = await errorAlert.isVisible().catch(() => false);
      if (hasError) {
        const errorText = await errorAlert.textContent();
        console.log('[ensureReadyToTest] ERROR AFTER SUBMIT:', errorText);
      }

      retries++;
      continue;
    }

    // Check if we're on setup/onboarding pages
    if (url.includes('/setup') || url.includes('/onboarding')) {
      console.log(
        '[ensureReadyToTest] Setup/onboarding page detected, trying to navigate to admin...'
      );
      await page.goto(`${baseUrl}/admin/apps/documents`);
      await page.waitForTimeout(1000);
      retries++;
      continue;
    }

    // If we're on /admin but not /admin/apps/*, navigate to a specific app page to trigger guards
    if (url === `${baseUrl}/admin` || url === `${baseUrl}/admin/`) {
      console.log(
        '[ensureReadyToTest] On admin landing page, navigating to app page to trigger guards...'
      );
      await page.goto(`${baseUrl}/admin/apps/documents`);
      await page.waitForTimeout(1000);
      retries++;
      continue;
    }

    // If none of the guards are visible, we're ready to proceed
    console.log('[ensureReadyToTest] Ready to proceed - no guards detected');
    return;
  }

  // If we exhausted retries, throw an error
  throw new Error(
    `Failed to ensure ready state after ${maxRetries} retries. Current URL: ${page.url()}`
  );
}
