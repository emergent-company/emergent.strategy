/**
 * Centralized test environment setup
 * Ensures all test database configuration is explicit and validated
 *
 * Import this at the top of test setup files to ensure consistent test configuration
 *
 * IMPORTANT: This function is called lazily by getTestDbConfig(), NOT at module import time.
 * This allows vitest's env config (vitest.e2e.config.ts) to set environment variables first
 * before we apply defaults. This way E2E tests get POSTGRES_PORT=5438 and POSTGRES_DB=spec_e2e
 * while unit tests get the defaults POSTGRES_PORT=5437 and POSTGRES_DB=spec.
 */

export function setupTestEnvironment() {
  const isCI = process.env.CI === 'true';

  // In CI, we expect env vars to be set by the CI system
  // Locally, we can provide defaults for convenience
  // IMPORTANT: Only set defaults if NOT already set by vitest config
  if (!isCI) {
    // Set defaults only for local development
    // These defaults apply to unit/integration tests running with vitest.config.ts
    // E2E tests use vitest.e2e.config.ts which sets POSTGRES_PORT=5438 and POSTGRES_DB=spec_e2e
    process.env.POSTGRES_HOST = process.env.POSTGRES_HOST || 'localhost';
    process.env.POSTGRES_PORT = process.env.POSTGRES_PORT || '5437';
    process.env.POSTGRES_USER = process.env.POSTGRES_USER || 'spec';
    process.env.POSTGRES_PASSWORD = process.env.POSTGRES_PASSWORD || 'spec';
    process.env.POSTGRES_DB = process.env.POSTGRES_DB || 'spec';
  }

  console.log(
    '[setupTestEnvironment] AFTER defaults - PORT:',
    process.env.POSTGRES_PORT,
    'DB:',
    process.env.POSTGRES_DB
  );

  // Validate that all required vars are now set
  const required = [
    'POSTGRES_HOST',
    'POSTGRES_PORT',
    'POSTGRES_USER',
    'POSTGRES_PASSWORD',
    'POSTGRES_DB',
  ];

  const missing = required.filter((name) => !process.env[name]);

  if (missing.length > 0) {
    throw new Error(
      `Test environment incomplete. Missing: ${missing.join(', ')}. ` +
        `Set these in your test environment or CI configuration.`
    );
  }

  // Set test-specific flags
  process.env.NODE_ENV = 'test';
  process.env.AUTH_TEST_STATIC_TOKENS =
    process.env.AUTH_TEST_STATIC_TOKENS || '1';
  process.env.DB_AUTOINIT = process.env.DB_AUTOINIT || 'true';
  process.env.SCOPES_DISABLED = '0'; // Always enforce scopes in tests

  // Skip encryption key requirement in tests
  if (!process.env.INTEGRATION_ENCRYPTION_KEY) {
    process.env.INTEGRATION_ENCRYPTION_KEY = 'test-key-32-characters-long-!!';
  }

  // Auth module requires ZITADEL_DOMAIN even in test mode
  // Set a placeholder value if not provided (actual auth is bypassed via AUTH_TEST_STATIC_TOKENS)
  if (!process.env.ZITADEL_DOMAIN) {
    process.env.ZITADEL_DOMAIN = 'test.zitadel.local';
  }
  if (!process.env.ZITADEL_API_URL) {
    process.env.ZITADEL_API_URL = 'http://test.zitadel.local';
  }

  console.log(
    `✅ Test environment configured: ${process.env.POSTGRES_USER}@${process.env.POSTGRES_HOST}:${process.env.POSTGRES_PORT}/${process.env.POSTGRES_DB}`
  );
}

/**
 * Get test database configuration
 * Ensures environment is set up and returns config object
 */
export function getTestDbConfig() {
  setupTestEnvironment();

  return {
    host: process.env.POSTGRES_HOST!,
    port: Number(process.env.POSTGRES_PORT!),
    user: process.env.POSTGRES_USER!,
    password: process.env.POSTGRES_PASSWORD!,
    database: process.env.POSTGRES_DB!,
  };
}
