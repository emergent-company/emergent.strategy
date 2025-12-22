/**
 * Tree-style RelationshipGraph component
 * Uses incremental left-to-right layout that preserves node positions on expand/collapse
 * Designed for exploration workflows where context should be maintained
 */
import { useCallback, useMemo, useState, useEffect, useRef } from 'react';
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  BackgroundVariant,
  MarkerType,
  useReactFlow,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { Icon } from '@/components/atoms/Icon';
import { Spinner } from '@/components/atoms/Spinner';
import { GraphNode } from './GraphNode';
import { GraphEdge } from './GraphEdge';
import { OrthogonalEdge } from './OrthogonalEdge';
import { GraphControls } from './GraphControls';
import { GraphMinimap } from './GraphMinimap';
import { GraphSearch } from './GraphSearch';
import {
  useTreeGraphData,
  type UseTreeGraphDataReturn,
} from './useTreeGraphData';
import type { GraphNodeData } from './useGraphData';

export type TreeEdgeStyle = 'bezier' | 'orthogonal';

export interface TreeRelationshipGraphProps {
  /** The object ID to visualize relationships for */
  objectId: string;
  /** Called when a node is double-clicked to open its details */
  onNodeDoubleClick?: (objectId: string) => void;
  /** Initial depth for the graph (default: 1) */
  initialDepth?: number;
  /** Whether to show the minimap */
  showMinimap?: boolean;
  /** Custom class name for the container */
  className?: string;
  /** Edge style: 'bezier' (curved) or 'orthogonal' (right-angle) */
  edgeStyle?: TreeEdgeStyle;
}

// Define custom node types
const nodeTypes = {
  graphNode: GraphNode,
};

// Define edge types for each style
const bezierEdgeTypes = {
  graphEdge: GraphEdge,
};

const orthogonalEdgeTypes = {
  graphEdge: OrthogonalEdge,
};

// Default edge options
const defaultEdgeOptions = {
  type: 'graphEdge',
  markerEnd: {
    type: MarkerType.ArrowClosed,
    width: 15,
    height: 15,
  },
};

/**
 * Inner graph component that uses React Flow hooks
 */
