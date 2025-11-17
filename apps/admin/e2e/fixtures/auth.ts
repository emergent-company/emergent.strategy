/* eslint-disable react-hooks/rules-of-hooks */
import { test as base, expect, type Page } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AUTH_STORAGE_KEY } from '../constants/storage';

export type AuthFixtures = {
  authToken?: string;
};

// Reads the auth token from app localStorage or from env
async function extractAuthToken(page: Page): Promise<string | undefined> {
  const token = await page.evaluate(() => {
    try {
      const raw = localStorage.getItem(AUTH_STORAGE_KEY);
      if (!raw) return undefined;
      const parsed = JSON.parse(raw) as {
        accessToken?: string;
        idToken?: string;
        expiresAt?: number;
      };
      if (parsed.expiresAt && Date.now() > parsed.expiresAt) return undefined;
      return parsed.accessToken || parsed.idToken;
    } catch {
      return undefined;
    }
  });
  return token ?? process.env.E2E_AUTH_TOKEN;
}

export const test = base.extend<AuthFixtures>({
  context: async ({ context }, use) => {
    // Reuse storage state saved by auth.setup.ts when available
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const storagePath = path.resolve(__dirname, '..', '.auth', 'state.json');
    await context.addInitScript(() => void 0);
    await use(context);
  },
  authToken: async ({ page }, use) => {
    const token = await extractAuthToken(page);
    await use(token);
  },
});

export { expect } from '@playwright/test';
