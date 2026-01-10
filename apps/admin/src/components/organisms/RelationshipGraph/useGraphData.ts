/**
 * Custom hook for fetching and managing graph data
 * Handles API calls, data transformation to React Flow format, and expansion state
 */
import { useState, useCallback, useEffect, useMemo } from 'react';
import type { Node, Edge } from '@xyflow/react';
import { useApi } from '@/hooks/use-api';
import {
  getLayoutedElements,
  getOptimalDirection,
  DEFAULT_NODE_WIDTH,
  DEFAULT_NODE_HEIGHT,
} from './graphLayoutUtils';

/** Data attached to each node */
export interface GraphNodeData extends Record<string, unknown> {
  /** Display label for the node */
  label: string;
  /** Object type (e.g., Person, Event) */
  type: string;
  /** Object status */
  status?: string;
  /** Whether this node has unexpanded relationships */
  hasMore: boolean;
  /** Whether this is the root/focal node */
  isRoot: boolean;
  /** Whether this node is currently expanded */
  isExpanded?: boolean;
  /** Whether this node is currently focused (from search) */
  isFocused?: boolean;
  /** Whether this node is currently hovered */
  isHovered?: boolean;
  /** Depth from root node */
  depth: number;
  /** Original object ID */
  objectId: string;
  /** Relationship count if known (shown on expand button) */
  relationshipCount?: number;
  /** Number of descendant nodes that will be hidden when collapsed */
  descendantCount?: number;
  /** Properties for tooltip display */
  properties?: Record<string, unknown>;
}

/** Data attached to each edge */
export interface GraphEdgeData extends Record<string, unknown> {
  /** Relationship type label */
  label: string;
  /** Vertical offset for label to avoid overlapping with reverse edges */
  labelOffsetY?: number;
  /** Vertical offset for the edge path itself (to separate parallel edges) - used by bezier edges */
  edgeOffsetY?: number;
  /** Horizontal offset for the edge path (to separate parallel edges) - used by orthogonal edges */
  edgeOffsetX?: number;
  /** Whether source and target nodes are in the same column (same depth) - for orthogonal edges */
  isSameColumn?: boolean;
  /** Whether this edge should be highlighted (connected to hovered node) */
  isHighlighted?: boolean;
}

/** API response types */
interface TraversalNode {
  id: string;
  key?: string | null;
  type: string;
  status?: string | null;
  properties?: Record<string, unknown>;
  depth?: number;
}

interface TraversalEdge {
  id: string;
  type: string;
  src_id: string;
  dst_id: string;
  properties?: Record<string, unknown>;
}

interface TraversalResponse {
  nodes: TraversalNode[];
  edges: TraversalEdge[];
  truncated?: boolean;
}

export interface UseGraphDataOptions {
  /** The root object ID to start traversal from */
  objectId: string;
  /** Initial depth to fetch (default: 2) */
  initialDepth?: number;
  /** Maximum depth allowed (default: 5) */
  maxDepth?: number;
}

export interface UseGraphDataReturn {
  /** React Flow nodes */
  nodes: Node<GraphNodeData>[];
  /** React Flow edges */
  edges: Edge<GraphEdgeData>[];
  /** Loading state */
  loading: boolean;
  /** Error message if any */
  error: string | null;
  /** Whether the graph was truncated due to size limits */
  truncated: boolean;
  /** Expand a specific node to show more relationships */
  expandNode: (nodeId: string) => Promise<void>;
  /** Collapse a specific node to hide its relationships */
  collapseNode: (nodeId: string) => void;
  /** Reset graph to initial state */
  resetGraph: () => void;
  /** Set of currently expanded node IDs */
  expandedNodes: Set<string>;
  /** Re-layout the graph */
  relayout: () => void;
}

/**
 * Apply label offsets to edges that have bidirectional counterparts
 * This prevents overlapping labels when A→B and B→A both exist
 */
function applyBidirectionalLabelOffsets(
  edges: Edge<GraphEdgeData>[]
): Edge<GraphEdgeData>[] {
  // Build a map of node pairs to detect bidirectional edges
  const edgePairs = new Map<string, Edge<GraphEdgeData>[]>();

  edges.forEach((edge) => {
    // Create a canonical key for the node pair (sorted to group A→B and B→A together)
    const nodes = [edge.source, edge.target].sort();
    const pairKey = `${nodes[0]}:${nodes[1]}`;

    if (!edgePairs.has(pairKey)) {
      edgePairs.set(pairKey, []);
    }
    edgePairs.get(pairKey)!.push(edge);
  });

  // Apply offsets to edges that share the same node pair
  const LABEL_OFFSET = 14; // Pixels to offset labels vertically

  return edges.map((edge) => {
    const nodes = [edge.source, edge.target].sort();
    const pairKey = `${nodes[0]}:${nodes[1]}`;
    const siblings = edgePairs.get(pairKey) || [];

    if (siblings.length <= 1) {
      // No bidirectional edge, no offset needed
      return edge;
    }

    // Find this edge's index in the siblings array
    const index = siblings.findIndex((e) => e.id === edge.id);

    // Offset: first edge goes up, second goes down, etc.
    const offset = index === 0 ? -LABEL_OFFSET : LABEL_OFFSET;

    return {
      ...edge,
      data: {
        ...edge.data,
        label: edge.data?.label || '',
        labelOffsetY: offset,
      },
    };
  });
}

