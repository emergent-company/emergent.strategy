import { defineConfig } from 'vitest/config';

/**
 * E2E & Integration Test Configuration
 * 
 * All tests requiring external infrastructure (database, services, APIs):
 * - HTTP endpoint tests in tests/e2e directory
 * - Service integration tests in tests/e2e/integration directory
 * - Scenario tests in tests/scenarios directory
 * - Graph DB tests with -integration suffix
 * 
 * Requirements:
 * - PostgreSQL database (port 5432)
 * - External APIs where applicable (ClickUp, etc.)
 * 
 * Run with: npm run test:e2e
 */
export default defineConfig({
    test: {
        globals: true,
        include: [
            'tests/e2e/**/*.e2e.spec.ts',
            'tests/e2e/**/*.spec.ts',
            'tests/scenarios/**/*.spec.ts',
            'src/modules/graph/__tests__/*-integration.spec.ts',
            '**/clickup-real.integration.spec.ts',
        ],
        watch: false,
        setupFiles: ['tests/e2e/global-org-cleanup.ts'],
        env: {
            E2E_MINIMAL_DB: 'true',
        },
        // Longer timeout for tests that hit real databases/APIs
        testTimeout: 30000,
        hookTimeout: 30000,
        teardownTimeout: 10000,
    },
});
