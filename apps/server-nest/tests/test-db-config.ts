/**
 * Unified database configuration for tests
 * Centralizes all database connection variable setup to avoid duplication
 */

export interface TestDbConfig {
    host: string;
    port: number;
    user: string;
    password: string;
    database: string;
}

/**
 * Get database configuration with proper fallback chain
 * Priority: PG* env vars > POSTGRES_* env vars > defaults
 */
export function getTestDbConfig(): TestDbConfig {
    // Set PG* environment variables if not already set (for pg library compatibility)
    process.env.PGHOST = process.env.PGHOST || process.env.POSTGRES_HOST || 'localhost';
    process.env.PGPORT = process.env.PGPORT || process.env.POSTGRES_PORT || '5437';
    process.env.PGUSER = process.env.PGUSER || process.env.POSTGRES_USER || 'spec';
    process.env.PGPASSWORD = process.env.PGPASSWORD || process.env.POSTGRES_PASSWORD || 'spec';
    process.env.PGDATABASE = process.env.PGDATABASE || process.env.PGDATABASE_E2E || process.env.POSTGRES_DB || 'spec';

    return {
        host: process.env.PGHOST,
        port: parseInt(process.env.PGPORT, 10),
        user: process.env.PGUSER,
        password: process.env.PGPASSWORD,
        database: process.env.PGDATABASE,
    };
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
