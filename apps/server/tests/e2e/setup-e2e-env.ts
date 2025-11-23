/**
 * E2E Environment Setup
 *
 * This file MUST be the first setupFile in vitest.e2e.config.ts
 * It sets environment variables for the E2E database before any test code runs
 */

// Set E2E database configuration
process.env.POSTGRES_HOST = 'localhost';
process.env.POSTGRES_PORT = '5438';
process.env.POSTGRES_USER = 'spec';
process.env.POSTGRES_PASSWORD = 'spec';
process.env.POSTGRES_DB = 'spec_e2e';

// Set test-specific flags
process.env.NODE_ENV = 'test';
process.env.AUTH_TEST_STATIC_TOKENS = '1';
process.env.SCOPES_DISABLED = '0';
process.env.EXTRACTION_WORKER_ENABLED = 'false';

console.log('✅ E2E environment configured: spec@localhost:5438/spec_e2e');
