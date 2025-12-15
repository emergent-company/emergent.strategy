/**
 * MergeComparisonModal
 * Three-column comparison modal for merge suggestion tasks
 * Shows Source | Target | AI Suggested Merge with property diff highlighting
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { Icon } from '@/components/atoms/Icon';
import { Button } from '@/components/atoms/Button';
import { useApi } from '@/hooks/use-api';
import { createTasksClient } from '@/api/tasks';
import type {
  Task,
  MergeSuggestionResult,
  PropertyMergeSuggestion,
} from '@/types/task';

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
  /** LLM suggestion for this property (if available) */
  suggestion?: PropertyMergeSuggestion;
}

/**
 * Modal that displays three-column comparison of two objects for merge review
 * Source | Target | AI Suggested Merge
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

  // LLM suggestion state
  const [mergeSuggestion, setMergeSuggestion] =
    useState<MergeSuggestionResult | null>(null);
  const [suggestionLoading, setSuggestionLoading] = useState(false);
  const [suggestionError, setSuggestionError] = useState<string | null>(null);

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

  // Fetch LLM merge suggestion
  const fetchMergeSuggestion = useCallback(async () => {
    if (!task?.id) return;

    setSuggestionLoading(true);
    setSuggestionError(null);

    try {
      const client = createTasksClient(apiBase, fetchJson);
      const suggestion = await client.getMergeSuggestion(task.id);
      setMergeSuggestion(suggestion);
    } catch (err) {
      console.error('Failed to fetch merge suggestion:', err);
      setSuggestionError(
        err instanceof Error ? err.message : 'Failed to get AI suggestion'
      );
    } finally {
      setSuggestionLoading(false);
    }
  }, [task?.id, apiBase, fetchJson]);

  useEffect(() => {
    if (isOpen && metadata) {
      fetchObjects();
      // Also fetch the merge suggestion
      fetchMergeSuggestion();
    } else {
      // Reset state when modal closes
      setSourceObject(null);
      setTargetObject(null);
      setError(null);
      setMergeSuggestion(null);
      setSuggestionError(null);
    }
  }, [isOpen, metadata, fetchObjects, fetchMergeSuggestion]);

  // Compare properties between source and target, enriched with suggestions
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

    // Also add keys from suggestions that might be new
    if (mergeSuggestion?.propertyMergeSuggestions) {
      mergeSuggestion.propertyMergeSuggestions.forEach((s) => {
        if (!s.key.startsWith('_')) allKeys.add(s.key);
      });
    }

    // Create a map of suggestions by key for quick lookup
    const suggestionMap = new Map<string, PropertyMergeSuggestion>();
    if (mergeSuggestion?.propertyMergeSuggestions) {
      mergeSuggestion.propertyMergeSuggestions.forEach((s) => {
        suggestionMap.set(s.key, s);
      });
    }

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
          suggestion: suggestionMap.get(key),
        });
      });

    // Sort: properties with differences first, then by key
    comparisons.sort((a, b) => {
      // Properties with suggestions that have differences come first
      const aHasDiff = a.diff !== 'same';
      const bHasDiff = b.diff !== 'same';
      if (aHasDiff !== bHasDiff) return aHasDiff ? -1 : 1;
      return a.key.localeCompare(b.key);
    });

    return comparisons;
  }, [sourceObject, targetObject, mergeSuggestion]);

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

  // Get styling for suggestion column based on action
  const getSuggestionStyles = (
    suggestion?: PropertyMergeSuggestion
  ): string => {
    if (!suggestion) return 'bg-base-200/30 border-base-300';

    switch (suggestion.action) {
      case 'combine':
        return 'bg-success/10 border-success/30';
      case 'new_value':
        return 'bg-accent/10 border-accent/30';
      case 'keep_source':
        return 'bg-primary/10 border-primary/30';
      case 'keep_target':
        return 'bg-secondary/10 border-secondary/30';
      default:
        return 'bg-base-200/30 border-base-300';
    }
  };

  // Get action badge for suggestion
  const getActionBadge = (
    action: PropertyMergeSuggestion['action']
  ): React.ReactNode => {
    switch (action) {
      case 'combine':
        return <span className="badge badge-success badge-xs">Combined</span>;
      case 'new_value':
        return <span className="badge badge-accent badge-xs">New Value</span>;
      case 'keep_source':
        return (
          <span className="badge badge-primary badge-xs">From Source</span>
        );
      case 'keep_target':
        return (
          <span className="badge badge-secondary badge-xs">From Target</span>
        );
      default:
        return null;
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

          {/* AI Confidence badge */}
          {mergeSuggestion && (
            <div className="flex flex-col items-center mr-4">
              <div
                className="radial-progress text-accent"
                style={
                  {
                    '--value': Math.round(mergeSuggestion.confidence * 100),
                    '--size': '4rem',
                    '--thickness': '4px',
                  } as React.CSSProperties
                }
              >
                <span className="text-sm font-bold">
                  {Math.round(mergeSuggestion.confidence * 100)}%
                </span>
              </div>
              <span className="text-xs text-base-content/60 mt-1">
                AI Confidence
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

        {/* Content */}
        <div className="flex-1 overflow-hidden flex flex-col">
          {loading ? (
            <div className="flex-1 flex items-center justify-center">
              <span className="loading loading-spinner loading-lg" />
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
              {/* Column headers - 3 columns now */}
              <div className="grid grid-cols-3 gap-4 px-6 py-3 bg-base-200/50 border-b border-base-300 shrink-0">
                <div className="flex items-center gap-2">
                  <span className="badge badge-primary badge-lg">Source</span>
                  <span className="font-semibold truncate">
                    {metadata?.sourceKey || sourceObject?.key || 'Unknown'}
                  </span>
                  <span className="badge badge-ghost badge-sm">
                    {metadata?.sourceType || sourceObject?.type}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="badge badge-secondary badge-lg">Target</span>
                  <span className="font-semibold truncate">
                    {metadata?.targetKey || targetObject?.key || 'Unknown'}
                  </span>
                  <span className="badge badge-ghost badge-sm">
                    {metadata?.targetType || targetObject?.type}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="badge badge-accent badge-lg">
                    <Icon icon="lucide--sparkles" className="size-3 mr-1" />
                    AI Suggestion
                  </span>
                  {suggestionLoading && (
                    <span className="loading loading-spinner loading-sm" />
                  )}
                  {suggestionError && (
                    <span className="text-error text-xs">Failed to load</span>
                  )}
                </div>
              </div>

              {/* AI Overall Explanation */}
              {mergeSuggestion?.overallExplanation && (
                <div className="px-6 py-3 bg-accent/5 border-b border-accent/20">
                  <div className="flex items-start gap-2">
                    <Icon
                      icon="lucide--lightbulb"
                      className="size-4 text-accent mt-0.5 shrink-0"
                    />
                    <div className="text-sm">
                      <span className="font-medium text-accent">
                        AI Analysis:{' '}
                      </span>
                      <span className="text-base-content/80">
                        {mergeSuggestion.overallExplanation}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* Warnings */}
              {mergeSuggestion?.warnings &&
                mergeSuggestion.warnings.length > 0 && (
                  <div className="px-6 py-2 bg-warning/5 border-b border-warning/20">
                    {mergeSuggestion.warnings.map((warning, i) => (
                      <div
                        key={i}
                        className="flex items-start gap-2 text-sm text-warning"
                      >
                        <Icon
                          icon="lucide--alert-triangle"
                          className="size-4 mt-0.5 shrink-0"
                        />
                        <span>{warning}</span>
                      </div>
                    ))}
                  </div>
                )}

              {/* Property comparison - 3 columns */}
              <div className="flex-1 overflow-y-auto px-6 py-4">
                {propertyComparisons.length === 0 ? (
                  <div className="text-center py-8 text-base-content/60">
                    <Icon
                      icon="lucide--file-question"
                      className="size-12 mx-auto mb-2 opacity-50"
                    />
                    <p>No properties to compare</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {propertyComparisons.map((prop) => (
                      <div key={prop.key} className="grid grid-cols-3 gap-4">
                        {/* Source value */}
                        <div
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

                        {/* Target value */}
                        <div
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

                        {/* AI Suggested value */}
                        <div
                          className={`p-3 rounded border ${getSuggestionStyles(
                            prop.suggestion
                          )}`}
                        >
                          <div className="text-xs font-medium text-base-content/70 mb-1 flex items-center gap-2">
                            {formatPropertyName(prop.key)}
                            {prop.suggestion &&
                              getActionBadge(prop.suggestion.action)}
                          </div>
                          <div className="text-sm break-words whitespace-pre-wrap">
                            {suggestionLoading ? (
                              <span className="loading loading-dots loading-xs" />
                            ) : suggestionError ? (
                              <span className="italic text-base-content/40">
                                No suggestion
                              </span>
                            ) : prop.suggestion ? (
                              formatValue(prop.suggestion.suggestedValue)
                            ) : mergeSuggestion?.suggestedProperties?.[
                                prop.key
                              ] !== undefined ? (
                              formatValue(
                                mergeSuggestion.suggestedProperties[prop.key]
                              )
                            ) : (
                              <span className="italic text-base-content/40">
                                {prop.diff === 'same'
                                  ? 'Same as both'
                                  : 'No change suggested'}
                              </span>
                            )}
                          </div>
                          {/* Explanation tooltip */}
                          {prop.suggestion?.explanation && (
                            <div className="mt-2 text-xs text-base-content/60 italic">
                              {prop.suggestion.explanation}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-base-300 p-6 pt-4 shrink-0">
          <div className="flex justify-between items-center">
            {/* Legend */}
            <div className="flex items-center gap-4 text-xs text-base-content/60">
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 rounded bg-warning/30 border border-warning/50"></div>
                <span>Different</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 rounded bg-info/30 border border-info/50"></div>
                <span>Unique</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 rounded bg-success/30 border border-success/50"></div>
                <span>Combined</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 rounded bg-base-200/50 border border-base-300"></div>
                <span>Same</span>
              </div>
            </div>

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
