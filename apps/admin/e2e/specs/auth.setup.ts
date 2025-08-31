import { test as setup } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// This setup logs in and saves a storage state file for reuse in other tests.
// It supports two modes:
// 1) Direct token injection (preferred for CI): provide E2E_AUTH_TOKEN env var
// 2) Interactive UI login (fallback): navigates to /auth/login and clicks SSO

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const authDir = path.resolve(__dirname, '..', '.auth');
const storageFile = path.join(authDir, 'state.json');

async function waitAnyVisible(page: import('@playwright/test').Page, selectors: string[], timeout = 30_000) {
    const waits = selectors.map((sel) => page.locator(sel).first().waitFor({ state: 'visible', timeout }));
    return Promise.any(waits);
}

async function clickAnyButton(page: import('@playwright/test').Page, texts: string[], timeout = 15_000) {
    for (const t of texts) {
        const btn = page.getByRole('button', { name: new RegExp(t, 'i') });
        if (await btn.first().isVisible({ timeout: 500 })) {
            await btn.first().click();
            return true;
        }
    }
    const submit = page.locator('button[type="submit"], input[type="submit"]');
    if (await submit.first().isVisible({ timeout })) {
        await submit.first().click();
        return true;
    }
    return false;
}

setup('authenticate and save storage state', async ({ page, context, baseURL }) => {
    await fs.mkdir(authDir, { recursive: true });

    const token = process.env.E2E_AUTH_TOKEN;
    const email = process.env.E2E_OIDC_EMAIL as string | undefined;
    const password = process.env.E2E_OIDC_PASSWORD as string | undefined;
    const doReal = process.env.E2E_REAL_LOGIN === '1' || (!!email && !!password);

    if (token && !doReal) {
        // Store token in localStorage under the same key as the app uses
        await page.goto(baseURL || '/');
        await page.addInitScript((tokenValue: string) => {
            const STORAGE_KEY = '__nexus_auth_v1__';
            const now = Date.now();
            const expiresAt = now + 60 * 60 * 1000; // 1h
            const state = { accessToken: tokenValue, idToken: tokenValue, expiresAt };
            localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
        }, token);
        // Navigate to an authenticated page to ensure state is loaded
        await page.goto('/admin/apps/documents');
        await page.waitForLoadState('domcontentloaded');
    } else if (doReal) {
        // Perform full real login flow using IdP
        await page.goto('/auth/login', { waitUntil: 'domcontentloaded' });
        await page.getByRole('button', { name: /continue with sso/i }).click();
        await page.waitForLoadState('domcontentloaded');
        // Fill email
        await waitAnyVisible(page, ['input[type="email"]', 'input[name="loginName"]', '#loginName', 'input[name="email"]']);
        const emailField = page.locator('input[type="email"], input[name="loginName"], #loginName, input[name="email"]').first();
        await emailField.fill(email!);
        await clickAnyButton(page, ['next', 'continue', 'sign in', 'log in']);
        // Fill password
        await waitAnyVisible(page, ['input[type="password"]', 'input[name="password"]', '#password']);
        const passField = page.locator('input[type="password"], input[name="password"], #password').first();
        await passField.fill(password!);
        await clickAnyButton(page, ['sign in', 'log in', 'continue', 'submit']);
        // Optional consent
        await page.waitForLoadState('domcontentloaded');
        const consentClicked = await clickAnyButton(page, ['accept', 'allow', 'authorize', 'continue']);
        if (consentClicked) await page.waitForLoadState('domcontentloaded');
        // Back to app
        await page.waitForURL(/\/auth\/callback|\/admin/i, { timeout: 60_000 });
        await page.waitForURL(/\/admin(\/|$)/, { timeout: 60_000 });
    } else {
        // Fallback: click the "Continue with SSO" button on the login page
        await page.goto('/auth/login');
        const ssoButton = page.getByRole('button', { name: /continue with sso/i });
        await ssoButton.click();
        // Expect redirect to external IdP; in real env we’d complete the flow.
        // If the IdP is not reachable in test, this branch will likely fail.
    }

    await context.storageState({ path: storageFile });
});

export default {};