/**
 * Hook for fetching and managing relationship graph data
 */
export function useGraphData({
  objectId,
  initialDepth = 2,
  maxDepth = 5,
}: UseGraphDataOptions): UseGraphDataReturn {
  const { fetchJson, apiBase } = useApi();

  const [nodes, setNodes] = useState<Node<GraphNodeData>[]>([]);
  const [edges, setEdges] = useState<Edge<GraphEdgeData>[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [truncated, setTruncated] = useState(false);
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
  const [nodeDepths, setNodeDepths] = useState<Map<string, number>>(new Map());

  /**
   * Transform API response to React Flow format
   * @param queryMaxDepth - the max_depth used in the query; nodes at this depth may have undiscovered connections
   */
  const transformToReactFlow = useCallback(
    (
      response: TraversalResponse,
      rootId: string,
      queryMaxDepth: number,
      existingNodes: Node<GraphNodeData>[] = [],
      existingEdges: Edge<GraphEdgeData>[] = [],
      existingDepths: Map<string, number> = new Map()
    ): {
      nodes: Node<GraphNodeData>[];
      edges: Edge<GraphEdgeData>[];
      depths: Map<string, number>;
      truncated: boolean;
    } => {
      const existingNodeIds = new Set(existingNodes.map((n) => n.id));
      const existingEdgeIds = new Set(existingEdges.map((e) => e.id));
      const newDepths = new Map(existingDepths);

      // Calculate depths for new nodes based on edges
      const adjacencyList = new Map<string, string[]>();
      response.edges.forEach((edge) => {
        if (!adjacencyList.has(edge.src_id)) {
          adjacencyList.set(edge.src_id, []);
        }
        if (!adjacencyList.has(edge.dst_id)) {
          adjacencyList.set(edge.dst_id, []);
        }
        adjacencyList.get(edge.src_id)!.push(edge.dst_id);
        adjacencyList.get(edge.dst_id)!.push(edge.src_id);
      });

      // BFS to assign depths
      if (!newDepths.has(rootId)) {
        newDepths.set(rootId, 0);
      }

      const queue: string[] = [rootId];
      const visited = new Set<string>([rootId]);

      while (queue.length > 0) {
        const current = queue.shift()!;
        const currentDepth = newDepths.get(current) ?? 0;
        const neighbors = adjacencyList.get(current) ?? [];

        for (const neighbor of neighbors) {
          if (!visited.has(neighbor)) {
            visited.add(neighbor);
            if (!newDepths.has(neighbor)) {
              newDepths.set(neighbor, currentDepth + 1);
            }
            queue.push(neighbor);
          }
        }
      }

      // Count edges per node to determine if there are more relationships
      const edgeCountByNode = new Map<string, number>();
      response.edges.forEach((edge) => {
        edgeCountByNode.set(
          edge.src_id,
          (edgeCountByNode.get(edge.src_id) ?? 0) + 1
        );
        edgeCountByNode.set(
          edge.dst_id,
          (edgeCountByNode.get(edge.dst_id) ?? 0) + 1
        );
      });

      // Transform nodes
      const newNodes: Node<GraphNodeData>[] = response.nodes
        .filter((node) => !existingNodeIds.has(node.id))
        .map((node) => {
          const depth = newDepths.get(node.id) ?? 0;
          const name =
            (node.properties?.name as string) ||
            (node.properties?.title as string) ||
            node.key ||
            `${node.type}-${node.id.substring(0, 8)}`;

          // Nodes at the edge of our query depth may have undiscovered connections
          // We set hasMore=true for them since we don't know if they have more relationships
          const edgeCount = edgeCountByNode.get(node.id) ?? 0;
          const isAtQueryBoundary = depth >= queryMaxDepth;
          const hasMore = edgeCount > 0 || isAtQueryBoundary;

          const nodeData: GraphNodeData = {
            label: name,
            type: node.type,
            status: node.status ?? undefined,
            hasMore,
            isRoot: node.id === rootId,
            depth,
            objectId: node.id,
            relationshipCount: edgeCount || undefined,
            properties: node.properties,
          };

          return {
            id: node.id,
            type: 'graphNode',
            position: { x: 0, y: 0 }, // Will be set by layout
            width: DEFAULT_NODE_WIDTH,
            height: DEFAULT_NODE_HEIGHT,
            data: nodeData,
          };
        });

      // Transform edges
      const newEdges: Edge<GraphEdgeData>[] = response.edges
        .filter((edge) => !existingEdgeIds.has(edge.id))
        .map((edge) => {
          const edgeData: GraphEdgeData = {
            label: edge.type.replace(/_/g, ' '),
          };

          return {
            id: edge.id,
            source: edge.src_id,
            target: edge.dst_id,
            type: 'graphEdge',
            data: edgeData,
          };
        });

      const allNodes = [...existingNodes, ...newNodes];
      const allEdges = [...existingEdges, ...newEdges];

      // Apply layout
      const direction = getOptimalDirection(allNodes.length);
      const { nodes: layoutedNodes, edges: layoutedEdges } =
        getLayoutedElements(allNodes as Node[], allEdges as Edge[], {
          direction,
        });

      return {
        nodes: layoutedNodes as Node<GraphNodeData>[],
        edges: layoutedEdges as Edge<GraphEdgeData>[],
        depths: newDepths,
        truncated: response.truncated ?? false,
      };
    },
    []
  );

  /**
   * Fetch initial graph data
   */
  const fetchGraph = useCallback(async () => {
    if (!objectId) return;

    setLoading(true);
    setError(null);

    try {
      const response = await fetchJson<TraversalResponse>(
        `${apiBase}/api/graph/traverse`,
        {
          method: 'POST',
          body: {
            root_ids: [objectId],
            max_depth: initialDepth,
            max_nodes: 100,
            max_edges: 200,
            direction: 'both',
          },
        }
      );

      const result = transformToReactFlow(response, objectId, initialDepth);
      setNodes(result.nodes);
      setEdges(applyBidirectionalLabelOffsets(result.edges));
      setNodeDepths(result.depths);
      setTruncated(result.truncated);
      setExpandedNodes(new Set([objectId]));
    } catch (err) {
      console.error('Failed to fetch graph data:', err);
      setError(
        err instanceof Error ? err.message : 'Failed to fetch graph data'
      );
    } finally {
      setLoading(false);
    }
  }, [objectId, initialDepth, fetchJson, apiBase, transformToReactFlow]);

  /**
   * Expand a node to show more relationships
   */
  const expandNode = useCallback(
    async (nodeId: string) => {
      if (expandedNodes.has(nodeId)) return;

      const nodeDepth = nodeDepths.get(nodeId) ?? 0;
      if (nodeDepth >= maxDepth) {
        console.warn(`Cannot expand beyond max depth of ${maxDepth}`);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        // Fetch just 1 level from the expanded node
        const response = await fetchJson<TraversalResponse>(
          `${apiBase}/api/graph/traverse`,
          {
            method: 'POST',
            body: {
              root_ids: [nodeId],
              max_depth: 1,
              max_nodes: 50,
              max_edges: 100,
              direction: 'both',
            },
          }
        );

        const result = transformToReactFlow(
          response,
          objectId,
          1, // We fetched depth=1 from the expanded node
          nodes,
          edges,
          nodeDepths
        );

        setNodes(result.nodes);
        setEdges(applyBidirectionalLabelOffsets(result.edges));
        setNodeDepths(result.depths);
        setTruncated((prev) => prev || result.truncated);
        setExpandedNodes((prev) => new Set([...prev, nodeId]));
      } catch (err) {
        console.error('Failed to expand node:', err);
        setError(err instanceof Error ? err.message : 'Failed to expand node');
      } finally {
        setLoading(false);
      }
    },
    [
      expandedNodes,
      nodeDepths,
      maxDepth,
      fetchJson,
      apiBase,
      objectId,
      nodes,
      edges,
      transformToReactFlow,
    ]
  );

  /**
   * Reset graph to initial state
   */
  const resetGraph = useCallback(() => {
    setNodes([]);
    setEdges([]);
    setExpandedNodes(new Set());
    setNodeDepths(new Map());
    setTruncated(false);
    setError(null);
    fetchGraph();
  }, [fetchGraph]);

  /**
   * Re-layout the graph with current nodes
   */
  const relayout = useCallback(() => {
    const direction = getOptimalDirection(nodes.length);
    const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(
      nodes as Node[],
      edges as Edge[],
      { direction }
    );
    setNodes(layoutedNodes as Node<GraphNodeData>[]);
    setEdges(
      applyBidirectionalLabelOffsets(layoutedEdges as Edge<GraphEdgeData>[])
    );
  }, [nodes, edges]);

  /**
   * Collapse a node by removing all nodes that were added when expanding it
   * This removes nodes that are only reachable through the collapsed node
   */
  const collapseNode = useCallback(
    (nodeId: string) => {
      // Don't collapse the root node or nodes that aren't expanded
      if (nodeId === objectId || !expandedNodes.has(nodeId)) return;

      // Find all nodes that should be removed (descendants of this node)
      // We need to keep nodes that are connected to other expanded nodes
      const nodesToRemove = new Set<string>();
      const edgesToRemove = new Set<string>();

      // Build adjacency list from current edges
      const adjacency = new Map<string, Set<string>>();
      edges.forEach((edge) => {
        if (!adjacency.has(edge.source)) adjacency.set(edge.source, new Set());
        if (!adjacency.has(edge.target)) adjacency.set(edge.target, new Set());
        adjacency.get(edge.source)!.add(edge.target);
        adjacency.get(edge.target)!.add(edge.source);
      });

      // Find nodes to remove using BFS from the collapsed node
      // A node should be removed if it's only reachable through the collapsed node
      const nodeDepthFromCollapsed = new Map<string, number>();
      const queue: string[] = [];

      // Start from neighbors of the collapsed node
      const neighbors = adjacency.get(nodeId) || new Set();
      neighbors.forEach((neighbor) => {
        if (neighbor !== objectId) {
          queue.push(neighbor);
          nodeDepthFromCollapsed.set(neighbor, 1);
        }
      });

      while (queue.length > 0) {
        const current = queue.shift()!;
        const currentDepth = nodeDepthFromCollapsed.get(current) || 0;

        // Check if this node has any path back to root or other expanded nodes
        // that doesn't go through the collapsed node
        const currentNeighbors = adjacency.get(current) || new Set();
        let hasAlternatePath = false;

        for (const neighbor of currentNeighbors) {
          if (neighbor === objectId) {
            hasAlternatePath = true;
            break;
          }
          if (
            neighbor !== nodeId &&
            expandedNodes.has(neighbor) &&
            neighbor !== current
          ) {
            hasAlternatePath = true;
            break;
          }
        }

        if (!hasAlternatePath) {
          nodesToRemove.add(current);

          // Continue BFS to find more descendants
          currentNeighbors.forEach((neighbor) => {
            if (
              !nodeDepthFromCollapsed.has(neighbor) &&
              neighbor !== nodeId &&
              neighbor !== objectId
            ) {
              nodeDepthFromCollapsed.set(neighbor, currentDepth + 1);
              queue.push(neighbor);
            }
          });
        }
      }

      // Find edges to remove (any edge connected to a removed node)
      edges.forEach((edge) => {
        if (nodesToRemove.has(edge.source) || nodesToRemove.has(edge.target)) {
          edgesToRemove.add(edge.id);
        }
      });

      // Filter out removed nodes and edges
      const remainingNodes = nodes.filter(
        (node) => !nodesToRemove.has(node.id)
      );
      const remainingEdges = edges.filter(
        (edge) => !edgesToRemove.has(edge.id)
      );

      // Update expanded nodes set
      const newExpandedNodes = new Set(expandedNodes);
      newExpandedNodes.delete(nodeId);
      nodesToRemove.forEach((id) => newExpandedNodes.delete(id));

      // Re-layout the remaining graph
      const direction = getOptimalDirection(remainingNodes.length);
      const { nodes: layoutedNodes, edges: layoutedEdges } =
        getLayoutedElements(
          remainingNodes as Node[],
          remainingEdges as Edge[],
          { direction }
        );

      setNodes(layoutedNodes as Node<GraphNodeData>[]);
      setEdges(layoutedEdges as Edge<GraphEdgeData>[]);
      setExpandedNodes(newExpandedNodes);

      // Update node depths
      const newDepths = new Map(nodeDepths);
      nodesToRemove.forEach((id) => newDepths.delete(id));
      setNodeDepths(newDepths);
    },
    [objectId, nodes, edges, expandedNodes, nodeDepths]
  );

  // Fetch graph on mount and when objectId changes
  useEffect(() => {
    fetchGraph();
  }, [fetchGraph]);

  // Memoize the expanded nodes set
  const expandedNodesSet = useMemo(() => expandedNodes, [expandedNodes]);

  return {
    nodes,
    edges,
    loading,
    error,
    truncated,
    expandNode,
    collapseNode,
    resetGraph,
    expandedNodes: expandedNodesSet,
    relayout,
  };
}
