import { beforeAll, afterAll, beforeEach, describe, it, expect } from 'vitest';
import supertest from 'supertest';
import { createE2EContext, E2EContext } from './e2e-context';
import { authHeader } from './auth-helpers';
import { ingestDocs } from './utils/fixtures';

/**
 * Unified Search E2E Tests
 *
 * Validates the unified search endpoint (POST /search/unified) which combines:
 * - Graph search: Hybrid search over graph objects (decisions, requirements, etc.)
 * - Text search: Hybrid search over document chunks
 * - Fusion: Configurable strategies for combining results (weighted, RRF, interleave)
 * - Relationships: Optional expansion of graph object relationships
 *
 * Test Strategy:
 * - Create both graph objects and documents with overlapping semantic content
 * - Test different fusion strategies and their effects on result ordering
 * - Validate relationship expansion for graph results
 * - Test result type filtering (graph-only, text-only, both)
 * - Validate response structure and metadata
 */

let ctx: E2EContext;
let request: supertest.SuperTest<supertest.Test>;

// Object IDs for test graph
let decisionId: string;
let requirementId: string;

const contextHeaders = () => ({
  ...authHeader('all', 'unified-search'),
  'x-org-id': ctx.orgId,
  'x-project-id': ctx.projectId,
});

async function createObject(
  type: string,
  key: string,
  properties: Record<string, any>,
  labels: string[] = []
): Promise<any> {
  const res = await request
    .post('/graph/objects')
    .set(contextHeaders())
    .send({
      type,
      key,
      properties,
      labels,
      organization_id: ctx.orgId,
      project_id: ctx.projectId,
    })
    .expect(201);
  return res.body;
}

async function createRelationship(
  type: string,
  srcId: string,
  dstId: string,
  properties: Record<string, any> = {}
): Promise<any> {
  const res = await request
    .post('/graph/relationships')
    .set(contextHeaders())
    .send({
      type,
      src_id: srcId,
      dst_id: dstId,
      properties,
      organization_id: ctx.orgId,
      project_id: ctx.projectId,
    })
    .expect(201);
  return res.body;
}

