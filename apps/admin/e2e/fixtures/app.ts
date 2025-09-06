/* eslint-disable react-hooks/rules-of-hooks */
/* Combined fixture: auth token + console/page error capture */
import { test as base } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export type AppFixtures = {
    consoleErrors: string[];
    pageErrors: string[];
    authToken?: string;
};

async function extractAuthToken(page: import('@playwright/test').Page): Promise<string | undefined> {
    const token = await page.evaluate(() => {
        try {
            const raw = localStorage.getItem('__nexus_auth_v1__');
            if (!raw) return undefined;
            const parsed = JSON.parse(raw) as { accessToken?: string; idToken?: string; expiresAt?: number };
            if (parsed.expiresAt && Date.now() > parsed.expiresAt) return undefined;
            return parsed.accessToken || parsed.idToken;
        } catch { return undefined; }
    });
    return token ?? process.env.E2E_AUTH_TOKEN;
}

export const test = base.extend<AppFixtures>({
    context: async ({ context }, use) => {
        // (Optional) load storage state if produced by auth.setup (kept side-effect free here)
        const __filename = fileURLToPath(import.meta.url);
        const __dirname = path.dirname(__filename);
        const storagePath = path.resolve(__dirname, '..', '.auth', 'state.json');
        // We rely on project-level storageState config; no manual load to avoid double-init.
        await context.addInitScript(() => void 0);
        await use(context);
    },
    consoleErrors: async ({ page }, use) => {
        const errors: string[] = [];
        page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });
        await use(errors);
    },
    pageErrors: async ({ page }, use) => {
        const errors: string[] = [];
        page.on('pageerror', (err) => errors.push(err.message));
        await use(errors);
    },
    authToken: async ({ page }, use) => {
        const token = await extractAuthToken(page);
        await use(token);
    },
});

export { expect } from '@playwright/test';