/**
 * Main RelationshipGraph component
 * Provides an interactive graph visualization of object relationships
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
import { GraphControls } from './GraphControls';
import { GraphMinimap } from './GraphMinimap';
import { GraphSearch } from './GraphSearch';
import { useGraphData, type GraphNodeData } from './useGraphData';

export interface RelationshipGraphProps {
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
}

// Define custom node and edge types
const nodeTypes = {
  graphNode: GraphNode,
};

const edgeTypes = {
  graphEdge: GraphEdge,
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
function RelationshipGraphInner({
  objectId,
  onNodeDoubleClick,
  initialDepth = 1,
  showMinimap = true,
  className = '',
}: RelationshipGraphProps) {
  const { fitView } = useReactFlow();

  // Track focused node for highlighting after search
  const [focusedNodeId, setFocusedNodeId] = useState<string | null>(null);
  const focusTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Track hovered node for edge highlighting
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);

  // Clear focus after 2 seconds
  const handleNodeFocus = useCallback((nodeId: string) => {
    // Clear any existing timeout
    if (focusTimeoutRef.current) {
      clearTimeout(focusTimeoutRef.current);
    }
    setFocusedNodeId(nodeId);
    // Auto-clear focus after 2 seconds
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
    relayout,
  } = useGraphData({
    objectId,
    initialDepth,
  });

  // Clear hover state if the hovered node is no longer in the graph
  useEffect(() => {
    if (hoveredNodeId && !nodes.some((n) => n.id === hoveredNodeId)) {
      setHoveredNodeId(null);
    }
  }, [hoveredNodeId, nodes]);

  // Add expandedNodes, focus info, and hover state to each node's data for rendering
  const nodesWithExpandState = useMemo(() => {
    return nodes.map((node) => ({
      ...node,
      data: {
        ...node.data,
        isExpanded: expandedNodes.has(node.id),
        isFocused: node.id === focusedNodeId,
        isHovered: node.id === hoveredNodeId,
      },
    }));
  }, [nodes, expandedNodes, focusedNodeId, hoveredNodeId]);

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

  // Fit view when nodes change
  const handleNodesChange = useCallback(() => {
    // Debounce fit view
    setTimeout(() => {
      fitView({ duration: 200, padding: 0.2 });
    }, 100);
  }, [fitView]);

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
        onNodesChange={handleNodesChange}
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
        <GraphControls
          onReset={resetGraph}
          onRelayout={relayout}
          loading={loading}
        />
        {showMinimap && <GraphMinimap />}
      </ReactFlow>

      {/* Loading overlay */}
      {loading && nodes.length > 0 && (
        <div className="absolute top-4 right-4 flex items-center gap-2 bg-base-100 px-3 py-2 rounded-lg shadow-md border border-base-300">
          <Spinner size="sm" className="text-primary" />
          <span className="text-sm text-base-content/70">Updating...</span>
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
        Click to expand • Double-click to view details • Scroll to zoom • Drag
        to pan
      </div>
    </div>
  );
}

/**
 * RelationshipGraph component with ReactFlow provider
 */
export function RelationshipGraph(props: RelationshipGraphProps) {
  return (
    <ReactFlowProvider>
      <RelationshipGraphInner {...props} />
    </ReactFlowProvider>
  );
}

export default RelationshipGraph;
