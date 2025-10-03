#!/usr/bin/env tsx

/**
 * Apply Phase 1 Dynamic Type System Migration
 * 
 * This script applies the database migration for the dynamic type discovery system.
 * It includes template packs, project type registry, extraction jobs, and type suggestions.
 * 
 * Usage:
 *   npm run migrate:phase1
 *   # or directly:
 *   npx tsx scripts/migrate-phase1.ts
 */

import { Client } from 'pg';
import * as fs from 'fs';
import * as path from 'path';

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/facts_hub';

async function applyMigration() {
    const client = new Client({ connectionString: DATABASE_URL });

    try {
        await client.connect();
        console.log('✓ Connected to database');

        // Read migration file
        const migrationPath = path.join(__dirname, '../src/migrations/0001_dynamic_type_system_phase1.sql');
        const migrationSql = fs.readFileSync(migrationPath, 'utf-8');

        console.log('📝 Applying Phase 1 migration...');
        console.log('   Creating tables:');
        console.log('   - kb.graph_template_packs');
        console.log('   - kb.project_template_packs');
        console.log('   - kb.project_object_type_registry');
        console.log('   - kb.object_extraction_jobs');
        console.log('   - kb.object_type_suggestions');
        console.log('   Enhancing: kb.graph_objects (provenance columns)');
        console.log('');

        await client.query(migrationSql);

        console.log('✓ Migration applied successfully!');
        console.log('');

        // Verify tables exist
        const result = await client.query(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'kb' 
            AND table_name IN (
                'graph_template_packs',
                'project_template_packs',
                'project_object_type_registry',
                'object_extraction_jobs',
                'object_type_suggestions'
            )
            ORDER BY table_name
        `);

        console.log('📊 Verification:');
        console.log(`   Created ${result.rows.length}/5 tables:`);
        result.rows.forEach(row => {
            console.log(`   ✓ kb.${row.table_name}`);
        });

        if (result.rows.length !== 5) {
            console.warn('   ⚠️  Warning: Not all tables were created');
        }

        console.log('');
        console.log('🎉 Phase 1 migration complete!');
        console.log('');
        console.log('Next steps:');
        console.log('  1. Restart the NestJS server: npm run start:dev');
        console.log('  2. Load TOGAF template: npm run seed:togaf');
        console.log('  3. Test API endpoints (see PHASE1_IMPLEMENTATION.md)');

    } catch (error) {
        console.error('❌ Migration failed:', error);
        process.exit(1);
    } finally {
        await client.end();
    }
}

applyMigration();
