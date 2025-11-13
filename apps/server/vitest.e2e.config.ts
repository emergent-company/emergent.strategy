import { defineConfig } from 'vitest/config';
import { config } from 'dotenv';

// Load E2E-specific environment variables
config({ path: '../../.env.e2e' });

/**
 * E2E & Integration Test Configuration
 *
 * All tests requiring external infrastructure (database, services, APIs):
 * - HTTP endpoint tests in tests/e2e directory
 * - Integration tests in tests/integration directory
 *
 * Requirements:
 * - Ephemeral PostgreSQL database via Docker (port 5438)
 * - Started with: npm run db:e2e:up
 * - Stopped/cleaned with: npm run db:e2e:down
 *
 * Run with: npm run test:e2e (auto-manages Docker lifecycle)
 */
export default defineConfig({
  test: {
    globals: true,
    include: [
      'tests/e2e/**/*.e2e.spec.ts',
      'tests/e2e/**/*.spec.ts',
      'tests/integration/**/*.spec.ts',
    ],
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      // Skip corrupted test file (needs manual reconstruction)
      'tests/e2e/chat.mcp-integration.e2e.spec.ts',
    ],
    watch: false,
    setupFiles: ['tests/e2e/global-org-cleanup.ts'],
    env: {
      NODE_ENV: 'test',
      // E2E Database configuration (ephemeral Docker container)
      POSTGRES_HOST: 'localhost',
      POSTGRES_PORT: '5438',
      POSTGRES_USER: 'spec',
      POSTGRES_PASSWORD: 'spec',
      POSTGRES_DB: 'spec_e2e',
      // Use static test tokens (no real auth)
      AUTH_TEST_STATIC_TOKENS: '1',
      SCOPES_DISABLED: '0',
      // Explicitly disable extraction worker (has its own config flag)
      EXTRACTION_WORKER_ENABLED: 'false',
      // Other workers disabled via NODE_ENV check in onModuleInit
      // Set ENABLE_WORKERS_IN_TESTS=true if specific tests need workers
    },
    // Longer timeout for tests that hit real databases/APIs
    testTimeout: 30000,
    hookTimeout: 30000,
    teardownTimeout: 10000,
    // Use forks pool with limited workers to prevent orphaned processes
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: false,
        minForks: 1,
        maxForks: 4,
      },
    },
  },
});
