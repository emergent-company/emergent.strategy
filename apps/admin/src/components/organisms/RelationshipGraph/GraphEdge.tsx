/**
 * Custom edge component for the relationship graph
 * Gray by default, orange with label on hover
 */
import { memo } from 'react';
import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  type Position,
} from '@xyflow/react';
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
  markerEnd,
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
