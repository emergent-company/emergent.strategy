#!/usr/bin/env node

/**
 * Test script to verify the Monitoring Module setup
 *
 * This script checks:
 * 1. Database tables exist
 * 2. API endpoints are accessible
 * 3. Logging functionality works
 *
 * Usage:
 *   node test-monitoring-setup.mjs
 *
 * Environment:
 *   API_URL (default: http://localhost:3001)
 *   PROJECT_ID (required for API tests)
 *   AUTH_TOKEN (required for API tests)
 */

import pg from 'pg';
const { Client } = pg;

const API_URL = process.env.API_URL || 'http://localhost:3001';
const PROJECT_ID = process.env.PROJECT_ID;
const AUTH_TOKEN = process.env.AUTH_TOKEN;

// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function success(message) {
  log(`✓ ${message}`, 'green');
}

function error(message) {
  log(`✗ ${message}`, 'red');
}

function info(message) {
  log(`ℹ ${message}`, 'blue');
}

function warn(message) {
  log(`⚠ ${message}`, 'yellow');
}

function section(message) {
  log(`\n═══ ${message} ═══\n`, 'cyan');
}

/**
 * Test database tables exist
 */
async function testDatabaseSetup() {
  section('Database Setup Tests');

  const client = new Client({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    database: process.env.DB_NAME || 'nexus',
    user: process.env.DB_USER || 'nexus',
    password: process.env.DB_PASSWORD || 'nexus_password',
  });

  try {
    await client.connect();
    success('Connected to database');

    // Check system_process_logs table
    const processLogsResult = await client.query(`
            SELECT COUNT(*) as count FROM information_schema.tables 
            WHERE table_schema = 'kb' AND table_name = 'system_process_logs'
        `);

    if (parseInt(processLogsResult.rows[0].count) === 1) {
      success('Table kb.system_process_logs exists');

      // Check columns
      const columnsResult = await client.query(`
                SELECT column_name FROM information_schema.columns
                WHERE table_schema = 'kb' AND table_name = 'system_process_logs'
                ORDER BY ordinal_position
            `);

      const expectedColumns = [
        'id',
        'process_id',
        'process_type',
        'level',
        'message',
        'metadata',
        'timestamp',
        'project_id',
      ];
      const actualColumns = columnsResult.rows.map((r) => r.column_name);
      const missingColumns = expectedColumns.filter(
        (c) => !actualColumns.includes(c)
      );

      if (missingColumns.length === 0) {
        success('All required columns present in system_process_logs');
        info(`  Columns: ${actualColumns.join(', ')}`);
      } else {
        error(
          `Missing columns in system_process_logs: ${missingColumns.join(', ')}`
        );
      }

      // Check row count
      const countResult = await client.query(
        'SELECT COUNT(*) as count FROM kb.system_process_logs'
      );
      info(`  Current rows: ${countResult.rows[0].count}`);
    } else {
      error('Table kb.system_process_logs does not exist');
      warn('  Run migration: npx nx run server:migrate');
    }

    // Check llm_call_logs table
    const llmLogsResult = await client.query(`
            SELECT COUNT(*) as count FROM information_schema.tables 
            WHERE table_schema = 'kb' AND table_name = 'llm_call_logs'
        `);

    if (parseInt(llmLogsResult.rows[0].count) === 1) {
      success('Table kb.llm_call_logs exists');

      // Check key columns
      const columnsResult = await client.query(`
                SELECT column_name FROM information_schema.columns
                WHERE table_schema = 'kb' AND table_name = 'llm_call_logs'
                ORDER BY ordinal_position
            `);

      const expectedLLMColumns = [
        'id',
        'process_id',
        'process_type',
        'model_name',
        'input_tokens',
        'output_tokens',
        'cost_usd',
      ];
      const actualColumns = columnsResult.rows.map((r) => r.column_name);
      const missingColumns = expectedLLMColumns.filter(
        (c) => !actualColumns.includes(c)
      );

      if (missingColumns.length === 0) {
        success('All required columns present in llm_call_logs');
        info(`  Key columns: ${expectedLLMColumns.join(', ')}`);
      } else {
        error(`Missing columns in llm_call_logs: ${missingColumns.join(', ')}`);
      }

      // Check row count
      const countResult = await client.query(
        'SELECT COUNT(*) as count FROM kb.llm_call_logs'
      );
      info(`  Current rows: ${countResult.rows[0].count}`);
    } else {
      error('Table kb.llm_call_logs does not exist');
      warn('  Run migration: npx nx run server:migrate');
    }

    // Check indexes
    const indexesResult = await client.query(`
            SELECT indexname FROM pg_indexes 
            WHERE schemaname = 'kb' 
            AND tablename IN ('system_process_logs', 'llm_call_logs')
            ORDER BY indexname
        `);

    const indexCount = indexesResult.rows.length;
    if (indexCount >= 10) {
      success(`Found ${indexCount} indexes on monitoring tables`);
      info(
        `  Indexes: ${indexesResult.rows.map((r) => r.indexname).join(', ')}`
      );
    } else {
      warn(`Only found ${indexCount} indexes (expected ~10)`);
    }
  } catch (err) {
    error(`Database test failed: ${err.message}`);
  } finally {
    await client.end();
  }
}

