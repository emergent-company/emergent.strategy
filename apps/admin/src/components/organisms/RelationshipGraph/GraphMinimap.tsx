/**
 * Graph minimap component for navigation in large graphs
 */
import { memo } from 'react';
import { MiniMap } from '@xyflow/react';
import { getTypeColor } from './graphLayoutUtils';

/**
 * Minimap for navigating large relationship graphs
 */
export const GraphMinimap = memo(function GraphMinimap() {
  // Custom node color function based on object type
  const nodeColor = (node: { data?: { type?: string; isRoot?: boolean } }) => {
    if (node.data?.isRoot) {
      return 'hsl(var(--p))'; // Primary color for root
    }

    const type = node.data?.type ?? '';
    const colorClass = getTypeColor(type);

    // Map Tailwind color classes to hex values
    const colorMap: Record<string, string> = {
      'bg-blue-500': '#3b82f6',
      'bg-purple-500': '#a855f7',
      'bg-green-500': '#22c55e',
      'bg-orange-500': '#f97316',
      'bg-pink-500': '#ec4899',
      'bg-cyan-500': '#06b6d4',
      'bg-amber-500': '#f59e0b',
      'bg-gray-500': '#6b7280',
    };

    return colorMap[colorClass] ?? '#6b7280';
  };

  return (
    <MiniMap
      nodeColor={nodeColor}
      nodeStrokeWidth={3}
      pannable
      zoomable
      className="!bg-base-200 !border !border-base-300 !rounded-lg !shadow-sm"
      style={{
        width: 160,
        height: 120,
      }}
      maskColor="rgba(0, 0, 0, 0.1)"
    />
  );
});

export default GraphMinimap;
