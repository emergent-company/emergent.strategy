/**
 * Orthogonal edge component for the relationship graph
 * Uses right-angle (step) paths instead of curves
 * Gray by default, orange with label on hover
 * Supports vertical offset for parallel edges on the horizontal segment
 * Uses custom arrow markers that change color with the edge
 */
import { memo } from 'react';
import { EdgeLabelRenderer, type Position } from '@xyflow/react';
import type { GraphEdgeData } from './useGraphData';

/**
 * Configuration for orthogonal edge rendering - easily adjustable
 */
export const ORTHOGONAL_EDGE_CONFIG = {
  /** Minimum horizontal distance from node border to first/last path segment */
  NODE_MARGIN: 20,
  /** Minimum offset for same-column edges (loop distance to the right) */
  SAME_COLUMN_LOOP_OFFSET: 60,
};

export interface OrthogonalEdgeComponentProps {
  id: string;
  sourceX: number;
  sourceY: number;
  targetX: number;
  targetY: number;
  sourcePosition: Position;
  targetPosition: Position;
  data?: GraphEdgeData;
  selected?: boolean;
  markerEnd?: string;
}

/**
 * Build an orthogonal step path with offset on the middle segment
 * Handles both cross-column and same-column (loop) edge cases
 *
 * Cross-column: source → horizontal to midX → vertical → horizontal to target
 * Same-column (loop): source → right → vertical → back to target (both nodes use right handles)
 */
function buildOrthogonalPath(
  sourceX: number,
  sourceY: number,
  targetX: number,
  targetY: number,
  edgeOffsetX: number,
  isSameColumn: boolean
): { path: string; labelX: number; labelY: number } {
  const { NODE_MARGIN, SAME_COLUMN_LOOP_OFFSET } = ORTHOGONAL_EDGE_CONFIG;

  if (isSameColumn) {
    // Same-column edge: create a loop to the right of both nodes
    // Both source and target use right-side handles
    const loopX =
      Math.max(sourceX, targetX) +
      SAME_COLUMN_LOOP_OFFSET +
      Math.abs(edgeOffsetX);

    // Path: go right from source → down/up to target Y → back left to target
    const startX = sourceX + NODE_MARGIN;
    const endX = targetX + NODE_MARGIN;

    const path =
      `M ${startX} ${sourceY} ` +
      `L ${loopX} ${sourceY} ` +
      `L ${loopX} ${targetY} ` +
      `L ${endX} ${targetY}`;

    return {
      path,
      labelX: loopX,
      labelY: (sourceY + targetY) / 2,
    };
  }

  // Cross-column edge: standard orthogonal path with margins
  // Determine direction: left-to-right or right-to-left
  const goingRight = targetX > sourceX;

  const startX = goingRight ? sourceX + NODE_MARGIN : sourceX - NODE_MARGIN;
  const endX = goingRight ? targetX - NODE_MARGIN : targetX + NODE_MARGIN;

  // Midpoint X for the vertical segment (with offset for bidirectional edges)
  const midX = (startX + endX) / 2 + edgeOffsetX;

  // Classic step path:
  // 1. Start at source (with margin)
  // 2. Go horizontally to midX (at sourceY)
  // 3. Go vertically to targetY (at midX)
  // 4. Go horizontally to target (with margin)
  const path =
    `M ${startX} ${sourceY} ` +
    `L ${midX} ${sourceY} ` +
    `L ${midX} ${targetY} ` +
    `L ${endX} ${targetY}`;

  return {
    path,
    labelX: midX,
    labelY: (sourceY + targetY) / 2,
  };
}

/**
 * Orthogonal edge component using step/right-angle paths
 * Shows gray line by default, orange line with label when connected node is hovered
 * Applies vertical offset to the horizontal segment to separate parallel edges
 */
export const OrthogonalEdge = memo(function OrthogonalEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  data,
}: OrthogonalEdgeComponentProps) {
  const label = data?.label || '';
  const labelOffsetY = data?.labelOffsetY || 0;
  const edgeOffsetX = data?.edgeOffsetX || 0;
  const isSameColumn = data?.isSameColumn ?? false;
  const isHighlighted = data?.isHighlighted ?? false;

  // Build custom path with offset and same-column detection
  const {
    path: edgePath,
    labelX,
    labelY,
  } = buildOrthogonalPath(
    sourceX,
    sourceY,
    targetX,
    targetY,
    edgeOffsetX,
    isSameColumn
  );

  // Unique marker ID for this edge to ensure proper coloring
  const markerId = `orthogonal-arrow-${id}-${isHighlighted ? 'hl' : 'def'}`;

  // Use CSS custom properties with var() - daisyUI format
  // Warning color for highlighted, base-content with opacity for default
  const strokeColor = isHighlighted
    ? 'var(--color-warning, #f59e0b)' // warning color with fallback
    : 'color-mix(in oklch, var(--color-base-content, #888) 30%, transparent)';

  return (
    <>
      {/* Define custom marker that inherits the edge color */}
      <defs>
        <marker
          id={markerId}
          markerWidth="15"
          markerHeight="15"
          refX="12"
          refY="7.5"
          orient="auto"
          markerUnits="userSpaceOnUse"
        >
          <path d="M 0 0 L 15 7.5 L 0 15 L 3 7.5 Z" fill={strokeColor} />
        </marker>
      </defs>
      {/* Custom path element with proper styling */}
      {/* Use style prop to override React Flow's CSS variables */}
      <path
        id={id}
        d={edgePath}
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
        markerEnd={`url(#${markerId})`}
        className="react-flow__edge-path"
        style={{
          stroke: strokeColor,
          strokeWidth: isHighlighted ? 2.5 : 1.5,
        }}
      />
      {/* Only show label when highlighted */}
      {label && isHighlighted && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px,${
                labelY + labelOffsetY
              }px)`,
              pointerEvents: 'all',
            }}
            className="px-2 py-0.5 rounded text-xs font-medium bg-base-100 border border-warning text-warning shadow-sm max-w-[120px] truncate"
            title={label}
          >
            {label}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
});

export default OrthogonalEdge;
