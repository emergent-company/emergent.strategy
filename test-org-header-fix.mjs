#!/usr/bin/env node
/**
 * Test script to verify that Template Packs and Type Registry APIs
 * no longer require x-org-id header (only x-project-id)
 */

import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
config({ path: resolve(__dirname, '.env') });
config({ path: resolve(__dirname, '.env.test.local') });

const SERVER_URL = process.env.SERVER_URL || `http://localhost:${process.env.SERVER_PORT || 3002}`;

// Test user token
const TEST_TOKEN = process.env.E2E_TEST_USER_TOKEN;
const TEST_PROJECT_ID = process.env.E2E_TEST_PROJECT_ID;

if (!TEST_TOKEN) {
  console.error('❌ E2E_TEST_USER_TOKEN not found in environment');
  process.exit(1);
}

if (!TEST_PROJECT_ID) {
  console.error('❌ E2E_TEST_PROJECT_ID not found in environment');
  process.exit(1);
}

console.log('🧪 Testing org-header-removal fix...\n');
console.log('Server:', SERVER_URL);
console.log('Project ID:', TEST_PROJECT_ID);
console.log('Token:', TEST_TOKEN.substring(0, 20) + '...\n');

async function testAPI(endpoint, description) {
  console.log(`Testing: ${description}`);
  console.log(`  Endpoint: ${endpoint}`);
  
  try {
    const response = await fetch(`${SERVER_URL}${endpoint}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${TEST_TOKEN}`,
        'x-project-id': TEST_PROJECT_ID,
        // Intentionally NOT sending x-org-id header
      }
    });

    const status = response.status;
    const statusText = response.statusText;
    
    if (status === 200) {
      console.log(`  ✅ SUCCESS - Status: ${status}`);
      const data = await response.json();
      console.log(`  Response keys: ${Object.keys(data).join(', ')}`);
      return true;
    } else {
      console.log(`  ❌ FAILED - Status: ${status} ${statusText}`);
      const text = await response.text();
      console.log(`  Error: ${text.substring(0, 200)}`);
      return false;
    }
  } catch (error) {
    console.log(`  ❌ ERROR: ${error.message}`);
    return false;
  }
}

async function runTests() {
  const results = [];
  
  // Test 1: Template Packs - Get compiled object types
  console.log('\n━━━ Test 1: Template Packs API ━━━');
  results.push(await testAPI(
    `/api/template-packs/compiled-types?projectId=${TEST_PROJECT_ID}`,
    'Get compiled object types (was causing console error)'
  ));
  
  console.log('\n━━━ Test 2: Type Registry API ━━━');
  // Test 2: Type Registry - Get project types
  results.push(await testAPI(
    `/api/types/projects/${TEST_PROJECT_ID}`,
    'Get project types (was causing console error)'
  ));
  
  // Test 3: Extraction Jobs API (already fixed earlier)
  console.log('\n━━━ Test 3: Extraction Jobs API (baseline) ━━━');
  results.push(await testAPI(
    `/admin/extraction-jobs/projects/${TEST_PROJECT_ID}?status=pending&limit=1`,
    'Get extraction jobs (fixed earlier - should still work)'
  ));
  
  // Summary
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('SUMMARY');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  const passed = results.filter(r => r).length;
  const total = results.length;
  console.log(`Tests passed: ${passed}/${total}`);
  
  if (passed === total) {
    console.log('\n✅ All APIs work without x-org-id header!');
    console.log('The console errors on /extraction page should be gone.\n');
    process.exit(0);
  } else {
    console.log('\n❌ Some tests failed');
    process.exit(1);
  }
}

runTests();
