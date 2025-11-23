import { describe, it, beforeAll, afterAll, expect, beforeEach } from 'vitest';
import { createE2EContext, E2EContext } from './e2e-context';
import { Pool } from 'pg';
import { getTestDbConfig } from '../test-db-config';
import { GoogleVertexEmbeddingProvider } from '../../src/modules/graph/google-vertex-embedding.provider';

/**
 * E2E test for Graph Vector Search with snippet matching
 *
 * Tests the embedding and vector similarity search functionality:
 * 1. Generate embeddings for text snippets using Vertex AI
 * 2. Search for similar/relevant graph objects using vector similarity
 * 3. Verify results are semantically related to the query
 * 4. Test various search filters and parameters
 *
 * This test validates Bug #004 fix:
 * - Embeddings are stored in embedding_v2 vector(768) column
 * - EmbeddingProvider returns number[] (not Buffer)
 * - Vector search uses cosine similarity correctly
 *
 * Mocked: None
 * Real: Full NestJS app, PostgreSQL with pgvector, Vertex AI embeddings
 * Auth: Not required (internal service test)
 * Prerequisites:
 * - VERTEX_EMBEDDING_PROJECT and VERTEX_EMBEDDING_LOCATION configured
 * - GOOGLE_APPLICATION_CREDENTIALS pointing to valid service account
 * - Database with graph_objects that have embeddings (embedding_v2 column)
 * - Graph embedding jobs should be running or completed
 */