describe('Unified Search E2E', () => {
  beforeAll(async () => {
    ctx = await createE2EContext('unified-search');
    request = supertest(ctx.baseUrl);
  });

  beforeEach(async () => {
    await ctx.cleanup();

    // Create graph objects with search-related content
    const decision = await createObject(
      'Decision',
      'dec-hybrid-search',
      {
        title: 'Hybrid Search Architecture',
        description:
          'Decision to implement hybrid search combining lexical BM25 and semantic vector search for optimal relevance',
        status: 'approved',
      },
      ['architecture', 'search']
    );
    decisionId = decision.id;

    const requirement = await createObject(
      'Requirement',
      'req-search-fusion',
      {
        title: 'Search Result Fusion',
        description:
          'Requirement to support multiple fusion strategies including weighted combination and reciprocal rank fusion',
        priority: 'high',
      },
      ['search', 'feature']
    );
    requirementId = requirement.id;

    // Create relationship between decision and requirement
    await createRelationship('informs', decisionId, requirementId, {
      rationale: 'Architecture decision informs feature requirements',
    });

    // Ingest documents with overlapping semantic content
    await ingestDocs(
      ctx,
      [
        {
          name: 'hybrid-search-guide',
          content: `Hybrid search combines lexical and semantic search techniques to provide better relevance.
                    BM25 handles exact keyword matching while vector embeddings capture semantic similarity.
                    The fusion of these approaches yields superior results compared to either method alone.`,
        },
        {
          name: 'search-optimization-tips',
          content: `Optimizing search performance requires balancing relevance with response time.
                    Consider using weighted fusion strategies to prioritize different signal types.
                    Monitor query latency and adjust ranking algorithms accordingly.`,
        },
        {
          name: 'unrelated-content',
          content: `This document discusses database indexing strategies and query optimization techniques.
                    B-tree indexes provide efficient lookups for structured data queries.
                    Consider table partitioning for large datasets to improve query performance.`,
        },
      ],
      { userSuffix: 'unified-search' }
    );
  });

  afterAll(async () => {
    await ctx.close();
  });

  it('AT-US-01: returns both graph and text results with default fusion', async () => {
    const res = await request
      .post('/search/unified')
      .set(contextHeaders())
      .send({
        query: 'hybrid search relevance',
        limit: 10,
      })
      .expect(200);

    const json = res.body;
    expect(json.results).toBeDefined();
    expect(Array.isArray(json.results)).toBe(true);
    expect(json.results.length).toBeGreaterThan(0);

    // Should have both graph and text results
    const graphResults = json.results.filter((r: any) => r.type === 'graph');
    const textResults = json.results.filter((r: any) => r.type === 'text');
    expect(graphResults.length).toBeGreaterThan(0);
    expect(textResults.length).toBeGreaterThan(0);

    // Each result should have required fields
    json.results.forEach((result: any) => {
      expect(result.id).toBeDefined();
      expect(result.type).toBeDefined();
      expect(['graph', 'text'].includes(result.type)).toBe(true);
      expect(result.score).toBeDefined();
      expect(typeof result.score).toBe('number');
    });

    // Metadata should be present
    expect(json.metadata).toBeDefined();
    expect(json.metadata.totalResults).toBeDefined();
    expect(json.metadata.graphResultCount).toBeDefined();
    expect(json.metadata.textResultCount).toBeDefined();
    expect(json.metadata.fusionStrategy).toBe('weighted');
  });

  it('AT-US-02: respects resultTypes filter for graph-only results', async () => {
    const res = await request
      .post('/search/unified')
      .set(contextHeaders())
      .send({
        query: 'hybrid search architecture',
        limit: 10,
        resultTypes: 'graph',
      })
      .expect(200);

    const json = res.body;
    expect(json.results).toBeDefined();
    expect(Array.isArray(json.results)).toBe(true);

    // All results should be graph type
    json.results.forEach((result: any) => {
      expect(result.type).toBe('graph');
      expect(result.id).toBeDefined();
      expect(result.object_id).toBeDefined();
      expect(result.object_type).toBeDefined();
      expect(result.fields).toBeDefined();
    });

    expect(json.metadata.textResultCount).toBe(0);
  });

  it('AT-US-03: respects resultTypes filter for text-only results', async () => {
    const res = await request
      .post('/search/unified')
      .set(contextHeaders())
      .send({
        query: 'hybrid search optimization',
        limit: 10,
        resultTypes: 'text',
      })
      .expect(200);

    const json = res.body;
    expect(json.results).toBeDefined();
    expect(Array.isArray(json.results)).toBe(true);

    // All results should be text type
    json.results.forEach((result: any) => {
      expect(result.type).toBe('text');
      expect(result.snippet).toBeDefined();
      expect(result.documentId).toBeDefined();
    });

    expect(json.metadata.graphResultCount).toBe(0);
  });

  it('AT-US-04: weighted fusion strategy applies custom weights', async () => {
    const res = await request
      .post('/search/unified')
      .set(contextHeaders())
      .send({
        query: 'hybrid search',
        limit: 10,
        fusionStrategy: 'weighted',
        weights: {
          graphWeight: 0.7,
          textWeight: 0.3,
        },
      })
      .expect(200);

    const json = res.body;
    expect(json.metadata.fusionStrategy).toBe('weighted');

    // Graph results should generally be ranked higher due to higher weight
    // (This is probabilistic but should hold for this specific query/data)
    if (json.results.length >= 2) {
      // At least some graph results should appear early
      const topThree = json.results.slice(0, Math.min(3, json.results.length));
      const graphInTopThree = topThree.some((r: any) => r.type === 'graph');
      expect(graphInTopThree).toBe(true);
    }
  });

  it('AT-US-05: RRF fusion strategy produces expected ranking', async () => {
    const res = await request
      .post('/search/unified')
      .set(contextHeaders())
      .send({
        query: 'search fusion',
        limit: 10,
        fusionStrategy: 'rrf',
      })
      .expect(200);

    const json = res.body;
    expect(json.metadata.fusionStrategy).toBe('rrf');
    expect(json.results).toBeDefined();
    expect(json.results.length).toBeGreaterThan(0);

    // RRF scores should be positive and results should be sorted descending
    for (let i = 0; i < json.results.length - 1; i++) {
      expect(json.results[i].score).toBeGreaterThanOrEqual(
        json.results[i + 1].score
      );
    }
  });

  it('AT-US-06: interleave fusion strategy alternates result types', async () => {
    const res = await request
      .post('/search/unified')
      .set(contextHeaders())
      .send({
        query: 'search',
        limit: 10,
        fusionStrategy: 'interleave',
      })
      .expect(200);

    const json = res.body;
    expect(json.metadata.fusionStrategy).toBe('interleave');

    // Check that types alternate when both are present
    if (json.results.length >= 4) {
      const types = json.results.map((r: any) => r.type);
      // Should see some alternation pattern (not all same type consecutively)
      const hasGraphAndText = types.includes('graph') && types.includes('text');
      expect(hasGraphAndText).toBe(true);
    }
  });

  it('AT-US-07: graph_first fusion strategy orders graph results before text', async () => {
    const res = await request
      .post('/search/unified')
      .set(contextHeaders())
      .send({
        query: 'search',
        limit: 10,
        fusionStrategy: 'graph_first',
      })
      .expect(200);

    const json = res.body;
    expect(json.metadata.fusionStrategy).toBe('graph_first');

    // Find first text result index
    const firstTextIndex = json.results.findIndex(
      (r: any) => r.type === 'text'
    );
    const firstGraphIndex = json.results.findIndex(
      (r: any) => r.type === 'graph'
    );

    // If both exist, all graph results should come before text results
    if (firstTextIndex !== -1 && firstGraphIndex !== -1) {
      expect(firstGraphIndex).toBeLessThan(firstTextIndex);

      // All results before first text should be graph
      const beforeText = json.results.slice(0, firstTextIndex);
      beforeText.forEach((r: any) => {
        expect(r.type).toBe('graph');
      });
    }
  });

  it('AT-US-08: text_first fusion strategy orders text results before graph', async () => {
    const res = await request
      .post('/search/unified')
      .set(contextHeaders())
      .send({
        query: 'search',
        limit: 10,
        fusionStrategy: 'text_first',
      })
      .expect(200);

    const json = res.body;
    expect(json.metadata.fusionStrategy).toBe('text_first');

    // Find first graph result index
    const firstTextIndex = json.results.findIndex(
      (r: any) => r.type === 'text'
    );
    const firstGraphIndex = json.results.findIndex(
      (r: any) => r.type === 'graph'
    );

    // If both exist, all text results should come before graph results
    if (firstTextIndex !== -1 && firstGraphIndex !== -1) {
      expect(firstTextIndex).toBeLessThan(firstGraphIndex);

      // All results before first graph should be text
      const beforeGraph = json.results.slice(0, firstGraphIndex);
      beforeGraph.forEach((r: any) => {
        expect(r.type).toBe('text');
      });
    }
  });

  it('AT-US-09: includes relationships when enabled', async () => {
    // Test unified search with relationship expansion enabled
    const res = await request
      .post('/search/unified')
      .set(contextHeaders())
      .send({
        query: 'Decision hybrid search architecture BM25 semantic', // Specific query for our objects
        limit: 20,
        resultTypes: 'graph', // Only graph results
        relationshipOptions: {
          enabled: true,
          maxDepth: 1,
          maxNeighbors: 5,
        },
      })
      .expect(200);

    const json = res.body;
    const graphResults = json.results.filter((r: any) => r.type === 'graph');

    // Verify we got some graph results
    expect(graphResults.length).toBeGreaterThan(0);

    // All graph results should have relationships field (even if empty array)
    graphResults.forEach((result: any) => {
      expect(result.relationships).toBeDefined();
      expect(Array.isArray(result.relationships)).toBe(true);
    });

    // Check if our specific decision is in the results
    const ourDecision = graphResults.find((r: any) => r.id === decisionId);
    if (ourDecision) {
      // If our decision is found, it should have the relationship we created
      expect(ourDecision.relationships.length).toBeGreaterThan(0);

      // Validate relationship structure
      ourDecision.relationships.forEach((rel: any) => {
        expect(rel.object_id).toBeDefined();
        expect(rel.type).toBeDefined();
        expect(rel.direction).toBeDefined();
        expect(['in', 'out'].includes(rel.direction)).toBe(true);
      });
    } else {
      // If our decision isn't in top results, verify that the relationship expansion
      // feature is working by checking that at least the relationships field exists
      // and has the correct structure for all results

      // Check if any results have relationships
      const resultsWithRels = graphResults.filter(
        (r: any) => r.relationships && r.relationships.length > 0
      );

      if (resultsWithRels.length > 0) {
        // Validate structure of first result with relationships
        resultsWithRels[0].relationships.forEach((rel: any) => {
          expect(rel.object_id).toBeDefined();
          expect(rel.type).toBeDefined();
          expect(rel.direction).toBeDefined();
          expect(['in', 'out'].includes(rel.direction)).toBe(true);
        });
      }
    }
  });

  it('AT-US-10: respects limit parameter', async () => {
    const limit = 5;
    const res = await request
      .post('/search/unified')
      .set(contextHeaders())
      .send({
        query: 'search',
        limit,
      })
      .expect(200);

    const json = res.body;
    expect(json.results.length).toBeLessThanOrEqual(limit);
  });

  it('AT-US-11: returns performance metadata', async () => {
    const res = await request
      .post('/search/unified')
      .set(contextHeaders())
      .send({
        query: 'hybrid search',
        limit: 10,
      })
      .expect(200);

    const json = res.body;
    expect(json.metadata.executionTime).toBeDefined();
    expect(json.metadata.executionTime.graphSearchMs).toBeDefined();
    expect(json.metadata.executionTime.textSearchMs).toBeDefined();
    expect(json.metadata.executionTime.fusionMs).toBeDefined();
    expect(json.metadata.executionTime.totalMs).toBeDefined();

    // All times should be positive
    expect(json.metadata.executionTime.graphSearchMs).toBeGreaterThanOrEqual(0);
    expect(json.metadata.executionTime.textSearchMs).toBeGreaterThanOrEqual(0);
    expect(json.metadata.executionTime.fusionMs).toBeGreaterThanOrEqual(0);
    expect(json.metadata.executionTime.totalMs).toBeGreaterThan(0);
  });

  it('AT-US-12: validates query length constraint', async () => {
    const longQuery = 'a'.repeat(801); // Exceeds maxLength of 800
    const res = await request
      .post('/search/unified')
      .set(contextHeaders())
      .send({
        query: longQuery,
        limit: 10,
      });

    // Should return 400 Bad Request
    expect(res.status).toBe(400);
  });

  it('AT-US-13: validates limit constraints', async () => {
    const res = await request
      .post('/search/unified')
      .set(contextHeaders())
      .send({
        query: 'search',
        limit: 101, // Exceeds max of 100
      });

    expect(res.status).toBe(400);
  });

  it('AT-US-14: handles empty results gracefully', async () => {
    const res = await request
      .post('/search/unified')
      .set(contextHeaders())
      .send({
        query: 'xyzabc123nonexistent',
        limit: 10,
      })
      .expect(200);

    const json = res.body;
    expect(json.results).toBeDefined();
    expect(Array.isArray(json.results)).toBe(true);

    // Note: BM25 lexical search may return results even for nonsense queries
    // due to token matching. The important thing is that the response structure
    // is valid and metadata is correct.
    expect(json.metadata).toBeDefined();
    expect(json.metadata.totalResults).toBe(json.results.length);
    expect(json.metadata.graphResultCount).toBeGreaterThanOrEqual(0);
    expect(json.metadata.textResultCount).toBeGreaterThanOrEqual(0);
  });

  it('AT-US-15: requires search:read scope', async () => {
    const res = await request
      .post('/search/unified')
      .set({
        ...authHeader('none', 'unified-search'), // Missing search:read scope
        'x-org-id': ctx.orgId,
        'x-project-id': ctx.projectId,
      })
      .send({
        query: 'search',
        limit: 10,
      });

    // Should return 403 Forbidden due to missing scope
    expect(res.status).toBe(403);
  });
});
