/**
 * Custom node component for the relationship graph
 * Displays object type icon, name, and expand button
 */
import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import { Icon } from '@/components/atoms/Icon';
import { getTypeColor, getTypeIcon, truncateText } from './graphLayoutUtils';
import type { GraphNodeData } from './useGraphData';

export interface GraphNodeComponentProps {
  id: string;
  data: GraphNodeData;
  selected?: boolean;
}

/**
 * Custom node component for displaying graph objects
 */
export const GraphNode = memo(function GraphNode({
  data,
  selected,
}: GraphNodeComponentProps) {
  const {
    label,
    type,
    status,
    isRoot,
    isExpanded,
    isFocused,
    isHovered,
    hasMore,
    depth,
    relationshipCount,
  } = data;

  const typeColor = getTypeColor(type);
  const typeIcon = getTypeIcon(type);
  const truncatedLabel = truncateText(label, 30);

  return (
    <div
      className={`
        relative px-3 py-2 rounded-lg border-2 shadow-md
        transition-all duration-200 cursor-pointer
        min-w-[200px] max-w-[270px]
        ${isRoot ? 'border-primary bg-base-200' : 'border-base-300 bg-base-100'}
        ${selected ? 'ring-2 ring-primary ring-offset-2' : ''}
        ${isFocused ? 'ring-4 ring-accent ring-offset-2 animate-pulse' : ''}
        ${
          isHovered
            ? 'border-warning shadow-lg shadow-warning/20'
            : 'hover:shadow-lg hover:border-primary/50'
        }
      `}
    >
      {/* Handles on all sides for optimal edge routing */}
      <Handle
        type="target"
        position={Position.Top}
        id="target-top"
        className="!w-1 !h-1 !bg-transparent !border-0"
        isConnectable={false}
      />
      <Handle
        type="target"
        position={Position.Bottom}
        id="target-bottom"
        className="!w-1 !h-1 !bg-transparent !border-0"
        isConnectable={false}
      />
      <Handle
        type="target"
        position={Position.Left}
        id="target-left"
        className="!w-1 !h-1 !bg-transparent !border-0"
        isConnectable={false}
      />
      <Handle
        type="target"
        position={Position.Right}
        id="target-right"
        className="!w-1 !h-1 !bg-transparent !border-0"
        isConnectable={false}
      />

      {/* Node content */}
      <div className="flex items-start gap-2">
        {/* Type indicator */}
        <div
          className={`
            flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center
            ${typeColor} text-white
          `}
        >
          <Icon icon={typeIcon} className="size-4" />
        </div>

        {/* Label and metadata */}
        <div className="flex-1 min-w-0 overflow-hidden">
          <div className="flex items-center gap-1">
            <span className="text-xs text-base-content/60 truncate">
              {type}
            </span>
            {status && (
              <span
                className={`
                  badge badge-xs
                  ${status === 'accepted' ? 'badge-success' : 'badge-ghost'}
                `}
              >
                {status}
              </span>
            )}
          </div>
          <div className="font-medium text-sm truncate mt-0.5" title={label}>
            {truncatedLabel}
          </div>
        </div>
      </div>

      {/* Expand/Collapse indicator - pointer-events-none so clicks pass through to node */}
      {!isRoot && isExpanded && (
        <div
          className="absolute -bottom-2 right-2 btn btn-xs bg-error hover:bg-error text-error-content pointer-events-none flex items-center gap-0.5 px-2"
          title={`Collapse to hide ${data.descendantCount ?? ''} relationships`}
        >
          <Icon icon="lucide--minus" className="size-3" />
          {data.descendantCount !== undefined && data.descendantCount > 0 && (
            <span className="text-xs font-medium">{data.descendantCount}</span>
          )}
        </div>
      )}
      {hasMore && !isExpanded && depth < 5 && (
        <div
          className="absolute -bottom-2 right-2 btn btn-xs bg-success hover:bg-success text-success-content pointer-events-none flex items-center gap-0.5 px-2"
          title={`Expand to show ${relationshipCount ?? 'more'} relationships`}
        >
          <Icon icon="lucide--plus" className="size-3" />
          {relationshipCount !== undefined && relationshipCount > 0 && (
            <span className="text-xs font-medium">{relationshipCount}</span>
          )}
        </div>
      )}

      {/* Source handles on all sides for optimal edge routing */}
      <Handle
        type="source"
        position={Position.Top}
        id="source-top"
        className="!w-1 !h-1 !bg-transparent !border-0"
        isConnectable={false}
      />
      <Handle
        type="source"
        position={Position.Bottom}
        id="source-bottom"
        className="!w-1 !h-1 !bg-transparent !border-0"
        isConnectable={false}
      />
      <Handle
        type="source"
        position={Position.Left}
        id="source-left"
        className="!w-1 !h-1 !bg-transparent !border-0"
        isConnectable={false}
      />
      <Handle
        type="source"
        position={Position.Right}
        id="source-right"
        className="!w-1 !h-1 !bg-transparent !border-0"
        isConnectable={false}
      />
    </div>
  );
});

export default GraphNode;
