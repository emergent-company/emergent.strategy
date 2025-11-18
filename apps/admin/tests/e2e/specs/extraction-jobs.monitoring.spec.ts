import { expect } from '@playwright/test';
import { test } from '../fixtures/consoleGate';
import { BASE_URL } from '../constants/storage';

// DISABLED: This test uses real OIDC auth flow which is unreliable in CI.
// Need to implement proper auth mocking before re-enabling.
test.describe.skip('Extraction Jobs - Monitoring Endpoint', () => {
  test('should authenticate via OIDC, load page correctly, and not return 500 errors', async ({
    page,
  }) => {
    await test.step('Authenticate via Zitadel OIDC login', async () => {
      const email = process.env.E2E_OIDC_EMAIL || 'maciej@kucharz.net';
      const password = process.env.E2E_OIDC_PASSWORD || 'Test1234!';

      console.log('Starting OIDC authentication for:', email);

      await page.goto(`${BASE_URL}/admin/extraction-jobs`);

      console.log('Waiting for Zitadel login page...');
      await page.waitForURL(/localhost:8200.*login/, { timeout: 15000 });
      console.log('Redirected to:', page.url());

      console.log('[Step 1] Filling email field...');
      const emailInput = page
        .locator('input[name="loginName"]')
        .or(page.locator('input[type="email"]'));
      await emailInput.waitFor({ state: 'visible', timeout: 10000 });
      await emailInput.fill(email);
      console.log('Email filled:', email);

      console.log('[Step 2] Clicking Next button...');
      const nextButton = page.locator('button:has-text("Next")');
      await nextButton.waitFor({ state: 'visible', timeout: 5000 });
      await nextButton.click();
      console.log('Next button clicked, waiting for password screen...');

      console.log('[Step 3] Waiting for password screen...');
      const passwordInput = page
        .locator('input[name="password"]')
        .or(page.locator('input[type="password"]'));
      await passwordInput.waitFor({ state: 'visible', timeout: 10000 });
      console.log('Password field visible');

      console.log('[Step 4] Filling password field...');
      await passwordInput.fill(password);
      console.log('Password filled');

      console.log('[Step 5] Clicking Next button on password screen...');
      const passwordNextButton = page.locator('button:has-text("Next")');
      await passwordNextButton.waitFor({ state: 'visible', timeout: 5000 });
      await passwordNextButton.click();
      console.log(
        'Password Next button clicked - checking for password change requirement...'
      );

      // Check if Zitadel is asking for a password change
      await page.waitForTimeout(2000); // Wait for navigation
      const currentUrl = page.url();
      console.log('Current URL after password submit:', currentUrl);

      if (
        currentUrl.includes('password') &&
        (currentUrl.includes('change') || currentUrl.includes('set'))
      ) {
        console.log('⚠️ Zitadel is requiring a password change!');
        console.log('This happens when:');
        console.log('- Password has expired');
        console.log('- Account requires password reset');
        console.log('- First-time login requires password change');
        console.log('');
        console.log('Please either:');
        console.log('1. Complete the password change in Zitadel UI manually');
        console.log("2. Use an account that doesn't require password change");
        console.log('3. Contact admin to reset the password requirement');
        throw new Error(
          'Zitadel requires password change - cannot complete automated login'
        );
      }

      console.log(
        'No password change required - proceeding with OAuth flow...'
      );

      console.log('[Step 6] Waiting for OAuth redirect...');
      // After OIDC login, SetupGuard will redirect to either:
      // - /setup/organization (no org)
      // - /setup/project (has org, no project)
      // - /admin/* (has both org and project)
      await page.waitForURL(/\/(setup|admin)/, { timeout: 30000 });
      console.log('Authentication complete - redirected to:', page.url());
    });

    await test.step('Handle org/project creation if needed', async () => {
      const currentUrl = page.url();
      console.log('Checking if org/project setup is needed...');
      console.log('Current URL:', currentUrl);

      // If we're on /setup/organization, create org
      if (currentUrl.includes('/setup/organization')) {
        console.log('Creating organization via setup flow...');

        const orgNameInput = page.locator('input[type="text"]').first();
        await orgNameInput.waitFor({ state: 'visible', timeout: 5000 });
        // Use timestamp to ensure unique org name for each test run
        const timestamp = Date.now();
        await orgNameInput.fill(`E2E Test Org ${timestamp}`);
        console.log('Organization name filled');

        const createButton = page.locator(
          'button:has-text("Create organization")'
        );
        await createButton.waitFor({ state: 'visible', timeout: 5000 });
        await createButton.click();
        console.log('Organization creation submitted');

        // Check for errors
        await page.waitForTimeout(1000); // Give API call time to complete
        const errorAlert = page.locator('.alert-error');
        const hasError = await errorAlert.isVisible().catch(() => false);
        if (hasError) {
          const errorText = await errorAlert.textContent();
          console.error('Organization creation error:', errorText);
          throw new Error(`Failed to create organization: ${errorText}`);
        }

        // Wait for redirect to project setup
        await page.waitForURL(/\/setup\/project/, { timeout: 10000 });
        console.log('Redirected to project setup');
      }

      // If we're on /setup/project, create project
      if (page.url().includes('/setup/project')) {
        console.log('Creating project via setup flow...');

        await page.waitForTimeout(1000); // Wait for page to load

        const projectNameInput = page.locator('input[type="text"]').first();
        await projectNameInput.waitFor({ state: 'visible', timeout: 5000 });
        // Use timestamp to ensure unique project name for each test run
        const timestamp = Date.now();
        await projectNameInput.fill(`E2E Test Project ${timestamp}`);
        console.log('Project name filled');

        const createButton = page.locator('button:has-text("Create project")');
        await createButton.waitFor({ state: 'visible', timeout: 5000 });
        await createButton.click();
        console.log('Project creation submitted');

        // Wait for redirect to admin area
        await page.waitForURL(/\/admin/, { timeout: 10000 });
        console.log('Setup complete - redirected to:', page.url());
      }

      // Now we should be in the admin area
      const finalUrl = page.url();
      if (!finalUrl.includes('/admin')) {
        throw new Error(`Expected to be at /admin but got: ${finalUrl}`);
      }

      console.log('✅ Setup complete - now in admin area');
    });

    await test.step('Verify authentication state in localStorage', async () => {
      console.log('Checking localStorage for auth state...');

      // First, let's see what's actually in localStorage
      const allKeys = await page.evaluate(() => {
        const keys = [];
        for (let i = 0; i < localStorage.length; i++) {
          keys.push(localStorage.key(i));
        }
        return keys;
      });
      console.log('All localStorage keys:', allKeys);

      // Wait for auth state to be saved to localStorage
      // NOTE: Using literal value because this runs in browser context
      let authState = null;
      let attempts = 0;
      const maxAttempts = 10;

      while (!authState && attempts < maxAttempts) {
        attempts++;
        authState = await page.evaluate(() => {
          const rawState = localStorage.getItem('spec-server-auth');
          if (!rawState) return null;
          try {
            return JSON.parse(rawState);
          } catch {
            return null;
          }
        });

        if (!authState) {
          console.log(
            `Attempt ${attempts}/${maxAttempts}: Auth state not yet in localStorage, waiting...`
          );
          await page.waitForTimeout(500);
        }
      }

      expect(
        authState,
        'Auth state MUST exist in localStorage after OIDC login'
      ).toBeTruthy();
      expect(
        authState?.accessToken,
        'Access token MUST be present after OIDC login'
      ).toBeTruthy();

      const tokenPreview = authState?.accessToken?.substring(0, 30);
      console.log('✅ Authentication verified - token:', tokenPreview + '...');
      console.log(
        '✅ Token expires:',
        authState?.expiresAt
          ? new Date(authState.expiresAt).toISOString()
          : 'never'
      );
      console.log('✅ User sub:', authState?.user?.sub);
    });

    const apiRequests: Array<{
      url: string;
      status: number;
      method: string;
      body?: any;
    }> = [];
    const errorRequests: Array<{ url: string; status: number; body: any }> = [];

    await test.step('Setup network monitoring', async () => {
      console.log('Setting up network request monitoring...');

      page.on('response', async (response) => {
        const url = response.url();
        const status = response.status();
        const method = response.request().method();

        if (url.includes('/api/') || url.includes('localhost:5176')) {
          const requestInfo = { url, status, method };
          apiRequests.push(requestInfo);

          const statusEmoji =
            status >= 200 && status < 300
              ? 'OK'
              : status >= 400
              ? 'ERR'
              : 'WARN';
          console.log(statusEmoji, method, url, '->', status);

          if (status === 500) {
            try {
              const body = await response.text();
              errorRequests.push({ url, status, body });
              console.error('500 ERROR DETECTED:', url);
              console.error('Response body:', body.substring(0, 200));
            } catch (e) {
              console.error('Could not read response body:', e);
            }
          }
        }
      });

      console.log('Network monitoring active');
    });

    await test.step('Navigate to extraction jobs page', async () => {
      console.log('Navigating to /admin/extraction-jobs...');

      await page.goto(`${BASE_URL}/admin/extraction-jobs`);

      const currentUrl = page.url();
      console.log('Current URL:', currentUrl);

      const isOnLoginPage =
        currentUrl.includes('/login') || currentUrl.includes('localhost:8200');
      if (isOnLoginPage) {
        console.error('Redirected to login page:', currentUrl);
        throw new Error(
          'Unexpected redirect to login - authentication may have failed'
        );
      }

      console.log('Navigation successful - no auth redirect');
    });

    await test.step('Verify page rendered with correct elements', async () => {
      console.log('Checking for page elements...');

      const pageContainer = page.locator(
        '[data-testid="page-extraction-jobs"]'
      );
      await expect(
        pageContainer,
        'Page container with data-testid="page-extraction-jobs" MUST be visible'
      ).toBeVisible({ timeout: 15000 });
      console.log('Page container found with correct data-testid');

      const pageTitle = page.getByRole('heading', {
        name: /extraction jobs/i,
        level: 1,
      });
      await expect(
        pageTitle,
        'Page title "Extraction Jobs" MUST be visible'
      ).toBeVisible({ timeout: 5000 });
      console.log('Page title verified: "Extraction Jobs"');
    });

    await test.step('Wait for network requests to complete', async () => {
      console.log('Waiting for network idle...');
      await page
        .waitForLoadState('networkidle', { timeout: 10000 })
        .catch(() => {
          console.log('Network idle timeout - continuing anyway');
        });
      console.log('Network requests completed');
    });

    await test.step('Capture screenshot for verification', async () => {
      console.log('Taking screenshot...');
      await page.screenshot({
        path: 'test-results/extraction-jobs-monitoring-verified.png',
        fullPage: true,
      });
      console.log(
        'Screenshot saved: test-results/extraction-jobs-monitoring-verified.png'
      );
    });

    await test.step('Analyze captured API requests', async () => {
      console.log('API Request Summary:');
      console.log('Total requests captured:', apiRequests.length);

      const statusGroups = {
        '2xx': apiRequests.filter((r) => r.status >= 200 && r.status < 300),
        '4xx': apiRequests.filter((r) => r.status >= 400 && r.status < 500),
        '5xx': apiRequests.filter((r) => r.status >= 500),
      };

      console.log('Successful (2xx):', statusGroups['2xx'].length);
      console.log('Client errors (4xx):', statusGroups['4xx'].length);
      console.log('Server errors (5xx):', statusGroups['5xx'].length);
    });

    await test.step('Verify no 500 errors from monitoring endpoint', async () => {
      if (errorRequests.length > 0) {
        console.error('500 ERRORS DETECTED:');
        errorRequests.forEach(({ url, status, body }) => {
          console.error('-', url, `(${status})`);
          console.error('  Body preview:', body.substring(0, 200));
        });

        throw new Error(
          `Found ${errorRequests.length} 500 error(s). See logs above for details.`
        );
      }

      console.log('No 500 errors detected - monitoring endpoint is healthy');
    });

    await test.step('Report any client errors (4xx)', async () => {
      const clientErrors = apiRequests.filter(
        (r) => r.status >= 400 && r.status < 500
      );

      if (clientErrors.length > 0) {
        console.log('Client Errors (4xx) detected:');
        clientErrors.forEach(({ url, status, method }) => {
          console.log('-', method, url, `(${status})`);
        });
        console.log(
          'Note: Client errors are informational and do not fail the test'
        );
      } else {
        console.log('No client errors (4xx) detected');
      }
    });
  });
});
