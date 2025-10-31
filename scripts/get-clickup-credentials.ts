#!/usr/bin/env tsx
/**
 * Get ClickUp Credentials from Database
 * 
 * This script fetches your ClickUp API credentials from the database
 * so you can use them with the debug script.
 * 
 * Usage:
 *   npx tsx scripts/get-clickup-credentials.ts [integration_name]
 */

import { Client } from 'pg';
import { validateEnvVars, DB_REQUIREMENTS, getDbConfig } from './lib/env-validator.js';

async function main() {
    const integrationName = process.argv[2] || 'clickup';

    // Validate required environment variables with helpful error messages
    validateEnvVars(DB_REQUIREMENTS);

    // Use validated env vars with no fallbacks
    const client = new Client(getDbConfig());

    try {
        await client.connect();
        console.log('✓ Connected to database\n');

        // Query for ClickUp integration
        const result = await client.query(
            `SELECT 
                id, 
                name, 
                enabled,
                org_id,
                project_id,
                encode(settings_encrypted, 'escape') as settings_raw
             FROM kb.integrations 
             WHERE name = $1
             ORDER BY created_at DESC
             LIMIT 1`,
            [integrationName]
        );

        if (result.rows.length === 0) {
            console.error(`❌ No ${integrationName} integration found in database`);
            console.log('\nCreate one first in the admin UI at /admin/integrations');
            process.exit(1);
        }

        const integration = result.rows[0];
        console.log('Found integration:');
        console.log(`  Name: ${integration.name}`);
        console.log(`  ID: ${integration.id}`);
        console.log(`  Enabled: ${integration.enabled}`);
        console.log(`  Org ID: ${integration.org_id}`);
        console.log(`  Project ID: ${integration.project_id}`);

        // Try to parse settings
        let settings;
        try {
            // Settings are stored as JSON string in bytea
            const settingsStr = integration.settings_raw;
            settings = JSON.parse(settingsStr);
        } catch (error) {
            console.error('\n❌ Failed to parse settings. They may be encrypted.');
            console.error('   Set ENCRYPTION_KEY environment variable if encryption is enabled.');
            process.exit(1);
        }

        console.log('\n📋 Settings:');
        console.log(JSON.stringify(settings, null, 2));

        if (settings.api_token && settings.workspace_id) {
            console.log('\n✅ Credentials found! Run the debug script with:');
            console.log('\n  npx tsx scripts/debug-clickup-api.ts \\');
            console.log(`    "${settings.api_token}" \\`);
            console.log(`    "${settings.workspace_id}"`);
            console.log('\n  # Or with archived items:');
            console.log(`  npx tsx scripts/debug-clickup-api.ts "${settings.api_token}" "${settings.workspace_id}" true`);
        } else {
            console.error('\n❌ Missing api_token or workspace_id in settings');
        }

    } catch (error: any) {
        console.error('\n❌ Error:', error.message);
        if (error.code === 'ECONNREFUSED') {
            console.error('\nDatabase connection refused. Is PostgreSQL running?');
            console.error('Try: docker compose up -d postgres');
        }
        process.exit(1);
    } finally {
        await client.end();
    }
}

main();
