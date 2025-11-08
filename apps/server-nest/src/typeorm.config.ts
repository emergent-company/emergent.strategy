/**
 * TypeORM DataSource Configuration
 * ================================
 * Used by TypeORM CLI for migrations and by the application for database connection
 * 
 * Usage:
 *   npm run migration:generate src/migrations/MigrationName
 *   npm run migration:run
 *   npm run migration:revert
 */

import { DataSource } from 'typeorm';
import { config } from 'dotenv';
import { join } from 'path';

// Load environment variables
config({ path: join(__dirname, '../../.env') });
config({ path: join(__dirname, '.env') });

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
  logging: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn', 'migration'] : ['error', 'warn', 'migration'],
  migrationsTableName: 'typeorm_migrations',
  migrationsRun: false, // Run manually or via app startup
});
