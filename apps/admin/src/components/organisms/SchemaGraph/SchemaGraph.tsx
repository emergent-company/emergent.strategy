/**
 * SchemaGraph component
 * Visualizes template pack schemas (object types and relationships) as a graph
 */
import { useMemo, useCallback, useState } from 'react';
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  BackgroundVariant,
  MarkerType,
  useReactFlow,
  type Node,
  type Edge,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { Icon } from '@/components/atoms/Icon';
import { SchemaGraphNode } from './SchemaGraphNode';
import { SchemaGraphEdge } from './SchemaGraphEdge';
import { getLayoutedElements } from '../RelationshipGraph/graphLayoutUtils';

export interface SchemaGraphProps {
  /** Object type schemas keyed by type name */
  objectTypes: Record<string, Record<string, unknown>>;
  /** Relationship type schemas keyed by relationship type name */
  relationshipTypes: Record<string, Record<string, unknown>>;
  /** Custom class name for the container */
  className?: string;
  /** Whether to show the minimap */
  showMinimap?: boolean;
}

/** Data attached to each schema node */
export interface SchemaNodeData extends Record<string, unknown> {
  label: string;
  description?: string;
  propertyCount: number;
  isHovered?: boolean;
}

/** Data attached to each schema edge */
export interface SchemaEdgeData extends Record<string, unknown> {
  label: string;
  relationType: string;
  description?: string;
  multiplicity?: { src?: string; dst?: string };
  isHighlighted?: boolean;
}

// Node dimensions for schema types
const SCHEMA_NODE_WIDTH = 180;
const SCHEMA_NODE_HEIGHT = 70;

// Custom node and edge types
const nodeTypes = {
  schemaNode: SchemaGraphNode,
};

const edgeTypes = {
  schemaEdge: SchemaGraphEdge,
};

// Default edge options
const defaultEdgeOptions = {
  type: 'schemaEdge',
  markerEnd: {
    type: MarkerType.ArrowClosed,
    width: 12,
    height: 12,
  },
};

/**
 * Parse relationship schema to extract source and target types
 */
function parseRelationshipTypes(schema: Record<string, unknown>): {
  sourceTypes: string[];
  targetTypes: string[];
} {
  // Support multiple schema formats
  const sourceTypes = (schema.source_types ||
    schema.allowedSrcTypes ||
    schema.fromTypes ||
    []) as string[];
  const targetTypes = (schema.target_types ||
    schema.allowedDstTypes ||
    schema.toTypes ||
    []) as string[];

  return { sourceTypes, targetTypes };
}

/**
 * Transform template pack schemas to React Flow nodes and edges
 */
function transformToReactFlow(
  objectTypes: Record<string, Record<string, unknown>>,
  relationshipTypes: Record<string, Record<string, unknown>>
): { nodes: Node<SchemaNodeData>[]; edges: Edge<SchemaEdgeData>[] } {
  // Create nodes for each object type
  const nodes: Node<SchemaNodeData>[] = Object.entries(objectTypes).map(
    ([typeName, schema]) => {
      const properties = (schema.properties as Record<string, unknown>) || {};
      const propertyCount = Object.keys(properties).length;

      return {
        id: typeName,
        type: 'schemaNode',
        position: { x: 0, y: 0 }, // Will be set by layout
        width: SCHEMA_NODE_WIDTH,
        height: SCHEMA_NODE_HEIGHT,
        data: {
          label: typeName,
          description: schema.description as string | undefined,
          propertyCount,
        },
      };
    }
  );

  // Create edges for each relationship type
  const edges: Edge<SchemaEdgeData>[] = [];
  const existingNodeIds = new Set(nodes.map((n) => n.id));

  Object.entries(relationshipTypes).forEach(([relType, schema]) => {
    const { sourceTypes, targetTypes } = parseRelationshipTypes(schema);
    const multiplicity = schema.multiplicity as
      | { src?: string; dst?: string }
      | undefined;

    // Create an edge for each source->target combination
    sourceTypes.forEach((srcType) => {
      targetTypes.forEach((dstType) => {
        // Only create edges between existing nodes
        if (existingNodeIds.has(srcType) && existingNodeIds.has(dstType)) {
          const edgeId = `${relType}-${srcType}-${dstType}`;
          edges.push({
            id: edgeId,
            source: srcType,
            target: dstType,
            type: 'schemaEdge',
            data: {
              label: (schema.label as string) || relType.replace(/_/g, ' '),
              relationType: relType,
              description: schema.description as string | undefined,
              multiplicity,
            },
          });
        }
      });
    });
  });

  // Apply layout
  const direction = nodes.length > 6 ? 'LR' : 'TB';
  const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(
    nodes as Node[],
    edges as Edge[],
    {
      direction,
      nodeSeparation: 100,
      rankSeparation: 120,
    }
  );

  return {
    nodes: layoutedNodes as Node<SchemaNodeData>[],
    edges: layoutedEdges as Edge<SchemaEdgeData>[],
  };
}

