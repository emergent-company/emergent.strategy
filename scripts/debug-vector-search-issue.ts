#!/usr/bin/env tsx
/**
 * Debug script to isolate the vector search + WHERE clause issue
 * Uses the same REST API approach as GoogleVertexEmbeddingProvider
 */

import { Pool } from 'pg';
import { GoogleAuth } from 'google-auth-library';

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

  console.log(
    `   Using project: ${projectId}, location: ${location}, model: ${model}`
  );

  // Use REST API approach (same as GoogleVertexEmbeddingProvider)
  const url = `https://${location}-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${location}/publishers/google/models/${model}:predict`;

  const auth = new GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/cloud-platform'],
  });
  const client = await auth.getClient();
  const accessToken = await client.getAccessToken();

  if (!accessToken.token) {
    throw new Error('Failed to get access token from ADC');
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      instances: [{ content: text }],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Vertex AI API error: ${response.status} ${response.statusText} - ${errorText}`
    );
  }

  const data = await response.json();
  const values =
    data.predictions?.[0]?.embeddings?.values || data.predictions?.[0]?.values;

  if (!Array.isArray(values) || values.length === 0) {
    throw new Error('No embedding values returned from Vertex AI');
  }

  return values as number[];
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

    // Step 3: Format vectors
    console.log('3️⃣  Testing Vertex AI vector with type filter...\n');

    const formatters = {
      'rounded-8': (v: number[]) =>
        `[${v.map((n) => Math.round(n * 100000000) / 100000000).join(',')}]`,
    };

    const vertexLiteral = formatters['rounded-8'](vertexVector);
    const dbLiteral = formatters['rounded-8'](dbVector);

    // Test A: Vertex vector WITHOUT type filter
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
        name: 'Vertex AI - No filter',
        success: true,
        rowCount: result.rowCount || 0,
      });
    } catch (error: any) {
      results.push({
        name: 'Vertex AI - No filter',
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
        name: 'Vertex AI - WITH type=Person',
        success: true,
        rowCount: result.rowCount || 0,
      });
    } catch (error: any) {
      results.push({
        name: 'Vertex AI - WITH type=Person',
        success: false,
        rowCount: 0,
        error: error.message,
      });
    }

    // Test C: DB vector WITH type filter (control)
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
        name: 'DB Vector - WITH type=Person',
        success: true,
        rowCount: result.rowCount || 0,
      });
    } catch (error: any) {
      results.push({
        name: 'DB Vector - WITH type=Person',
        success: false,
        rowCount: 0,
        error: error.message,
      });
    }

    // Print results
    console.log('\n' + '='.repeat(80));
    console.log('📊 TEST RESULTS');
    console.log('='.repeat(80) + '\n');

    results.forEach((r) => {
      const status = r.success ? (r.rowCount > 0 ? '✅' : '⚠️ ') : '❌';
      const info = r.success ? `${r.rowCount} rows` : `ERROR: ${r.error}`;
      console.log(`${status} ${r.name}: ${info}`);
    });

    // Analysis
    console.log('\n' + '='.repeat(80));
    console.log('🔬 ANALYSIS');
    console.log('='.repeat(80) + '\n');

    const vertexNoFilter = results.find((r) =>
      r.name.includes('Vertex AI - No filter')
    );
    const vertexWithPerson = results.find((r) =>
      r.name.includes('Vertex AI - WITH type=Person')
    );
    const dbWithPerson = results.find((r) =>
      r.name.includes('DB Vector - WITH type=Person')
    );

    if (vertexNoFilter && vertexNoFilter.rowCount > 0) {
      console.log('✅ Vertex AI vectors work WITHOUT type filter');
    } else {
      console.log('❌ Vertex AI vectors FAIL even without type filter');
    }

    if (vertexWithPerson && vertexWithPerson.rowCount > 0) {
      console.log('✅ Vertex AI vectors work WITH type filter');
      console.log(
        '   🎉 ISSUE RESOLVED! Fresh Vertex AI embeddings now work correctly.'
      );
    } else {
      console.log('❌ Vertex AI vectors FAIL with type filter');
    }

    if (dbWithPerson && dbWithPerson.rowCount > 0) {
      console.log('✅ Database vectors work WITH type filter (control test)');
    }

    if (
      vertexNoFilter &&
      vertexNoFilter.rowCount > 0 &&
      vertexWithPerson &&
      vertexWithPerson.rowCount === 0 &&
      dbWithPerson &&
      dbWithPerson.rowCount > 0
    ) {
      console.log(
        '\n🚨 CONFIRMED: Vertex AI vectors fail specifically with WHERE filters'
      );
      console.log(
        '   This suggests a formatting or encoding difference between fresh'
      );
      console.log('   API responses and stored database vectors.');
    }
  } catch (error) {
    console.error('\n❌ Script failed:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

main().catch(console.error);
