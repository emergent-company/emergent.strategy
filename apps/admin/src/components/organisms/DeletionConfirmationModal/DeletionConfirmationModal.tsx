import React, { useEffect, useState } from 'react';
import { ConfirmActionModal } from '../ConfirmActionModal/ConfirmActionModal';
import { DeletionImpact, BulkDeletionImpact } from '../../../api/documents';
import { Spinner } from '@/components/atoms/Spinner';

export interface DeletionConfirmationModalProps {
  /** Controlled open state */
  open: boolean;
  /** Called when user cancels or closes */
  onCancel: () => void;
  /** Called when user confirms deletion */
  onConfirm: () => Promise<void>;
  /** Single document ID or multiple IDs for bulk deletion */
  documentIds: string | string[];
  /** Function to fetch deletion impact */
  fetchImpact: (
    ids: string | string[]
  ) => Promise<DeletionImpact | BulkDeletionImpact>;
  /** Document name(s) for display */
  documentNames?: string | string[];
}

type ImpactState = {
  loading: boolean;
  error: string | null;
  impact: DeletionImpact | BulkDeletionImpact | null;
};

/**
 * Modal for confirming document deletion with cascade impact display
 * Shows what related resources will be deleted before user confirms
 */
export const DeletionConfirmationModal: React.FC<
  DeletionConfirmationModalProps
