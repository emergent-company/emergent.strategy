#!/usr/bin/env tsx
/**
 * Debug script to isolate the vector search + WHERE clause issue
 *
 * Tests different combinations to identify why Vertex AI vectors + WHERE type='Person'
 * returns 0 rows while database vectors work fine.
 */

import { Pool } from 'pg';
import { VertexAI } from '@google-cloud/vertexai';

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
  details?: any;
}

async function generateEmbedding(text: string): Promise<number[]> {
  const projectId = process.env.VERTEX_EMBEDDING_PROJECT;
  const location = process.env.VERTEX_EMBEDDING_LOCATION || 'us-central1';
  const model = process.env.VERTEX_EMBEDDING_MODEL || 'text-embedding-004';

  if (!projectId) {
    throw new Error(
      'VERTEX_EMBEDDING_PROJECT environment variable is required'
    );
  }

  const vertexAI = new VertexAI({ project: projectId, location });
  const textEmbedding = vertexAI.preview.getGenerativeModel({
    model: model,
  });

  const request = {
    contents: [{ role: 'user', parts: [{ text }] }],
  };

  const result = await textEmbedding.generateContent(request);

  // Extract embedding from response
  const embedding = result.response?.candidates?.[0]?.content?.parts?.[0];
  if (embedding && 'functionCall' in embedding) {
    const values = (embedding.functionCall as any)?.args?.embedding?.values;
    if (Array.isArray(values)) {
      return values;
    }
  }

  throw new Error('Failed to extract embedding from Vertex AI response');
}

