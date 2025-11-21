#!/usr/bin/env node
/**
 * Quick Test: Graph Search with Real Database
 *
 * Tests the newly implemented graph search repository to verify:
 * 1. Lexical search returns real objects (not fake doc-lex-* stubs)
 * 2. Objects have proper names and descriptions
 * 3. Scores are reasonable
 *
 * Usage:
 *   node scripts/test-graph-search-fix.mjs
 */

import 'dotenv/config';
import fetch from 'node-fetch';

const API_BASE = process.env.API_BASE || 'http://localhost:3002';

async function testGraphSearch() {
  console.log('🔍 Testing Graph Search with Real Database\n');

  const testQueries = ['spec', 'decision', 'meeting', 'authentication'];

  for (const query of testQueries) {
    console.log(`\n📝 Testing query: "${query}"`);
    console.log('─'.repeat(60));

    try {
      const response = await fetch(`${API_BASE}/graph/search`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query,
          limit: 5,
        }),
      });

      if (!response.ok) {
        console.error(`   ❌ Request failed: ${response.statusText}`);
        continue;
      }

      const data = await response.json();

      if (data.items.length === 0) {
        console.log(`   ℹ️  No results found for "${query}"`);
        continue;
      }

      console.log(`   ✅ Found ${data.items.length} results\n`);

      for (const item of data.items) {
        const name =
          item.fields?.name ||
          item.fields?.title ||
          item.fields?.key ||
          'Unknown';
        const description = item.fields?.description || 'No description';
        const type = item.fields?.type || 'Unknown';
        const score = item.score?.toFixed(4) || '0.00';

        console.log(`   ${item.rank}. ${name}`);
        console.log(`      Type: ${type}`);
        console.log(`      Score: ${score}`);
        console.log(
          `      Description: ${description.substring(0, 80)}${
            description.length > 80 ? '...' : ''
          }`
        );
        console.log('');
      }

      // Validate results
      const hasRealData = data.items.every((item) => {
        const hasProperFields = item.fields && typeof item.fields === 'object';
        const notStubKey =
          !item.object_id.startsWith('doc-lex-') &&
          !item.object_id.startsWith('doc-vec-');
        return hasProperFields && notStubKey;
      });

      if (hasRealData) {
        console.log('   ✅ All results have real data (not stubs)');
      } else {
        console.log('   ❌ Some results are still stubs!');
      }
    } catch (error) {
      console.error(`   ❌ Error: ${error.message}`);
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('✅ Test complete');
}

testGraphSearch();
