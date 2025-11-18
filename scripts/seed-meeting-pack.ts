#!/usr/bin/env tsx
import { Client, Pool } from 'pg';
import { config } from 'dotenv';
import {
  validateEnvVars,
  DB_REQUIREMENTS,
  getDbConfig,
} from './lib/env-validator.js';

// Load environment variables
config();

const PACK_ID = '9f8d7e6c-5b4a-3c2d-1e0f-9a8b7c6d5e4f';

// Import the schemas directly - simplified for script execution
async function seedMeetingDecisionPack(): Promise<void> {
  // Validate required environment variables with helpful error messages
  validateEnvVars(DB_REQUIREMENTS);

  // Use validated env vars with no fallbacks
  const dbConfig = getDbConfig();
  const pool = new Pool({
    ...dbConfig,
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
  });

  const { seedMeetingDecisionPack: seedFn } = await import(
    '../apps/server/src/modules/template-packs/seeds/meeting-decision-pack.seed.js'
  );
  await seedFn(pool);
  await pool.end();
}

async function createDbClient() {
  // Validate required environment variables with helpful error messages
  validateEnvVars(DB_REQUIREMENTS);

  // Use validated env vars with no fallbacks
  const dbConfig = getDbConfig();
  const client = new Client({
    ...dbConfig,
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
  });

  await client.connect();
  return client;
}

async function main() {
  try {
    console.log('🌱 Seeding Meeting & Decision Management Template Pack...\n');
    await seedMeetingDecisionPack();
    console.log('\n✅ Seed completed successfully');
  } catch (error) {
    console.error('\n❌ Seed failed:', error);
    process.exit(1);
  }
}

main();
