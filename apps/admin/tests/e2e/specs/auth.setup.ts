import { test as setup, expect, Page } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AUTH_STORAGE_KEY } from '../constants/storage';
import { ensureOrgAndProject } from '../helpers/test-user';

/**
 * Auth setup test
 * -----------------------------------------------
 * Authenticates a test user via UI login and writes a storage state file
 * that can be re-used via `storageState` in other tests.
 *
 * Performs real UI credential login – fills email + password on /auth/login and clicks auth button.
 * Env: E2E_TEST_USER_EMAIL, E2E_TEST_USER_PASSWORD (required)
 * Works with VITE_AUTH_MODE=credentials (button text: "Sign In") OR OIDC ("Continue with SSO").
 *
 * The UI login path intentionally uses strict, accessible locators (getByRole / label / name) per guidelines.
 */

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const authDir = path.resolve(__dirname, '..', '.auth');
const storageFile = path.join(authDir, 'state.json');

// Centralised selectors grounded in the Login page implementation.
// Email input is inside a fieldset with legend "Email Address" and has name=id=email.
// Password input has id=name=password.
/**
 * Flexible selector resolution to support both legacy local credential screen and hosted Zitadel login.
 * We attempt multiple candidate selectors and pick the first that appears.
 * Environment overrides:
 *   E2E_SEL_EMAIL   (default tries several: input[name=email], input[name=loginName], #loginName, input[name=login])
 *   E2E_SEL_PASS    (default: input[name=password], #password, input[type=password])
 *   E2E_SEL_SUBMIT  (default: button[name=signin], button[type=submit], button:has-text("Sign In"), button:has-text("Continue"))
 */
const EMAIL_SELECTOR_CANDIDATES = (
  process.env.E2E_SEL_EMAIL?.split(',').map((s) => s.trim()) || [
    'input[name="email"]',
    'input[name="loginName"]',
    '#loginName',
    'input[name="login"]',
  ]
).filter(Boolean);
const PASSWORD_SELECTOR_CANDIDATES = (
  process.env.E2E_SEL_PASS?.split(',').map((s) => s.trim()) || [
    'input[name="password"]',
    '#password',
    'input[type="password"]',
  ]
).filter(Boolean);
const SUBMIT_SELECTOR_CANDIDATES = (
  process.env.E2E_SEL_SUBMIT?.split(',').map((s) => s.trim()) || [
    'button[name="signin"]',
    'button[type="submit"]',
    'button:has-text("Sign In")',
    'button:has-text("Continue")',
    'button:has-text("Continue with SSO")',
  ]
).filter(Boolean);
// Optional intermediate "Next" button for multi-step identity-first flows
const NEXT_SELECTOR_CANDIDATES = (
  process.env.E2E_SEL_NEXT?.split(',').map((s) => s.trim()) || [
    'button:has-text("Next")',
    'button[name="next"]',
  ]
).filter(Boolean);

async function waitForFirstVisible(
  page: Page,
  selectors: string[],
  timeoutMs: number
): Promise<import('@playwright/test').Locator> {
  const start = Date.now();
  const interval = 150; // ms
  while (Date.now() - start < timeoutMs) {
    for (const sel of selectors) {
      const loc = page.locator(sel);
      if ((await loc.first().count()) > 0) {
        try {
          if (await loc.first().isVisible()) return loc.first();
        } catch {
          /* ignore transient */
        }
      }
    }
    await page.waitForTimeout(interval);
  }
  throw new Error(
    `None of selectors became visible within ${timeoutMs}ms: ${selectors.join(
      ' | '
    )}`
  );
}

async function resolveEmailLocator(page: Page) {
  return waitForFirstVisible(page, EMAIL_SELECTOR_CANDIDATES, 15_000);
}
async function resolvePasswordLocator(page: Page) {
  return waitForFirstVisible(page, PASSWORD_SELECTOR_CANDIDATES, 15_000);
}
async function resolveSubmitLocator(page: Page) {
  return waitForFirstVisible(page, SUBMIT_SELECTOR_CANDIDATES, 15_000);
}
async function resolveNextLocator(page: Page) {
  return waitForFirstVisible(page, NEXT_SELECTOR_CANDIDATES, 3_000);
}

