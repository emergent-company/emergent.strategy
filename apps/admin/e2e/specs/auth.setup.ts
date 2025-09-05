import { test as setup, expect, Page } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Auth setup test
 * -----------------------------------------------
 * Deterministically authenticates a test user and writes a storage state file
 * that can be re-used via `storageState` in other tests.
 *
 * Modes:
 * 1) UI credential login (preferred) – fills email + password on /auth/login and clicks primary auth button.
 *    Env: E2E_LOGIN_EMAIL, E2E_LOGIN_PASSWORD
 *    Works with VITE_AUTH_MODE=credentials (button text: "Sign In") OR OIDC ("Continue with SSO").
 * 2) Token injection (fallback / forced) – if credentials absent OR E2E_FORCE_TOKEN=1, inject a dev token.
 *    Env: E2E_AUTH_TOKEN overrides generated token, E2E_INCLUDE_IDTOKEN=1 to also store idToken.
 *
 * The UI login path intentionally uses strict, accessible locators (getByRole / label / name) per guidelines.
 */

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const authDir = path.resolve(__dirname, '..', '.auth');
const storageFile = path.join(authDir, 'state.json');

function generateDevToken(email: string): string {
    // Mirror logic from credentials mode: unsigned JWT (alg none) with 1h expiry
    const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
    const nowSec = Math.floor(Date.now() / 1000);
    const payload = Buffer.from(JSON.stringify({ sub: email, email, name: email.split('@')[0], iat: nowSec, exp: nowSec + 3600 })).toString('base64url');
    return `${header}.${payload}.`;
}

// Centralised selectors grounded in the Login page implementation.
// Email input is inside a fieldset with legend "Email Address" and has name=id=email.
// Password input has id=name=password.
function emailInput(page: Page) {
    return page.locator('input[name="email"]');
}
function passwordInput(page: Page) {
    return page.locator('input[name="password"]');
}
function primaryLoginButton(page: Page) {
    // Stable selector: button used for both credentials and SSO flows has name="signin".
    // Text can be 'Sign In', 'Signing In...', 'Continue with SSO', or 'Redirecting...'.
    return page.locator('button[name="signin"]');
}

setup.describe.configure({ mode: 'serial' });

setup('auth: login (or inject) and save storage state', async ({ page, context }) => {
    await fs.mkdir(authDir, { recursive: true });

    const email = process.env.E2E_LOGIN_EMAIL?.trim();
    const password = process.env.E2E_LOGIN_PASSWORD?.trim();
    const tokenOverride = process.env.E2E_AUTH_TOKEN?.trim();
    const forceToken = (process.env.E2E_FORCE_TOKEN || '').toLowerCase() === '1';
    const includeIdToken = (process.env.E2E_INCLUDE_IDTOKEN || '').toLowerCase() === '1';
    const useTokenInjection = forceToken || !email || !password;

    console.log(`Auth setup: mode=${useTokenInjection ? 'token-injection' : 'ui-login'} force=${forceToken}`);

    if (useTokenInjection) {
        const token = tokenOverride || generateDevToken(email || 'dev@example.com');
        await page.goto('/', { waitUntil: 'domcontentloaded' });
        await page.evaluate(({ tokenValue, includeIdToken }) => {
            const STORAGE_KEY = '__nexus_auth_v1__';
            const now = Date.now();
            const expiresAt = now + 60 * 60 * 1000;
            const state: any = { accessToken: tokenValue, expiresAt };
            if (includeIdToken) state.idToken = tokenValue;
            localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
        }, { tokenValue: token, includeIdToken });
        await context.storageState({ path: storageFile });
        return;
    }

    // UI Login Flow
    await page.goto('/auth/login');

    await testStep('Fill email field', async () => {
        const emailBox = emailInput(page);
        await expect(emailBox, 'Email input should be visible').toBeVisible();
        await emailBox.fill(email!); // safe due to earlier guard
        await expect(emailBox).toHaveValue(email!);
    });

    await testStep('Fill password field (masked)', async () => {
        const passBox = passwordInput(page);
        await expect(passBox, 'Password input should be visible').toBeVisible();
        await passBox.fill(password!);
        // We intentionally do NOT assert displayed value (password is masked)
        await expect(passBox).toHaveAttribute('type', 'password');
    });

    await testStep('Click primary login button', async () => {
        const btn = primaryLoginButton(page);
        await expect(btn, 'Primary login button should exist').toBeVisible();
        await btn.click();
    });

    // After clicking login, a redirect to /auth/callback then /admin is expected (OIDC). We wait until an admin route loads
    // or until auth storage appears (in case of rapid local token issuance).
    await testStep('Wait for authenticated landing', async () => {
        // Race between admin URL, localStorage token availability, or presence of an admin nav element.
        await Promise.race([
            page.waitForURL(/\/admin(\/|$)/, { timeout: 30_000 }).catch(() => null),
            page.waitForFunction(() => {
                try {
                    const raw = localStorage.getItem('__nexus_auth_v1__');
                    if (!raw) return false;
                    const parsed = JSON.parse(raw);
                    return !!parsed?.accessToken; // idToken now optional
                } catch { return false; }
            }, {}, { timeout: 30_000 }).catch(() => null),
            page.locator('text=Documents').first().waitFor({ timeout: 30_000 }).catch(() => null),
        ]);
        // Sanity assertion
        const authState = await page.evaluate(() => {
            try { return JSON.parse(localStorage.getItem('__nexus_auth_v1__') || 'null'); } catch { return null; }
        });
        expect(authState, 'Auth state should exist after login').toBeTruthy();
        expect(authState.accessToken, 'accessToken should be present').toBeTruthy();
    });

    // Persist storage state for subsequent tests.
    await context.storageState({ path: storageFile });
});

// Helper wrapper using test.step for structured reporting.
async function testStep<T>(title: string, body: () => Promise<T>): Promise<T> {
    return await setup.step(title, body);
}

export default {}; 
