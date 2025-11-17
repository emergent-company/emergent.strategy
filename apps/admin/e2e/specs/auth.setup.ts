import { test as setup, expect, Page } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AUTH_STORAGE_KEY } from '../constants/storage';

/**
 * Auth setup test
 * -----------------------------------------------
 * Authenticates a test user via UI login and writes a storage state file
 * that can be re-used via `storageState` in other tests.
 *
 * Performs real UI credential login – fills email + password on /auth/login and clicks auth button.
 * Env: E2E_LOGIN_EMAIL, E2E_LOGIN_PASSWORD (required)
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

  const email = process.env.E2E_LOGIN_EMAIL?.trim();
  const password = process.env.E2E_LOGIN_PASSWORD?.trim();

  if (!email || !password) {
    throw new Error(
      'E2E_LOGIN_EMAIL and E2E_LOGIN_PASSWORD are required for authentication'
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
        if (url.pathname.startsWith('/admin')) {
          sawAdmin = true;
        }
      } catch {
        // Ignore invalid URLs during transient navigations
      }
    };

    page.on('framenavigated', navListener);

    try {
      await page.waitForNavigation({
        url: (currentUrl) => {
          try {
            const parsed = new URL(currentUrl);
            if (parsed.pathname.startsWith('/auth/callback')) {
              sawCallback = true;
              return true;
            }
            if (parsed.pathname.startsWith('/admin')) {
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
    } catch (error) {
      throw new Error(
        'No redirect observed after submitting login. Check IdP configuration.'
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

  // After the callback, we expect a redirect into the admin surface. Confirm the redirect before
  // validating stored auth state to avoid false positives when stale tokens linger in storage.
  await testStep('Wait for authenticated landing', async () => {
    if (!sawAdmin) {
      sawAdmin = await page
        .waitForURL(/\/admin(\/|$)/, {
          timeout: 30_000,
          waitUntil: 'domcontentloaded',
        })
        .then(() => true)
        .catch(() => false);
    }

    expect(sawAdmin, 'Admin area should load after authentication').toBe(true);

    if (!sawCallback) {
      console.warn('[auth.setup] Proceeding without observing /auth/callback.');
    }

    const authState = await page.evaluate(() => {
      try {
        // Note: Using literal value because this runs in browser context
        return JSON.parse(localStorage.getItem('spec-server-auth') || 'null');
      } catch {
        return null;
      }
    });
    expect(authState, 'Auth state should exist after login').toBeTruthy();
    expect(authState.accessToken, 'accessToken should be present').toBeTruthy();
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