setup.describe.configure({ mode: 'serial' });

setup('auth: login and save storage state', async ({ page, context }) => {
  await fs.mkdir(authDir, { recursive: true });

  const email = process.env.E2E_TEST_USER_EMAIL?.trim();
  const password = process.env.E2E_TEST_USER_PASSWORD?.trim();

  if (!email || !password) {
    throw new Error(
      'E2E_TEST_USER_EMAIL and E2E_TEST_USER_PASSWORD are required for authentication'
    );
  }

  console.log(`[auth.setup] Logging in with email: ${email}`);

  // UI Login Flow
  await page.goto('/auth/login');

  // If immediately redirected to external/issuer domain, continue – flexible selectors will adapt.
  // We intentionally do NOT assert the URL pattern here to stay agnostic to provider query params.

  await testStep('Fill email/login field', async () => {
    const emailBox = await resolveEmailLocator(page);
    await expect(emailBox, 'Email/login input should be visible').toBeVisible();
    await emailBox.fill(email!);
    // Some hosted pages auto-transform; we skip strict value assertion to avoid false negatives.
  });
  await testStep('Advance to password screen (Next if present)', async () => {
    try {
      const nextBtn = await resolveNextLocator(page);
      if (await nextBtn.isVisible()) {
        await nextBtn.click();
        console.log('Clicked intermediate Next button.');
      }
    } catch {
      // Next not present – single step form, continue silently.
    }
  });

  await testStep('Fill password field', async () => {
    const passBox = await resolvePasswordLocator(page);
    await expect(passBox, 'Password input should be visible').toBeVisible();
    await passBox.fill(password!);
  });

  await testStep('Submit login form', async () => {
    const btn = await resolveSubmitLocator(page);
    await expect(btn, 'Submit/login button should exist').toBeVisible();
    await btn.click();
  });

  await testStep('Handle optional 2FA setup (first login only)', async () => {
    // On first login, Zitadel may show a 2FA setup screen.
    // If it appears, click "Skip" to proceed. Otherwise, continue.
    try {
      const skipBtn = page.locator('button:has-text("Skip")');
      await skipBtn.waitFor({ state: 'visible', timeout: 3_000 });
      if (await skipBtn.isVisible()) {
        console.log('[auth.setup] 2FA setup screen detected - clicking Skip');
        await skipBtn.click();
      }
    } catch {
      // 2FA screen not present - continue normally
      console.log('[auth.setup] No 2FA setup screen - continuing');
    }
  });

  let sawCallback = false;
  let sawAdmin = false;

  await testStep('Wait for auth callback redirect', async () => {
    const navListener = (frame: import('@playwright/test').Frame) => {
      if (frame !== page.mainFrame()) return;
      try {
        const url = new URL(frame.url());
        if (url.pathname.startsWith('/auth/callback')) {
          sawCallback = true;
        }
        // Accept /admin or any authenticated page (onboarding, setup, dashboard, etc.)
        if (
          url.pathname.startsWith('/admin') ||
          url.pathname.startsWith('/onboarding') ||
          url.pathname.startsWith('/setup') ||
          url.pathname.startsWith('/dashboard')
        ) {
          sawAdmin = true;
        }
      } catch {
        // Ignore invalid URLs during transient navigations
      }
    };

    page.on('framenavigated', navListener);

    try {
      // Check if we're already on an authenticated page before waiting
      const currentUrl = page.url();
      const currentParsed = new URL(currentUrl);
      if (
        currentParsed.pathname.startsWith('/admin') ||
        currentParsed.pathname.startsWith('/onboarding') ||
        currentParsed.pathname.startsWith('/setup') ||
        currentParsed.pathname.startsWith('/dashboard')
      ) {
        console.log(
          `[auth.setup] Already on authenticated page: ${currentUrl}`
        );
        sawAdmin = true;
      } else {
        // Wait for navigation to authenticated page
        await page.waitForNavigation({
          url: (navUrl) => {
            console.log(`[auth.setup] Navigation to: ${navUrl}`);
            try {
              const parsed = new URL(navUrl);
              if (parsed.pathname.startsWith('/auth/callback')) {
                sawCallback = true;
                return true;
              }
              // Accept /admin or any authenticated page (onboarding, setup, dashboard, etc.)
              if (
                parsed.pathname.startsWith('/admin') ||
                parsed.pathname.startsWith('/onboarding') ||
                parsed.pathname.startsWith('/setup') ||
                parsed.pathname.startsWith('/dashboard')
              ) {
                sawAdmin = true;
                return true;
              }
            } catch {
              return false;
            }
            return false;
          },
          timeout: 30_000,
          waitUntil: 'domcontentloaded',
        });
      }
    } catch (error) {
      const currentUrl = page.url();
      console.error(
        `[auth.setup] Timeout waiting for redirect. Current URL: ${currentUrl}`
      );
      throw new Error(
        `No redirect observed after submitting login. Current URL: ${currentUrl}. Check IdP configuration.`
      );
    } finally {
      page.off('framenavigated', navListener);
    }

    if (!sawCallback) {
      try {
        await page.waitForURL(/\/auth\/callback(\/|$)/, {
          timeout: 5_000,
          waitUntil: 'domcontentloaded',
        });
        sawCallback = true;
      } catch {
        console.warn(
          '[auth.setup] /auth/callback was not observed; continuing based on direct admin redirect.'
        );
      }
    }
  });

  // After the callback, we expect a redirect into the admin surface or onboarding.
  // Confirm the redirect before validating stored auth state to avoid false positives.
  await testStep('Wait for authenticated landing', async () => {
    if (!sawAdmin) {
      // Accept /admin, /onboarding, /setup, or /dashboard as valid authenticated pages
      sawAdmin = await page
        .waitForURL(/\/(admin|onboarding|setup|dashboard)(\/|$)/, {
          timeout: 30_000,
          waitUntil: 'domcontentloaded',
        })
        .then(() => true)
        .catch(() => false);
    }

    expect(sawAdmin, 'Authenticated page should load after login').toBe(true);

    if (!sawCallback) {
      console.warn('[auth.setup] Proceeding without observing /auth/callback.');
    }

    console.log('[auth.setup] Current URL:', page.url());

    // Give the app a moment to save auth state after callback processing
    await page.waitForTimeout(2000);

    const authState = await page.evaluate(() => {
      try {
        // Note: Using literal value because this runs in browser context
        // The actual key used in the code is 'spec-server-auth' (AUTH_STORAGE_KEY)
        const stored = localStorage.getItem('spec-server-auth');
        console.log('[browser] localStorage keys:', Object.keys(localStorage));
        console.log('[browser] spec-server-auth value:', stored);
        return JSON.parse(stored || 'null');
      } catch (err) {
        console.error('[browser] Error parsing auth state:', err);
        return null;
      }
    });

    console.log('[auth.setup] Auth state:', authState ? 'present' : 'null');
    expect(authState, 'Auth state should exist after login').toBeTruthy();
    expect(authState.accessToken, 'accessToken should be present').toBeTruthy();

    // Give the page a moment to settle after auth state verification
    await page.waitForTimeout(1000);
  });

  // Ensure org and project exist for subsequent tests
  await testStep('Ensure org and project exist', async () => {
    try {
      const { orgId, projectId } = await ensureOrgAndProject(page);
      console.log('[auth.setup] Org/project ready:', { orgId, projectId });
    } catch (error) {
      console.error('[auth.setup] Failed to ensure org/project:', error);
      console.log('[auth.setup] Current URL:', page.url());
      console.log('[auth.setup] Will retry API call...');

      // Wait a bit longer and retry
      await page.waitForTimeout(2000);
      const { orgId, projectId } = await ensureOrgAndProject(page);
      console.log('[auth.setup] Org/project ready (after retry):', {
        orgId,
        projectId,
      });
    }
  });

  // Persist storage state for subsequent tests.
  await context.storageState({ path: storageFile });
  console.log('[auth.setup] Storage state saved to:', storageFile);
});

// Helper wrapper using test.step for structured reporting.
async function testStep<T>(title: string, body: () => Promise<T>): Promise<T> {
  return await setup.step(title, body);
}

export default {};