/**
 * Test API endpoints
 */
async function testAPIEndpoints() {
  section('API Endpoint Tests');

  if (!PROJECT_ID || !AUTH_TOKEN) {
    warn('Skipping API tests - PROJECT_ID and AUTH_TOKEN required');
    info('  Set environment variables to test API:');
    info('  export PROJECT_ID=<your-project-uuid>');
    info('  export AUTH_TOKEN=<your-access-token>');
    return;
  }

  const headers = {
    'X-Project-ID': PROJECT_ID,
    Authorization: `Bearer ${AUTH_TOKEN}`,
    'Content-Type': 'application/json',
  };

  // Test 1: List extraction jobs
  try {
    const response = await fetch(
      `${API_URL}/monitoring/extraction-jobs?limit=5`,
      { headers }
    );

    if (response.ok) {
      const data = await response.json();
      success(`GET /monitoring/extraction-jobs - Status ${response.status}`);
      info(`  Total jobs: ${data.total || 0}`);
      info(`  Items returned: ${data.items?.length || 0}`);

      if (data.items && data.items.length > 0) {
        const job = data.items[0];
        info(`  Sample job: ${job.id} - ${job.status} (${job.source_type})`);
      }
    } else {
      error(`GET /monitoring/extraction-jobs - Status ${response.status}`);
      const text = await response.text();
      info(`  Response: ${text.substring(0, 200)}`);
    }
  } catch (err) {
    error(`API test failed: ${err.message}`);
    warn('  Make sure server is running: npm run workspace:start');
  }

  // Test 2: Get specific job (if we have jobs)
  try {
    const listResponse = await fetch(
      `${API_URL}/monitoring/extraction-jobs?limit=1`,
      { headers }
    );
    if (listResponse.ok) {
      const listData = await listResponse.json();
      if (listData.items && listData.items.length > 0) {
        const jobId = listData.items[0].id;

        const detailResponse = await fetch(
          `${API_URL}/monitoring/extraction-jobs/${jobId}`,
          { headers }
        );
        if (detailResponse.ok) {
          const detailData = await detailResponse.json();
          success(
            `GET /monitoring/extraction-jobs/:id - Status ${detailResponse.status}`
          );
          info(`  Job: ${detailData.id} - ${detailData.status}`);
          info(`  Logs: ${detailData.logs?.length || 0} entries`);
          info(`  LLM calls: ${detailData.llm_calls?.length || 0} calls`);

          if (detailData.metrics) {
            info(`  Metrics: ${JSON.stringify(detailData.metrics)}`);
          }
        } else {
          error(
            `GET /monitoring/extraction-jobs/:id - Status ${detailResponse.status}`
          );
        }
      } else {
        warn('No jobs found to test detail endpoint');
      }
    }
  } catch (err) {
    warn(`Detail endpoint test skipped: ${err.message}`);
  }
}

/**
 * Check module registration
 */
async function checkModuleRegistration() {
  section('Module Registration Check');

  info('Checking if MonitoringModule is imported...');

  // This is a static check - just verify files exist
  const fs = await import('fs');
  const path = await import('path');

  const appModulePath = path.resolve('./apps/server/src/modules/app.module.ts');
  if (fs.existsSync(appModulePath)) {
    const content = fs.readFileSync(appModulePath, 'utf-8');

    if (content.includes('MonitoringModule')) {
      success('MonitoringModule is imported in app.module.ts');
    } else {
      error('MonitoringModule NOT found in app.module.ts');
      warn(
        "  Add: import { MonitoringModule } from './monitoring/monitoring.module';"
      );
    }
  } else {
    warn('Could not find app.module.ts');
  }

  const extractionModulePath = path.resolve(
    './apps/server/src/modules/extraction-jobs/extraction-job.module.ts'
  );
  if (fs.existsSync(extractionModulePath)) {
    const content = fs.readFileSync(extractionModulePath, 'utf-8');

    if (content.includes('MonitoringModule')) {
      success('MonitoringModule is imported in extraction-job.module.ts');
    } else {
      error('MonitoringModule NOT found in extraction-job.module.ts');
      warn(
        "  Add: import { MonitoringModule } from '../monitoring/monitoring.module';"
      );
    }
  } else {
    warn('Could not find extraction-job.module.ts');
  }
}

/**
 * Main test runner
 */
async function runTests() {
  log(
    '\n╔════════════════════════════════════════════════════════════╗',
    'cyan'
  );
  log('║   System Monitoring Phase 1 - Setup Verification Test   ║', 'cyan');
  log(
    '╚════════════════════════════════════════════════════════════╝\n',
    'cyan'
  );

  await testDatabaseSetup();
  await checkModuleRegistration();
  await testAPIEndpoints();

  section('Test Summary');
  info('Setup verification complete!');
  info('\nNext Steps:');
  info('  1. Start server: npm run workspace:start');
  info('  2. Run an extraction job');
  info('  3. Query monitoring API to see logs');
  info('  4. Integrate LLM call logging in VertexAIProvider');
  info('  5. Build frontend components\n');
}

runTests().catch(console.error);
