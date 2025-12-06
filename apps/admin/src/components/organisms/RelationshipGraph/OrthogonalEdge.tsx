/**
 * Orthogonal edge component for the relationship graph
 * Uses right-angle (step) paths instead of curves
 * Gray by default, orange with label on hover
 * Supports vertical offset for parallel edges on the horizontal segment
 */
import { memo } from 'react';
import { BaseEdge, EdgeLabelRenderer, type Position } from '@xyflow/react';
import type { GraphEdgeData } from './useGraphData';

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
 * Build a simple orthogonal step path with offset on the middle segment
 * Creates a path: source → horizontal to midX → vertical segment (with offset) → horizontal to target
 */
function buildOrthogonalPath(
  sourceX: number,
  sourceY: number,
  targetX: number,
  targetY: number,
  edgeOffsetY: number
): { path: string; labelX: number; labelY: number } {
  // Midpoint X for the vertical segment
  const midX = (sourceX + targetX) / 2 + edgeOffsetY; // offset applied to X for the vertical segment

  // Classic step path:
  // 1. Start at source
  // 2. Go horizontally to midX (at sourceY)
  // 3. Go vertically to targetY (at midX)
  // 4. Go horizontally to target (at targetY)
  const path = `M ${sourceX} ${sourceY} L ${midX} ${sourceY} L ${midX} ${targetY} L ${targetX} ${targetY}`;

  // Label position is at the midpoint of the vertical segment
  const labelY = (sourceY + targetY) / 2;

  return {
    path,
    labelX: midX,
    labelY,
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
  markerEnd,
}: OrthogonalEdgeComponentProps) {
  const label = data?.label || '';
  const labelOffsetY = data?.labelOffsetY || 0;
  const edgeOffsetY = data?.edgeOffsetY || 0;
  const isHighlighted = data?.isHighlighted ?? false;

  // Build custom path with offset on the horizontal segment
  const {
    path: edgePath,
    labelX,
    labelY,
  } = buildOrthogonalPath(sourceX, sourceY, targetX, targetY, edgeOffsetY);

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        markerEnd={markerEnd}
        className={`
          transition-all duration-200
          ${
            isHighlighted
              ? '!stroke-warning !stroke-2'
              : '!stroke-base-content/30 !stroke-[1.5px]'
          }
        `}
        style={{
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
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
