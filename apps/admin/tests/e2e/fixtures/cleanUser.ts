/**
 * Clean User Fixture
 *
 * Provides a test fixture that performs OIDC login with test user and wraps tests with automatic cleanup
 * before and after each test. Ensures tests start with a clean slate.
 *
 * Usage:
 * ```typescript
 * import { test, expect } from './fixtures/cleanUser';
 *
 * test('my test', async ({ page, cleanupComplete }) => {
 *     // Test user is logged in and data is clean
 *     await page.goto('/admin');
 *     // Test logic here
 *     // Cleanup happens automatically after test
 * });
 * ```
 */

/* eslint-disable react-hooks/rules-of-hooks */
import { test as consoleGateTest, expect as baseExpect } from './consoleGate';
import { cleanupTestUser, getTestUserCredentials } from '../helpers/test-user';
import { AUTH_STORAGE_KEY, BASE_URL } from '../constants/storage';

/**
 * Perform OIDC login with test user credentials
 */
async function loginTestUser(
  page: import('@playwright/test').Page
): Promise<void> {
  const { email, password } = getTestUserCredentials();

  console.log('[FIXTURE] cleanUser: Starting OIDC login for test user');
  console.log('[FIXTURE] cleanUser: Email:', email);
  console.log('[FIXTURE] cleanUser: Password:', password); // Show full password for debugging
  console.log('[FIXTURE] cleanUser: Password length:', password.length);

  // Navigate to admin (will redirect to Zitadel)
  await page.goto(`${BASE_URL}/admin`);

  // Wait for Zitadel login page
  await page.waitForURL(/localhost:8200.*login/, { timeout: 15000 });
  console.log('[FIXTURE] cleanUser: Redirected to Zitadel login');

  // Fill email
  const emailInput = page
    .locator('input[name="loginName"], input[type="email"]')
    .first();
  await emailInput.waitFor({ state: 'visible', timeout: 5000 });
  await emailInput.fill(email);
  console.log('[FIXTURE] cleanUser: Email filled');

  // Click Next
  const nextButton = page
    .locator('button:has-text("Next"), button:has-text("Weiter")')
    .first();
  await nextButton.click();
  console.log('[FIXTURE] cleanUser: Next button clicked');

  // Wait for password screen
  await page.waitForTimeout(1000);
  const passwordInput = page
    .locator('input[name="password"], input[type="password"]')
    .first();
  await passwordInput.waitFor({ state: 'visible', timeout: 5000 });
  await passwordInput.fill(password);
  console.log('[FIXTURE] cleanUser: Password filled');

  // Click Next on password screen
  const passwordNextButton = page
    .locator('button:has-text("Next"), button:has-text("Weiter")')
    .first();
  await passwordNextButton.click();
  console.log('[FIXTURE] cleanUser: Password Next clicked');

  // Wait for OAuth callback
  await page.waitForURL(/localhost:5176/, { timeout: 15000 });
  console.log('[FIXTURE] cleanUser: OAuth callback completed');

  // Wait for auth token to be stored
  console.log('[FIXTURE] cleanUser: Waiting for auth token storage...');
  await page.waitForFunction(
    () => {
      const authData = localStorage.getItem(AUTH_STORAGE_KEY);
      return authData !== null;
    },
    { timeout: 10000 }
  );
  console.log('[FIXTURE] cleanUser: Auth token stored successfully');

  // Debug: Log the auth data structure and decode JWT claims
  const authData = await page.evaluate(() => {
    const data = localStorage.getItem(AUTH_STORAGE_KEY);
    if (!data) return null;
    const parsed = JSON.parse(data);
    const tokenParts = parsed.accessToken?.split('.');

    // Decode BOTH accessToken AND idToken to compare
    const decodeToken = (token: string) => {
      if (!token) return null;
      try {
        const [, payload] = token.split('.');
        const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
        return JSON.parse(json);
      } catch (e) {
        return { error: 'Failed to decode' };
      }
    };

    const accessTokenClaims = parsed.accessToken
      ? decodeToken(parsed.accessToken)
      : null;
    const idTokenClaims = parsed.idToken ? decodeToken(parsed.idToken) : null;

    return {
      keys: Object.keys(parsed),
      userEmail: parsed.user?.email,
      tokenStart: parsed.accessToken?.substring(0, 30),
      tokenParts: tokenParts?.length,
      isJWT: tokenParts?.length === 3,
      idTokenStart: parsed.idToken?.substring(0, 30),
      expiresAt: parsed.expiresAt,
      // ACCESS TOKEN claims
      accessTokenClaims: accessTokenClaims
        ? {
            sub: accessTokenClaims.sub,
            email: accessTokenClaims.email,
            aud: accessTokenClaims.aud,
            iss: accessTokenClaims.iss,
            allClaims: Object.keys(accessTokenClaims || {}),
          }
        : null,
      // ID TOKEN claims
      idTokenClaims: idTokenClaims
        ? {
            sub: idTokenClaims.sub,
            email: idTokenClaims.email,
            email_verified: idTokenClaims.email_verified,
            name: idTokenClaims.name,
            preferred_username: idTokenClaims.preferred_username,
            aud: idTokenClaims.aud,
            iss: idTokenClaims.iss,
            // Show all claims for debugging
            allClaims: Object.keys(idTokenClaims || {}),
          }
        : null,
    };
  });
  console.log(
    '[FIXTURE] cleanUser: Auth data:',
    JSON.stringify(authData, null, 2)
  );
}

/**
 * Extended test fixture with clean user
 * Extends consoleGate (for console error tracking) and adds OIDC login + automatic cleanup
 * Provides: cleanupComplete boolean indicating if cleanup ran successfully
 */
export const test = consoleGateTest.extend<{ cleanupComplete: boolean }>({
  cleanupComplete: async ({ page }, use) => {
    let cleanupSuccess = false;

    // Step 1: Login as test user
    console.log('[FIXTURE] cleanUser: Logging in as test user');
    await loginTestUser(page);

    // Step 2: Cleanup any existing data for test user (BEFORE test)
    console.log('[FIXTURE] cleanUser: Starting cleanup BEFORE test');
    try {
      await cleanupTestUser(page);
      console.log('[FIXTURE] cleanUser: Pre-test cleanup complete');
      cleanupSuccess = true;
    } catch (error) {
      const err = error as Error;
      console.warn(
        '[FIXTURE] cleanUser: Pre-test cleanup failed (may be first run):',
        err.message
      );
      // Don't fail test if cleanup fails - user might not have any data yet
      cleanupSuccess = false;
    }

    // Step 3: Run the test
    console.log('[FIXTURE] cleanUser: Running test with clean data');
    await use(cleanupSuccess);

    // Step 4: Cleanup after test (AFTER test)
    console.log('[FIXTURE] cleanUser: Starting cleanup AFTER test');
    try {
      await cleanupTestUser(page);
      console.log('[FIXTURE] cleanUser: Post-test cleanup complete');
    } catch (error) {
      const err = error as Error;
      console.error(
        '[FIXTURE] cleanUser: Post-test cleanup failed:',
        err.message
      );
      // Don't fail test if cleanup fails - test already completed
    }
  },
});

// Re-export expect for convenience
export { baseExpect as expect };
