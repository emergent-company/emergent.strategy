import { defineConfig, devices } from '@playwright/test';
import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

// Canonical admin port: ADMIN_PORT (fallback 5175)
const DEV_PORT = Number(process.env.ADMIN_PORT || 5175);
const baseURL = process.env.E2E_BASE_URL || `http://localhost:${DEV_PORT}`;

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ADMIN_DIR = resolve(__dirname, '..');

// Environment variable loading strategy (earlier calls load first, later calls DO NOT override existing vars)
// 1. Repo root .env (shared defaults)
dotenv.config({ path: resolve(ADMIN_DIR, '..', '..', '.env') });
// 2. App-level .env (project specific)
dotenv.config({ path: resolve(ADMIN_DIR, '.env') });
// 3. App-level .env.local (developer machine overrides)
dotenv.config({ path: resolve(ADMIN_DIR, '.env.local') });
// 4. Optional dedicated E2E env file (put secret test creds here). Name chosen to be explicit.
dotenv.config({ path: resolve(ADMIN_DIR, '.env.e2e') });
// 5. Final generic lookup (.env in CWD, etc.)
dotenv.config();

// Note: dotenv won't overwrite already-set env vars. To ensure a later file wins, unset the var before running tests.

export default defineConfig({
    testDir: './specs',
    timeout: 30_000, // 30 seconds per test (reduced from 90s)
    expect: { timeout: 10_000 }, // 10 seconds for assertions (reduced from 15s)
    fullyParallel: true,
    retries: process.env.CI ? 2 : 0,
    reporter: process.env.CI ? [['dot'], ['junit', { outputFile: 'results/junit.xml' }]] : 'html',
    use: {
        baseURL,
        trace: 'on-first-retry',
        screenshot: 'only-on-failure',
        video: 'retain-on-failure',
    },
    // Local dev convenience: if no E2E_BASE_URL, spin up dev server
    webServer: !process.env.E2E_BASE_URL
        ? {
            command: 'npm run dev',
            cwd: ADMIN_DIR,
            port: DEV_PORT,
            // If another project already runs on this port, Playwright would reuse it and tests could hit the wrong app.
            // Set E2E_FORCE_START=1 to always start a fresh server and avoid cross-repo leakage.
            reuseExistingServer: !process.env.CI && !process.env.E2E_FORCE_START,
            timeout: 30_000, // 30 seconds to start server (reduced from 180s)
        }
        : undefined,
    projects: [
        // Setup project to create an authenticated storage state (if E2E_AUTH_TOKEN is provided, it injects it)
        {
            name: 'setup',
            testMatch: /auth\.setup\.ts/,
            use: { ...devices['Desktop Chrome'] },
        },
        // Authenticated tests re-use storage state when present
        {
            name: 'chromium',
            use: {
                ...devices['Desktop Chrome'],
                storageState: resolve(__dirname, '.auth/state.json'),
            },
            dependencies: ['setup'],
        },
        // { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
        // { name: 'webkit', use: { ...devices['Desktop Safari'] } },
    ],
});
