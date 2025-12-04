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
  /** Depth from root node */
  depth: number;
  /** Original object ID */
  objectId: string;
  /** Relationship count if known */
  relationshipCount?: number;
  /** Properties for tooltip display */
  properties?: Record<string, unknown>;
}

/** Data attached to each edge */
export interface GraphEdgeData extends Record<string, unknown> {
  /** Relationship type label */
  label: string;
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
  /** Reset graph to initial state */
  resetGraph: () => void;
  /** Set of currently expanded node IDs */
  expandedNodes: Set<string>;
  /** Re-layout the graph */
  relayout: () => void;
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
   */
  const transformToReactFlow = useCallback(
    (
      response: TraversalResponse,
      rootId: string,
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

          const nodeData: GraphNodeData = {
            label: name,
            type: node.type,
            status: node.status ?? undefined,
            hasMore: (edgeCountByNode.get(node.id) ?? 0) > 0,
            isRoot: node.id === rootId,
            depth,
            objectId: node.id,
            relationshipCount: edgeCountByNode.get(node.id),
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

      const result = transformToReactFlow(response, objectId);
      setNodes(result.nodes);
      setEdges(result.edges);
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
          nodes,
          edges,
          nodeDepths
        );

        setNodes(result.nodes);
        setEdges(result.edges);
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
    setEdges(layoutedEdges as Edge<GraphEdgeData>[]);
  }, [nodes, edges]);

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
    resetGraph,
    expandedNodes: expandedNodesSet,
    relayout,
  };
}