function TreeRelationshipGraphInner({
  objectId,
  onNodeDoubleClick,
  initialDepth = 1,
  showMinimap = true,
  className = '',
  edgeStyle = 'bezier',
}: TreeRelationshipGraphProps) {
  const { fitView, setCenter, getNode } = useReactFlow();

  // Select edge types based on style prop
  const edgeTypes = useMemo(
    () => (edgeStyle === 'orthogonal' ? orthogonalEdgeTypes : bezierEdgeTypes),
    [edgeStyle]
  );

  // Track focused node for highlighting after search
  const [focusedNodeId, setFocusedNodeId] = useState<string | null>(null);
  const focusTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Track hovered node for edge highlighting
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);

  // Clear focus after 2 seconds
  const handleNodeFocus = useCallback((nodeId: string) => {
    if (focusTimeoutRef.current) {
      clearTimeout(focusTimeoutRef.current);
    }
    setFocusedNodeId(nodeId);
    focusTimeoutRef.current = setTimeout(() => {
      setFocusedNodeId(null);
    }, 2000);
  }, []);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (focusTimeoutRef.current) {
        clearTimeout(focusTimeoutRef.current);
      }
    };
  }, []);

  const {
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
  }: UseTreeGraphDataReturn = useTreeGraphData({
    objectId,
    initialDepth,
  });

  // Clear hover state if the hovered node is no longer in the graph
  useEffect(() => {
    if (hoveredNodeId && !nodes.some((n) => n.id === hoveredNodeId)) {
      setHoveredNodeId(null);
    }
  }, [hoveredNodeId, nodes]);

  // Focus on the expanded node after expansion
  useEffect(() => {
    if (lastExpandedNodeId && !loading) {
      const node = getNode(lastExpandedNodeId);
      if (node) {
        // Calculate center position (right side of expanded node where new nodes appear)
        const nodeWidth = node.measured?.width || 270;
        const x = node.position.x + nodeWidth + 150; // Focus slightly to the right
        const y = node.position.y + (node.measured?.height || 60) / 2;

        // Animate to the new position
        setCenter(x, y, { zoom: 0.8, duration: 400 });
      }
    }
  }, [lastExpandedNodeId, loading, getNode, setCenter]);

  // Helper to count all descendants of a node
  const countDescendants = useCallback(
    (nodeId: string): number => {
      // Build a parent-to-children map from edges
      const childrenMap = new Map<string, string[]>();
      edges.forEach((edge) => {
        // In tree layout, source is parent, target is child (for our edges)
        // But we need to check both directions since edges can go either way
        const sourceDepth = nodes.find((n) => n.id === edge.source)?.data.depth;
        const targetDepth = nodes.find((n) => n.id === edge.target)?.data.depth;

        if (
          sourceDepth !== undefined &&
          targetDepth !== undefined &&
          targetDepth > sourceDepth
        ) {
          // source is parent, target is child
          if (!childrenMap.has(edge.source)) {
            childrenMap.set(edge.source, []);
          }
          childrenMap.get(edge.source)!.push(edge.target);
        } else if (
          sourceDepth !== undefined &&
          targetDepth !== undefined &&
          sourceDepth > targetDepth
        ) {
          // target is parent, source is child
          if (!childrenMap.has(edge.target)) {
            childrenMap.set(edge.target, []);
          }
          childrenMap.get(edge.target)!.push(edge.source);
        }
      });

      // BFS to count all descendants
      let count = 0;
      const queue = [...(childrenMap.get(nodeId) || [])];
      const visited = new Set<string>();

      while (queue.length > 0) {
        const current = queue.shift()!;
        if (visited.has(current)) continue;
        visited.add(current);
        count++;

        const children = childrenMap.get(current) || [];
        queue.push(...children);
      }

      return count;
    },
    [nodes, edges]
  );

  // Add expandedNodes, focus info, hover state, and descendant count to each node's data for rendering
  const nodesWithExpandState = useMemo(() => {
    return nodes.map((node) => {
      const isExpanded = expandedNodes.has(node.id);
      return {
        ...node,
        data: {
          ...node.data,
          isExpanded,
          isFocused: node.id === focusedNodeId,
          isHovered: node.id === hoveredNodeId,
          // Only calculate descendant count for expanded nodes (for collapse button)
          descendantCount: isExpanded ? countDescendants(node.id) : undefined,
        },
      };
    });
  }, [nodes, expandedNodes, focusedNodeId, hoveredNodeId, countDescendants]);

  // Add highlight state to edges based on hovered node
  // Also filter out any edges that reference non-existent nodes (safety check)
  const edgesWithHighlight = useMemo(() => {
    const nodeIds = new Set(nodes.map((n) => n.id));
    return edges
      .filter((edge) => nodeIds.has(edge.source) && nodeIds.has(edge.target))
      .map((edge) => ({
        ...edge,
        data: {
          ...edge.data,
          // Highlight if this edge connects to the hovered node
          isHighlighted:
            hoveredNodeId !== null &&
            (edge.source === hoveredNodeId || edge.target === hoveredNodeId),
        },
      }));
  }, [edges, hoveredNodeId, nodes]);

  // Handle node hover
  const handleNodeMouseEnter = useCallback(
    (_event: React.MouseEvent, node: { id: string }) => {
      setHoveredNodeId(node.id);
    },
    []
  );

  const handleNodeMouseLeave = useCallback(() => {
    setHoveredNodeId(null);
  }, []);

  // Handle node click to expand or collapse
  const handleNodeClick = useCallback(
    (_event: React.MouseEvent, node: { id: string; data: GraphNodeData }) => {
      if (expandedNodes.has(node.id) && node.id !== objectId) {
        // Node is expanded, collapse it
        collapseNode(node.id);
      } else if (!expandedNodes.has(node.id) && node.data.hasMore) {
        // Node is not expanded, expand it
        expandNode(node.id);
      }
    },
    [expandedNodes, expandNode, collapseNode, objectId]
  );

  // Handle node double-click to open details
  const handleNodeDoubleClick = useCallback(
    (_event: React.MouseEvent, node: { id: string; data: GraphNodeData }) => {
      if (onNodeDoubleClick) {
        onNodeDoubleClick(node.data.objectId);
      }
    },
    [onNodeDoubleClick]
  );

  // Fit view on initial load only
  const hasInitializedRef = useRef(false);
  useEffect(() => {
    if (nodes.length > 0 && !hasInitializedRef.current) {
      hasInitializedRef.current = true;
      setTimeout(() => {
        fitView({ duration: 300, padding: 0.3 });
      }, 100);
    }
  }, [nodes.length, fitView]);

  // Reset initialization flag when objectId changes
  useEffect(() => {
    hasInitializedRef.current = false;
  }, [objectId]);

  // Memoize proOptions to avoid rerenders
  const proOptions = useMemo(() => ({ hideAttribution: true }), []);

  if (error) {
    return (
      <div
        className={`flex flex-col items-center justify-center p-8 ${className}`}
      >
        <Icon icon="lucide--alert-circle" className="size-12 text-error mb-4" />
        <h4 className="text-lg font-medium text-error mb-2">
          Failed to load graph
        </h4>
        <p className="text-sm text-base-content/60 text-center mb-4">{error}</p>
        <button onClick={resetGraph} className="btn btn-sm btn-primary">
          <Icon icon="lucide--refresh-cw" className="size-4 mr-2" />
          Try Again
        </button>
      </div>
    );
  }

  if (loading && nodes.length === 0) {
    return (
      <div
        className={`flex flex-col items-center justify-center p-8 ${className}`}
      >
        <Spinner size="lg" className="text-primary mb-4" />
        <p className="text-sm text-base-content/60">Loading graph...</p>
      </div>
    );
  }

  if (nodes.length === 0) {
    return (
      <div
        className={`flex flex-col items-center justify-center p-8 ${className}`}
      >
        <Icon
          icon="lucide--git-branch"
          className="size-12 text-base-content/30 mb-4"
        />
        <h4 className="text-lg font-medium text-base-content/70 mb-2">
          No Relationships
        </h4>
        <p className="text-sm text-base-content/50 text-center">
          This object has no relationships to display.
        </p>
      </div>
    );
  }

  return (
    <div className={`relative w-full h-full min-h-[400px] ${className}`}>
      {/* Search component */}
      <GraphSearch nodes={nodesWithExpandState} onNodeFocus={handleNodeFocus} />

      {/* Tree layout indicator */}
      <div className="absolute top-4 right-4 z-10">
        <div className="flex items-center gap-1 bg-base-100/90 px-2 py-1 rounded-lg shadow-sm border border-base-300 text-xs text-base-content/60">
          <Icon icon="lucide--git-branch" className="size-3" />
          <span>
            {edgeStyle === 'orthogonal' ? 'Orthogonal Tree' : 'Tree View'}
          </span>
        </div>
      </div>

      <ReactFlow
        nodes={nodesWithExpandState}
        edges={edgesWithHighlight}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        defaultEdgeOptions={defaultEdgeOptions}
        onNodeClick={handleNodeClick}
        onNodeDoubleClick={handleNodeDoubleClick}
        onNodeMouseEnter={handleNodeMouseEnter}
        onNodeMouseLeave={handleNodeMouseLeave}
        fitView
        fitViewOptions={{ padding: 0.4, maxZoom: 0.8 }}
        minZoom={0.1}
        maxZoom={2}
        proOptions={proOptions}
        className="bg-base-200/50"
        // Read-only: disable all editing capabilities
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        edgesFocusable={false}
        nodesFocusable={false}
        panOnDrag={true}
        zoomOnScroll={true}
        preventScrolling={true}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={16}
          size={1}
          className="!bg-base-100"
        />
        <GraphControls onReset={resetGraph} loading={loading} />
        {showMinimap && <GraphMinimap />}
      </ReactFlow>

      {/* Loading overlay */}
      {loading && nodes.length > 0 && (
        <div className="absolute top-14 right-4 flex items-center gap-2 bg-base-100 px-3 py-2 rounded-lg shadow-md border border-base-300">
          <Spinner size="sm" className="text-primary" />
          <span className="text-sm text-base-content/70">Expanding...</span>
        </div>
      )}

      {/* Truncation warning */}
      {truncated && (
        <div className="absolute bottom-4 right-4 alert alert-warning shadow-lg max-w-xs">
          <Icon icon="lucide--alert-triangle" className="size-4" />
          <span className="text-sm">
            Graph truncated due to size limits. Try focusing on specific nodes.
          </span>
        </div>
      )}

      {/* Instructions */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-xs text-base-content/50 bg-base-100/80 px-3 py-1 rounded-full">
        Click to expand/collapse • Double-click to view details • Scroll to zoom
        • Drag to pan
      </div>
    </div>
  );
}

/**
 * TreeRelationshipGraph component with ReactFlow provider
 */
export function TreeRelationshipGraph(props: TreeRelationshipGraphProps) {
  return (
    <ReactFlowProvider>
      <TreeRelationshipGraphInner {...props} />
    </ReactFlowProvider>
  );
}

export default TreeRelationshipGraph;
