/**
 * Graph control buttons component
 * Provides zoom, fit, and reset functionality
 */
import { memo } from 'react';
import { useReactFlow } from '@xyflow/react';
import { Icon } from '@/components/atoms/Icon';

export interface GraphControlsProps {
  /** Called when reset is requested */
  onReset?: () => void;
  /** Called when relayout is requested */
  onRelayout?: () => void;
  /** Whether graph is currently loading */
  loading?: boolean;
}

/**
 * Control panel for graph navigation
 */
export const GraphControls = memo(function GraphControls({
  onReset,
  onRelayout,
  loading,
}: GraphControlsProps) {
  const { zoomIn, zoomOut, fitView } = useReactFlow();

  const handleZoomIn = () => {
    zoomIn({ duration: 200 });
  };

  const handleZoomOut = () => {
    zoomOut({ duration: 200 });
  };

  const handleFitView = () => {
    fitView({ duration: 300, padding: 0.2 });
  };

  return (
    <div className="absolute bottom-4 left-4 z-10 flex flex-col gap-1">
      {/* Zoom controls */}
      <div className="flex flex-col bg-base-100 rounded-lg border border-base-300 shadow-sm overflow-hidden">
        <button
          onClick={handleZoomIn}
          className="btn btn-ghost btn-sm btn-square"
          title="Zoom in"
          disabled={loading}
        >
          <Icon icon="lucide--plus" className="size-4" />
        </button>
        <div className="border-t border-base-300" />
        <button
          onClick={handleZoomOut}
          className="btn btn-ghost btn-sm btn-square"
          title="Zoom out"
          disabled={loading}
        >
          <Icon icon="lucide--minus" className="size-4" />
        </button>
      </div>

      {/* Action controls */}
      <div className="flex flex-col bg-base-100 rounded-lg border border-base-300 shadow-sm overflow-hidden mt-2">
        <button
          onClick={handleFitView}
          className="btn btn-ghost btn-sm btn-square"
          title="Fit view"
          disabled={loading}
        >
          <Icon icon="lucide--maximize" className="size-4" />
        </button>
        {onRelayout && (
          <>
            <div className="border-t border-base-300" />
            <button
              onClick={onRelayout}
              className="btn btn-ghost btn-sm btn-square"
              title="Re-layout graph"
              disabled={loading}
            >
              <Icon icon="lucide--layout-grid" className="size-4" />
            </button>
          </>
        )}
        {onReset && (
          <>
            <div className="border-t border-base-300" />
            <button
              onClick={onReset}
              className="btn btn-ghost btn-sm btn-square"
              title="Reset to initial view"
              disabled={loading}
            >
              <Icon icon="lucide--refresh-cw" className="size-4" />
            </button>
          </>
        )}
      </div>
    </div>
  );
});

export default GraphControls;
