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

// Zitadel configuration for test environment
// These are required even with static tokens because the ZitadelStrategy
// validates env vars at construction time
process.env.ZITADEL_URL = process.env.ZITADEL_URL || 'http://localhost:8200';
process.env.ZITADEL_DOMAIN = process.env.ZITADEL_DOMAIN || 'localhost';
process.env.ZITADEL_ORG_ID = process.env.ZITADEL_ORG_ID || 'test-org-id';
process.env.ZITADEL_PROJECT_ID =
  process.env.ZITADEL_PROJECT_ID || 'test-project-id';
process.env.ZITADEL_SA_CLIENT_ID =
  process.env.ZITADEL_SA_CLIENT_ID || 'test-client-id';
process.env.ZITADEL_SA_KEY_ID = process.env.ZITADEL_SA_KEY_ID || 'test-key-id';
process.env.ZITADEL_SA_KEY =
  process.env.ZITADEL_SA_KEY ||
  'LS0tLS1CRUdJTiBSU0EgUFJJVkFURSBLRVktLS0tLQpNSUlFb3dJQkFBS0NBUUVBdHN3bjJKMnppN1BKQU1KVXN3d3N1S2JNTEJYQXdUZmVGN3ZGalNoT3F0MWh2aWtICk1BMEdDU3FHU0liM0RRRUJBUVVBQTRHTkFEQ0JpUUtCZ1FDdE1EclI2S1hoNUl5T0lDemlQd0dVMW8xTjZHRlUKUm5NZUVBd0pvL3VJL0RpV3pLaVFUdHp5eUtvRWJZNFV6SElMNmdLQXNPQ1VsaFV5Z0RSZ3pNbVlPQUExT0FQSgo4TzBEb0FHQUFRQUFBPQotLS0tLUVORCBSU0EgUFJJVkFURSBLRVktLS0tLQo=';

console.log('✅ E2E environment configured: spec@localhost:5438/spec_e2e');
