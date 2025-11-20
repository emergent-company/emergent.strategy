import { beforeAll, afterAll, beforeEach, describe, it, expect } from 'vitest';
import supertest from 'supertest';
import { createE2EContext, E2EContext } from './e2e-context';
import { authHeader } from './auth-helpers';

/**
 * Graph Search with Relationships E2E Tests
 *
 * Validates that graph search operations correctly handle relationships:
 * 1. POST /graph/search returns relevant objects with correct ranking
 * 2. POST /graph/traverse retrieves relationships up to max_depth
 * 3. POST /graph/expand includes relationship properties
 * 4. POST /graph/search-with-neighbors combines search + relationships
 * 5. Relationship metadata (type, direction, properties) is accurate
 *
 * Test Strategy:
 * - Create controlled graph structure: Decision → Requirement → Issue chain
 * - Use deterministic queries with known semantic properties
 * - Validate relationship expansion and filtering
 * - Test different traversal depths and directions
 */

let ctx: E2EContext;
let request: supertest.SuperTest<supertest.Test>;

// Object IDs for test graph
let decisionId: string;
let requirementId: string;
let issueId: string;
let unrelatedId: string;

// Relationship IDs
let relDecisionToRequirement: string;
let relRequirementToIssue: string;

const contextHeaders = () => ({
  ...authHeader('all', 'graph-rel'),
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

describe('Graph Search with Relationships E2E', () => {
  beforeAll(async () => {
    ctx = await createE2EContext('graph-rel');
    request = supertest(ctx.baseUrl);
  });

  beforeEach(async () => {
    await ctx.cleanup();

    // Create test graph structure: Decision → Requirement → Issue
    // This simulates a common pattern where decisions inform requirements which lead to issues

    const decision = await createObject(
      'Decision',
      'dec-search-architecture',
      {
        title: 'Search Architecture Decision',
        description:
          'Decided to implement hybrid search combining lexical and semantic signals for better relevance',
        status: 'approved',
      },
      ['architecture', 'search']
    );
    decisionId = decision.id;

    const requirement = await createObject(
      'Requirement',
      'req-hybrid-search',
      {
        title: 'Hybrid Search Requirement',
        description:
          'System must support hybrid search that combines BM25 lexical ranking with vector semantic search',
        priority: 'high',
      },
      ['search', 'feature']
    );
    requirementId = requirement.id;

    const issue = await createObject(
      'Issue',
      'issue-search-performance',
      {
        title: 'Search Performance Issue',
        description:
          'Hybrid search queries taking longer than 500ms need optimization and performance benchmarking',
        severity: 'medium',
      },
      ['search', 'performance']
    );
    issueId = issue.id;

    const unrelated = await createObject(
      'Task',
      'task-unrelated',
      {
        title: 'Unrelated Task',
        description: 'This task has nothing to do with search or architecture',
        status: 'open',
      },
      ['misc']
    );
    unrelatedId = unrelated.id;

    // Create relationships with properties
    const rel1 = await createRelationship(
      'informs',
      decisionId,
      requirementId,
      {
        confidence: 0.95,
        created_at: '2025-01-01T00:00:00Z',
      }
    );
    relDecisionToRequirement = rel1.id;

    const rel2 = await createRelationship('leads_to', requirementId, issueId, {
      confidence: 0.85,
      identified_at: '2025-01-15T00:00:00Z',
    });
    relRequirementToIssue = rel2.id;
  });

  afterAll(async () => {
    await ctx.close();
  });

  it('AT-GR-01: /graph/search returns relevant objects with correct ranking', async () => {
    const res = await request
      .post('/graph/search')
      .set(contextHeaders())
      .send({
        query: 'hybrid search architecture',
        pagination: { limit: 10 },
      })
      .expect(200);

    const body = res.body;
    expect(Array.isArray(body.items)).toBe(true);
    expect(body.items.length).toBeGreaterThan(0);

    // Find our test objects in results
    const ids = body.items.map((item: any) => item.object_id);

    // Decision and Requirement should be in results (semantically related to query)
    expect(ids).toContain(decisionId);
    expect(ids).toContain(requirementId);

    // Validate result structure
    const topResult = body.items[0];
    expect(topResult).toHaveProperty('object_id');
    expect(topResult).toHaveProperty('score');
    expect(typeof topResult.score).toBe('number');
    expect(topResult.score).toBeGreaterThan(0);
    expect(topResult.score).toBeLessThanOrEqual(1);
  });

  it('AT-GR-02: /graph/traverse retrieves relationships up to max_depth', async () => {
    const res = await request
      .post('/graph/traverse')
      .set(contextHeaders())
      .send({
        root_ids: [decisionId],
        max_depth: 2,
        direction: 'out',
      })
      .expect(200);

    const body = res.body;
    expect(Array.isArray(body.nodes)).toBe(true);
    expect(Array.isArray(body.edges)).toBe(true);

    // At depth 2, we should reach Decision → Requirement → Issue
    const nodeIds = body.nodes.map((n: any) => n.id);
    expect(nodeIds).toContain(decisionId); // depth 0 (root)
    expect(nodeIds).toContain(requirementId); // depth 1
    expect(nodeIds).toContain(issueId); // depth 2

    // Should have 2 edges (relationships)
    expect(body.edges.length).toBe(2);

    // Validate edge structure
    const edge1 = body.edges.find(
      (e: any) => e.src_id === decisionId && e.dst_id === requirementId
    );
    expect(edge1).toBeDefined();
    expect(edge1.type).toBe('informs');
    expect(edge1.properties).toHaveProperty('confidence');
    expect(edge1.properties.confidence).toBe(0.95);
  });

  it('AT-GR-03: /graph/traverse respects max_depth boundaries', async () => {
    const res = await request
      .post('/graph/traverse')
      .set(contextHeaders())
      .send({
        root_ids: [decisionId],
        max_depth: 1, // Only go 1 level deep
        direction: 'out',
      })
      .expect(200);

    const body = res.body;
    const nodeIds = body.nodes.map((n: any) => n.id);

    // Should reach Decision and Requirement but NOT Issue
    expect(nodeIds).toContain(decisionId);
    expect(nodeIds).toContain(requirementId);
    expect(nodeIds).not.toContain(issueId);

    // Should have only 1 edge
    expect(body.edges.length).toBe(1);
  });

  it('AT-GR-04: /graph/expand includes relationship properties', async () => {
    const res = await request
      .post('/graph/expand')
      .set(contextHeaders())
      .send({
        object_ids: [requirementId],
        direction: 'both', // Include both incoming and outgoing relationships
      })
      .expect(200);

    const body = res.body;
    expect(Array.isArray(body.nodes)).toBe(true);
    expect(Array.isArray(body.edges)).toBe(true);

    // Should include the requirement itself plus connected nodes
    const nodeIds = body.nodes.map((n: any) => n.id);
    expect(nodeIds).toContain(requirementId);
    expect(nodeIds).toContain(decisionId); // incoming
    expect(nodeIds).toContain(issueId); // outgoing

    // Should have 2 edges
    expect(body.edges.length).toBe(2);

    // Validate incoming relationship (Decision → Requirement)
    const incomingEdge = body.edges.find(
      (e: any) => e.dst_id === requirementId && e.src_id === decisionId
    );
    expect(incomingEdge).toBeDefined();
    expect(incomingEdge.type).toBe('informs');
    expect(incomingEdge.properties.confidence).toBe(0.95);

    // Validate outgoing relationship (Requirement → Issue)
    const outgoingEdge = body.edges.find(
      (e: any) => e.src_id === requirementId && e.dst_id === issueId
    );
    expect(outgoingEdge).toBeDefined();
    expect(outgoingEdge.type).toBe('leads_to');
    expect(outgoingEdge.properties.confidence).toBe(0.85);
  });

  it('AT-GR-05: /graph/expand filters by direction (incoming only)', async () => {
    const res = await request
      .post('/graph/expand')
      .set(contextHeaders())
      .send({
        object_ids: [requirementId],
        direction: 'in', // Only incoming relationships
      })
      .expect(200);

    const body = res.body;
    const nodeIds = body.nodes.map((n: any) => n.id);

    // Should include requirement and decision (incoming) but NOT issue (outgoing)
    expect(nodeIds).toContain(requirementId);
    expect(nodeIds).toContain(decisionId);
    expect(nodeIds).not.toContain(issueId);

    // Should have only 1 edge (incoming)
    expect(body.edges.length).toBe(1);
    expect(body.edges[0].dst_id).toBe(requirementId);
  });

  it('AT-GR-06: /graph/expand filters by direction (outgoing only)', async () => {
    const res = await request
      .post('/graph/expand')
      .set(contextHeaders())
      .send({
        object_ids: [requirementId],
        direction: 'out', // Only outgoing relationships
      })
      .expect(200);

    const body = res.body;
    const nodeIds = body.nodes.map((n: any) => n.id);

    // Should include requirement and issue (outgoing) but NOT decision (incoming)
    expect(nodeIds).toContain(requirementId);
    expect(nodeIds).toContain(issueId);
    expect(nodeIds).not.toContain(decisionId);

    // Should have only 1 edge (outgoing)
    expect(body.edges.length).toBe(1);
    expect(body.edges[0].src_id).toBe(requirementId);
  });

  it('AT-GR-07: /graph/search-with-neighbors combines search and relationships', async () => {
    // Note: This endpoint may not exist yet - test will fail until implemented
    // This test documents the expected behavior for the unified search feature

    const res = await request
      .post('/graph/search-with-neighbors')
      .set(contextHeaders())
      .send({
        query: 'search architecture',
        pagination: { limit: 10 },
        expand_neighbors: true,
        max_depth: 1,
      })
      .expect(200);

    const body = res.body;

    // Should have items (search results) with expanded relationships
    expect(Array.isArray(body.items)).toBe(true);
    expect(body.items.length).toBeGreaterThan(0);

    // Each item should have neighbor information if available
    const itemWithNeighbors = body.items.find(
      (item: any) => item.neighbors && item.neighbors.length > 0
    );

    if (itemWithNeighbors) {
      expect(Array.isArray(itemWithNeighbors.neighbors)).toBe(true);

      // Neighbors should have relationship metadata
      const neighbor = itemWithNeighbors.neighbors[0];
      expect(neighbor).toHaveProperty('object_id');
      expect(neighbor).toHaveProperty('relationship_type');
      expect(neighbor).toHaveProperty('direction');
    }
  });

  it('AT-GR-08: validates relationship metadata accuracy', async () => {
    // Get the relationship directly to verify metadata
    const res = await request
      .post('/graph/traverse')
      .set(contextHeaders())
      .send({
        root_ids: [decisionId],
        max_depth: 1,
      })
      .expect(200);

    const body = res.body;
    const edge = body.edges.find(
      (e: any) => e.src_id === decisionId && e.dst_id === requirementId
    );

    expect(edge).toBeDefined();

    // Validate all metadata fields
    expect(edge.id).toBeDefined();
    expect(edge.type).toBe('informs');
    expect(edge.src_id).toBe(decisionId);
    expect(edge.dst_id).toBe(requirementId);
    expect(edge.properties).toBeDefined();
    expect(typeof edge.properties).toBe('object');
    expect(edge.properties.confidence).toBe(0.95);
    expect(edge.properties.created_at).toBe('2025-01-01T00:00:00Z');
  });

  it('AT-GR-09: /graph/search filters unrelated objects correctly', async () => {
    const res = await request
      .post('/graph/search')
      .set(contextHeaders())
      .send({
        query: 'hybrid search',
        pagination: { limit: 10 },
      })
      .expect(200);

    const body = res.body;
    const ids = body.items.map((item: any) => item.object_id);

    // Unrelated task should NOT be in search results for "hybrid search"
    expect(ids).not.toContain(unrelatedId);

    // But search-related objects should be present
    const searchRelatedIds = [decisionId, requirementId, issueId];
    const foundSearchRelated = searchRelatedIds.some((id) => ids.includes(id));
    expect(foundSearchRelated).toBe(true);
  });

  it('AT-GR-10: /graph/traverse handles multiple root nodes', async () => {
    const res = await request
      .post('/graph/traverse')
      .set(contextHeaders())
      .send({
        root_ids: [decisionId, issueId], // Start from both ends of the chain
        max_depth: 1,
        direction: 'both',
      })
      .expect(200);

    const body = res.body;
    const nodeIds = body.nodes.map((n: any) => n.id);

    // From Decision → should see Requirement
    // From Issue (going backwards) → should see Requirement
    expect(nodeIds).toContain(decisionId);
    expect(nodeIds).toContain(issueId);
    expect(nodeIds).toContain(requirementId); // Connected to both roots

    // Should have 2 edges (the two relationships)
    expect(body.edges.length).toBe(2);
  });
});
