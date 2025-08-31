import { expect } from '@playwright/test';
import { test } from '../fixtures/consoleGate';

const hasRealCreds = !!(process.env.E2E_REAL_LOGIN === '1' || (process.env.E2E_OIDC_EMAIL && process.env.E2E_OIDC_PASSWORD));

// Helper to wait for any selector to be visible
async function waitAnyVisible(page: import('@playwright/test').Page, selectors: string[], timeout = 30_000) {
    const waits = selectors.map((sel) => page.locator(sel).first().waitFor({ state: 'visible', timeout }));
    return Promise.any(waits);
}

// Best-effort helper to click a button among common texts
async function clickAnyButton(page: import('@playwright/test').Page, texts: string[], timeout = 15_000) {
    for (const t of texts) {
        const btn = page.getByRole('button', { name: new RegExp(t, 'i') });
        if (await btn.first().isVisible({ timeout: 500 })) {
            await btn.first().click();
            return true;
        }
    }
    // Try generic submit
    const submit = page.locator('button[type="submit"], input[type="submit"]');
    if (await submit.first().isVisible({ timeout })) {
        await submit.first().click();
        return true;
    }
    return false;
}

test.skip(!hasRealCreds, 'Set E2E_REAL_LOGIN=1 or E2E_OIDC_EMAIL/E2E_OIDC_PASSWORD to run real login test');

test('real SSO login redirects to admin and shows Documents UI', async ({ page, consoleErrors, pageErrors }) => {
    const email = process.env.E2E_OIDC_EMAIL as string | undefined;
    const password = process.env.E2E_OIDC_PASSWORD as string | undefined;
    const issuer = process.env.E2E_OIDC_ISSUER as string | undefined; // optional: expected IdP base URL
    expect(email, 'E2E_OIDC_EMAIL is required').toBeTruthy();
    expect(password, 'E2E_OIDC_PASSWORD is required').toBeTruthy();

    // Start at our login page and trigger SSO
    await page.goto('/auth/login', { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: /continue with sso/i }).click();

    // Wait for redirect to IdP
    await page.waitForLoadState('domcontentloaded');
    if (issuer) {
        await expect(page).toHaveURL(new RegExp(issuer.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    } else {
        // Ensure we left our app origin
        const base = new URL(process.env.E2E_BASE_URL || 'http://localhost:5173');
        await expect.soft(page).not.toHaveURL(new RegExp(`^${base.origin}`));
    }

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
    if (consentClicked) {
        await page.waitForLoadState('domcontentloaded');
    }

    // Expect we return to app callback and then admin
    await expect(page).toHaveURL(/\/auth\/callback|\/admin/i, { timeout: 60_000 });
    await page.waitForURL(/\/admin(\/|$)/, { timeout: 60_000 });

    // Landed in admin → by default the app redirects to Documents. Assert key UI bits:
    await page.goto('/admin/apps/documents');
    await waitAnyVisible(page, ['.breadcrumbs', 'table.table', 'button:has-text("Upload document")'], 15_000);
    // Check the PageTitle title text is present
    await expect(page.getByText('Documents', { exact: true })).toBeVisible();
    // Check upload button and table header
    await expect(page.getByRole('button', { name: /upload document/i })).toBeVisible();
    await expect(page.locator('table.table thead')).toBeVisible();

    // Gate: no console or page errors
    expect(consoleErrors, `console errors: ${consoleErrors.join('\n')}`).toHaveLength(0);
    expect(pageErrors, `page errors: ${pageErrors.join('\n')}`).toHaveLength(0);
});

test('real SSO login fails with wrong credentials and does not reach admin', async ({ page }) => {
    test.skip(!hasRealCreds, 'Requires real login configuration');
    const email = process.env.E2E_OIDC_EMAIL as string | undefined;
    const badPwd = process.env.E2E_OIDC_BAD_PASSWORD as string | undefined || '___definitely_wrong___';
    expect(email, 'E2E_OIDC_EMAIL is required').toBeTruthy();

    await page.goto('/auth/login', { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: /continue with sso/i }).click();
    await page.waitForLoadState('domcontentloaded');

    // Fill email
    await waitAnyVisible(page, ['input[type="email"]', 'input[name="loginName"]', '#loginName', 'input[name="email"]']);
    const emailField = page.locator('input[type="email"], input[name="loginName"], #loginName, input[name="email"]').first();
    await emailField.fill(email!);
    await clickAnyButton(page, ['next', 'continue', 'sign in', 'log in']);

    // Fill wrong password
    await waitAnyVisible(page, ['input[type="password"]', 'input[name="password"]', '#password']);
    const passField = page.locator('input[type="password"], input[name="password"], #password').first();
    await passField.fill(badPwd);
    await clickAnyButton(page, ['sign in', 'log in', 'continue', 'submit']);

    // Expect we do NOT reach /admin. Either an inline error at IdP or stay on login.
    // Common inline error indicators:
    const errorCandidates = [
        '[role="alert"]',
        '.alert.alert-error',
        'text=Invalid credentials',
        'text=incorrect',
        'text=try again',
        '.error',
    ];
    // Wait briefly for either an error or for URL to change to callback; assert it's not admin.
    const sawError = await Promise.race([
        waitAnyVisible(page, errorCandidates, 10_000).then(() => true).catch(() => false),
        page.waitForURL(/\/auth\/callback|\/admin/i, { timeout: 10_000 }).then(() => false).catch(() => false),
    ]);

    // If we did reach callback, ensure we did NOT land at admin
    const url = page.url();
    expect(/\/admin(\/|$)/.test(url)).toBeFalsy();
    // Prefer that an error indicator is visible; soft assertion in case IdP messages differ
    expect.soft(sawError, 'Expected an error message on IdP for wrong credentials').toBeTruthy();
});
