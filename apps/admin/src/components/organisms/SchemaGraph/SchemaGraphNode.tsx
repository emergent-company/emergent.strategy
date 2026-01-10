/**
 * Custom node component for the schema graph
 * Displays object type name, description, and property count
 */
import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import { Icon } from '@/components/atoms/Icon';
import type { SchemaNodeData } from './SchemaGraph';

export interface SchemaGraphNodeProps {
  id: string;
  data: SchemaNodeData;
  selected?: boolean;
}

/**
 * Custom node component for displaying schema object types
 */
export const SchemaGraphNode = memo(function SchemaGraphNode({
  data,
  selected,
}: SchemaGraphNodeProps) {
  const { label, description, propertyCount, isHovered } = data;

  return (
    <div
      className={`
        relative px-3 py-2 rounded-lg border-2 shadow-md
        transition-all duration-200
        min-w-[160px] max-w-[200px]
        bg-base-100 border-base-300
        ${selected ? 'ring-2 ring-primary ring-offset-2' : ''}
        ${
          isHovered
            ? 'border-primary shadow-lg shadow-primary/20 scale-105'
            : 'hover:shadow-lg hover:border-primary/50'
        }
      `}
    >
      {/* Handles on all sides */}
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
      <div className="flex items-center gap-2">
        {/* Type icon */}
        <div className="flex-shrink-0 w-8 h-8 rounded-md flex items-center justify-center bg-primary/10 text-primary">
          <Icon icon="lucide--box" className="size-4" />
        </div>

        {/* Label and metadata */}
        <div className="flex-1 min-w-0 overflow-hidden">
          <div className="font-semibold text-sm truncate" title={label}>
            {label}
          </div>
          <div className="flex items-center gap-1 text-xs text-base-content/60">
            <span>{propertyCount} properties</span>
          </div>
        </div>
      </div>

      {/* Description tooltip on hover */}
      {description && isHovered && (
        <div className="absolute top-full left-0 right-0 mt-1 z-10 p-2 bg-base-200 rounded-md shadow-lg text-xs text-base-content/80 max-w-[200px]">
          {description}
        </div>
      )}

      {/* Source handles on all sides */}
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

export default SchemaGraphNode;
