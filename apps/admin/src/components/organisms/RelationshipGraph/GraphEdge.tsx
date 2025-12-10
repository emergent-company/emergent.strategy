/**
 * Custom edge component for the relationship graph
 * Gray by default, orange with label on hover
 * Uses custom arrow markers that change color with the edge
 */
import { memo } from 'react';
import { EdgeLabelRenderer, getBezierPath, type Position } from '@xyflow/react';
import type { GraphEdgeData } from './useGraphData';

export interface GraphEdgeComponentProps {
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
 * Custom edge component for displaying relationships
 * Shows gray line by default, orange line with label when connected node is hovered
 * Uses custom markers that change color with the edge
 */
export const GraphEdge = memo(function GraphEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
}: GraphEdgeComponentProps) {
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  const label = data?.label || '';
  const labelOffsetY = data?.labelOffsetY || 0;
  const isHighlighted = data?.isHighlighted ?? false;

  // Unique marker ID for this edge - include highlight state to force re-render
  const markerId = `bezier-arrow-${id}-${isHighlighted ? 'hl' : 'def'}`;

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
            className="px-2 py-0.5 rounded text-xs font-medium bg-warning/20 border border-warning text-warning-content max-w-[120px] truncate"
            title={label}
          >
            {label}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
});

export default GraphEdge;
