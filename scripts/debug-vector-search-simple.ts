#!/usr/bin/env tsx
/**
 * Debug script to isolate the vector search + WHERE clause issue
 * Uses database vectors to avoid API quota issues
 */

import { Pool } from 'pg';

const dbConfig = {
  host: process.env.POSTGRES_HOST || 'localhost',
  port: parseInt(process.env.POSTGRES_PORT || '5432'),
  user: process.env.POSTGRES_USER || 'specserver',
  password: process.env.POSTGRES_PASSWORD || 'password',
  database: process.env.POSTGRES_DB || 'specserver',
};

interface TestResult {
  name: string;
  success: boolean;
  rowCount: number;
  error?: string;
  queryPlan?: string[];
}

async function main() {
  const pool = new Pool(dbConfig);
  const results: TestResult[] = [];

  try {
    console.log('🔍 Starting vector search debugging (using DB vectors)...\n');

    // Get two database vectors for testing
    console.log('1️⃣  Fetching database vectors for testing...');
    const vectorsResult = await pool.query(`
      SELECT id, type, embedding_v2::text as vector_text, 
             array_length(embedding_v2::real[], 1) as dims
      FROM kb.graph_objects
      WHERE embedding_v2 IS NOT NULL
      LIMIT 2
    `);

    if (vectorsResult.rows.length < 2) {
      throw new Error('Need at least 2 objects with embeddings in database');
    }

    const [obj1, _obj2] = vectorsResult.rows;
    const vector1 = JSON.parse(obj1.vector_text);

    console.log(`   ✓ Vector 1: ${obj1.id} (${obj1.type}) - ${obj1.dims} dims`);
    console.log(
      `   ✓ Vector literal length: ${obj1.vector_text.length} chars\n`
    );

    // Test different formatting strategies
    const formatters = {
      'json-string': (v: number[]) => JSON.stringify(v),
      'bracket-literal': (v: number[]) => `[${v.join(',')}]`,
      'rounded-8': (v: number[]) =>
        `[${v.map((n) => Math.round(n * 100000000) / 100000000).join(',')}]`,
      'rounded-4': (v: number[]) =>
        `[${v.map((n) => Math.round(n * 10000) / 10000).join(',')}]`,
    };

    console.log('2️⃣  Testing query patterns with vector 1...\n');

    for (const [formatName, formatter] of Object.entries(formatters)) {
      const vectorLiteral = formatter(vector1);

      // Test A: No WHERE filter (baseline)
      try {
        const result = await pool.query(
          `SELECT id, (embedding_v2 <=> $1::vector(768)) as distance
           FROM kb.graph_objects
           WHERE embedding_v2 IS NOT NULL
           ORDER BY embedding_v2 <=> $1::vector(768)
           LIMIT 5`,
          [vectorLiteral]
        );
        results.push({
          name: `Format: ${formatName} | No filter`,
          success: true,
          rowCount: result.rowCount || 0,
        });
      } catch (error: any) {
        results.push({
          name: `Format: ${formatName} | No filter`,
          success: false,
          rowCount: 0,
          error: error.message,
        });
      }

      // Test B: WITH type filter
      try {
        const result = await pool.query(
          `SELECT id, (embedding_v2 <=> $1::vector(768)) as distance
           FROM kb.graph_objects
           WHERE embedding_v2 IS NOT NULL AND type = $2
           ORDER BY embedding_v2 <=> $1::vector(768)
           LIMIT 5`,
          [vectorLiteral, obj1.type]
        );
        results.push({
          name: `Format: ${formatName} | type='${obj1.type}'`,
          success: true,
          rowCount: result.rowCount || 0,
        });
      } catch (error: any) {
        results.push({
          name: `Format: ${formatName} | type='${obj1.type}'`,
          success: false,
          rowCount: 0,
          error: error.message,
        });
      }

      // Test C: Type filter BEFORE embedding check (different filter order)
      try {
        const result = await pool.query(
          `SELECT id, (embedding_v2 <=> $1::vector(768)) as distance
           FROM kb.graph_objects
           WHERE type = $2 AND embedding_v2 IS NOT NULL
           ORDER BY embedding_v2 <=> $1::vector(768)
           LIMIT 5`,
          [vectorLiteral, obj1.type]
        );
        results.push({
          name: `Format: ${formatName} | type FIRST`,
          success: true,
          rowCount: result.rowCount || 0,
        });
      } catch (error: any) {
        results.push({
          name: `Format: ${formatName} | type FIRST`,
          success: false,
          rowCount: 0,
          error: error.message,
        });
      }
    }

    // Get query execution plans
    console.log('3️⃣  Analyzing query execution plans...\n');

    const vectorLiteral = formatters['rounded-8'](vector1);

    const explainNoFilter = await pool.query(
      `EXPLAIN (ANALYZE, BUFFERS, VERBOSE)
       SELECT id, (embedding_v2 <=> $1::vector(768)) as distance
       FROM kb.graph_objects
       WHERE embedding_v2 IS NOT NULL
       ORDER BY embedding_v2 <=> $1::vector(768)
       LIMIT 5`,
      [vectorLiteral]
    );

    const explainWithFilter = await pool.query(
      `EXPLAIN (ANALYZE, BUFFERS, VERBOSE)
       SELECT id, (embedding_v2 <=> $1::vector(768)) as distance
       FROM kb.graph_objects
       WHERE embedding_v2 IS NOT NULL AND type = $2
       ORDER BY embedding_v2 <=> $1::vector(768)
       LIMIT 5`,
      [vectorLiteral, obj1.type]
    );

    // Check indexes
    console.log('4️⃣  Checking database indexes...\n');
    const indexResult = await pool.query(`
      SELECT indexname, indexdef
      FROM pg_indexes
      WHERE schemaname = 'kb' AND tablename = 'graph_objects'
      AND (indexdef LIKE '%embedding%' OR indexdef LIKE '%type%')
    `);

    console.log('   Relevant indexes:');
    indexResult.rows.forEach((row) => {
      console.log(`   - ${row.indexname}`);
      console.log(`     ${row.indexdef}\n`);
    });

    // Test with different object types
    console.log('5️⃣  Testing across different object types...\n');

    const typesResult = await pool.query(`
      SELECT type, COUNT(*) as count
      FROM kb.graph_objects
      WHERE embedding_v2 IS NOT NULL
      GROUP BY type
      ORDER BY count DESC
      LIMIT 5
    `);

    console.log('   Top 5 types with embeddings:');
    typesResult.rows.forEach((row) => {
      console.log(`   - ${row.type}: ${row.count} objects`);
    });
    console.log();

    for (const { type } of typesResult.rows) {
      try {
        const result = await pool.query(
          `SELECT id, (embedding_v2 <=> $1::vector(768)) as distance
           FROM kb.graph_objects
           WHERE embedding_v2 IS NOT NULL AND type = $2
           ORDER BY embedding_v2 <=> $1::vector(768)
           LIMIT 5`,
          [vectorLiteral, type]
        );
        results.push({
          name: `Type test | type='${type}'`,
          success: true,
          rowCount: result.rowCount || 0,
        });
      } catch (error: any) {
        results.push({
          name: `Type test | type='${type}'`,
          success: false,
          rowCount: 0,
          error: error.message,
        });
      }
    }

    // Print all results
    console.log('\n' + '='.repeat(80));
    console.log('📊 TEST RESULTS SUMMARY');
    console.log('='.repeat(80) + '\n');

    const grouped = results.reduce((acc, r) => {
      const cat = r.name.split(' | ')[0];
      if (!acc[cat]) acc[cat] = [];
      acc[cat].push(r);
      return acc;
    }, {} as Record<string, TestResult[]>);

    for (const [category, items] of Object.entries(grouped)) {
      console.log(`\n${category}:`);
      items.forEach((r) => {
        const status = r.success ? (r.rowCount > 0 ? '✅' : '⚠️ ') : '❌';
        const info = r.success ? `${r.rowCount} rows` : `ERROR: ${r.error}`;
        console.log(`  ${status} ${r.name.split(' | ')[1]}: ${info}`);
      });
    }

    // Print query plans
    console.log('\n' + '='.repeat(80));
    console.log('📈 QUERY EXECUTION PLANS COMPARISON');
    console.log('='.repeat(80) + '\n');

    console.log('WITHOUT type filter:');
    console.log('-------------------');
    explainNoFilter.rows.forEach((row) => console.log(row['QUERY PLAN']));

    console.log('\n\nWITH type filter:');
    console.log('----------------');
    explainWithFilter.rows.forEach((row) => console.log(row['QUERY PLAN']));

    // Analysis
    console.log('\n' + '='.repeat(80));
    console.log('🔬 ANALYSIS');
    console.log('='.repeat(80) + '\n');

    const noFilterTests = results.filter((r) => r.name.includes('No filter'));
    const withFilterTests = results.filter(
      (r) => r.name.includes("type='") && !r.name.includes('Type test')
    );

    const noFilterSuccess = noFilterTests.filter((r) => r.rowCount > 0).length;
    const withFilterSuccess = withFilterTests.filter(
      (r) => r.rowCount > 0
    ).length;

    console.log(
      `Tests without type filter: ${noFilterSuccess}/${noFilterTests.length} returned rows`
    );
    console.log(
      `Tests WITH type filter: ${withFilterSuccess}/${withFilterTests.length} returned rows`
    );

    if (noFilterSuccess > 0 && withFilterSuccess === 0) {
      console.log(
        '\n🚨 ISSUE CONFIRMED: Type filter causes all queries to return 0 rows'
      );
      console.log(
        '   Even with database vectors (not Vertex AI), the problem persists.'
      );
      console.log(
        '   This points to a PostgreSQL/pgvector query optimization issue.'
      );
    } else if (withFilterSuccess > 0) {
      console.log('\n✅ Type filter works with database vectors!');
      console.log(
        '   The issue may be specific to Vertex AI vector characteristics.'
      );
    }

    // Check for common patterns in failing queries
    const failingFormats = withFilterTests
      .filter((r) => r.rowCount === 0)
      .map((r) => r.name);
    if (failingFormats.length > 0) {
      console.log('\n   Failing formats:');
      failingFormats.forEach((f) => console.log(`   - ${f}`));
    }
  } catch (error) {
    console.error('\n❌ Script failed:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

main().catch(console.error);
