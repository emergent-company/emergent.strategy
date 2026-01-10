/**
 * Custom hook for tree-style graph data management
 * Uses incremental positioning to preserve node positions on expand/collapse
 * Always expands left-to-right in a tree structure
 */
import { useState, useCallback, useEffect, useRef } from 'react';
import type { Node, Edge } from '@xyflow/react';
import { useApi } from '@/hooks/use-api';
import { DEFAULT_NODE_WIDTH, DEFAULT_NODE_HEIGHT } from './graphLayoutUtils';
import type { GraphNodeData, GraphEdgeData } from './useGraphData';

/** Minimum horizontal spacing between nodes (ensures edge labels fit) */
const MIN_HORIZONTAL_SPACING = 400; // Node width (270) + minimum label space (130)

/** Spacing between parallel edges (arrows) */
const EDGE_SPACING = 10;

/** Vertical spacing between sibling nodes (node height ~60px + 20px gap) */
const VERTICAL_SPACING = 80;

/**
 * Get display name from object properties using case-insensitive lookup.
 * Checks for common name properties in order of priority:
 * name, Name, NAME, title, Title, TITLE, label, Label, LABEL, displayName, DisplayName
 */
function getDisplayName(
  properties: Record<string, unknown> | undefined,
  key: string | undefined,
  type: string,
  id: string
): string {
  if (properties) {
    // Property names to check in order of priority
    const nameProps = ['name', 'title', 'label', 'displayName'];

    // Check each property name case-insensitively
    for (const propName of nameProps) {
      for (const key of Object.keys(properties)) {
        if (key.toLowerCase() === propName.toLowerCase()) {
          const value = properties[key];
          if (typeof value === 'string' && value.trim()) {
            return value;
          }
        }
      }
    }
  }

  // Fallback to key if available
  if (key && key.trim()) {
    return key;
  }

  // Final fallback to type-id format
  return `${type}-${id.substring(0, 8)}`;
}

/**
 * Calculate offsets for edges to prevent overlapping arrows.
 * Only offsets bidirectional edges (A→B and B→A pairs).
 * Offset is applied to the vertical segment's X position.
 */
