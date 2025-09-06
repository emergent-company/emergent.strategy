import { expect } from '@playwright/test';
import { test } from '../fixtures/consoleGate';
import { navigate } from '../utils/navigation';
import { expectNoRuntimeErrors } from '../utils/assertions';
import { ROUTES } from '../routes';

const VISIBLE_SELECTORS = ['[role="main"]', 'main', '#root', 'nav', 'form', 'html', 'body'];

test.describe('Route smoke (no console/page errors)', () => {
    test.beforeEach(async ({ page }) => {
        await page.route('**://localhost:3001/**', async (route) => {
            const url = new URL(route.request().url());
            const method = route.request().method();
            if (method === 'GET' && url.pathname === '/documents') {
                return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ documents: [] }) });
            }
            if (method === 'GET' && url.pathname === '/chat/conversations') {
                return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ conversations: [] }) });
            }
            if (method === 'GET') return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
            return route.fulfill({ status: 204, body: '' });
        });
    });

    for (const path of ROUTES) {
        test(`path: ${path}`, async ({ page, consoleErrors, pageErrors }) => {
            await test.step('Navigate', async () => { await navigate(page, path); });

            await test.step('Wait for any meaningful container', async () => {
                const waits = VISIBLE_SELECTORS.map((sel) => page.locator(sel).first().waitFor({ state: 'visible', timeout: 15_000 }));
                try { await Promise.any(waits); } catch { throw new Error(`No visible containers on ${path} after 15s. Tried: ${VISIBLE_SELECTORS.join(', ')}`); }
            });

            await test.step('Assert no console/page errors', async () => { expectNoRuntimeErrors(path, consoleErrors, pageErrors); });
        });
    }
});
