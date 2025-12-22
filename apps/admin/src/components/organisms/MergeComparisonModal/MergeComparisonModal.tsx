/**
 * MergeComparisonModal
 * Three-column comparison modal for merge suggestion tasks with chat interface
 * Shows Source | Target | Chat in equal-width columns
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { Icon } from '@/components/atoms/Icon';
import { Button } from '@/components/atoms/Button';
import { Spinner } from '@/components/atoms/Spinner';
import { useApi } from '@/hooks/use-api';
import { MergeChat } from './MergeChat';
import type { Task } from '@/types/task';

interface GraphObject {
  id: string;
  key?: string | null;
  type: string;
  status?: string | null;
  description?: string;
  properties: Record<string, unknown>;
  labels: string[];
  created_at: string;
}

export interface MergeComparisonModalProps {
  /** The merge suggestion task */
  task: Task | null;
  /** Whether the modal is open */
  isOpen: boolean;
  /** Called when the modal should close */
  onClose: () => void;
  /** Called when merge is accepted */
  onAccept?: (taskId: string) => void;
  /** Called when merge is rejected */
  onReject?: (taskId: string) => void;
}

interface MergeMetadata {
  sourceId: string;
  targetId: string;
  sourceKey: string;
  targetKey: string;
  sourceType: string;
  targetType: string;
  similarityPercent: number;
  actionUrl?: string;
}

type PropertyDiff = 'same' | 'different' | 'only-source' | 'only-target';

interface PropertyComparison {
  key: string;
  sourceValue: unknown;
  targetValue: unknown;
  diff: PropertyDiff;
}

/**
 * Modal that displays three-column comparison of two objects with chat interface
 * Column 1: Source object properties
 * Column 2: Target object properties
 * Column 3: AI Chat for merge assistance
 */
