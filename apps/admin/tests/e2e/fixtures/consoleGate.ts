/* eslint-disable react-hooks/rules-of-hooks */
import { test as base } from '@playwright/test';

export const test = base.extend<{
    consoleErrors: string[];
    pageErrors: string[];
    apiErrors: string[];
}>({
    consoleErrors: async ({ page }, use) => {
        const errors: string[] = [];
        page.on('console', (msg) => {
            if (msg.type() === 'error') {
                const text = msg.text();
                // Filter out resource loading errors (404s) - these are already captured by apiErrors
                // We only want actual JavaScript console.error() calls here
                if (!text.includes('Failed to load resource:')) {
                    errors.push(text);
                }
            }
        });
        await use(errors);
    },
    pageErrors: async ({ page }, use) => {
        const errors: string[] = [];
        page.on('pageerror', (err) => errors.push(err.message));
        await use(errors);
    },
    apiErrors: async ({ page }, use) => {
        const errors: string[] = [];
        page.on('response', (response) => {
            // Capture failed API requests (4xx, 5xx status codes)
            const status = response.status();
            const url = response.url();
            if (status >= 400) {
                errors.push(`${status} ${response.statusText()} - ${url}`);
            }
        });
        await use(errors);
    },
});
export { expect } from '@playwright/test';
