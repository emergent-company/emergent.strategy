import { defineConfig, devices } from '@playwright/test';
import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { existsSync } from 'node:fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ADMIN_DIR = resolve(__dirname, '..', '..');

// Environment variable loading strategy (earlier calls load first, later calls DO NOT override existing vars)
// 1. Repo root .env (shared defaults)
dotenv.config({ path: resolve(ADMIN_DIR, '..', '..', '.env') });
// 2. App-level .env (project specific)
dotenv.config({ path: resolve(ADMIN_DIR, '.env') });
// 3. App-level .env.local (developer machine overrides)
dotenv.config({ path: resolve(ADMIN_DIR, '.env.local') });
// 4. Optional dedicated E2E env file (put secret test creds here). Name chosen to be explicit.
const e2eEnvPath = resolve(ADMIN_DIR, '.env.e2e');
console.log('[playwright.config] Loading E2E env from:', e2eEnvPath);
console.log('[playwright.config] File exists:', existsSync(e2eEnvPath));
dotenv.config({ path: e2eEnvPath });
console.log(
  '[playwright.config] E2E_TEST_USER_EMAIL:',
  process.env.E2E_TEST_USER_EMAIL
);
console.log(
  '[playwright.config] E2E_TEST_USER_PASSWORD:',
  process.env.E2E_TEST_USER_PASSWORD ? '***' : 'NOT SET'
);
// 5. Final generic lookup (.env in CWD, etc.)
dotenv.config();

// Canonical admin port: ADMIN_PORT (required - must be set in .env)
// Note: Read AFTER dotenv.config() to pick up environment variables
const DEV_PORT = Number(process.env.ADMIN_PORT);
if (!DEV_PORT) {
  throw new Error('ADMIN_PORT environment variable is required but not set');
}
const baseURL = process.env.E2E_BASE_URL || `http://localhost:${DEV_PORT}`;

console.log(
  `[playwright.config] ADMIN_PORT=${process.env.ADMIN_PORT}, DEV_PORT=${DEV_PORT}, baseURL=${baseURL}`
);

// Note: dotenv won't overwrite already-set env vars. To ensure a later file wins, unset the var before running tests.

export default defineConfig({
  testDir: './specs',
  timeout: 30_000, // 30 seconds per test (whole test duration)
  expect: { timeout: 15_000 }, // 15 seconds for assertions
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  // Output all test results to dedicated folder: test-results/
  outputDir: 'test-results',
  // Reporter: list for console + json file for detailed logs
  reporter: process.env.CI
    ? [['dot'], ['junit', { outputFile: 'test-results/junit.xml' }]]
    : [
        ['list'],
        ['html', { outputFolder: 'test-results/html-report', open: 'never' }],
        ['json', { outputFile: 'test-results/test-results.json' }],
      ],
  use: {
    baseURL,
    actionTimeout: 5_000, // 5 seconds for individual actions (click, fill, etc.)
    trace: 'retain-on-failure', // Changed from 'on-first-retry' to capture on first failure
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
        timeout: 30_000, // 30 seconds to start server
      }
    : undefined,
  projects: [
    // Setup project to authenticate and ensure org/project exist
    {
      name: 'setup',
      testMatch: /auth\.setup\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
    // All tests re-use authenticated storage state from setup
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