function calculateEdgeOffsets(
  edges: Array<{ id: string; source: string; target: string }>
): Map<string, number> {
  const offsets = new Map<string, number>();

  // Group edges by node pair (regardless of direction)
  const edgesByNodePair = new Map<string, string[]>();

  edges.forEach((edge) => {
    // Create a canonical key for the node pair (sorted to group A→B and B→A together)
    const nodes = [edge.source, edge.target].sort();
    const pairKey = `${nodes[0]}:${nodes[1]}`;

    if (!edgesByNodePair.has(pairKey)) {
      edgesByNodePair.set(pairKey, []);
    }
    edgesByNodePair.get(pairKey)!.push(edge.id);
  });

  // Assign offsets to edges that share the same node pair (bidirectional)
  edgesByNodePair.forEach((edgeIds) => {
    const count = edgeIds.length;
    if (count <= 1) {
      // Single edge, no offset needed
      edgeIds.forEach((id) => offsets.set(id, 0));
      return;
    }

    // Center the edges around 0
    // For 2 edges: offsets are -5, +5
    // For 3 edges: offsets are -10, 0, +10
    const totalSpan = (count - 1) * EDGE_SPACING;
    const startOffset = -totalSpan / 2;

    edgeIds.forEach((id, index) => {
      offsets.set(id, startOffset + index * EDGE_SPACING);
    });
  });

  return offsets;
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

export interface UseTreeGraphDataOptions {
  /** The root object ID to start traversal from */
  objectId: string;
  /** Initial depth to fetch (default: 1) */
  initialDepth?: number;
  /** Maximum depth allowed (default: 5) */
  maxDepth?: number;
}

export interface UseTreeGraphDataReturn {
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
  /** ID of the most recently expanded node (for focusing) */
  lastExpandedNodeId: string | null;
}

/**
 * Calculate positions for new child nodes expanding from a parent
 * Places children to the right of the parent in the NEXT column, vertically centered around parent
 */
function calculateChildPositions(
  parentNode: Node<GraphNodeData>,
  childIds: string[],
  existingNodes: Map<string, Node<GraphNodeData>>,
  nodeDepths: Map<string, number>
): Map<string, { x: number; y: number }> {
  const positions = new Map<string, { x: number; y: number }>();

  const parentY = parentNode.position.y;
  const parentDepth = nodeDepths.get(parentNode.id) ?? 0;

  // Filter out children that already exist (they might be connected to other nodes)
  const newChildIds = childIds.filter((id) => !existingNodes.has(id));

  if (newChildIds.length === 0) return positions;

  // New children go to the next column (parent depth + 1)
  const childColumn = parentDepth + 1;
  const childX = childColumn * MIN_HORIZONTAL_SPACING;

  // Calculate the total height needed for all children with uniform spacing
  const totalHeight = (newChildIds.length - 1) * VERTICAL_SPACING;
  const startY = parentY - totalHeight / 2;

  // Position each new child in the next column, centered around parent Y
  newChildIds.forEach((childId, index) => {
    positions.set(childId, {
      x: childX,
      y: startY + index * VERTICAL_SPACING,
    });
  });

  return positions;
}

/**
 * Adjust positions to prevent overlaps while preserving column alignment
 * Uses a two-pass approach:
 * 1. First pass: identify overlaps
 * 2. Second pass: spread nodes symmetrically to minimize displacement
 */
function adjustForOverlaps(
  nodes: Node<GraphNodeData>[],
  nodeDepths: Map<string, number>
): Node<GraphNodeData>[] {
  // Group nodes by their depth (column)
  const columns = new Map<number, Node<GraphNodeData>[]>();

  nodes.forEach((node) => {
    const depth = nodeDepths.get(node.id) ?? 0;
    if (!columns.has(depth)) {
      columns.set(depth, []);
    }
    columns.get(depth)!.push(node);
  });

  // Adjust each column - fix X position and resolve overlaps symmetrically
  const adjustedNodes: Node<GraphNodeData>[] = [];

  columns.forEach((columnNodes, depth) => {
    // Fixed column X position
    const columnX = depth * MIN_HORIZONTAL_SPACING;

    // Sort by Y position to maintain relative order
    columnNodes.sort((a, b) => a.position.y - b.position.y);

    // Calculate the center of mass of current positions
    const centerY =
      columnNodes.reduce((sum, n) => sum + n.position.y, 0) /
      columnNodes.length;

    // Check if we have overlaps
    let hasOverlaps = false;
    for (let i = 1; i < columnNodes.length; i++) {
      const gap = columnNodes[i].position.y - columnNodes[i - 1].position.y;
      if (gap < VERTICAL_SPACING) {
        hasOverlaps = true;
        break;
      }
    }

    // If overlaps exist, redistribute nodes symmetrically around their center
    if (hasOverlaps && columnNodes.length > 1) {
      const totalHeight = (columnNodes.length - 1) * VERTICAL_SPACING;
      const startY = centerY - totalHeight / 2;

      columnNodes.forEach((node, index) => {
        node.position.y = startY + index * VERTICAL_SPACING;
      });
    }

    // Set correct X position for all nodes
    columnNodes.forEach((node) => {
      node.position.x = columnX;
    });

    adjustedNodes.push(...columnNodes);
  });

  return adjustedNodes;
}

/**
 * Calculate edge handles for tree layout
 * ONLY uses left/right handles - never top/bottom
 * - Forward edges (to higher depth): source-right -> target-left
 * - Back edges (to same/lower depth): source-right -> target-right (curves back)
 */
function calculateEdgeHandles(
  srcDepth: number,
  dstDepth: number
): { sourceHandle: string; targetHandle: string; isSameColumn: boolean } {
  if (dstDepth > srcDepth) {
    // Forward edge: parent to child (left to right)
    return {
      sourceHandle: 'source-right',
      targetHandle: 'target-left',
      isSameColumn: false,
    };
  } else if (dstDepth < srcDepth) {
    // Back edge: child to parent (right side curves back to left)
    return {
      sourceHandle: 'source-left',
      targetHandle: 'target-right',
      isSameColumn: false,
    };
  } else {
    // Same column: use right handles for both (creates a loop-back curve)
    return {
      sourceHandle: 'source-right',
      targetHandle: 'target-right',
      isSameColumn: true,
    };
  }
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
 * Count all descendants of a node using the parent map
 */
function countDescendants(
  nodeId: string,
  nodeParents: Map<string, string>,
  allNodeIds: Set<string>
): number {
  let count = 0;
  const queue: string[] = [];

  // Find direct children
  allNodeIds.forEach((id) => {
    if (nodeParents.get(id) === nodeId) {
      queue.push(id);
      count++;
    }
  });

  // BFS to count all descendants
  while (queue.length > 0) {
    const current = queue.shift()!;
    allNodeIds.forEach((id) => {
      if (nodeParents.get(id) === current) {
        queue.push(id);
        count++;
      }
    });
  }

  return count;
}

/**
 * Hook for fetching and managing tree-style relationship graph data
 * Preserves existing node positions when expanding
 */
export function useTreeGraphData({
  objectId,
  initialDepth = 1,
  maxDepth = 5,
}: UseTreeGraphDataOptions): UseTreeGraphDataReturn {
  const { fetchJson, apiBase } = useApi();

  const [nodes, setNodes] = useState<Node<GraphNodeData>[]>([]);
  const [edges, setEdges] = useState<Edge<GraphEdgeData>[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [truncated, setTruncated] = useState(false);
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
  const [lastExpandedNodeId, setLastExpandedNodeId] = useState<string | null>(
    null
  );

  // Store node depths and parent relationships
  const nodeDepthsRef = useRef<Map<string, number>>(new Map());
  const nodeParentsRef = useRef<Map<string, string>>(new Map());

  /**
   * Fetch initial graph data - just root and immediate neighbors
   * We fetch depth 2 to get edge counts for child nodes, but only display depth 1
   */
  const fetchGraph = useCallback(async () => {
    if (!objectId) return;

    setLoading(true);
    setError(null);

    try {
      // Fetch depth 2 so we can count edges for immediate children
      const response = await fetchJson<TraversalResponse>(
        `${apiBase}/api/graph/traverse`,
        {
          method: 'POST',
          body: {
            root_ids: [objectId],
            max_depth: Math.max(initialDepth + 1, 2), // Fetch one level deeper for edge counting
            max_nodes: 150,
            max_edges: 300,
            direction: 'both',
          },
        }
      );

      // Find the root node
      const rootApiNode = response.nodes.find((n) => n.id === objectId);
      if (!rootApiNode) {
        throw new Error('Root node not found in response');
      }

      // Create root node at center
      const rootName = getDisplayName(
        rootApiNode.properties,
        rootApiNode.key ?? undefined,
        rootApiNode.type,
        rootApiNode.id
      );

      const rootNode: Node<GraphNodeData> = {
        id: objectId,
        type: 'graphNode',
        position: { x: 0, y: 0 },
        width: DEFAULT_NODE_WIDTH,
        height: DEFAULT_NODE_HEIGHT,
        data: {
          label: rootName,
          type: rootApiNode.type,
          status: rootApiNode.status ?? undefined,
          hasMore: true, // We'll update this based on edges
          isRoot: true,
          depth: 0,
          objectId: objectId,
          properties: rootApiNode.properties,
        },
      };

      nodeDepthsRef.current.set(objectId, 0);

      // Find connected nodes
      const connectedNodeIds = new Set<string>();
      response.edges.forEach((edge) => {
        if (edge.src_id === objectId) connectedNodeIds.add(edge.dst_id);
        if (edge.dst_id === objectId) connectedNodeIds.add(edge.src_id);
      });

      // Count edges per node (for showing relationship count on expand button)
      const edgeCountPerNode = new Map<string, number>();
      response.edges.forEach((edge) => {
        edgeCountPerNode.set(
          edge.src_id,
          (edgeCountPerNode.get(edge.src_id) || 0) + 1
        );
        edgeCountPerNode.set(
          edge.dst_id,
          (edgeCountPerNode.get(edge.dst_id) || 0) + 1
        );
      });

      // Create child nodes positioned to the right
      const childNodes: Node<GraphNodeData>[] = [];
      const childIds = Array.from(connectedNodeIds);
      const totalHeight = (childIds.length - 1) * VERTICAL_SPACING;
      const startY = -totalHeight / 2;

      childIds.forEach((childId, index) => {
        const apiNode = response.nodes.find((n) => n.id === childId);
        if (!apiNode) return;

        const name = getDisplayName(
          apiNode.properties,
          apiNode.key ?? undefined,
          apiNode.type,
          apiNode.id
        );

        nodeDepthsRef.current.set(childId, 1);
        nodeParentsRef.current.set(childId, objectId);

        // Count edges for this node (subtract 1 for the edge to parent we already show)
        const totalEdges = edgeCountPerNode.get(childId) || 0;
        const remainingEdges = Math.max(0, totalEdges - 1);

        childNodes.push({
          id: childId,
          type: 'graphNode',
          position: {
            x: MIN_HORIZONTAL_SPACING,
            y: startY + index * VERTICAL_SPACING,
          },
          width: DEFAULT_NODE_WIDTH,
          height: DEFAULT_NODE_HEIGHT,
          data: {
            label: name,
            type: apiNode.type,
            status: apiNode.status ?? undefined,
            hasMore: remainingEdges > 0,
            isRoot: false,
            depth: 1,
            objectId: childId,
            relationshipCount: remainingEdges > 0 ? remainingEdges : undefined,
            properties: apiNode.properties,
          },
        });
      });

      // Build a position map for calculating edge handles
      const nodePositions = new Map<string, { x: number; y: number }>();
      nodePositions.set(objectId, { x: 0, y: 0 });
      childNodes.forEach((child) => {
        nodePositions.set(child.id, child.position);
      });

      // Create edges with proper handle directions based on node positions
      const graphEdges: Edge<GraphEdgeData>[] = response.edges
        .filter(
          (edge) =>
            (edge.src_id === objectId && connectedNodeIds.has(edge.dst_id)) ||
            (edge.dst_id === objectId && connectedNodeIds.has(edge.src_id))
        )
        .map((edge) => {
          const srcDepth = nodeDepthsRef.current.get(edge.src_id) ?? 0;
          const dstDepth = nodeDepthsRef.current.get(edge.dst_id) ?? 0;
          const handles = calculateEdgeHandles(srcDepth, dstDepth);

          return {
            id: edge.id,
            source: edge.src_id,
            target: edge.dst_id,
            type: 'graphEdge',
            sourceHandle: handles.sourceHandle,
            targetHandle: handles.targetHandle,
            data: {
              label: edge.type.replace(/_/g, ' '),
              isSameColumn: handles.isSameColumn,
            },
          };
        });

      // Calculate edge offsets for parallel edges
      const edgeOffsets = calculateEdgeOffsets(
        graphEdges.map((e) => ({
          id: e.id,
          source: e.source,
          target: e.target,
        }))
      );

      // Apply edge path offsets (use edgeOffsetX for orthogonal edges)
      const edgesWithPathOffsets: Edge<GraphEdgeData>[] = graphEdges.map(
        (edge) => ({
          ...edge,
          data: {
            ...edge.data,
            label: edge.data?.label || '',
            edgeOffsetX: edgeOffsets.get(edge.id) || 0,
            edgeOffsetY: edgeOffsets.get(edge.id) || 0, // Keep for bezier edge compatibility
          },
        })
      );

      // Apply label offsets for bidirectional edges
      const edgesWithOffsets =
        applyBidirectionalLabelOffsets(edgesWithPathOffsets);

      // Update root node's hasMore based on whether it has children
      rootNode.data.hasMore = childNodes.length > 0;

      setNodes([rootNode, ...childNodes]);
      setEdges(edgesWithOffsets);
      setTruncated(response.truncated ?? false);
      setExpandedNodes(new Set([objectId]));
      setLastExpandedNodeId(null);
    } catch (err) {
      console.error('Failed to fetch graph data:', err);
      setError(
        err instanceof Error ? err.message : 'Failed to fetch graph data'
      );
    } finally {
      setLoading(false);
    }
  }, [objectId, initialDepth, fetchJson, apiBase]);

  /**
   * Expand a node to show more relationships
   * Preserves existing node positions and adds new nodes to the right
   */
  const expandNode = useCallback(
    async (nodeId: string) => {
      if (expandedNodes.has(nodeId)) return;

      const nodeDepth = nodeDepthsRef.current.get(nodeId) ?? 0;
      if (nodeDepth >= maxDepth) {
        console.warn(`Cannot expand beyond max depth of ${maxDepth}`);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        // Fetch 2 levels from the expanded node to get edge counts for children
        const response = await fetchJson<TraversalResponse>(
          `${apiBase}/api/graph/traverse`,
          {
            method: 'POST',
            body: {
              root_ids: [nodeId],
              max_depth: 2, // Fetch 2 levels to count edges for new children
              max_nodes: 100,
              max_edges: 200,
              direction: 'both',
            },
          }
        );

        // Get existing node map
        const existingNodeMap = new Map<string, Node<GraphNodeData>>(
          nodes.map((n) => [n.id, n])
        );
        const existingEdgeIds = new Set(edges.map((e) => e.id));

        // Find the parent node we're expanding from
        const parentNode = existingNodeMap.get(nodeId);
        if (!parentNode) {
          throw new Error('Parent node not found');
        }

        // Find new connected nodes (not already in the graph)
        const newConnectedIds: string[] = [];
        response.edges.forEach((edge) => {
          if (edge.src_id === nodeId && !existingNodeMap.has(edge.dst_id)) {
            newConnectedIds.push(edge.dst_id);
          }
          if (edge.dst_id === nodeId && !existingNodeMap.has(edge.src_id)) {
            newConnectedIds.push(edge.src_id);
          }
        });

        // Count edges per node from the response (for relationship count on expand button)
        const edgeCountPerNode = new Map<string, number>();
        response.edges.forEach((edge) => {
          edgeCountPerNode.set(
            edge.src_id,
            (edgeCountPerNode.get(edge.src_id) || 0) + 1
          );
          edgeCountPerNode.set(
            edge.dst_id,
            (edgeCountPerNode.get(edge.dst_id) || 0) + 1
          );
        });

        // Calculate positions for new nodes
        const newPositions = calculateChildPositions(
          parentNode,
          newConnectedIds,
          existingNodeMap,
          nodeDepthsRef.current
        );

        // Create new nodes
        const newDepth = nodeDepth + 1;
        const newNodes: Node<GraphNodeData>[] = [];

        newConnectedIds.forEach((childId) => {
          const apiNode = response.nodes.find((n) => n.id === childId);
          if (!apiNode) return;

          const position = newPositions.get(childId);
          if (!position) return;

          const name = getDisplayName(
            apiNode.properties,
            apiNode.key ?? undefined,
            apiNode.type,
            apiNode.id
          );

          nodeDepthsRef.current.set(childId, newDepth);
          nodeParentsRef.current.set(childId, nodeId);

          // Count edges for this node (subtract 1 for the edge to parent we already show)
          const totalEdges = edgeCountPerNode.get(childId) || 0;
          const remainingEdges = Math.max(0, totalEdges - 1);

          newNodes.push({
            id: childId,
            type: 'graphNode',
            position,
            width: DEFAULT_NODE_WIDTH,
            height: DEFAULT_NODE_HEIGHT,
            data: {
              label: name,
              type: apiNode.type,
              status: apiNode.status ?? undefined,
              hasMore: remainingEdges > 0,
              isRoot: false,
              depth: newDepth,
              objectId: childId,
              relationshipCount:
                remainingEdges > 0 ? remainingEdges : undefined,
              properties: apiNode.properties,
            },
          });
        });

        // Create new edges
        const newEdges: Edge<GraphEdgeData>[] = response.edges
          .filter((edge) => !existingEdgeIds.has(edge.id))
          .filter((edge) => {
            // Only include edges where at least one end is the expanded node
            // and the other end is either existing or new
            const srcExists =
              existingNodeMap.has(edge.src_id) ||
              newConnectedIds.includes(edge.src_id);
            const dstExists =
              existingNodeMap.has(edge.dst_id) ||
              newConnectedIds.includes(edge.dst_id);
            return srcExists && dstExists;
          })
          .map((edge) => {
            // Use depth for edge handle calculation
            const srcDepth = nodeDepthsRef.current.get(edge.src_id) ?? 0;
            const dstDepth = nodeDepthsRef.current.get(edge.dst_id) ?? 0;
            const handles = calculateEdgeHandles(srcDepth, dstDepth);

            return {
              id: edge.id,
              source: edge.src_id,
              target: edge.dst_id,
              type: 'graphEdge',
              sourceHandle: handles.sourceHandle,
              targetHandle: handles.targetHandle,
              data: {
                label: edge.type.replace(/_/g, ' '),
                isSameColumn: handles.isSameColumn,
              },
            };
          });

        // Combine all nodes and edges
        const allNodes = [...nodes, ...newNodes];
        const allEdges = [...edges, ...newEdges];

        // Adjust positions to prevent overlaps
        const adjustedNodes = adjustForOverlaps(
          allNodes,
          nodeDepthsRef.current
        );

        // Calculate edge offsets for parallel edges
        const edgeOffsets = calculateEdgeOffsets(
          allEdges.map((e) => ({
            id: e.id,
            source: e.source,
            target: e.target,
          }))
        );

        // Apply edge offsets to edge data (use edgeOffsetX for orthogonal edges)
        const edgesWithOffsets: Edge<GraphEdgeData>[] = allEdges.map(
          (edge) => ({
            ...edge,
            data: {
              ...edge.data,
              label: edge.data?.label || '',
              edgeOffsetX: edgeOffsets.get(edge.id) || 0,
              edgeOffsetY: edgeOffsets.get(edge.id) || 0, // Keep for bezier edge compatibility
            },
          })
        );

        // Update parent node's hasMore to false if no new children found
        const updatedNodes = adjustedNodes.map((node) => {
          if (node.id === nodeId) {
            return {
              ...node,
              data: {
                ...node.data,
                hasMore: newNodes.length > 0,
              },
            };
          }
          return node;
        });

        setNodes(updatedNodes);
        // Reapply bidirectional offsets to edges with edge path offsets
        setEdges(applyBidirectionalLabelOffsets(edgesWithOffsets));
        setTruncated((prev) => prev || (response.truncated ?? false));
        setExpandedNodes((prev) => new Set([...prev, nodeId]));
        setLastExpandedNodeId(nodeId);
      } catch (err) {
        console.error('Failed to expand node:', err);
        setError(err instanceof Error ? err.message : 'Failed to expand node');
      } finally {
        setLoading(false);
      }
    },
    [expandedNodes, maxDepth, fetchJson, apiBase, nodes, edges]
  );

  /**
   * Collapse a node by removing nodes that were added when expanding it
   * Uses functional setState to avoid stale closure issues
   */
  const collapseNode = useCallback(
    (nodeId: string) => {
      if (nodeId === objectId) return;

      // Use functional setState to get current state and avoid stale closures
      setExpandedNodes((currentExpandedNodes) => {
        if (!currentExpandedNodes.has(nodeId)) return currentExpandedNodes;

        // Update nodes using functional setState with current nodes
        setNodes((currentNodes) => {
          // Find all descendant nodes (nodes whose parent chain includes this node)
          const nodesToRemove = new Set<string>();

          // Find direct children first
          currentNodes.forEach((node) => {
            if (nodeParentsRef.current.get(node.id) === nodeId) {
              nodesToRemove.add(node.id);
            }
          });

          // Recursively find all descendants
          const processQueue = [...nodesToRemove];
          while (processQueue.length > 0) {
            const current = processQueue.shift()!;
            currentNodes.forEach((node) => {
              if (
                nodeParentsRef.current.get(node.id) === current &&
                !nodesToRemove.has(node.id)
              ) {
                nodesToRemove.add(node.id);
                processQueue.push(node.id);
              }
            });
          }

          // Clean up refs for removed nodes
          nodesToRemove.forEach((id) => {
            nodeDepthsRef.current.delete(id);
            nodeParentsRef.current.delete(id);
          });

          // Update edges using functional setState
          setEdges((currentEdges) =>
            currentEdges.filter(
              (e) =>
                !nodesToRemove.has(e.source) && !nodesToRemove.has(e.target)
            )
          );

          // Filter out removed nodes and update the collapsed node's hasMore status
          return currentNodes
            .filter((n) => !nodesToRemove.has(n.id))
            .map((node) => {
              if (node.id === nodeId) {
                return {
                  ...node,
                  data: {
                    ...node.data,
                    hasMore: true, // Can be expanded again
                  },
                };
              }
              return node;
            });
        });

        setLastExpandedNodeId(null);

        // Return new expanded nodes set without the collapsed node
        const newExpandedNodes = new Set(currentExpandedNodes);
        newExpandedNodes.delete(nodeId);
        return newExpandedNodes;
      });
    },
    [objectId]
  );

  /**
   * Reset graph to initial state
   */
  const resetGraph = useCallback(() => {
    setNodes([]);
    setEdges([]);
    setExpandedNodes(new Set());
    nodeDepthsRef.current.clear();
    nodeParentsRef.current.clear();
    setTruncated(false);
    setError(null);
    setLastExpandedNodeId(null);
    fetchGraph();
  }, [fetchGraph]);

  // Fetch graph on mount and when objectId changes
  useEffect(() => {
    fetchGraph();
  }, [fetchGraph]);

  return {
    nodes,
    edges,
    loading,
    error,
    truncated,
    expandNode,
    collapseNode,
    resetGraph,
    expandedNodes,
    lastExpandedNodeId,
  };
}