/**
 * Inner graph component using React Flow hooks
 */
function SchemaGraphInner({
  objectTypes,
  relationshipTypes,
  className = '',
  showMinimap = false,
}: SchemaGraphProps) {
  const { fitView } = useReactFlow();
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);

  // Transform schemas to React Flow format
  const { nodes: baseNodes, edges: baseEdges } = useMemo(
    () => transformToReactFlow(objectTypes, relationshipTypes),
    [objectTypes, relationshipTypes]
  );

  // Add hover state to nodes
  const nodes = useMemo(
    () =>
      baseNodes.map((node) => ({
        ...node,
        data: {
          ...node.data,
          isHovered: node.id === hoveredNodeId,
        },
      })),
    [baseNodes, hoveredNodeId]
  );

  // Add highlight state to edges based on hovered node
  const edges = useMemo(
    () =>
      baseEdges.map((edge) => ({
        ...edge,
        data: {
          ...edge.data,
          isHighlighted:
            hoveredNodeId !== null &&
            (edge.source === hoveredNodeId || edge.target === hoveredNodeId),
        },
      })),
    [baseEdges, hoveredNodeId]
  );

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

  // Fit view when layout changes
  const handleNodesChange = useCallback(() => {
    setTimeout(() => {
      fitView({ duration: 200, padding: 0.3 });
    }, 100);
  }, [fitView]);

  // Memoize proOptions
  const proOptions = useMemo(() => ({ hideAttribution: true }), []);

  if (baseNodes.length === 0) {
    return (
      <div
        className={`flex flex-col items-center justify-center p-8 ${className}`}
      >
        <Icon
          icon="lucide--git-branch"
          className="size-12 text-base-content/30 mb-4"
        />
        <h4 className="text-lg font-medium text-base-content/70 mb-2">
          No Schema
        </h4>
        <p className="text-sm text-base-content/50 text-center">
          Add object types to see the schema graph.
        </p>
      </div>
    );
  }

  return (
    <div className={`relative w-full h-full min-h-[300px] ${className}`}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        defaultEdgeOptions={defaultEdgeOptions}
        onNodeMouseEnter={handleNodeMouseEnter}
        onNodeMouseLeave={handleNodeMouseLeave}
        onNodesChange={handleNodesChange}
        fitView
        fitViewOptions={{ padding: 0.3, maxZoom: 1.2 }}
        minZoom={0.3}
        maxZoom={2}
        proOptions={proOptions}
        className="bg-base-200/50"
        // Read-only mode
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
      </ReactFlow>

      {/* Instructions */}
      <div className="absolute bottom-2 left-1/2 -translate-x-1/2 text-xs text-base-content/50 bg-base-100/80 px-3 py-1 rounded-full">
        Hover to highlight relationships
      </div>
    </div>
  );
}

/**
 * SchemaGraph component with ReactFlow provider
 */
export function SchemaGraph(props: SchemaGraphProps) {
  return (
    <ReactFlowProvider>
      <SchemaGraphInner {...props} />
    </ReactFlowProvider>
  );
}

export default SchemaGraph;
