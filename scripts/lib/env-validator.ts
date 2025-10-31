/**
 * Environment variable validation helper for scripts
 * Provides clear error messages when required variables are missing
 */

export interface EnvRequirement {
    name: string;
    description?: string;
    example?: string;
}

export function validateEnvVars(requirements: EnvRequirement[]): void {
    const missing: EnvRequirement[] = [];

    for (const req of requirements) {
        if (!process.env[req.name]) {
            missing.push(req);
        }
    }

    if (missing.length === 0) {
        return; // All good!
    }

    console.error('❌ Missing Required Environment Variables:\n');

    for (const req of missing) {
        console.error(`  ${req.name}`);
        if (req.description) {
            console.error(`    ${req.description}`);
        }
        if (req.example) {
            console.error(`    Example: ${req.example}`);
        }
        console.error('');
    }

    console.error('💡 Solutions:');
    console.error('  1. Create .env file: cp .env.example .env');
    console.error('  2. Edit .env and set the required values');
    console.error('  3. Run: source .env && npm run <script>\n');

    process.exit(1);
}

/**
 * Standard database connection requirements
 * Used by most scripts that need database access
 */
export const DB_REQUIREMENTS: EnvRequirement[] = [
    {
        name: 'POSTGRES_HOST',
        description: 'PostgreSQL server hostname',
        example: 'localhost'
    },
    {
        name: 'POSTGRES_PORT',
        description: 'PostgreSQL server port',
        example: '5432'
    },
    {
        name: 'POSTGRES_USER',
        description: 'PostgreSQL username',
        example: 'spec'
    },
    {
        name: 'POSTGRES_PASSWORD',
        description: 'PostgreSQL password',
        example: 'spec'
    },
    {
        name: 'POSTGRES_DB',
        description: 'PostgreSQL database name',
        example: 'spec'
    },
];

/**
 * Validate and get database configuration
 * Throws error if any required variable is missing
 */
export function getDbConfig() {
    validateEnvVars(DB_REQUIREMENTS);

    return {
        host: process.env.POSTGRES_HOST!,
        port: Number(process.env.POSTGRES_PORT!),
        user: process.env.POSTGRES_USER!,
        password: process.env.POSTGRES_PASSWORD!,
        database: process.env.POSTGRES_DB!,
    };
}