> = ({
  open,
  onCancel,
  onConfirm,
  documentIds,
  fetchImpact,
  documentNames,
}) => {
  const [impactState, setImpactState] = useState<ImpactState>({
    loading: false,
    error: null,
    impact: null,
  });
  const [isDeleting, setIsDeleting] = useState(false);

  const isBulk = Array.isArray(documentIds) && documentIds.length > 1;
  const count = Array.isArray(documentIds) ? documentIds.length : 1;

  // Fetch impact when modal opens
  useEffect(() => {
    if (open && !impactState.impact) {
      setImpactState({ loading: true, error: null, impact: null });
      fetchImpact(documentIds)
        .then((impact) => {
          setImpactState({ loading: false, error: null, impact });
        })
        .catch((err) => {
          setImpactState({
            loading: false,
            error: err.message || 'Failed to fetch deletion impact',
            impact: null,
          });
        });
    }
  }, [open, documentIds, fetchImpact, impactState.impact]);

  // Reset state when modal closes
  useEffect(() => {
    if (!open) {
      setImpactState({ loading: false, error: null, impact: null });
      setIsDeleting(false);
    }
  }, [open]);

  const handleConfirm = async () => {
    setIsDeleting(true);
    try {
      await onConfirm();
    } catch (err) {
      // Error handling done by parent
      setIsDeleting(false);
    }
  };

  const renderImpactSummary = () => {
    if (impactState.loading) {
      return (
        <div className="flex items-center justify-center py-4">
          <Spinner size="md" />
          <span className="ml-2 text-sm text-base-content/70">
            Analyzing impact...
          </span>
        </div>
      );
    }

    if (impactState.error) {
      return (
        <div className="alert alert-error">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="stroke-current shrink-0 h-6 w-6"
            fill="none"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <span>{impactState.error}</span>
        </div>
      );
    }

    if (!impactState.impact) {
      return null;
    }

    const impact = impactState.impact;

    // Extract impact data based on single or bulk impact
    const impactData = isBulk
      ? (impact as BulkDeletionImpact).impact
      : (impact as DeletionImpact).impact;

    // Defensive check - if impact is undefined, show a safe default
    if (!impactData) {
      return (
        <div className="alert alert-error">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="stroke-current shrink-0 h-6 w-6"
            fill="none"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <span>
            Unable to determine deletion impact. Impact data is missing from
            server response.
          </span>
        </div>
      );
    }

    const hasImpact =
      impactData.chunks > 0 ||
      impactData.extractionJobs > 0 ||
      impactData.graphObjects > 0 ||
      impactData.graphRelationships > 0 ||
      impactData.notifications > 0;

    // For bulk deletion, get per-document breakdown
    const bulkImpact = isBulk ? (impact as BulkDeletionImpact) : null;
    const hasPerDocumentBreakdown =
      bulkImpact?.documents && bulkImpact.documents.length > 0;

    return (
      <div className="space-y-3">
        <div className="alert alert-warning">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="stroke-current shrink-0 h-6 w-6"
            fill="none"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
          <span>This action cannot be undone.</span>
        </div>

        {/* Single document: simplified display */}
        {!isBulk ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-base font-medium">
              <span>📄</span>
              <span className="truncate">{documentNames || 'Document'}</span>
            </div>
            {hasImpact ? (
              <div className="text-sm">
                <p className="font-semibold mb-2">Impact:</p>
                <ul className="space-y-1">
                  {impactData.chunks > 0 && (
                    <li>
                      • {impactData.chunks} Chunk
                      {impactData.chunks !== 1 ? 's' : ''}
                    </li>
                  )}
                  {impactData.notifications > 0 && (
                    <li>
                      • {impactData.notifications} Notification
                      {impactData.notifications !== 1 ? 's' : ''}
                    </li>
                  )}
                  {impactData.graphRelationships > 0 && (
                    <li>
                      • {impactData.graphRelationships} Relationship
                      {impactData.graphRelationships !== 1 ? 's' : ''}
                    </li>
                  )}
                  {impactData.graphObjects > 0 && (
                    <li>
                      • {impactData.graphObjects} Object
                      {impactData.graphObjects !== 1 ? 's' : ''}
                    </li>
                  )}
                  {impactData.extractionJobs > 0 && (
                    <li>
                      • {impactData.extractionJobs} Extraction Job
                      {impactData.extractionJobs !== 1 ? 's' : ''}
                    </li>
                  )}
                </ul>
              </div>
            ) : (
              <div className="text-sm text-base-content/70">
                No related resources will be affected.
              </div>
            )}
          </div>
        ) : (
          /* Bulk deletion: show aggregate impact */
          <>
            {hasImpact ? (
              <div className="bg-base-200 rounded-lg p-4">
                <h4 className="font-semibold mb-2 text-sm">Total Impact:</h4>
                <ul className="space-y-1 text-sm">
                  {impactData.chunks > 0 && (
                    <li className="flex items-center">
                      <span className="badge badge-sm badge-ghost mr-2">
                        {impactData.chunks}
                      </span>
                      Chunk{impactData.chunks !== 1 ? 's' : ''}
                    </li>
                  )}
                  {impactData.notifications > 0 && (
                    <li className="flex items-center">
                      <span className="badge badge-sm badge-ghost mr-2">
                        {impactData.notifications}
                      </span>
                      Notification{impactData.notifications !== 1 ? 's' : ''}
                    </li>
                  )}
                  {impactData.graphRelationships > 0 && (
                    <li className="flex items-center">
                      <span className="badge badge-sm badge-ghost mr-2">
                        {impactData.graphRelationships}
                      </span>
                      Relationship
                      {impactData.graphRelationships !== 1 ? 's' : ''}
                    </li>
                  )}
                  {impactData.graphObjects > 0 && (
                    <li className="flex items-center">
                      <span className="badge badge-sm badge-ghost mr-2">
                        {impactData.graphObjects}
                      </span>
                      Object{impactData.graphObjects !== 1 ? 's' : ''}
                    </li>
                  )}
                  {impactData.extractionJobs > 0 && (
                    <li className="flex items-center">
                      <span className="badge badge-sm badge-ghost mr-2">
                        {impactData.extractionJobs}
                      </span>
                      Extraction Job
                      {impactData.extractionJobs !== 1 ? 's' : ''}
                    </li>
                  )}
                </ul>
              </div>
            ) : (
              <div className="text-sm text-base-content/70">
                No related resources will be affected.
              </div>
            )}
          </>
        )}

        {/* Per-document breakdown for bulk deletion */}
        {hasPerDocumentBreakdown && (
          <div className="bg-base-100 rounded-lg border border-base-300 p-4">
            <h4 className="font-semibold mb-3 text-sm">
              Documents to be deleted:
            </h4>
            <div className="space-y-3 max-h-64 overflow-y-auto">
              {bulkImpact.documents?.map((docImpact, index) => {
                const docHasImpact =
                  docImpact.impact.chunks > 0 ||
                  docImpact.impact.extractionJobs > 0 ||
                  docImpact.impact.graphObjects > 0 ||
                  docImpact.impact.graphRelationships > 0 ||
                  docImpact.impact.notifications > 0;

                // Highlight high-impact documents
                const isHighImpact =
                  docImpact.impact.chunks > 10 ||
                  docImpact.impact.extractionJobs > 5;

                return (
                  <div
                    key={docImpact.document.id}
                    className={`p-3 rounded ${
                      isHighImpact
                        ? 'bg-warning/10 border border-warning/30'
                        : 'bg-base-200'
                    }`}
                  >
                    <div className="font-medium text-sm mb-1 flex items-center gap-2">
                      <span>📄</span>
                      <span className="truncate">
                        {docImpact.document.name}
                      </span>
                      {isHighImpact && (
                        <span className="badge badge-warning badge-xs">
                          High Impact
                        </span>
                      )}
                    </div>
                    {docHasImpact && (
                      <ul className="space-y-0.5 text-xs ml-6 mt-2">
                        {docImpact.impact.chunks > 0 && (
                          <li className="flex items-center">
                            <span className="badge badge-xs badge-ghost mr-1">
                              {docImpact.impact.chunks}
                            </span>
                            Chunk{docImpact.impact.chunks !== 1 ? 's' : ''}
                          </li>
                        )}
                        {docImpact.impact.extractionJobs > 0 && (
                          <li className="flex items-center">
                            <span className="badge badge-xs badge-ghost mr-1">
                              {docImpact.impact.extractionJobs}
                            </span>
                            Extraction Job
                            {docImpact.impact.extractionJobs !== 1 ? 's' : ''}
                          </li>
                        )}
                        {docImpact.impact.graphObjects > 0 && (
                          <li className="flex items-center">
                            <span className="badge badge-xs badge-ghost mr-1">
                              {docImpact.impact.graphObjects}
                            </span>
                            Object
                            {docImpact.impact.graphObjects !== 1 ? 's' : ''}
                          </li>
                        )}
                        {docImpact.impact.graphRelationships > 0 && (
                          <li className="flex items-center">
                            <span className="badge badge-xs badge-ghost mr-1">
                              {docImpact.impact.graphRelationships}
                            </span>
                            Relationship
                            {docImpact.impact.graphRelationships !== 1
                              ? 's'
                              : ''}
                          </li>
                        )}
                        {docImpact.impact.notifications > 0 && (
                          <li className="flex items-center">
                            <span className="badge badge-xs badge-ghost mr-1">
                              {docImpact.impact.notifications}
                            </span>
                            Notification
                            {docImpact.impact.notifications !== 1 ? 's' : ''}
                          </li>
                        )}
                      </ul>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    );
  };

  const getTitle = () => {
    if (isBulk) {
      return `Delete ${count} Document${count !== 1 ? 's' : ''}?`;
    }
    return documentNames ? `Delete "${documentNames}"?` : 'Delete Document?';
  };

  const getDescription = () => {
    if (isBulk) {
      return `You are about to permanently delete ${count} document${
        count !== 1 ? 's' : ''
      } and all related resources.`;
    }
    return 'You are about to permanently delete this document and all related resources.';
  };

  return (
    <ConfirmActionModal
      open={open}
      onCancel={onCancel}
      onConfirm={handleConfirm}
      title={getTitle()}
      description={getDescription()}
      confirmLabel="Delete"
      confirmVariant="error"
      confirmDisabled={impactState.loading}
      confirmLoading={isDeleting}
      sizeClassName="max-w-xl"
    >
      {renderImpactSummary()}
    </ConfirmActionModal>
  );
};

DeletionConfirmationModal.displayName = 'DeletionConfirmationModal';

export default DeletionConfirmationModal;
