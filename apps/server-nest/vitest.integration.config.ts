import { defineConfig } from 'vitest/config';

/**
 * Integration Test Configuration
 * 
 * These tests require external services:
 * - PostgreSQL database (port 5432)
 * - External APIs (ClickUp, etc.)
 * 
 * Run with: npm run test:integration
 * 
 * Tests in this category should use the @integration tag or be in the
 * tests/integration/ directory.
 */
export default defineConfig({
    test: {
        globals: true,
        // Only run integration tests
        include: [
            'tests/integration/**/*.spec.ts',
            'src/modules/graph/__tests__/*-integration.spec.ts',
        ],
        // Longer timeout for tests that hit real databases/APIs
        testTimeout: 30000,
        hookTimeout: 30000,
        teardownTimeout: 10000,
        // Run integration tests sequentially to avoid database conflicts
        pool: 'forks',
        poolOptions: {
            forks: {
                singleFork: true,
            },
        },
        coverage: {
            enabled: false, // Integration tests don't contribute to coverage
        },
    },
});