export const MergeComparisonModal: React.FC<MergeComparisonModalProps> = ({
  task,
  isOpen,
  onClose,
  onAccept,
  onReject,
}) => {
  const { fetchJson, apiBase } = useApi();
  const dialogRef = useRef<HTMLDialogElement>(null);

  const [sourceObject, setSourceObject] = useState<GraphObject | null>(null);
  const [targetObject, setTargetObject] = useState<GraphObject | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Parse metadata from task
  const metadata: MergeMetadata | null = task?.metadata
    ? (task.metadata as unknown as MergeMetadata)
    : null;

  // Sync dialog open state
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (isOpen) {
      if (!dialog.open) dialog.showModal();
    } else {
      if (dialog.open) dialog.close();
    }
  }, [isOpen]);

  // Fetch objects when modal opens
  const fetchObjects = useCallback(async () => {
    if (!metadata?.sourceId || !metadata?.targetId) return;

    setLoading(true);
    setError(null);

    try {
      const [source, target] = await Promise.all([
        fetchJson<GraphObject>(
          `${apiBase}/api/graph/objects/${metadata.sourceId}`
        ),
        fetchJson<GraphObject>(
          `${apiBase}/api/graph/objects/${metadata.targetId}`
        ),
      ]);
      setSourceObject(source);
      setTargetObject(target);
    } catch (err) {
      console.error('Failed to fetch objects for comparison:', err);
      setError('Failed to load objects for comparison');
    } finally {
      setLoading(false);
    }
  }, [metadata?.sourceId, metadata?.targetId, fetchJson, apiBase]);

  useEffect(() => {
    if (isOpen && metadata) {
      fetchObjects();
    } else {
      // Reset state when modal closes
      setSourceObject(null);
      setTargetObject(null);
      setError(null);
    }
  }, [isOpen, metadata, fetchObjects]);

  // Compare properties between source and target
  const compareProperties = useCallback((): PropertyComparison[] => {
    if (!sourceObject || !targetObject) return [];

    const allKeys = new Set<string>();
    const sourceProps = sourceObject.properties || {};
    const targetProps = targetObject.properties || {};

    // Collect all property keys (excluding internal ones)
    Object.keys(sourceProps).forEach((key) => {
      if (!key.startsWith('_')) allKeys.add(key);
    });
    Object.keys(targetProps).forEach((key) => {
      if (!key.startsWith('_')) allKeys.add(key);
    });

    const comparisons: PropertyComparison[] = [];

    Array.from(allKeys)
      .sort()
      .forEach((key) => {
        const sourceValue = sourceProps[key];
        const targetValue = targetProps[key];
        const sourceHas = key in sourceProps;
        const targetHas = key in targetProps;

        let diff: PropertyDiff = 'same';
        if (!sourceHas) {
          diff = 'only-target';
        } else if (!targetHas) {
          diff = 'only-source';
        } else if (
          JSON.stringify(sourceValue) !== JSON.stringify(targetValue)
        ) {
          diff = 'different';
        }

        comparisons.push({
          key,
          sourceValue,
          targetValue,
          diff,
        });
      });

    // Sort: properties with differences first, then by key
    comparisons.sort((a, b) => {
      const aHasDiff = a.diff !== 'same';
      const bHasDiff = b.diff !== 'same';
      if (aHasDiff !== bHasDiff) return aHasDiff ? -1 : 1;
      return a.key.localeCompare(b.key);
    });

    return comparisons;
  }, [sourceObject, targetObject]);

  const propertyComparisons = compareProperties();

  // Format property value for display
  const formatValue = (value: unknown): string => {
    if (value === null || value === undefined) return '—';
    if (typeof value === 'boolean') return value ? 'Yes' : 'No';
    if (typeof value === 'object') return JSON.stringify(value, null, 2);
    if (typeof value === 'number') return value.toString();
    return String(value);
  };

  // Format property name
  const formatPropertyName = (key: string): string => {
    return key
      .split('_')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  // Get diff styling for source/target columns
  const getDiffStyles = (
    diff: PropertyDiff,
    side: 'source' | 'target'
  ): string => {
    switch (diff) {
      case 'different':
        return 'bg-warning/10 border-warning/30';
      case 'only-source':
        return side === 'source'
          ? 'bg-info/10 border-info/30'
          : 'bg-base-200/50 border-base-300 opacity-50';
      case 'only-target':
        return side === 'target'
          ? 'bg-info/10 border-info/30'
          : 'bg-base-200/50 border-base-300 opacity-50';
      default:
        return 'bg-base-200/30 border-base-300';
    }
  };

  const isPending = task?.status === 'pending';

  if (!task) return null;

  return (
    <dialog ref={dialogRef} className="modal" onClose={onClose}>
      <div className="modal-box max-w-[95vw] w-[95vw] h-[90vh] max-h-[90vh] p-0 flex flex-col">
        {/* Header */}
        <div className="flex justify-between items-start p-6 pb-4 shrink-0 border-b border-base-300">
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 rounded-lg bg-warning/10 text-warning">
                <Icon icon="lucide--git-merge" className="w-5 h-5" />
              </div>
              <h3 className="font-bold text-xl">Merge Suggestion Review</h3>
            </div>
            <p className="text-sm text-base-content/70">{task.title}</p>
            {task.description && (
              <p className="text-sm text-base-content/60 mt-1">
                {task.description}
              </p>
            )}
          </div>

          {/* Similarity badge */}
          {metadata?.similarityPercent && (
            <div className="flex flex-col items-center mr-4">
              <div
                className="radial-progress text-success"
                style={
                  {
                    '--value': metadata.similarityPercent,
                    '--size': '4rem',
                    '--thickness': '4px',
                  } as React.CSSProperties
                }
              >
                <span className="text-sm font-bold">
                  {metadata.similarityPercent}%
                </span>
              </div>
              <span className="text-xs text-base-content/60 mt-1">
                Similarity
              </span>
            </div>
          )}

          {/* Close button */}
          <button
            onClick={onClose}
            className="btn btn-sm btn-circle btn-ghost"
            aria-label="Close"
          >
            <Icon icon="lucide--x" className="size-4" />
          </button>
        </div>

        {/* Content - Three Equal Column Layout */}
        <div className="flex-1 overflow-hidden grid grid-cols-3 min-h-0">
          {/* Column 1 - Source Object */}
          <div className="flex flex-col border-r border-base-300 min-w-0 overflow-hidden">
            {loading ? (
              <div className="flex-1 flex items-center justify-center">
                <Spinner size="lg" />
              </div>
            ) : error ? (
              <div className="flex-1 flex items-center justify-center">
                <div className="alert alert-error max-w-md">
                  <Icon icon="lucide--alert-circle" className="size-5" />
                  <span>{error}</span>
                </div>
              </div>
            ) : (
              <>
                {/* Source header */}
                <div className="px-4 py-3 bg-base-200/50 border-b border-base-300 shrink-0">
                  <div className="flex items-center gap-2">
                    <span className="badge badge-primary badge-lg">Source</span>
                    <span className="font-semibold truncate">
                      {metadata?.sourceKey || sourceObject?.key || 'Unknown'}
                    </span>
                  </div>
                  <span className="badge badge-ghost badge-sm mt-1">
                    {metadata?.sourceType || sourceObject?.type}
                  </span>
                </div>

                {/* Source properties */}
                <div className="flex-1 overflow-y-auto px-4 py-4">
                  {propertyComparisons.length === 0 ? (
                    <div className="text-center py-8 text-base-content/60">
                      <Icon
                        icon="lucide--file-question"
                        className="size-12 mx-auto mb-2 opacity-50"
                      />
                      <p>No properties</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {propertyComparisons.map((prop) => (
                        <div
                          key={prop.key}
                          className={`p-3 rounded border ${getDiffStyles(
                            prop.diff,
                            'source'
                          )}`}
                        >
                          <div className="text-xs font-medium text-base-content/70 mb-1">
                            {formatPropertyName(prop.key)}
                            {prop.diff === 'only-source' && (
                              <span className="badge badge-info badge-xs ml-2">
                                Only here
                              </span>
                            )}
                            {prop.diff === 'different' && (
                              <span className="badge badge-warning badge-xs ml-2">
                                Different
                              </span>
                            )}
                          </div>
                          <div className="text-sm break-words whitespace-pre-wrap">
                            {prop.diff === 'only-target' ? (
                              <span className="italic text-base-content/40">
                                Not present
                              </span>
                            ) : (
                              formatValue(prop.sourceValue)
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Legend - Source column */}
                <div className="px-4 py-2 border-t border-base-300 bg-base-200/30">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-base-content/60">
                    <div className="flex items-center gap-1">
                      <div className="w-2 h-2 rounded bg-warning/30 border border-warning/50"></div>
                      <span>Different</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <div className="w-2 h-2 rounded bg-info/30 border border-info/50"></div>
                      <span>Unique</span>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Column 2 - Target Object */}
          <div className="flex flex-col border-r border-base-300 min-w-0 overflow-hidden">
            {loading ? (
              <div className="flex-1 flex items-center justify-center">
                <Spinner size="lg" />
              </div>
            ) : error ? (
              <div className="flex-1 flex items-center justify-center">
                <div className="alert alert-error max-w-md">
                  <Icon icon="lucide--alert-circle" className="size-5" />
                  <span>{error}</span>
                </div>
              </div>
            ) : (
              <>
                {/* Target header */}
                <div className="px-4 py-3 bg-base-200/50 border-b border-base-300 shrink-0">
                  <div className="flex items-center gap-2">
                    <span className="badge badge-secondary badge-lg">
                      Target
                    </span>
                    <span className="font-semibold truncate">
                      {metadata?.targetKey || targetObject?.key || 'Unknown'}
                    </span>
                  </div>
                  <span className="badge badge-ghost badge-sm mt-1">
                    {metadata?.targetType || targetObject?.type}
                  </span>
                </div>

                {/* Target properties */}
                <div className="flex-1 overflow-y-auto px-4 py-4">
                  {propertyComparisons.length === 0 ? (
                    <div className="text-center py-8 text-base-content/60">
                      <Icon
                        icon="lucide--file-question"
                        className="size-12 mx-auto mb-2 opacity-50"
                      />
                      <p>No properties</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {propertyComparisons.map((prop) => (
                        <div
                          key={prop.key}
                          className={`p-3 rounded border ${getDiffStyles(
                            prop.diff,
                            'target'
                          )}`}
                        >
                          <div className="text-xs font-medium text-base-content/70 mb-1">
                            {formatPropertyName(prop.key)}
                            {prop.diff === 'only-target' && (
                              <span className="badge badge-info badge-xs ml-2">
                                Only here
                              </span>
                            )}
                            {prop.diff === 'different' && (
                              <span className="badge badge-warning badge-xs ml-2">
                                Different
                              </span>
                            )}
                          </div>
                          <div className="text-sm break-words whitespace-pre-wrap">
                            {prop.diff === 'only-source' ? (
                              <span className="italic text-base-content/40">
                                Not present
                              </span>
                            ) : (
                              formatValue(prop.targetValue)
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Legend - Target column */}
                <div className="px-4 py-2 border-t border-base-300 bg-base-200/30">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-base-content/60">
                    <div className="flex items-center gap-1">
                      <div className="w-2 h-2 rounded bg-warning/30 border border-warning/50"></div>
                      <span>Different</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <div className="w-2 h-2 rounded bg-info/30 border border-info/50"></div>
                      <span>Unique</span>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Column 3 - Chat */}
          <div className="flex flex-col min-w-0 overflow-hidden">
            {metadata?.sourceId && metadata?.targetId && task?.id && (
              <MergeChat
                taskId={task.id}
                sourceObjectId={metadata.sourceId}
                targetObjectId={metadata.targetId}
                sourceObjectName={
                  metadata.sourceKey || sourceObject?.key || 'Source'
                }
                targetObjectName={
                  metadata.targetKey || targetObject?.key || 'Target'
                }
              />
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-base-300 p-6 pt-4 shrink-0">
          <div className="flex justify-end items-center">
            {/* Actions */}
            <div className="flex gap-2">
              <Button color="ghost" onClick={onClose}>
                Cancel
              </Button>
              {isPending && (
                <>
                  <Button
                    variant="outline"
                    onClick={() => task && onReject?.(task.id)}
                  >
                    <Icon icon="lucide--x" className="size-4 mr-1" />
                    Reject Merge
                  </Button>
                  <Button
                    color="success"
                    onClick={() => task && onAccept?.(task.id)}
                  >
                    <Icon icon="lucide--check" className="size-4 mr-1" />
                    Accept Merge
                  </Button>
                </>
              )}
              {!isPending && (
                <div className="flex items-center gap-2">
                  <span
                    className={`badge ${
                      task.status === 'accepted'
                        ? 'badge-success'
                        : task.status === 'rejected'
                        ? 'badge-error'
                        : 'badge-ghost'
                    }`}
                  >
                    {task.status === 'accepted'
                      ? 'Accepted'
                      : task.status === 'rejected'
                      ? 'Rejected'
                      : task.status}
                  </span>
                  {task.resolvedByName && (
                    <span className="text-sm text-base-content/60">
                      by {task.resolvedByName}
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
      <form method="dialog" className="modal-backdrop" onClick={onClose}>
        <button type="button">close</button>
      </form>
    </dialog>
  );
};

export default MergeComparisonModal;