async function main() {
  const pool = new Pool(dbConfig);
  const results: TestResult[] = [];

  try {
    console.log('🔍 Starting vector search debugging...\n');

    // Step 1: Get a Vertex AI embedding
    console.log(
      '1️⃣  Generating Vertex AI embedding for "software engineer"...'
    );
    const vertexVector = await generateEmbedding(
      'software engineer with programming experience'
    );
    console.log(`   ✓ Generated vector with ${vertexVector.length} dimensions`);
    console.log(
      `   ✓ First 5 values: [${vertexVector.slice(0, 5).join(', ')}]`
    );
    console.log(
      `   ✓ Vector literal length: ${
        JSON.stringify(vertexVector).length
      } chars\n`
    );

    // Step 2: Get a database vector for comparison
    console.log(
      '2️⃣  Fetching a database vector from an existing Person object...'
    );
    const dbVectorResult = await pool.query(`
      SELECT id, type, embedding_v2::text, 
             array_length(embedding_v2::real[], 1) as dims
      FROM kb.graph_objects
      WHERE type = 'Person' AND embedding_v2 IS NOT NULL
      LIMIT 1
    `);

    if (dbVectorResult.rows.length === 0) {
      throw new Error('No Person objects with embeddings found in database');
    }

    const dbObject = dbVectorResult.rows[0];
    console.log(`   ✓ Found object: ${dbObject.id}`);
    console.log(`   ✓ Type: ${dbObject.type}`);
    console.log(`   ✓ Dimensions: ${dbObject.dims}`);
    console.log(
      `   ✓ Vector literal length: ${dbObject.embedding_v2.length} chars\n`
    );

    // Parse the database vector
    const dbVector = JSON.parse(dbObject.embedding_v2);

    // Step 3: Format vectors in different ways
    console.log('3️⃣  Testing different vector formatting approaches...\n');

    const formatters = {
      'high-precision': (v: number[]) => `[${v.join(',')}]`,
      'rounded-8': (v: number[]) =>
        `[${v.map((n) => Math.round(n * 100000000) / 100000000).join(',')}]`,
      'rounded-6': (v: number[]) =>
        `[${v.map((n) => Math.round(n * 1000000) / 1000000).join(',')}]`,
      'rounded-4': (v: number[]) =>
        `[${v.map((n) => Math.round(n * 10000) / 10000).join(',')}]`,
      'float4-like': (v: number[]) =>
        `[${v.map((n) => parseFloat(n.toFixed(7))).join(',')}]`,
    };

    // Step 4: Test each combination
    console.log('4️⃣  Running query tests...\n');

    for (const [formatName, formatter] of Object.entries(formatters)) {
      const vertexLiteral = formatter(vertexVector);
      const dbLiteral = formatter(dbVector);

      // Test A: Vertex vector without type filter
      try {
        const result = await pool.query(
          `SELECT id, (embedding_v2 <=> $1::vector(768)) as distance
           FROM kb.graph_objects
           WHERE embedding_v2 IS NOT NULL
           ORDER BY embedding_v2 <=> $1::vector(768)
           LIMIT 5`,
          [vertexLiteral]
        );
        results.push({
          name: `Vertex (${formatName}) - No filter`,
          success: true,
          rowCount: result.rowCount || 0,
        });
      } catch (error: any) {
        results.push({
          name: `Vertex (${formatName}) - No filter`,
          success: false,
          rowCount: 0,
          error: error.message,
        });
      }

      // Test B: Vertex vector WITH type filter
      try {
        const result = await pool.query(
          `SELECT id, (embedding_v2 <=> $1::vector(768)) as distance
           FROM kb.graph_objects
           WHERE embedding_v2 IS NOT NULL AND type = $2
           ORDER BY embedding_v2 <=> $1::vector(768)
           LIMIT 5`,
          [vertexLiteral, 'Person']
        );
        results.push({
          name: `Vertex (${formatName}) - WITH type='Person'`,
          success: true,
          rowCount: result.rowCount || 0,
        });
      } catch (error: any) {
        results.push({
          name: `Vertex (${formatName}) - WITH type='Person'`,
          success: false,
          rowCount: 0,
          error: error.message,
        });
      }

      // Test C: DB vector WITH type filter (control group)
      try {
        const result = await pool.query(
          `SELECT id, (embedding_v2 <=> $1::vector(768)) as distance
           FROM kb.graph_objects
           WHERE embedding_v2 IS NOT NULL AND type = $2
           ORDER BY embedding_v2 <=> $1::vector(768)
           LIMIT 5`,
          [dbLiteral, 'Person']
        );
        results.push({
          name: `DB Vector (${formatName}) - WITH type='Person'`,
          success: true,
          rowCount: result.rowCount || 0,
        });
      } catch (error: any) {
        results.push({
          name: `DB Vector (${formatName}) - WITH type='Person'`,
          success: false,
          rowCount: 0,
          error: error.message,
        });
      }
    }

    // Step 5: Test with EXPLAIN ANALYZE to see query plans
    console.log('\n5️⃣  Getting query execution plans...\n');

    const vertexLiteralDefault = formatters['rounded-8'](vertexVector);

    // Explain without type filter
    const explainNoFilter = await pool.query(
      `EXPLAIN ANALYZE
       SELECT id, (embedding_v2 <=> $1::vector(768)) as distance
       FROM kb.graph_objects
       WHERE embedding_v2 IS NOT NULL
       ORDER BY embedding_v2 <=> $1::vector(768)
       LIMIT 5`,
      [vertexLiteralDefault]
    );

    // Explain WITH type filter
    const explainWithFilter = await pool.query(
      `EXPLAIN ANALYZE
       SELECT id, (embedding_v2 <=> $1::vector(768)) as distance
       FROM kb.graph_objects
       WHERE embedding_v2 IS NOT NULL AND type = $2
       ORDER BY embedding_v2 <=> $1::vector(768)
       LIMIT 5`,
      [vertexLiteralDefault, 'Person']
    );

    // Step 6: Test if it's specific to Person type
    console.log('6️⃣  Testing other object types...\n');

    const typeCountResult = await pool.query(`
      SELECT type, COUNT(*) as count
      FROM kb.graph_objects
      WHERE embedding_v2 IS NOT NULL
      GROUP BY type
      ORDER BY count DESC
      LIMIT 10
    `);

    console.log('   Available types with embeddings:');
    typeCountResult.rows.forEach((row) => {
      console.log(`   - ${row.type}: ${row.count} objects`);
    });

    // Test with the top 3 types
    for (const { type } of typeCountResult.rows.slice(0, 3)) {
      try {
        const result = await pool.query(
          `SELECT id, (embedding_v2 <=> $1::vector(768)) as distance
           FROM kb.graph_objects
           WHERE embedding_v2 IS NOT NULL AND type = $2
           ORDER BY embedding_v2 <=> $1::vector(768)
           LIMIT 5`,
          [vertexLiteralDefault, type]
        );
        results.push({
          name: `Vertex - type='${type}'`,
          success: true,
          rowCount: result.rowCount || 0,
        });
      } catch (error: any) {
        results.push({
          name: `Vertex - type='${type}'`,
          success: false,
          rowCount: 0,
          error: error.message,
        });
      }
    }

    // Print results
    console.log('\n' + '='.repeat(80));
    console.log('📊 TEST RESULTS SUMMARY');
    console.log('='.repeat(80) + '\n');

    const groupedResults = results.reduce((acc, result) => {
      const category = result.name.split(' - ')[0];
      if (!acc[category]) acc[category] = [];
      acc[category].push(result);
      return acc;
    }, {} as Record<string, TestResult[]>);

    for (const [category, categoryResults] of Object.entries(groupedResults)) {
      console.log(`\n${category}:`);
      categoryResults.forEach((result) => {
        const status = result.success
          ? result.rowCount > 0
            ? '✅'
            : '⚠️ '
          : '❌';
        const rowInfo = result.success ? `${result.rowCount} rows` : 'ERROR';
        console.log(`  ${status} ${result.name.split(' - ')[1]}: ${rowInfo}`);
        if (result.error) {
          console.log(`      Error: ${result.error}`);
        }
      });
    }

    // Print query plans
    console.log('\n' + '='.repeat(80));
    console.log('📈 QUERY EXECUTION PLANS');
    console.log('='.repeat(80) + '\n');

    console.log('Without type filter:');
    console.log('-------------------');
    explainNoFilter.rows.forEach((row) => console.log(row['QUERY PLAN']));

    console.log('\n\nWith type filter (type=Person):');
    console.log('-------------------------------');
    explainWithFilter.rows.forEach((row) => console.log(row['QUERY PLAN']));

    // Analyze patterns
    console.log('\n' + '='.repeat(80));
    console.log('🔬 ANALYSIS');
    console.log('='.repeat(80) + '\n');

    const vertexNoFilter = results.filter(
      (r) => r.name.includes('Vertex') && r.name.includes('No filter')
    );
    const vertexWithPerson = results.filter(
      (r) => r.name.includes('Vertex') && r.name.includes("type='Person'")
    );
    const dbWithPerson = results.filter(
      (r) => r.name.includes('DB Vector') && r.name.includes("type='Person'")
    );

    console.log(
      `Vertex vectors without filter: ${
        vertexNoFilter.filter((r) => r.rowCount > 0).length
      }/${vertexNoFilter.length} succeeded`
    );
    console.log(
      `Vertex vectors WITH Person filter: ${
        vertexWithPerson.filter((r) => r.rowCount > 0).length
      }/${vertexWithPerson.length} succeeded`
    );
    console.log(
      `DB vectors WITH Person filter: ${
        dbWithPerson.filter((r) => r.rowCount > 0).length
      }/${dbWithPerson.length} succeeded`
    );

    if (
      vertexWithPerson.every((r) => r.rowCount === 0) &&
      dbWithPerson.some((r) => r.rowCount > 0)
    ) {
      console.log(
        '\n🚨 CONFIRMED: Vertex AI vectors fail with type filter, but DB vectors work'
      );
      console.log(
        '   This suggests the issue is with the Vertex AI vector values themselves,'
      );
      console.log(
        '   not with the query structure or node-postgres parameter handling.'
      );
    }

    if (
      vertexNoFilter.some((r) => r.rowCount > 0) &&
      vertexWithPerson.every((r) => r.rowCount === 0)
    ) {
      console.log(
        '\n🚨 CONFIRMED: Vertex AI vectors work WITHOUT filter but fail WITH filter'
      );
      console.log(
        '   This suggests a PostgreSQL query planner or index issue when combining'
      );
      console.log('   vector similarity search with WHERE clause filters.');
    }
  } catch (error) {
    console.error('❌ Script failed:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

main().catch(console.error);
