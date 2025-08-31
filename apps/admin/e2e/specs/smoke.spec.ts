import { expect } from '@playwright/test';
import { test } from '../fixtures/consoleGate';

const routes: string[] = [
    '/',
    '/landing',
    '/auth/login',
    '/admin/apps/documents',
    '/admin/apps/chunks',
    '/admin/apps/chat',
    '/admin/profile',
    '/admin/settings/ai/prompts',
];

const visibleSelectors = ['#root', 'main', 'form', 'nav', 'html', 'body', '[role="main"]'];

for (const path of routes) {
    test(`no console errors on ${path}`, async ({ page, consoleErrors, pageErrors }) => {
        await page.goto(path, { waitUntil: 'domcontentloaded' });
        // Be resilient to auth redirects: wait for any of the common containers to be visible
        const waits = visibleSelectors.map((sel) => page.locator(sel).first().waitFor({ state: 'visible', timeout: 15_000 }));
        try {
            await Promise.any(waits);
        } catch (err) {
            throw new Error(`No visible containers found on ${path} after 15s. Tried selectors: ${visibleSelectors.join(', ')}`);
        }
        expect(consoleErrors, `console errors on ${path}:\n${consoleErrors.join('\n')}`).toHaveLength(0);
        expect(pageErrors, `page errors on ${path}:\n${pageErrors.join('\n')}`).toHaveLength(0);
    });
}
