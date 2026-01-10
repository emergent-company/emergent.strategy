/**
 * GraphViewerModal - Full-screen modal for viewing relationship graphs
 * Used by ObjectPreviewDrawer to show expanded graph view
 */
import { useCallback } from 'react';
import { Modal } from '@/components/organisms/Modal/Modal';
import { Icon } from '@/components/atoms/Icon';
import { TreeRelationshipGraph } from '@/components/organisms/RelationshipGraph';

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

export function GraphViewerModal({
  isOpen,
  onClose,
  objectId,
  objectName,
  onNodeNavigate,
}: GraphViewerModalProps) {
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

  return (
    <Modal
      open={isOpen}
      onOpenChange={handleOpenChange}
      sizeClassName="max-w-[95vw] w-[95vw] h-[90vh]"
      className="!p-0"
      hideCloseButton
    >
      {/* Custom header */}
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

        {/* Close button */}
        <button
          type="button"
          className="btn btn-sm btn-circle btn-ghost"
          onClick={onClose}
          aria-label="Close graph viewer"
        >
          <Icon icon="lucide--x" className="size-4" />
        </button>
      </div>

      {/* Graph container */}
      <div className="flex-1 h-full min-h-0">
        <TreeRelationshipGraph
          objectId={objectId}
          onNodeDoubleClick={handleNodeDoubleClick}
          showMinimap={true}
          edgeStyle="orthogonal"
          className="h-full"
        />
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
