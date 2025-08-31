/* eslint-disable react-hooks/rules-of-hooks */
import { test as base } from '@playwright/test';

export const test = base.extend<{ consoleErrors: string[]; pageErrors: string[] }>({
    consoleErrors: async ({ page }, use) => {
        const errors: string[] = [];
        page.on('console', (msg) => {
            if (msg.type() === 'error') errors.push(msg.text());
        });
        await use(errors);
    },
    pageErrors: async ({ page }, use) => {
        const errors: string[] = [];
        page.on('pageerror', (err) => errors.push(err.message));
        await use(errors);
    },
});
export { expect } from '@playwright/test';
