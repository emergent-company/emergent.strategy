#!/usr/bin/env tsx
import { Pool } from 'pg';

const PACK_ID = '9f8d7e6c-5b4a-3c2d-1e0f-9a8b7c6d5e4f';

// Import the schemas directly - simplified for script execution
async function seedMeetingDecisionPack(pool: Pool): Promise<void> {
    const { seedMeetingDecisionPack: seedFn } = await import('../apps/server-nest/src/modules/template-packs/seeds/meeting-decision-pack.seed.js');
    return seedFn(pool);
}

const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    database: process.env.DB_NAME || 'spec',
    user: process.env.DB_USER || 'mcj',
    password: process.env.DB_PASSWORD || '',
});

async function main() {
    try {
        console.log('🌱 Seeding Meeting & Decision Management Template Pack...\n');
        await seedMeetingDecisionPack(pool);
        console.log('\n✅ Seed completed successfully');
    } catch (error) {
        console.error('\n❌ Seed failed:', error);
        process.exit(1);
    } finally {
        await pool.end();
    }
}

main();
