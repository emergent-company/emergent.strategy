#!/usr/bin/env tsx
/**
 * Backfill Chunk Embeddings
 *
 * Generates embeddings for all chunks that don't have them yet.
 * Supports both Vertex AI (production) and Generative AI (development).
 *
 * Context:
 * - 3,433 chunks exist with text but no embeddings
 * - New chunks get embeddings during ingestion automatically
 * - This script backfills existing chunks
 *
 * Authentication:
 * - Vertex AI (preferred): Uses VERTEX_EMBEDDING_PROJECT, VERTEX_EMBEDDING_LOCATION, GOOGLE_APPLICATION_CREDENTIALS
 * - Generative AI (fallback): Uses GOOGLE_API_KEY
 *
 * Related: docs/bugs/003-chunk-embeddings-missing.md
 *
 * Usage:
 *   npm run backfill-chunk-embeddings         # Preview (dry run)
 *   npm run backfill-chunk-embeddings:execute # Actually backfill
 */

import path from 'node:path';
import fs from 'node:fs';
import { Pool } from 'pg';
import * as dotenv from 'dotenv';
import {
  validateEnvVars,
  DB_REQUIREMENTS,
  getDbConfig,
} from './lib/env-validator.js';

const DRY_RUN = !process.argv.includes('--execute');
const BATCH_SIZE = 100; // Process 100 chunks at a time

// Load .env early (allow override via DOTENV_PATH)
(() => {
  const envPath =
    process.env.DOTENV_PATH || path.resolve(process.cwd(), '.env.test.local');
  if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath });
    console.log(
      `[backfill-chunk-embeddings] Loaded environment from ${envPath}`
    );
  } else {
    console.log(
      `[backfill-chunk-embeddings] No .env file found at ${envPath} (proceeding with existing environment)`
    );
  }
})();

interface Chunk {
  id: string;
  text: string;
}

interface Stats {
  total_chunks: number;
  with_embeddings: number;
  without_embeddings: number;
  processed?: number;
  failed?: number;
}

async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  // Try Vertex AI first (production), fallback to Generative AI (development)
  const useVertexAI =
    process.env.VERTEX_EMBEDDING_PROJECT &&
    process.env.VERTEX_EMBEDDING_LOCATION;

  if (useVertexAI) {
    return await generateEmbeddingsVertexAI(texts);
  } else {
    return await generateEmbeddingsGenerativeAI(texts);
  }
}

