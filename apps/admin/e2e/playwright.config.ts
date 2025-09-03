import { defineConfig, devices } from '@playwright/test';
import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const baseURL = process.env.E2E_BASE_URL || 'http://localhost:5173';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ADMIN_DIR = resolve(__dirname, '..');

// Load env from repo root first, then admin/.env, then default .env resolution
dotenv.config({ path: resolve(ADMIN_DIR, '..', '..', '.env') });
dotenv.config({ path: resolve(ADMIN_DIR, '.env') });
dotenv.config();

export default defineConfig({
    testDir: './specs',
    timeout: 90_000,
    expect: { timeout: 15_000 },
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
            port: 5173,
            reuseExistingServer: !process.env.CI,
            timeout: 180_000,
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
