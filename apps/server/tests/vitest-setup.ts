/**
 * Vitest setup file - runs before all tests
 * Ensures test environment variables are configured before any modules are loaded
 */
import { setupTestEnvironment } from './test-env';

// Initialize test environment immediately
setupTestEnvironment();
