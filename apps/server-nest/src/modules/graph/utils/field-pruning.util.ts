import {
  TraversalNode,
  TraversalEdge,
  GraphTraversalResult,
} from '../graph.types';

/**
 * Field pruning strategy for controlling response payload size
 */
export enum FieldStrategy {
  FULL = 'full', // All fields (default)
  COMPACT = 'compact', // Remove optional/large fields (phaseIndex, paths)
  MINIMAL = 'minimal', // Only essential fields (id, type, depth for nodes; id, type, src_id, dst_id for edges)
}

/**
 * Salience scores for each field (0-1 scale, higher = more important).
 * Used to determine which fields to include based on strategy threshold.
 */
export const FIELD_SALIENCE: Record<string, number> = {
  // Node fields
  'node.id': 1.0, // Essential for identification
  'node.type': 0.9, // Core semantic classification
  'node.depth': 0.9, // Core traversal metadata
  'node.key': 0.7, // Human-readable identifier (optional)
  'node.labels': 0.7, // Semantic tags for filtering
  'node.phaseIndex': 0.5, // Advanced phased traversal feature
  'node.paths': 0.3, // Large, debug-focused path enumeration

  // Edge fields
  'edge.id': 1.0, // Essential for identification
  'edge.type': 1.0, // Essential relationship classification
  'edge.src_id': 1.0, // Essential topology
  'edge.dst_id': 1.0, // Essential topology

  // Result metadata
  'result.roots': 1.0,
  'result.nodes': 1.0,
  'result.edges': 1.0,
  'result.truncated': 0.9,
  'result.max_depth_reached': 0.7,
  'result.total_nodes': 0.7,
  'result.has_next_page': 0.9,
  'result.has_previous_page': 0.9,
  'result.next_cursor': 0.9,
  'result.previous_cursor': 0.9,
  'result.approx_position_start': 0.5,
  'result.approx_position_end': 0.5,
  'result.page_direction': 0.5,
};

/**
 * Salience threshold for each strategy.
 * Fields with salience >= threshold are included.
 */
const STRATEGY_THRESHOLDS: Record<FieldStrategy, number> = {
  [FieldStrategy.FULL]: 0.0, // Include all fields
  [FieldStrategy.COMPACT]: 0.6, // Include fields with salience >= 0.6 (removes paths, phaseIndex)
  [FieldStrategy.MINIMAL]: 0.85, // Include only high-salience fields (id, type, core topology)
};

/**
 * Prune a traversal node based on field strategy
 */
export function pruneNode(
  node: TraversalNode,
  strategy: FieldStrategy
): TraversalNode {
  if (strategy === FieldStrategy.FULL) {
    return node;
  }

  const threshold = STRATEGY_THRESHOLDS[strategy];
  const pruned: Partial<TraversalNode> = {
    id: node.id,
    depth: node.depth,
    type: node.type,
    labels: node.labels, // Always include required field
  };

  // Apply salience-based pruning for optional/low-salience fields
  // key can be null, so check if it exists in node (not just truthy)
  if (node.key !== undefined && FIELD_SALIENCE['node.key'] >= threshold) {
    pruned.key = node.key;
  }

  // Optional fields only included if they exist AND meet threshold
  if (
    node.phaseIndex !== undefined &&
    FIELD_SALIENCE['node.phaseIndex'] >= threshold
  ) {
    pruned.phaseIndex = node.phaseIndex;
  }

  if (node.paths !== undefined && FIELD_SALIENCE['node.paths'] >= threshold) {
    pruned.paths = node.paths;
  }

  return pruned as TraversalNode;
}

/**
 * Prune a traversal edge based on field strategy
 */
export function pruneEdge(
  edge: TraversalEdge,
  strategy: FieldStrategy
): TraversalEdge {
  // For edges, all fields are essential (id, type, src_id, dst_id)
  // Even minimal strategy includes everything since edges are small
  return edge;
}

/**
 * Prune result metadata based on field strategy
 */
export function pruneResultMetadata(
  result: GraphTraversalResult,
  strategy: FieldStrategy
): GraphTraversalResult {
  if (strategy === FieldStrategy.FULL) {
    return result;
  }

  const threshold = STRATEGY_THRESHOLDS[strategy];
  const pruned: GraphTraversalResult = {
    roots: result.roots,
    nodes: result.nodes, // Already pruned by pruneNode
    edges: result.edges, // Already pruned by pruneEdge
    truncated: result.truncated,
    max_depth_reached: result.max_depth_reached, // Required field
  };

  // Optional pagination metadata - include if present AND meets threshold
  if (
    'total_nodes' in result &&
    FIELD_SALIENCE['result.total_nodes'] >= threshold
  ) {
    pruned.total_nodes = result.total_nodes;
  }

  if (
    'has_next_page' in result &&
    FIELD_SALIENCE['result.has_next_page'] >= threshold
  ) {
    pruned.has_next_page = result.has_next_page;
  }

  if (
    'has_previous_page' in result &&
    FIELD_SALIENCE['result.has_previous_page'] >= threshold
  ) {
    pruned.has_previous_page = result.has_previous_page;
  }

  if (
    'next_cursor' in result &&
    FIELD_SALIENCE['result.next_cursor'] >= threshold
  ) {
    pruned.next_cursor = result.next_cursor;
  }

  if (
    'previous_cursor' in result &&
    FIELD_SALIENCE['result.previous_cursor'] >= threshold
  ) {
    pruned.previous_cursor = result.previous_cursor;
  }

  if (
    'approx_position_start' in result &&
    FIELD_SALIENCE['result.approx_position_start'] >= threshold
  ) {
    pruned.approx_position_start = result.approx_position_start;
  }

  if (
    'approx_position_end' in result &&
    FIELD_SALIENCE['result.approx_position_end'] >= threshold
  ) {
    pruned.approx_position_end = result.approx_position_end;
  }

  if (
    'page_direction' in result &&
    FIELD_SALIENCE['result.page_direction'] >= threshold
  ) {
    pruned.page_direction = result.page_direction;
  }

  return pruned;
}

/**
 * Apply field pruning to a complete graph traversal result
 */
export function pruneGraphResult(
  result: GraphTraversalResult,
  strategy: FieldStrategy = FieldStrategy.FULL
): GraphTraversalResult {
  if (strategy === FieldStrategy.FULL) {
    return result;
  }

  // Prune nodes
  const prunedNodes = result.nodes.map((node) => pruneNode(node, strategy));

  // Prune edges (currently no-op as all edge fields are essential)
  const prunedEdges = result.edges.map((edge) => pruneEdge(edge, strategy));

  // Prune metadata
  const prunedResult = pruneResultMetadata(
    {
      ...result,
      nodes: prunedNodes,
      edges: prunedEdges,
    },
    strategy
  );

  return prunedResult;
}

/**
 * Estimate payload size reduction percentage for a strategy
 * Based on average field sizes and typical usage patterns
 */
export function estimatePayloadReduction(strategy: FieldStrategy): number {
  switch (strategy) {
    case FieldStrategy.FULL:
      return 0; // No reduction
    case FieldStrategy.COMPACT:
      // Removes paths (~30% of payload in path-heavy queries)
      // and phaseIndex (~2% overhead)
      return 25; // 25% reduction on average
    case FieldStrategy.MINIMAL:
      // Removes key, labels, phaseIndex, paths, pagination metadata
      // Can reduce payload by 40-50% for large results
      return 45; // 45% reduction on average
    default:
      return 0;
  }
}
