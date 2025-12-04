/**
 * Graph layout utilities using dagre for automatic node positioning
 */
import dagre from 'dagre';
import type { Node, Edge } from '@xyflow/react';

/** Options for the graph layout algorithm */
export interface LayoutOptions {
  /** Direction of the graph: 'TB' (top-bottom), 'BT', 'LR' (left-right), 'RL' */
  direction?: 'TB' | 'BT' | 'LR' | 'RL';
  /** Separation between nodes in the same rank */
  nodeSeparation?: number;
  /** Separation between ranks/layers */
  rankSeparation?: number;
  /** Separation between edges */
  edgeSeparation?: number;
}

/** Default node dimensions used for layout calculation */
export const DEFAULT_NODE_WIDTH = 180;
export const DEFAULT_NODE_HEIGHT = 60;

/**
 * Applies dagre layout algorithm to position nodes in the graph
 * @param nodes - Array of React Flow nodes
 * @param edges - Array of React Flow edges
 * @param options - Layout configuration options
 * @returns Nodes with updated positions
 */
export function getLayoutedElements(
  nodes: Node[],
  edges: Edge[],
  options: LayoutOptions = {}
): { nodes: Node[]; edges: Edge[] } {
  const {
    direction = 'TB',
    nodeSeparation = 80,
    rankSeparation = 100,
    edgeSeparation = 20,
  } = options;

  // Create a new directed graph
  const dagreGraph = new dagre.graphlib.Graph();
  dagreGraph.setDefaultEdgeLabel(() => ({}));

  // Configure the layout
  dagreGraph.setGraph({
    rankdir: direction,
    nodesep: nodeSeparation,
    ranksep: rankSeparation,
    edgesep: edgeSeparation,
  });

  // Add nodes to dagre graph
  nodes.forEach((node) => {
    const width = node.width ?? DEFAULT_NODE_WIDTH;
    const height = node.height ?? DEFAULT_NODE_HEIGHT;
    dagreGraph.setNode(node.id, { width, height });
  });

  // Add edges to dagre graph
  edges.forEach((edge) => {
    dagreGraph.setEdge(edge.source, edge.target);
  });

  // Run the layout algorithm
  dagre.layout(dagreGraph);

  // Apply calculated positions to nodes
  const layoutedNodes = nodes.map((node) => {
    const nodeWithPosition = dagreGraph.node(node.id);
    const width = node.width ?? DEFAULT_NODE_WIDTH;
    const height = node.height ?? DEFAULT_NODE_HEIGHT;

    return {
      ...node,
      // Center the node on the calculated position
      position: {
        x: nodeWithPosition.x - width / 2,
        y: nodeWithPosition.y - height / 2,
      },
    };
  });

  return { nodes: layoutedNodes, edges };
}

/**
 * Determines the optimal layout direction based on node count
 * @param nodeCount - Number of nodes in the graph
 * @returns Recommended layout direction
 */
export function getOptimalDirection(nodeCount: number): 'TB' | 'LR' {
  // For graphs with many nodes, horizontal layout often works better
  // For smaller graphs, vertical (top-bottom) is typically cleaner
  return nodeCount > 10 ? 'LR' : 'TB';
}

/**
 * Gets color class based on object type
 * @param type - Object type string
 * @returns Tailwind color class
 */
export function getTypeColor(type: string): string {
  const typeColors: Record<string, string> = {
    Person: 'bg-blue-500',
    Organization: 'bg-purple-500',
    Event: 'bg-green-500',
    Document: 'bg-orange-500',
    Place: 'bg-pink-500',
    Concept: 'bg-cyan-500',
    Product: 'bg-amber-500',
    default: 'bg-gray-500',
  };

  // Check for partial matches (e.g., "PersonEntity" matches "Person")
  for (const [key, color] of Object.entries(typeColors)) {
    if (key !== 'default' && type.toLowerCase().includes(key.toLowerCase())) {
      return color;
    }
  }

  return typeColors.default;
}

/**
 * Gets an icon name based on object type
 * @param type - Object type string
 * @returns Lucide icon name
 */
export function getTypeIcon(type: string): string {
  const typeIcons: Record<string, string> = {
    Person: 'lucide--user',
    Organization: 'lucide--building-2',
    Event: 'lucide--calendar',
    Document: 'lucide--file-text',
    Place: 'lucide--map-pin',
    Concept: 'lucide--lightbulb',
    Product: 'lucide--package',
    default: 'lucide--circle',
  };

  // Check for partial matches
  for (const [key, icon] of Object.entries(typeIcons)) {
    if (key !== 'default' && type.toLowerCase().includes(key.toLowerCase())) {
      return icon;
    }
  }

  return typeIcons.default;
}

/**
 * Truncates text to a maximum length with ellipsis
 * @param text - Text to truncate
 * @param maxLength - Maximum length before truncation
 * @returns Truncated text with ellipsis if needed
 */
export function truncateText(text: string, maxLength: number = 25): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 1) + '…';
}
