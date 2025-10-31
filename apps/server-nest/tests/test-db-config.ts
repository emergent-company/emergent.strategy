/**
 * Unified database configuration for tests
 * Centralizes all database connection variable setup to avoid duplication
 * 
 * MIGRATION NOTE: This file now delegates to test-env.ts for environment setup.
 * The setupTestEnvironment() function in test-env.ts should be called early
 * (e.g., in tests/setup.ts) to ensure environment variables are configured.
 */

import { getTestDbConfig as getEnvDbConfig } from './test-env';

export interface TestDbConfig {
    host: string;
    port: number;
    user: string;
    password: string;
    database: string;
}

/**
 * Get database configuration for tests
 * Delegates to test-env.ts which sets sensible defaults for local development
 */
export function getTestDbConfig(): TestDbConfig {
    // Delegate to centralized test environment configuration
    return getEnvDbConfig();
}

/**
 * Get database configuration for NestJS DatabaseService
 */
export function getTestDbServiceConfig() {
    const config = getTestDbConfig();
    return {
        dbHost: config.host,
        dbPort: config.port,
        dbUser: config.user,
        dbPassword: config.password,
        dbName: config.database,
    };
}
