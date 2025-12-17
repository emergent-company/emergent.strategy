/**
 * GraphViewerModal - Full-screen modal for viewing relationship graphs
 * Used by ObjectPreviewDrawer to show expanded graph view
 */
import { useState, useCallback } from 'react';
import { Modal } from '@/components/organisms/Modal/Modal';
import { Icon } from '@/components/atoms/Icon';
import {
  RelationshipGraph,
  TreeRelationshipGraph,
  type TreeEdgeStyle,
} from '@/components/organisms/RelationshipGraph';

export type GraphLayout = 'radial' | 'tree' | 'orthogonal';

export interface GraphViewerModalProps {
  /** Whether the modal is open */
  isOpen: boolean;
  /** Callback when modal should close */
  onClose: () => void;
  /** The object ID to visualize */
  objectId: string;
  /** Display name of the object (for title) */
  objectName: string;
  /** Called when a node is double-clicked to navigate to that object */
  onNodeNavigate?: (objectId: string) => void;
}

const layoutOptions: { value: GraphLayout; label: string; icon: string }[] = [
  { value: 'radial', label: 'Radial', icon: 'lucide--circle-dot' },
  { value: 'tree', label: 'Tree', icon: 'lucide--git-branch' },
  { value: 'orthogonal', label: 'Orthogonal', icon: 'lucide--git-fork' },
];

export function GraphViewerModal({
  isOpen,
  onClose,
  objectId,
  objectName,
  onNodeNavigate,
}: GraphViewerModalProps) {
  const [layout, setLayout] = useState<GraphLayout>('tree');

  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (!open) {
        onClose();
      }
    },
    [onClose]
  );

  const handleNodeDoubleClick = useCallback(
    (nodeObjectId: string) => {
      if (onNodeNavigate) {
        onNodeNavigate(nodeObjectId);
        onClose();
      }
    },
    [onNodeNavigate, onClose]
  );

  // Get edge style for tree layouts
  const getEdgeStyle = (): TreeEdgeStyle | undefined => {
    if (layout === 'orthogonal') return 'orthogonal';
    if (layout === 'tree') return 'bezier';
    return undefined;
  };

  return (
    <Modal
      open={isOpen}
      onOpenChange={handleOpenChange}
      sizeClassName="max-w-[95vw] w-[95vw] h-[90vh]"
      className="!p-0"
      hideCloseButton
    >
      {/* Custom header with layout controls */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-base-300 bg-base-100 shrink-0">
        <div className="flex items-center gap-3">
          <Icon icon="lucide--git-branch" className="size-5 text-primary" />
          <div>
            <h2 className="font-semibold text-base">Relationship Graph</h2>
            <p className="text-xs text-base-content/60 truncate max-w-[300px]">
              {objectName}
            </p>
          </div>
        </div>

        {/* Layout toggle */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-base-content/60 mr-1">Layout:</span>
          <div className="join">
            {layoutOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                className={`join-item btn btn-sm ${
                  layout === option.value ? 'btn-primary' : 'btn-ghost'
                }`}
                onClick={() => setLayout(option.value)}
                title={option.label}
              >
                <Icon icon={option.icon} className="size-4" />
                <span className="hidden sm:inline ml-1">{option.label}</span>
              </button>
            ))}
          </div>

          {/* Close button */}
          <button
            type="button"
            className="btn btn-sm btn-circle btn-ghost ml-2"
            onClick={onClose}
            aria-label="Close graph viewer"
          >
            <Icon icon="lucide--x" className="size-4" />
          </button>
        </div>
      </div>

      {/* Graph container */}
      <div className="flex-1 h-full min-h-0">
        {layout === 'radial' ? (
          <RelationshipGraph
            objectId={objectId}
            onNodeDoubleClick={handleNodeDoubleClick}
            showMinimap={true}
            className="h-full"
          />
        ) : (
          <TreeRelationshipGraph
            objectId={objectId}
            onNodeDoubleClick={handleNodeDoubleClick}
            showMinimap={true}
            edgeStyle={getEdgeStyle()}
            className="h-full"
          />
        )}
      </div>

      {/* Help text */}
      <div className="px-4 py-2 border-t border-base-300 bg-base-100/80 text-xs text-base-content/50 text-center shrink-0">
        Click nodes to expand/collapse • Double-click to view object details •
        Scroll to zoom • Drag to pan
      </div>
    </Modal>
  );
}

export default GraphViewerModal;
