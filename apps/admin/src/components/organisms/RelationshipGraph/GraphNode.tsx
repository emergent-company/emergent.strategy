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
  const { label, type, status, isRoot, hasMore, depth, relationshipCount } =
    data;

  const typeColor = getTypeColor(type);
  const typeIcon = getTypeIcon(type);
  const truncatedLabel = truncateText(label, 20);

  return (
    <div
      className={`
        relative px-3 py-2 rounded-lg border-2 shadow-md
        transition-all duration-200 cursor-pointer
        min-w-[140px] max-w-[180px]
        ${
          isRoot
            ? 'border-primary bg-primary/10'
            : 'border-base-300 bg-base-100'
        }
        ${selected ? 'ring-2 ring-primary ring-offset-2' : ''}
        hover:shadow-lg hover:border-primary/50
      `}
    >
      {/* Input handle (left side for incoming connections) - hidden, only for edge routing */}
      <Handle
        type="target"
        position={Position.Left}
        className="!w-2 !h-2 !bg-base-300 !border-0 !opacity-0"
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
          <div className="font-medium text-sm truncate" title={label}>
            {truncatedLabel}
          </div>
          <div className="flex items-center gap-1 mt-0.5">
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
        </div>
      </div>

      {/* Relationship count indicator */}
      {relationshipCount !== undefined && relationshipCount > 0 && (
        <div
          className="absolute -top-2 -right-2 badge badge-sm badge-neutral"
          title={`${relationshipCount} relationships`}
        >
          {relationshipCount}
        </div>
      )}

      {/* Root indicator */}
      {isRoot && (
        <div className="absolute -top-2 -left-2">
          <span className="badge badge-xs badge-primary">root</span>
        </div>
      )}

      {/* Expand indicator */}
      {hasMore && depth < 5 && (
        <div
          className="absolute -bottom-2 right-2 btn btn-xs btn-circle btn-primary"
          title="Expand to show more relationships"
        >
          <Icon icon="lucide--plus" className="size-3" />
        </div>
      )}

      {/* Output handle (right side for outgoing connections) - hidden, only for edge routing */}
      <Handle
        type="source"
        position={Position.Right}
        className="!w-2 !h-2 !bg-base-300 !border-0 !opacity-0"
        isConnectable={false}
      />
    </div>
  );
});

export default GraphNode;