describe('Graph Vector Search - Snippet Matching (e2e)', () => {
  let ctx: E2EContext;
  let pool: Pool;
  let embeddingProvider: GoogleVertexEmbeddingProvider;

  beforeAll(async () => {
    ctx = await createE2EContext('vector-search');

    // Create direct database pool for queries
    const dbConfig = getTestDbConfig();
    pool = new Pool({
      host: dbConfig.host,
      port: dbConfig.port,
      user: dbConfig.user,
      password: dbConfig.password,
      database: dbConfig.database,
    });

    // Create embedding provider directly (same as GraphModule factory)
    // GoogleVertexEmbeddingProvider needs a minimal config object
    const provider = process.env.EMBEDDING_PROVIDER?.toLowerCase();
    if (provider === 'vertex' || provider === 'google') {
      const mockConfig = {
        embeddingsEnabled: true,
      } as any;
      embeddingProvider = new GoogleVertexEmbeddingProvider(mockConfig);
    } else {
      throw new Error(
        'EMBEDDING_PROVIDER must be set to vertex or google for this test'
      );
    }
  });

  afterAll(async () => {
    if (pool) await pool.end();
    await ctx.close();
  });

  /**
   * Helper function to perform vector search using direct SQL
   * (replicates GraphVectorSearchService.searchByVector behavior)
   */
  async function searchByVector(
    queryVector: number[],
    options: {
      limit?: number;
      maxDistance?: number;
      type?: string;
      orgId?: string;
      projectId?: string;
      labelsAny?: string[];
    } = {}
  ): Promise<Array<{ id: string; distance: number }>> {
    const limit = options.limit || 10;
    // Build vector literal like '[1,2,3]' without spaces (matching GraphVectorSearchService)
    // Round to 8 decimal places to match database storage precision (pgvector stores as float4)
    const vectorLiteral = `[${queryVector
      .map((v) => {
        const val = Number.isFinite(v) ? v : 0;
        // Round to 8 decimal places to match pgvector float precision
        return Math.round(val * 100000000) / 100000000;
      })
      .join(',')}]`;
    const params: any[] = [vectorLiteral];
    let paramIndex = 2;

    const filters: string[] = ['embedding_v2 IS NOT NULL'];

    if (options.type) {
      filters.push(`type = $${paramIndex}`);
      params.push(options.type);
      paramIndex++;
    }

    if (options.orgId) {
      // Note: organization_id was removed from graph_objects in Phase 5
      // This filter is kept for API compatibility but will not match any rows
      console.warn(
        'orgId filter deprecated: organization_id column removed in Phase 5'
      );
    }

    if (options.projectId) {
      filters.push(`project_id = $${paramIndex}`);
      params.push(options.projectId);
      paramIndex++;
    }

    if (options.labelsAny && options.labelsAny.length > 0) {
      filters.push(`labels && $${paramIndex}::text[]`);
      params.push(options.labelsAny);
      paramIndex++;
    }

    const whereClause =
      filters.length > 0 ? `WHERE ${filters.join(' AND ')}` : '';

    // Add limit parameter at the end
    params.push(limit);

    // Use <=> for cosine distance (matching GraphVectorSearchService)
    // Note: We cast to vector(768) to match the embedding_v2 column type explicitly
    const sql = `
      SELECT id, (embedding_v2 <=> $1::vector(768)) as distance
      FROM kb.graph_objects
      ${whereClause}
      ORDER BY embedding_v2 <=> $1::vector(768)
      LIMIT $${paramIndex}
    `;

    console.log(`[searchByVector] SQL:`, sql.trim());
    console.log(`[searchByVector] Filters:`, filters);
    console.log(`[searchByVector] WHERE:`, whereClause);
    console.log(
      `[searchByVector] Params array length:`,
      params.length,
      'Expected paramIndex:',
      paramIndex
    );
    console.log(
      `[searchByVector] Vector dims=${queryVector.length}, literal length=${vectorLiteral.length}`,
      JSON.stringify({
        vectorPreview:
          vectorLiteral.length > 100
            ? `${vectorLiteral.substring(0, 50)}...`
            : vectorLiteral,
        allParams: params
          .slice(1)
          .map(
            (p, i) =>
              `$${i + 2}: ${
                typeof p === 'string' && p.length > 50
                  ? p.substring(0, 50) + '...'
                  : p
              }`
          ),
      })
    );

    // DEBUG: Log full vector for manual testing (only for type='Person' queries)
    if (options.type === 'Person') {
      console.log(
        `[DEBUG] Full vector literal for manual testing:`,
        vectorLiteral.substring(0, 200) +
          '...' +
          vectorLiteral.substring(vectorLiteral.length - 50)
      );
    }

    const result = await pool
      .query<{ id: string; distance: number }>(sql, params)
      .catch((err) => {
        console.error(`[searchByVector] Query error:`, err.message);
        console.error(`[searchByVector] Error detail:`, err.detail);
        console.error(`[searchByVector] Error hint:`, err.hint);
        throw err;
      });

    console.log(
      `[searchByVector] Query returned ${result.rows.length} rows before filter`
    );

    // Apply distance threshold after query (matching GraphVectorSearchService behavior)
    let rows = result.rows || [];
    if (options.maxDistance !== undefined) {
      const beforeFilter = rows.length;
      rows = rows.filter((r) => r.distance <= options.maxDistance!);
      console.log(
        `[searchByVector] After maxDistance filter (${options.maxDistance}): ${rows.length}/${beforeFilter} rows`
      );
    }

    return rows;
  }

  beforeEach(async () => {
    // Check if embedding infrastructure is ready
    const hasEmbeddingColumn = await pool.query<{ exists: boolean }>(`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema='kb' 
        AND table_name='graph_objects' 
        AND column_name='embedding_v2'
      ) as exists
    `);

    if (!hasEmbeddingColumn.rows[0]?.exists) {
      console.warn(
        'Skipping test: embedding_v2 column not found. Run migration first.'
      );
      return;
    }

    // Check if we have any objects with embeddings
    const embeddedCount = await pool.query<{ count: number }>(`
      SELECT COUNT(*) as count 
      FROM kb.graph_objects 
      WHERE embedding_v2 IS NOT NULL
    `);

    if (!embeddedCount.rows[0] || embeddedCount.rows[0].count < 10) {
      console.warn(
        `Skipping test: only ${
          embeddedCount.rows[0]?.count || 0
        } objects have embeddings. Need at least 10.`
      );
      return;
    }
  });

  /**
   * Test 1: Basic snippet matching - Find objects related to a concept
   */
  it('should find objects semantically related to a text snippet', async () => {
    // Skip if prerequisites not met
    const check = await pool.query<{ count: number }>(`
      SELECT COUNT(*) as count FROM kb.graph_objects WHERE embedding_v2 IS NOT NULL
    `);
    if (!check.rows[0] || check.rows[0].count < 10) {
      console.warn('Skipping: insufficient embedded objects');
      return;
    }

    // Test snippet about a religious/biblical concept
    const snippet = 'covenant between God and people';

    // Generate embedding for the snippet
    const queryVector = await embeddingProvider.generate(snippet);

    expect(queryVector).toBeDefined();
    expect(Array.isArray(queryVector)).toBe(true);
    expect(queryVector.length).toBe(768); // text-embedding-004 dimension

    // Search for similar objects (use looser threshold since biblical concepts might not match perfectly)
    const results = await searchByVector(queryVector, {
      limit: 10,
      maxDistance: 0.7, // Cosine distance threshold (0.7 is more permissive)
    });

    expect(results).toBeDefined();
    expect(Array.isArray(results)).toBe(true);
    expect(results.length).toBeGreaterThan(0);

    // Verify result structure
    const firstResult = results[0];
    expect(firstResult).toHaveProperty('id');
    expect(firstResult).toHaveProperty('distance');

    // Verify distance is within expected range
    expect(firstResult.distance).toBeGreaterThanOrEqual(0);
    expect(firstResult.distance).toBeLessThanOrEqual(0.5);

    // Fetch full object details for inspection
    const objectDetails = await pool.query<{
      id: string;
      type: string;
      key: string;
      properties: any;
    }>(
      `
      SELECT id, type, key, properties
      FROM kb.graph_objects
      WHERE id = ANY($1)
      ORDER BY array_position($1, id)
    `,
      [results.slice(0, 5).map((r) => r.id)]
    );

    // Log results for manual inspection
    console.log('\n=== Snippet Match Results ===');
    console.log(`Query: "${snippet}"`);
    console.log(`Found ${results.length} objects:\n`);
    objectDetails.rows.forEach((obj, i) => {
      console.log(`${i + 1}. ${obj.type} - ${obj.key.slice(0, 50)}`);
      console.log(`   Distance: ${results[i].distance.toFixed(4)}`);
      if (obj.properties?.name) {
        console.log(`   Name: ${obj.properties.name}`);
      }
      if (obj.properties?.description) {
        const desc = obj.properties.description.slice(0, 100);
        console.log(`   Description: ${desc}...`);
      }
      console.log('');
    });
  });

  /**
   * Test 2: Type-filtered snippet matching
   */
  it('should filter results by object type', async () => {
    const check = await pool.query<{ count: number }>(`
      SELECT COUNT(*) as count FROM kb.graph_objects 
      WHERE embedding_v2 IS NOT NULL AND type = 'Person'
    `);
    if (!check.rows[0] || check.rows[0].count < 5) {
      console.warn('Skipping: insufficient Person objects with embeddings');
      return;
    }

    const snippet = 'prophet who spoke to the people';
    const queryVector = await embeddingProvider.generate(snippet);

    // Search for Person objects only using our helper
    const results = await searchByVector(queryVector, {
      limit: 10,
      type: 'Person',
      maxDistance: 0.9, // Permissive threshold for cross-domain search (natural language query vs structured data)
    });

    expect(results.length).toBeGreaterThan(0);

    // Fetch full object details
    const objectDetails = await pool.query<{ id: string; type: string }>(
      `SELECT id, type FROM kb.graph_objects WHERE id = ANY($1)`,
      [results.map((r) => r.id)]
    );

    // Verify all results are Person type
    objectDetails.rows.forEach((obj) => {
      expect(obj.type).toBe('Person');
    });

    console.log('\n=== Type-Filtered Results (Person) ===');
    console.log(`Query: "${snippet}"`);
    console.log(`Found ${results.length} Person objects:\n`);
    objectDetails.rows.slice(0, 5).forEach((obj, i) => {
      const result = results.find((r) => r.id === obj.id)!;
      console.log(
        `${i + 1}. ${obj.id.slice(
          0,
          8
        )}... (distance: ${result.distance.toFixed(4)})`
      );
    });
  });

  /**
   * Test 3: Multiple search queries with different topics
   */
  it('should return different results for different semantic queries', async () => {
    const check = await pool.query<{ count: number }>(`
      SELECT COUNT(*) as count FROM kb.graph_objects WHERE embedding_v2 IS NOT NULL
    `);
    if (!check.rows[0] || check.rows[0].count < 10) {
      console.warn('Skipping: insufficient embedded objects');
      return;
    }

    const snippet1 = 'miracle and healing of the sick';
    const snippet2 = 'promise and covenant with ancestors';

    const vector1 = await embeddingProvider.generate(snippet1);
    const vector2 = await embeddingProvider.generate(snippet2);

    const results1 = await searchByVector(vector1, {
      limit: 5,
      maxDistance: 0.9, // Permissive for cross-domain search
    });

    const results2 = await searchByVector(vector2, {
      limit: 5,
      maxDistance: 0.9, // Permissive for cross-domain search
    });

    expect(results1.length).toBeGreaterThan(0);
    expect(results2.length).toBeGreaterThan(0);

    // Results should be different (different semantic concepts)
    const ids1 = results1.map((r) => r.id);
    const ids2 = results2.map((r) => r.id);

    // At most some overlap, but they should be mostly different
    const overlap = ids1.filter((id) => ids2.includes(id)).length;
    const overlapPercent = (overlap / Math.max(ids1.length, ids2.length)) * 100;

    // Fetch details for logging
    const details1 = await pool.query<{
      id: string;
      type: string;
      key: string;
    }>(`SELECT id, type, key FROM kb.graph_objects WHERE id = $1`, [
      results1[0].id,
    ]);
    const details2 = await pool.query<{
      id: string;
      type: string;
      key: string;
    }>(`SELECT id, type, key FROM kb.graph_objects WHERE id = $1`, [
      results2[0].id,
    ]);

    console.log('\n=== Semantic Differentiation Test ===');
    console.log(`Query 1: "${snippet1}"`);
    if (details1.rows[0]) {
      console.log(
        `Top result: ${details1.rows[0].type} - ${details1.rows[0].key.slice(
          0,
          40
        )} (${results1[0].distance.toFixed(4)})`
      );
    }
    console.log(`\nQuery 2: "${snippet2}"`);
    if (details2.rows[0]) {
      console.log(
        `Top result: ${details2.rows[0].type} - ${details2.rows[0].key.slice(
          0,
          40
        )} (${results2[0].distance.toFixed(4)})`
      );
    }
    console.log(
      `\nOverlap: ${overlap}/${Math.max(
        ids1.length,
        ids2.length
      )} (${overlapPercent.toFixed(1)}%)`
    );

    // Expect less than 80% overlap (different topics should give different results)
    expect(overlapPercent).toBeLessThan(80);
  });

  /**
   * Test 4: Distance threshold filtering
   */
  it('should respect distance thresholds', async () => {
    const check = await pool.query<{ count: number }>(`
      SELECT COUNT(*) as count FROM kb.graph_objects WHERE embedding_v2 IS NOT NULL
    `);
    if (!check.rows[0] || check.rows[0].count < 10) {
      console.warn('Skipping: insufficient embedded objects');
      return;
    }

    const snippet = 'divine intervention and salvation';
    const queryVector = await embeddingProvider.generate(snippet);

    // Get results with loose threshold
    const looseResults = await searchByVector(queryVector, {
      limit: 20,
      maxDistance: 0.8, // Very permissive
    });

    // Get results with strict threshold
    const strictResults = await searchByVector(queryVector, {
      limit: 20,
      maxDistance: 0.3, // Very strict
    });

    expect(looseResults.length).toBeGreaterThan(0);
    expect(strictResults.length).toBeGreaterThanOrEqual(0);

    // Strict should return fewer or equal results
    expect(strictResults.length).toBeLessThanOrEqual(looseResults.length);

    // All strict results should have distance <= 0.3
    strictResults.forEach((result) => {
      expect(result.distance).toBeLessThanOrEqual(0.3);
    });

    console.log('\n=== Distance Threshold Test ===');
    console.log(`Query: "${snippet}"`);
    console.log(`Loose threshold (0.8): ${looseResults.length} results`);
    console.log(`Strict threshold (0.3): ${strictResults.length} results`);
    if (strictResults.length > 0) {
      const bestMatch = await pool.query<{ type: string; key: string }>(
        `SELECT type, key FROM kb.graph_objects WHERE id = $1`,
        [strictResults[0].id]
      );
      if (bestMatch.rows[0]) {
        console.log(
          `Best match: ${
            bestMatch.rows[0].type
          } - ${bestMatch.rows[0].key.slice(
            0,
            40
          )} (${strictResults[0].distance.toFixed(4)})`
        );
      }
    }
  });

  /**
   * Test 5: Project filtering
   * NOTE: organization_id was removed from graph_objects in Phase 5
   * This test now only filters by project_id
   */
  it('should filter by project', async () => {
    // Find any project that has embeddings for testing
    const projectCheck = await pool.query<{
      project_id: string;
      count: number;
    }>(
      `
      SELECT project_id, COUNT(*) as count
      FROM kb.graph_objects 
      WHERE embedding_v2 IS NOT NULL 
      AND project_id IS NOT NULL
      GROUP BY project_id
      HAVING COUNT(*) >= 5
      ORDER BY COUNT(*) DESC
      LIMIT 1
    `
    );

    if (!projectCheck.rows[0]) {
      console.warn(
        'Skipping: no project with sufficient embedded objects found.'
      );
      return;
    }

    const testProjectId = projectCheck.rows[0].project_id;

    const snippet = 'test object search';
    const queryVector = await embeddingProvider.generate(snippet);

    // Search with project filter
    const filteredResults = await searchByVector(queryVector, {
      limit: 10,
      projectId: testProjectId,
      maxDistance: 1.0, // Very loose since we're testing filtering
    });

    // All results should belong to the filtered project
    if (filteredResults.length > 0) {
      const verification = await pool.query<{ id: string }>(
        `
        SELECT id FROM kb.graph_objects 
        WHERE id = ANY($1) 
        AND project_id = $2
      `,
        [filteredResults.map((r) => r.id), testProjectId]
      );

      expect(verification.rows.length).toBe(filteredResults.length);
    }

    console.log('\n=== Project Filter Test ===');
    console.log(`Project: ${testProjectId}`);
    console.log(`Results: ${filteredResults.length}`);
  });

  /**
   * Test 6: Label filtering
   */
  it('should filter by labels when available', async () => {
    // Check if we have objects with labels
    const check = await pool.query<{ count: number; sample_labels: string[] }>(`
      SELECT 
        COUNT(*) as count,
        ARRAY_AGG(DISTINCT labels[1]) FILTER (WHERE labels IS NOT NULL AND array_length(labels, 1) > 0) as sample_labels
      FROM kb.graph_objects 
      WHERE embedding_v2 IS NOT NULL 
      AND labels IS NOT NULL 
      AND array_length(labels, 1) > 0
    `);

    if (
      !check.rows[0] ||
      check.rows[0].count < 5 ||
      !check.rows[0].sample_labels?.length
    ) {
      console.warn('Skipping: insufficient objects with labels');
      return;
    }

    const testLabel = check.rows[0].sample_labels[0];
    const snippet = 'general concept search';
    const queryVector = await embeddingProvider.generate(snippet);

    // Search with label filter
    const labeledResults = await searchByVector(queryVector, {
      limit: 10,
      labelsAny: [testLabel],
      maxDistance: 1.0,
    });

    expect(labeledResults.length).toBeGreaterThan(0);

    console.log('\n=== Label Filter Test ===');
    console.log(`Filter label: ${testLabel}`);
    console.log(`Results: ${labeledResults.length}`);
  });

  /**
   * Test 7: Similarity score quality check
   */
  it('should return results in ascending distance order', async () => {
    const check = await pool.query<{ count: number }>(`
      SELECT COUNT(*) as count FROM kb.graph_objects WHERE embedding_v2 IS NOT NULL
    `);
    if (!check.rows[0] || check.rows[0].count < 5) {
      console.warn('Skipping: insufficient embedded objects');
      return;
    }

    const snippet = 'faith and belief in divine power';
    const queryVector = await embeddingProvider.generate(snippet);

    const results = await searchByVector(queryVector, {
      limit: 10,
      maxDistance: 0.9, // Permissive for cross-domain search
    });

    expect(results.length).toBeGreaterThanOrEqual(2);

    // Verify results are in ascending distance order
    for (let i = 0; i < results.length - 1; i++) {
      expect(results[i].distance).toBeLessThanOrEqual(results[i + 1].distance);
    }

    console.log('\n=== Distance Ordering Test ===');
    console.log(`Query: "${snippet}"`);
    console.log('Distance progression:');

    // Fetch object details for logging
    const objectsForLog = await pool.query<{
      id: string;
      type: string;
      key: string;
    }>(
      `SELECT id, type, key FROM kb.graph_objects WHERE id = ANY($1) ORDER BY array_position($1, id)`,
      [results.map((r) => r.id)]
    );

    objectsForLog.rows.forEach((obj, i) => {
      console.log(
        `${i + 1}. ${results[i].distance.toFixed(4)} - ${
          obj.type
        } (${obj.key.slice(0, 40)}...)`
      );
    });
  });

  /**
   * Test 8: Use document chunk embedding to find related graph objects
   * This tests the real-world use case: given a chunk of document content,
   * find graph objects that are semantically related to that content.
   */
  it('should find graph objects related to a document chunk', async () => {
    // Use the seeded project that has our graph objects
    const seededProjectId = '51093fb8-3c1f-4861-93de-232eb599bbee';

    // First, create a document chunk with biblical content that relates to our graph objects
    const chunkText = `Moses was a prophet who spoke to the people of Israel. 
      He led them out of Egypt and received the Ten Commandments from God on Mount Sinai.
      His leadership and faith were instrumental in establishing the covenant between God and His people.`;

    // Insert a document first (in the seeded project)
    const docResult = await pool.query<{ id: string }>(
      `INSERT INTO kb.documents (project_id, filename, content)
       VALUES ($1, $2, $3)
       RETURNING id`,
      [seededProjectId, 'history.txt', chunkText]
    );
    const documentId = docResult.rows[0].id;

    // Generate embedding for the chunk
    const chunkEmbedding = await embeddingProvider.generate(chunkText);
    expect(chunkEmbedding.length).toBe(768);

    // Insert chunk with embedding
    const chunkResult = await pool.query<{ id: string; embedding: number[] }>(
      `INSERT INTO kb.chunks (document_id, chunk_index, text, embedding)
       VALUES ($1, $2, $3, $4::vector)
       RETURNING id, embedding`,
      [documentId, 0, chunkText, `[${chunkEmbedding.join(',')}]`]
    );
    const chunkId = chunkResult.rows[0].id;

    console.log('\n=== Chunk to Graph Objects Test ===');
    console.log(`Created chunk ${chunkId} in document ${documentId}`);
    console.log(
      `Chunk text (first 100 chars): ${chunkText.substring(0, 100)}...`
    );

    // Now use the chunk's embedding to search for related graph objects
    const results = await searchByVector(chunkEmbedding, {
      limit: 5,
      maxDistance: 0.7,
      projectId: seededProjectId,
    });

    console.log(`Found ${results.length} related graph objects`);

    // Should find graph objects related to Moses, prophets, covenant, etc.
    expect(results.length).toBeGreaterThan(0);

    // Fetch object details
    const objects = await pool.query<{
      id: string;
      type: string;
      key: string;
      properties: any;
    }>(
      `SELECT id, type, key, properties FROM kb.graph_objects WHERE id = ANY($1)`,
      [results.map((r) => r.id)]
    );

    console.log('\nRelated objects:');
    results.forEach((r, i) => {
      const obj = objects.rows.find((o) => o.id === r.id);
      if (obj) {
        console.log(
          `${i + 1}. distance: ${r.distance.toFixed(4)} - ${obj.type}: ${
            obj.key
          } (${obj.properties.description || 'no description'})`
        );
      }
    });

    // Expect Moses to be among the top results (should have low distance)
    const mosesResult = results.find((r) => {
      const obj = objects.rows.find((o) => o.id === r.id);
      return obj && obj.key === 'moses';
    });

    expect(mosesResult).toBeDefined();
    expect(mosesResult!.distance).toBeLessThan(0.6); // Should be very similar

    // All results should be within the threshold
    results.forEach((r) => {
      expect(r.distance).toBeLessThanOrEqual(0.7);
    });
  });

  /**
   * Test 9: Performance check - embedding generation and search
   */
  it('should generate embeddings and search within reasonable time', async () => {
    const check = await pool.query<{ count: number }>(`
      SELECT COUNT(*) as count FROM kb.graph_objects WHERE embedding_v2 IS NOT NULL
    `);
    if (!check.rows[0] || check.rows[0].count < 10) {
      console.warn('Skipping: insufficient embedded objects');
      return;
    }

    const snippet = 'performance test query about divine events';

    // Time embedding generation
    const embedStart = Date.now();
    const queryVector = await embeddingProvider.generate(snippet);
    const embedTime = Date.now() - embedStart;

    expect(queryVector.length).toBe(768);

    // Time vector search
    const searchStart = Date.now();
    const results = await searchByVector(queryVector, {
      limit: 20,
      maxDistance: 0.6,
    });
    const searchTime = Date.now() - searchStart;

    expect(results.length).toBeGreaterThan(0);

    console.log('\n=== Performance Test ===');
    console.log(`Embedding generation: ${embedTime}ms`);
    console.log(`Vector search: ${searchTime}ms`);
    console.log(`Total time: ${embedTime + searchTime}ms`);
    console.log(`Results: ${results.length}`);

    // Performance assertions (reasonable for e2e)
    expect(embedTime).toBeLessThan(5000); // 5 seconds for embedding
    expect(searchTime).toBeLessThan(2000); // 2 seconds for search
  });
});