async function generateEmbeddingsVertexAI(
  texts: string[]
): Promise<number[][]> {
  const projectId = process.env.VERTEX_EMBEDDING_PROJECT;
  const location = process.env.VERTEX_EMBEDDING_LOCATION;
  const model = process.env.VERTEX_EMBEDDING_MODEL || 'text-embedding-004';

  if (!projectId || !location) {
    throw new Error(
      'Vertex AI configuration missing: VERTEX_EMBEDDING_PROJECT and VERTEX_EMBEDDING_LOCATION required'
    );
  }

  console.log(
    `  Using Vertex AI: project=${projectId}, location=${location}, model=${model}`
  );

  // Import GoogleAuth for ADC authentication
  const { GoogleAuth } = await import('google-auth-library');
  const auth = new GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/cloud-platform'],
  });

  const url = `https://${location}-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${location}/publishers/google/models/${model}:predict`;

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
      instances: texts.map((text) => ({
        content: text,
        task_type: 'RETRIEVAL_DOCUMENT',
      })),
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Vertex AI API error: ${response.status} ${response.statusText} - ${errorText}`
    );
  }

  const data = await response.json();

  if (!Array.isArray(data.predictions)) {
    throw new Error('No predictions returned from Vertex AI');
  }

  return data.predictions.map((prediction: any) => {
    const values = prediction.embeddings?.values || prediction.values || [];
    if (!Array.isArray(values) || values.length === 0) {
      throw new Error('Invalid embedding values in prediction');
    }
    return values as number[];
  });
}

async function generateEmbeddingsGenerativeAI(
  texts: string[]
): Promise<number[][]> {
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    throw new Error(
      'GOOGLE_API_KEY not set - required for Generative AI embeddings. ' +
        'For production, configure Vertex AI with VERTEX_EMBEDDING_PROJECT and VERTEX_EMBEDDING_LOCATION instead.'
    );
  }

  console.log('  Using Google Generative AI (development mode)');

  // Dynamically import to match EmbeddingsService pattern
  const { GoogleGenerativeAIEmbeddings } = await import(
    '@langchain/google-genai'
  );

  const client = new GoogleGenerativeAIEmbeddings({
    apiKey: apiKey,
    model: 'text-embedding-004',
  });

  return await client.embedDocuments(texts);
}

function formatVector(vec: number[]): string {
  return (
    '[' + vec.map((n) => (Number.isFinite(n) ? String(n) : '0')).join(',') + ']'
  );
}

async function main() {
  console.log('\n' + '='.repeat(70));
  console.log('  Backfill Chunk Embeddings');
  console.log('='.repeat(70));
  console.log();

  if (DRY_RUN) {
    console.log('🔍 DRY RUN MODE - No changes will be made');
    console.log('   Run with --execute flag to actually backfill');
    console.log();
  } else {
    console.log('⚠️  EXECUTE MODE - Embeddings will be generated');
    console.log();
  }

  // Validate environment
  validateEnvVars(DB_REQUIREMENTS);

  // Check for embedding credentials (Vertex AI or Generative AI)
  const hasVertexAI =
    process.env.VERTEX_EMBEDDING_PROJECT &&
    process.env.VERTEX_EMBEDDING_LOCATION;
  const hasGenerativeAI = process.env.GOOGLE_API_KEY;

  if (!hasVertexAI && !hasGenerativeAI) {
    console.error('❌ No embedding credentials configured');
    console.error('   Option 1 (Production): Configure Vertex AI');
    console.error('     - Set VERTEX_EMBEDDING_PROJECT in your .env file');
    console.error('     - Set VERTEX_EMBEDDING_LOCATION in your .env file');
    console.error(
      '     - Set GOOGLE_APPLICATION_CREDENTIALS to service account JSON path'
    );
    console.error('');
    console.error('   Option 2 (Development): Configure Generative AI');
    console.error('     - Set GOOGLE_API_KEY in your .env file');
    console.error(
      '     - Get API key from https://aistudio.google.com/app/apikey'
    );
    process.exit(1);
  }

  if (hasVertexAI) {
    console.log('✅ Vertex AI credentials configured (production mode)');
  } else {
    console.log('✅ Generative AI credentials configured (development mode)');
  }
  console.log();

  const dbConfig = getDbConfig();
  const pool = new Pool(dbConfig);
  console.log('✅ Connected to database');
  console.log();

  try {
    // Get current stats
    console.log('📊 Current Chunk Statistics');
    console.log('-'.repeat(70));

    const statsResult = await pool.query<Stats>(`
      SELECT 
        COUNT(*)::int as total_chunks,
        COUNT(embedding) FILTER (WHERE embedding IS NOT NULL)::int as with_embeddings,
        COUNT(*) FILTER (WHERE embedding IS NULL)::int as without_embeddings
      FROM kb.chunks
    `);

    const currentStats = statsResult.rows[0];
    console.log(`  Total chunks:       ${currentStats.total_chunks}`);
    console.log(`  With embeddings:    ${currentStats.with_embeddings}`);
    console.log(`  Without embeddings: ${currentStats.without_embeddings}`);
    console.log();

    const toProcess = currentStats.without_embeddings;

    if (toProcess === 0) {
      console.log('✅ No chunks need embeddings');
      console.log('   All chunks already have embeddings');
      return;
    }

    console.log('🔄 Backfill Plan');
    console.log('-'.repeat(70));
    console.log(`  Chunks to process: ${toProcess}`);
    console.log(`  Batch size: ${BATCH_SIZE}`);
    console.log(`  Estimated batches: ${Math.ceil(toProcess / BATCH_SIZE)}`);
    console.log(`  Model: text-embedding-004 (768 dimensions)`);
    console.log();

    if (DRY_RUN) {
      console.log('✅ Dry run complete - no changes made');
      console.log('   Run with --execute to perform the backfill');
      return;
    }

    // Execute backfill
    console.log('⚙️  Processing chunks...');
    console.log();

    let processed = 0;
    let failed = 0;
    let batch = 0;

    while (true) {
      // Fetch next batch of chunks without embeddings
      const chunksResult = await pool.query<Chunk>(
        `
        SELECT id, text
        FROM kb.chunks
        WHERE embedding IS NULL
        ORDER BY id
        LIMIT $1
      `,
        [BATCH_SIZE]
      );

      if (chunksResult.rows.length === 0) {
        break; // No more chunks to process
      }

      batch++;
      const batchChunks = chunksResult.rows;
      const texts = batchChunks.map((c) => c.text);

      console.log(
        `  Batch ${batch}: Processing ${batchChunks.length} chunks...`
      );

      try {
        // Generate embeddings one at a time (Vertex AI has token limits per request)
        // Process and update each chunk individually to avoid sync issues
        let batchSuccess = 0;
        let batchFailed = 0;

        for (let i = 0; i < batchChunks.length; i++) {
          try {
            // Generate embedding for this single chunk
            const embedding = await generateEmbeddings([batchChunks[i].text]);
            const vector = embedding[0];

            // Update database
            const vecLiteral = formatVector(vector);
            await pool.query(
              `
              UPDATE kb.chunks
              SET embedding = $1::vector
              WHERE id = $2
            `,
              [vecLiteral, batchChunks[i].id]
            );

            processed++;
            batchSuccess++;
          } catch (err) {
            console.error(
              `      ❌ Chunk ${batchChunks[i].id}: ${
                (err as Error).message.split('\n')[0]
              }`
            );
            failed++;
            batchFailed++;
          }
        }

        console.log(
          `    ✅ Batch complete: ${batchSuccess} succeeded, ${batchFailed} failed`
        );
      } catch (err) {
        console.error(`    ❌ Batch ${batch} error:`, (err as Error).message);
        failed += batchChunks.length;
      }

      // Small delay to avoid rate limiting
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    console.log();
    console.log('✅ Backfill complete!');
    console.log();
    console.log('📊 Final Statistics');
    console.log('-'.repeat(70));
    console.log(`  Processed: ${processed}`);
    console.log(`  Failed:    ${failed}`);
    console.log();

    // Show new stats
    const newStatsResult = await pool.query<Stats>(`
      SELECT 
        COUNT(*)::int as total_chunks,
        COUNT(embedding) FILTER (WHERE embedding IS NOT NULL)::int as with_embeddings,
        COUNT(*) FILTER (WHERE embedding IS NULL)::int as without_embeddings
      FROM kb.chunks
    `);

    const afterStats = newStatsResult.rows[0];
    console.log('📊 Updated Chunk Statistics');
    console.log('-'.repeat(70));
    console.log(`  Total chunks:       ${afterStats.total_chunks}`);
    console.log(
      `  With embeddings:    ${afterStats.with_embeddings} (↑ ${processed})`
    );
    console.log(`  Without embeddings: ${afterStats.without_embeddings}`);
    console.log();
  } finally {
    await pool.end();
    console.log('✅ Database connection closed');
  }
}

main().catch((error) => {
  console.error('❌ Error:', error.message);
  if (error.stack) {
    console.error(error.stack);
  }
  process.exit(1);
});
