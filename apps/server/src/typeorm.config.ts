/**
 * TypeORM DataSource Configuration
 * ================================
 * Used by TypeORM CLI for migrations and by the application for database connection
 *
 * Usage (from project root):
 *   npm run db:migrate                          # Run pending migrations
 *   npm run db:migrate:generate src/migrations/MigrationName  # Generate new migration
 *   npm run db:migrate:revert                   # Revert last migration
 */

import { DataSource } from 'typeorm';
import { config } from 'dotenv';
import { join } from 'path';

// Load environment variables FIRST, before creating DataSource
// The DataSource is created at module load time, so env vars must be set before that
// For E2E tests, the npm script uses `dotenv -e .env.e2e` which sets env vars
// before this module is loaded
//
// Path from src/typeorm.config.ts:
// - ../ = apps/server (where .env and .env.local are)
// - ../../ = apps
const serverDir = join(__dirname, '..');
const envPath =
  process.env.POSTGRES_PORT === '5438'
    ? join(serverDir, '.env.e2e')
    : join(serverDir, '.env');

config({ path: envPath });
// Also load .env.local which may have additional overrides
config({ path: join(serverDir, '.env.local') });

export default new DataSource({
  type: 'postgres',
  host: process.env.POSTGRES_HOST || 'localhost',
  port: parseInt(process.env.POSTGRES_PORT || '5437'),
  username: process.env.POSTGRES_USER || 'spec',
  password: process.env.POSTGRES_PASSWORD || 'spec',
  database: process.env.POSTGRES_DB || 'spec',
  entities: [join(__dirname, '**', '*.entity{.ts,.js}')],
  migrations: [join(__dirname, 'migrations', '*{.ts,.js}')],
  synchronize: false, // NEVER true - always use migrations
  logging:
    process.env.NODE_ENV === 'development'
      ? ['query', 'error', 'warn', 'migration']
      : ['error', 'warn', 'migration'],
  migrationsTableName: 'typeorm_migrations',
  migrationsRun: false, // Run manually or via app startup
});
