/* eslint-disable react-hooks/rules-of-hooks */
/* Combined fixture: auth token + console/page error capture */
import { test as base } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AUTH_STORAGE_KEY } from '../constants/storage';

export type AppFixtures = {
  consoleErrors: string[];
  pageErrors: string[];
  authToken?: string;
  serverErrors: string[];
};

async function extractAuthToken(
  page: import('@playwright/test').Page
): Promise<string | undefined> {
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
  authToken: async ({ page }, use) => {
    const token = await extractAuthToken(page);
    await use(token);
  },
  serverErrors: async ({ page }, use, testInfo) => {
    const logDir =
      process.env.ERROR_LOG_DIR ||
      path.resolve(process.cwd(), 'apps', 'server', 'logs');
    const logFile = path.join(logDir, 'errors.log');
    let baselineSize = 0;
    const startIso = new Date().toISOString();
    try {
      const fs = await import('node:fs/promises');
      const stat = await fs.stat(logFile);
      baselineSize = stat.size;
    } catch {
      /* file may not exist yet */
    }
    let delta: string[] = [];
    await use(delta);
    try {
      const fs = await import('node:fs/promises');
      const stat = await fs.stat(logFile);
      if (stat.size > baselineSize) {
        const fh = await fs.open(logFile, 'r');
        try {
          const buf = Buffer.alloc(stat.size - baselineSize);
          await fh.read(buf, 0, buf.length, baselineSize);
          const rawLines = buf
            .toString('utf-8')
            .split(/\n+/)
            .filter((l) => l.trim());
          // Filter by timestamp >= test start (line JSON has field time)
          delta = rawLines.filter((l) => {
            try {
              const obj = JSON.parse(l);
              if (!obj?.time) return true; // if missing time keep (diagnostic)
              return String(obj.time) >= startIso;
            } catch {
              return true;
            }
          });
          if (delta.length) {
            await testInfo.attach('server-errors.jsonl', {
              body: delta.join('\n'),
              contentType: 'application/jsonl',
            });
          }
        } finally {
          await fh.close();
        }
      }
    } catch {
      /* ignore */
    }
    // Note: we cannot mutate the already provided fixture value post-use; attach artifact is primary output.
  },
});

export { expect } from '@playwright/test';
