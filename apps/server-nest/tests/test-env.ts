/**
 * Centralized test environment setup
 * Ensures all test database configuration is explicit and validated
 * 
 * Import this at the top of test setup files to ensure consistent test configuration
 */

export function setupTestEnvironment() {
    const isCI = process.env.CI === 'true';
    
    // In CI, we expect env vars to be set by the CI system
    // Locally, we can provide defaults for convenience
    if (!isCI) {
        // Set defaults only for local development
        process.env.POSTGRES_HOST = process.env.POSTGRES_HOST || 'localhost';
        process.env.POSTGRES_PORT = process.env.POSTGRES_PORT || '5437';
        process.env.POSTGRES_USER = process.env.POSTGRES_USER || 'spec';
        process.env.POSTGRES_PASSWORD = process.env.POSTGRES_PASSWORD || 'spec';
        process.env.POSTGRES_DB = process.env.POSTGRES_DB || 'spec';
    }
    
    // Validate that all required vars are now set
    const required = [
        'POSTGRES_HOST',
        'POSTGRES_PORT', 
        'POSTGRES_USER',
        'POSTGRES_PASSWORD',
        'POSTGRES_DB',
    ];
    
    const missing = required.filter(name => !process.env[name]);
    
    if (missing.length > 0) {
        throw new Error(
            `Test environment incomplete. Missing: ${missing.join(', ')}. ` +
            `Set these in your test environment or CI configuration.`
        );
    }
    
    // Set test-specific flags
    process.env.NODE_ENV = 'test';
    process.env.AUTH_TEST_STATIC_TOKENS = process.env.AUTH_TEST_STATIC_TOKENS || '1';
    process.env.DB_AUTOINIT = process.env.DB_AUTOINIT || 'true';
    process.env.SCOPES_DISABLED = '0';  // Always enforce scopes in tests
    
    // Skip encryption key requirement in tests
    if (!process.env.INTEGRATION_ENCRYPTION_KEY) {
        process.env.INTEGRATION_ENCRYPTION_KEY = 'test-key-32-characters-long-!!';
    }
    
    console.log(`✅ Test environment configured: ${process.env.POSTGRES_USER}@${process.env.POSTGRES_HOST}:${process.env.POSTGRES_PORT}/${process.env.POSTGRES_DB}`);
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
