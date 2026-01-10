/**
 * Custom edge component for the schema graph
 * Shows relationship type with label on hover
 */
import { memo } from 'react';
import { EdgeLabelRenderer, getBezierPath, type Position } from '@xyflow/react';
import type { SchemaEdgeData } from './SchemaGraph';

export interface SchemaGraphEdgeProps {
  id: string;
  sourceX: number;
  sourceY: number;
  targetX: number;
  targetY: number;
  sourcePosition: Position;
  targetPosition: Position;
  data?: SchemaEdgeData;
  selected?: boolean;
  markerEnd?: string;
}

/**
 * Custom edge component for displaying schema relationships
 */
export const SchemaGraphEdge = memo(function SchemaGraphEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
}: SchemaGraphEdgeProps) {
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  const label = data?.label || '';
  const isHighlighted = data?.isHighlighted ?? false;
  const multiplicity = data?.multiplicity;

  // Unique marker ID for this edge
  const markerId = `schema-arrow-${id}-${isHighlighted ? 'hl' : 'def'}`;

  // Color based on highlight state
  const strokeColor = isHighlighted
    ? 'var(--color-primary, #3b82f6)'
    : 'color-mix(in oklch, var(--color-base-content, #888) 40%, transparent)';

  return (
    <>
      {/* Define custom marker */}
      <defs>
        <marker
          id={markerId}
          markerWidth="12"
          markerHeight="12"
          refX="10"
          refY="6"
          orient="auto"
          markerUnits="userSpaceOnUse"
        >
          <path d="M 0 0 L 12 6 L 0 12 L 2 6 Z" fill={strokeColor} />
        </marker>
      </defs>

      {/* Edge path */}
      <path
        id={id}
        d={edgePath}
        fill="none"
        strokeLinecap="round"
        markerEnd={`url(#${markerId})`}
        className="react-flow__edge-path"
        style={{
          stroke: strokeColor,
          strokeWidth: isHighlighted ? 2 : 1.5,
        }}
      />

      {/* Label - always show when highlighted, show on hover otherwise */}
      {label && isHighlighted && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              pointerEvents: 'all',
            }}
            className="px-2 py-1 rounded text-xs font-medium bg-primary/10 border border-primary/30 text-primary max-w-[140px] truncate"
            title={`${label}${
              multiplicity
                ? ` (${multiplicity.src || '*'} : ${multiplicity.dst || '*'})`
                : ''
            }`}
          >
            {label}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
});

export default SchemaGraphEdge;
