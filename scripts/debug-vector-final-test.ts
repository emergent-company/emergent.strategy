#!/usr/bin/env tsx
/**
 * Final focused test: Compare DB vector characteristics with format variants
 * to understand why certain combinations fail
 */

import { Pool } from 'pg';

const dbConfig = {
  host: process.env.POSTGRES_HOST || 'localhost',
  port: parseInt(process.env.POSTGRES_PORT || '5432'),
  user: process.env.POSTGRES_USER || 'specserver',
  password: process.env.POSTGRES_PASSWORD || 'password',
  database: process.env.POSTGRES_DB || 'specserver',
};

async function main() {
  const pool = new Pool(dbConfig);

  try {
    console.log('🔍 Comparing vector characteristics...\n');

    // Get a Person object with embedding
    const personResult = await pool.query(`
      SELECT id, type, key, embedding_v2::text as vector_text,
             array_length(embedding_v2::real[], 1) as dims
      FROM kb.graph_objects
      WHERE type = 'Person' AND embedding_v2 IS NOT NULL
      LIMIT 1
    `);

    if (personResult.rows.length === 0) {
      throw new Error('No Person objects with embeddings found');
    }

    const person = personResult.rows[0];
    const dbVector = JSON.parse(person.vector_text);

    console.log(`Found Person: ${person.key} (${person.id})`);
    console.log(`Vector dimensions: ${person.dims}`);
    console.log(`Vector literal length: ${person.vector_text.length} chars`);
    console.log(`First 5 values: [${dbVector.slice(0, 5).join(', ')}]`);
    console.log(`Last 5 values: [${dbVector.slice(-5).join(', ')}]\n`);

    // Test 1: Use THIS EXACT vector to search for Person type
    console.log('Test 1: Using exact DB vector to search for Persons...');
    const vectorLiteral = `[${dbVector.join(',')}]`;

    const result1 = await pool.query(
      `SELECT id, key, (embedding_v2 <=> $1::vector(768)) as distance
       FROM kb.graph_objects
       WHERE embedding_v2 IS NOT NULL AND type = 'Person'
       ORDER BY embedding_v2 <=> $1::vector(768)
       LIMIT 5`,
      [vectorLiteral]
    );

    console.log(`   Result: ${result1.rows.length} rows`);
    if (result1.rows.length > 0) {
      console.log(
        `   Top result: ${
          result1.rows[0].key || result1.rows[0].id
        } (distance: ${result1.rows[0].distance})`
      );
    }

    // Test 2: Try with explicit casting in WHERE clause
    console.log('\nTest 2: With explicit vector cast in WHERE clause...');
    const result2 = await pool.query(
      `SELECT id, key, (embedding_v2 <=> $1::vector(768)) as distance
       FROM kb.graph_objects
       WHERE embedding_v2::vector(768) IS NOT NULL AND type = $2
       ORDER BY embedding_v2 <=> $1::vector(768)
       LIMIT 5`,
      [vectorLiteral, 'Person']
    );

    console.log(`   Result: ${result2.rows.length} rows`);

    // Test 3: Try without vector cast
    console.log('\nTest 3: Without explicit vector dimension cast...');
    const result3 = await pool.query(
      `SELECT id, key, (embedding_v2 <=> $1) as distance
       FROM kb.graph_objects
       WHERE embedding_v2 IS NOT NULL AND type = $2
       ORDER BY embedding_v2 <=> $1
       LIMIT 5`,
      [vectorLiteral, 'Person']
    );

    console.log(`   Result: ${result1.rows.length} rows`);
    if (result1.rows.length > 0) {
      console.log(
        `   Top result: ${result1.rows[0].name} (distance: ${result1.rows[0].distance})`
      );
    }

    // Test 2: Try with explicit casting in WHERE clause
    console.log('\nTest 2: With explicit vector cast in WHERE clause...');
    const result2 = await pool.query(
      `SELECT id, name, (embedding_v2 <=> $1::vector(768)) as distance
       FROM kb.graph_objects
       WHERE embedding_v2::vector(768) IS NOT NULL AND type = $2
       ORDER BY embedding_v2 <=> $1::vector(768)
       LIMIT 5`,
      [vectorLiteral, 'Person']
    );

    console.log(`   Result: ${result2.rows.length} rows`);

    // Test 3: Try without vector cast
    console.log('\nTest 3: Without explicit vector dimension cast...');
    const result3 = await pool.query(
      `SELECT id, name, (embedding_v2 <=> $1) as distance
       FROM kb.graph_objects
       WHERE embedding_v2 IS NOT NULL AND type = $2
       ORDER BY embedding_v2 <=> $1
       LIMIT 5`,
      [vectorLiteral, 'Person']
    );

    console.log(`   Result: ${result3.rows.length} rows`);

    // Test 4: Check if parameter $1 is being interpretedcorrectly
    console.log('\nTest 4: Verify parameter handling with EXPLAIN...');
    const explain = await pool.query(
      `EXPLAIN (VERBOSE)
       SELECT id, (embedding_v2 <=> $1::vector(768)) as distance
       FROM kb.graph_objects
       WHERE embedding_v2 IS NOT NULL AND type = $2
       ORDER BY embedding_v2 <=> $1::vector(768)
       LIMIT 5`,
      [vectorLiteral, 'Person']
    );

    explain.rows.forEach((row) => console.log(`   ${row['QUERY PLAN']}`));

    // Test 5: Count how many Person objects exist vs how many have embeddings
    console.log('\nTest 5: Data availability check...');
    const counts = await pool.query(`
      SELECT 
        COUNT(*) FILTER (WHERE type = 'Person') as person_count,
        COUNT(*) FILTER (WHERE type = 'Person' AND embedding_v2 IS NOT NULL) as person_with_embeddings
      FROM kb.graph_objects
    `);

    console.log(`   Total Persons: ${counts.rows[0].person_count}`);
    console.log(
      `   Persons with embeddings: ${counts.rows[0].person_with_embeddings}`
    );

    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('SUMMARY');
    console.log('='.repeat(60));
    console.log(`Test 1 (standard): ${result1.rows.length} rows`);
    console.log(`Test 2 (explicit cast): ${result2.rows.length} rows`);
    console.log(`Test 3 (no cast): ${result3.rows.length} rows`);

    if (
      result1.rows.length > 0 &&
      result2.rows.length > 0 &&
      result3.rows.length > 0
    ) {
      console.log(
        '\n✅ ALL TESTS PASSED - DB vectors work fine with type filter!'
      );
      console.log(
        '   This confirms the issue is specific to Vertex AI vector values.'
      );
    } else {
      console.log('\n⚠️  Some tests failed even with DB vectors!');
      console.log(
        '   This would indicate a deeper PostgreSQL or node-postgres issue.'
      );
    }
  } catch (error) {
    console.error('\n❌ Error:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

main().catch(console.error);
