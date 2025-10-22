import { useState, useEffect, useCallback, type ReactElement } from 'react';
import { Icon } from '@/components/atoms/Icon';
import { GraphObject } from '../ObjectBrowser/ObjectBrowser';
import { useApi } from '@/hooks/use-api';
import type { ObjectVersion, ObjectHistoryResponse } from '@/types/object-version';

export interface ObjectDetailModalProps {
    /** The object to display */
    object: GraphObject | null;
    /** Whether the modal is open */
    isOpen: boolean;
    /** Called when the modal should close */
    onClose: () => void;
    /** Called when delete is requested */
    onDelete?: (objectId: string) => void;
    /** Called when accept is requested */
    onAccept?: (objectId: string) => void;
}

/**
 * Modal that displays full details of a graph object, including all properties
 * and extraction metadata.
 */
export const ObjectDetailModal: React.FC<ObjectDetailModalProps> = ({
    object,
    isOpen,
    onClose,
    onDelete,
    onAccept,
}) => {
    const { fetchJson } = useApi();
    const [versions, setVersions] = useState<ObjectVersion[]>([]);
    const [loadingVersions, setLoadingVersions] = useState(false);
    const [versionsError, setVersionsError] = useState<string | null>(null);

    const loadVersionHistory = useCallback(async () => {
        if (!object) return;

        setLoadingVersions(true);
        setVersionsError(null);
        try {
            const data = await fetchJson<ObjectHistoryResponse>(
                `/api/graph/objects/${object.id}/history?limit=50`
            );
            setVersions(data.items || []);
        } catch (error) {
            console.error('Failed to load version history:', error);
            setVersionsError('Failed to load version history');
        } finally {
            setLoadingVersions(false);
        }
    }, [object, fetchJson]);

    // Load version history when modal opens
    useEffect(() => {
        if (isOpen && object) {
            loadVersionHistory();
        } else {
            // Reset when modal closes
            setVersions([]);
            setVersionsError(null);
        }
    }, [isOpen, object, loadVersionHistory]);

    if (!object || !isOpen) return null;

    // Separate extraction metadata from regular properties
    const extractionMetadata: Record<string, unknown> = {};
    const regularProperties: Record<string, unknown> = {};

    if (object.properties) {
        Object.entries(object.properties).forEach(([key, value]) => {
            if (key.startsWith('_extraction_')) {
                extractionMetadata[key] = value;
            } else {
                regularProperties[key] = value;
            }
        });
    }

    const hasExtractionMetadata = Object.keys(extractionMetadata).length > 0;

    const formatValue = (value: unknown): string => {
        if (value === null || value === undefined) return '—';
        if (typeof value === 'boolean') return value ? 'Yes' : 'No';
        if (typeof value === 'object') return JSON.stringify(value, null, 2);
        if (typeof value === 'number') return value.toString();
        return String(value);
    };

    const formatPropertyName = (key: string): string => {
        // Remove _extraction_ prefix
        const cleanKey = key.replace('_extraction_', '');
        // Convert snake_case to Title Case
        return cleanKey
            .split('_')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' ');
    };

    const getConfidenceColor = (confidence: number): string => {
        if (confidence >= 0.8) return 'text-success';
        if (confidence >= 0.6) return 'text-warning';
        return 'text-error';
    };

    return (
        <dialog open={isOpen} className="modal modal-open">
            <div className="max-w-4xl modal-box">
                {/* Header */}
                <div className="flex justify-between items-start mb-6">
                    <div className="flex-1">
                        <h3 className="mb-2 font-bold text-2xl">{object.name}</h3>
                        <div className="flex flex-wrap items-center gap-2">
                            <span className="badge badge-primary badge-lg">
                                {object.type}
                            </span>
                            {object.relationship_count !== undefined && (
                                <span className="badge-outline badge badge-ghost">
                                    <Icon icon="lucide--git-branch" className="mr-1 size-3" />
                                    {object.relationship_count} relationships
                                </span>
                            )}
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="btn btn-sm btn-circle btn-ghost"
                        aria-label="Close"
                    >
                        <Icon icon="lucide--x" className="size-4" />
                    </button>
                </div>

                {/* Extraction Metadata Section */}
                {hasExtractionMetadata && (
                    <div className="mb-6">
                        <h4 className="flex items-center gap-2 mb-3 font-semibold text-lg">
                            <Icon icon="lucide--sparkles" className="size-5 text-primary" />
                            Extraction Metadata
                        </h4>
                        <div className="space-y-3 bg-base-200/50 p-4 border border-base-300 rounded-lg">
                            {/* Confidence Score - Highlighted */}
                            {typeof extractionMetadata._extraction_confidence === 'number' && (
                                <div className="flex justify-between items-center bg-base-100 p-3 rounded">
                                    <span className="font-medium text-sm">Confidence Score</span>
                                    <div className="flex items-center gap-2">
                                        <span className={`font-bold text-lg ${getConfidenceColor(
                                            extractionMetadata._extraction_confidence
                                        )}`}>
                                            {(extractionMetadata._extraction_confidence * 100).toFixed(1)}%
                                        </span>
                                        <div className="w-24">
                                            <progress
                                                className={`progress ${extractionMetadata._extraction_confidence >= 0.8
                                                    ? 'progress-success'
                                                    : extractionMetadata._extraction_confidence >= 0.6
                                                        ? 'progress-warning'
                                                        : 'progress-error'
                                                    }`}
                                                value={extractionMetadata._extraction_confidence * 100}
                                                max="100"
                                            />
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Source Documents */}
                            {(typeof extractionMetadata._extraction_source_id === 'string' ||
                                Array.isArray(extractionMetadata._extraction_source_ids)) && (
                                    <div className="flex justify-between items-start">
                                        <span className="font-medium text-sm">Sources</span>
                                        <div className="flex flex-wrap justify-end gap-1">
                                            {/* Handle single source (legacy) */}
                                            {typeof extractionMetadata._extraction_source_id === 'string' && (
                                                <a
                                                    href={`/admin/apps/documents`}
                                                    className="gap-1 btn btn-sm badge badge-primary"
                                                    onClick={(e) => e.stopPropagation()}
                                                    title="View source document"
                                                >
                                                    <Icon icon="lucide--file-text" className="size-3" />
                                                    Document
                                                </a>
                                            )}
                                            {/* Handle multiple sources */}
                                            {Array.isArray(extractionMetadata._extraction_source_ids) &&
                                                extractionMetadata._extraction_source_ids.map((sourceId, idx) => (
                                                    <a
                                                        key={sourceId as string}
                                                        href={`/admin/apps/documents`}
                                                        className="gap-1 btn btn-sm badge badge-primary"
                                                        onClick={(e) => e.stopPropagation()}
                                                        title={`Source ${idx + 1}`}
                                                    >
                                                        <Icon icon="lucide--file-text" className="size-3" />
                                                        Doc {idx + 1}
                                                    </a>
                                                ))}
                                        </div>
                                    </div>
                                )}

                            {/* Extraction Job Link */}
                            {typeof extractionMetadata._extraction_job_id === 'string' && (
                                <div className="flex justify-between items-center">
                                    <span className="font-medium text-sm">Extraction Job</span>
                                    <a
                                        href={`/admin/extraction-jobs/${extractionMetadata._extraction_job_id}`}
                                        className="gap-1 btn btn-sm btn-ghost"
                                        onClick={(e) => e.stopPropagation()}
                                    >
                                        <Icon icon="lucide--zap" className="size-3" />
                                        View Job
                                    </a>
                                </div>
                            )}

                            {/* Other Extraction Metadata */}
                            {Object.entries(extractionMetadata)
                                .filter(([key]) =>
                                    !key.includes('confidence') &&
                                    !key.includes('source_id') &&
                                    !key.includes('source_ids') &&
                                    !key.includes('job_id')
                                )
                                .map(([key, value]) => (
                                    <div key={key} className="flex justify-between items-start">
                                        <span className="font-medium text-sm">
                                            {formatPropertyName(key)}
                                        </span>
                                        <span className="max-w-xs text-sm text-base-content/70 text-right truncate">
                                            {formatValue(value)}
                                        </span>
                                    </div>
                                ))}
                        </div>
                    </div>
                )}

                {/* Regular Properties Section */}
                {Object.keys(regularProperties).length > 0 && (
                    <div className="mb-6">
                        <h4 className="flex items-center gap-2 mb-3 font-semibold text-lg">
                            <Icon icon="lucide--list" className="size-5" />
                            Properties
                        </h4>
                        <div className="space-y-2">
                            {Object.entries(regularProperties).map(([key, value]) => (
                                <div
                                    key={key}
                                    className="flex sm:flex-row flex-col sm:items-start gap-2 bg-base-200/30 p-3 border border-base-300 rounded"
                                >
                                    <span className="sm:min-w-40 font-medium text-sm text-base-content/80">
                                        {formatPropertyName(key)}
                                    </span>
                                    <span className="flex-1 text-sm text-base-content/70 break-words">
                                        {Array.isArray(value) ? (
                                            <div className="flex flex-wrap gap-1">
                                                {value.map((item, idx) => (
                                                    <span key={idx} className="badge badge-sm badge-ghost">
                                                        {String(item)}
                                                    </span>
                                                ))}
                                            </div>
                                        ) : typeof value === 'object' ? (
                                            <pre className="bg-base-100 p-2 rounded overflow-x-auto text-xs">
                                                {JSON.stringify(value, null, 2)}
                                            </pre>
                                        ) : (
                                            <span>{formatValue(value)}</span>
                                        )}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* System Metadata */}
                <div className="mb-6">
                    <h4 className="flex items-center gap-2 mb-3 font-semibold text-lg">
                        <Icon icon="lucide--info" className="size-5" />
                        System Information
                    </h4>
                    <div className="space-y-2">
                        <div className="flex justify-between items-center text-sm">
                            <span className="text-base-content/70">Object ID</span>
                            <code className="bg-base-200 px-2 py-1 rounded text-xs">
                                {object.id}
                            </code>
                        </div>
                        <div className="flex justify-between items-center text-sm">
                            <span className="text-base-content/70">Last Updated</span>
                            <span className="text-base-content">
                                {new Date(object.updated_at).toLocaleString()}
                            </span>
                        </div>
                    </div>
                </div>

                {/* Embedding Status Section */}
                <div className="mb-6">
                    <h4 className="flex items-center gap-2 mb-3 font-semibold text-lg">
                        <Icon icon="lucide--brain" className="size-5" />
                        Embedding Status
                    </h4>
                    <div className="space-y-3 bg-base-200/50 p-4 border border-base-300 rounded-lg">
                        <div className="flex justify-between items-center">
                            <span className="font-medium text-sm">Status</span>
                            {object.embedding ? (
                                <span className="gap-2 badge badge-success">
                                    <Icon icon="lucide--check-circle" className="size-3" />
                                    Embedded
                                </span>
                            ) : (
                                <span className="gap-2 badge badge-ghost">
                                    <Icon icon="lucide--circle" className="size-3" />
                                    No Embedding
                                </span>
                            )}
                        </div>
                        {object.embedding_updated_at && (
                            <div className="flex justify-between items-center text-sm">
                                <span className="text-base-content/70">Generated At</span>
                                <span className="text-base-content">
                                    {new Date(object.embedding_updated_at).toLocaleString()}
                                </span>
                            </div>
                        )}
                        {!object.embedding && (
                            <div className="text-sm text-base-content/60 italic">
                                This object has not been embedded yet. Embeddings are generated automatically for semantic search.
                            </div>
                        )}
                    </div>
                </div>

                {/* Version History */}
                <div className="mb-6">
                    <h4 className="flex items-center gap-2 mb-3 font-semibold text-lg">
                        <Icon icon="lucide--history" className="size-5" />
                        Version History
                    </h4>

                    {loadingVersions ? (
                        <div className="flex justify-center p-4">
                            <span className="loading loading-spinner loading-md"></span>
                        </div>
                    ) : versionsError ? (
                        <div className="alert alert-error">
                            <Icon icon="lucide--alert-circle" />
                            <span>{versionsError}</span>
                        </div>
                    ) : versions.length > 1 ? (
                        <div className="space-y-3">
                            {versions.map((version, idx): ReactElement => (
                                <div
                                    key={version.id}
                                    className={`flex gap-3 p-3 rounded border ${idx === 0 ? 'bg-primary/5 border-primary' : 'bg-base-200 border-base-300'
                                        }`}
                                >
                                    {/* Version Indicator */}
                                    <div className="flex flex-col items-center pt-1">
                                        <div className={`size-3 rounded-full ${idx === 0 ? 'bg-primary' : 'bg-base-300'
                                            }`} />
                                        {idx < versions.length - 1 && (
                                            <div className="flex-1 bg-base-300 mt-1 w-px" />
                                        )}
                                    </div>

                                    {/* Content */}
                                    <div className="flex-1 min-w-0">
                                        <div className="flex justify-between items-start mb-1">
                                            <div className="flex flex-wrap items-center gap-2">
                                                <span className="font-semibold">
                                                    Version {version.version}
                                                </span>
                                                {idx === 0 && (
                                                    <span className="badge badge-primary badge-sm">
                                                        Current
                                                    </span>
                                                )}
                                                {version.version === 1 && (
                                                    <span className="badge badge-ghost badge-sm">
                                                        Initial
                                                    </span>
                                                )}
                                                {version.deleted_at && (
                                                    <span className="badge badge-error badge-sm">
                                                        Deleted
                                                    </span>
                                                )}
                                            </div>
                                        </div>

                                        <div className="mb-2 text-xs text-base-content/70">
                                            {new Date(version.created_at).toLocaleString()}
                                        </div>

                                        {/* Change Summary */}
                                        {(() => {
                                            const summary = version.change_summary;
                                            if (!summary) return null;

                                            const hasChanges =
                                                (Array.isArray(summary.added) && summary.added.length > 0) ||
                                                (Array.isArray(summary.modified) && summary.modified.length > 0) ||
                                                (Array.isArray(summary.removed) && summary.removed.length > 0) ||
                                                summary.reason;

                                            if (!hasChanges) return null;

                                            return (
                                                <div className="space-y-1 mt-2">
                                                    {Array.isArray(summary.added) && summary.added.length > 0 && (
                                                        <div className="flex flex-wrap gap-1 text-xs">
                                                            <span className="font-medium text-success">Added:</span>
                                                            {summary.added.map((field, i) => (
                                                                <span key={i} className="gap-1 badge badge-success badge-sm">
                                                                    <Icon icon="lucide--plus" className="size-2" />
                                                                    {String(field)}
                                                                </span>
                                                            ))}
                                                        </div>
                                                    )}
                                                    {Array.isArray(summary.modified) && summary.modified.length > 0 && (
                                                        <div className="flex flex-wrap gap-1 text-xs">
                                                            <span className="font-medium text-info">Changed:</span>
                                                            {summary.modified.map((field, i) => (
                                                                <span key={i} className="gap-1 badge badge-info badge-sm">
                                                                    <Icon icon="lucide--edit-2" className="size-2" />
                                                                    {String(field)}
                                                                </span>
                                                            ))}
                                                        </div>
                                                    )}
                                                    {Array.isArray(summary.removed) && summary.removed.length > 0 && (
                                                        <div className="flex flex-wrap gap-1 text-xs">
                                                            <span className="font-medium text-error">Removed:</span>
                                                            {summary.removed.map((field, i) => (
                                                                <span key={i} className="gap-1 badge badge-error badge-sm">
                                                                    <Icon icon="lucide--minus" className="size-2" />
                                                                    {String(field)}
                                                                </span>
                                                            ))}
                                                        </div>
                                                    )}
                                                    {summary.reason && (
                                                        <p className="text-xs text-base-content/70 italic">
                                                            {String(summary.reason)}
                                                        </p>
                                                    )}
                                                </div>
                                            );
                                        })()}

                                        {/* Extraction Job Link */}
                                        {(() => {
                                            const props = version.properties;
                                            if (!props || typeof props !== 'object') return null;
                                            if (!('_extraction_job_id' in props)) return null;
                                            const jobId = props._extraction_job_id;
                                            if (!jobId) return null;

                                            return (
                                                <a
                                                    href={`/admin/extraction-jobs/${String(jobId)}`}
                                                    className="inline-flex gap-1 mt-2 btn btn-xs btn-ghost"
                                                    onClick={(e) => e.stopPropagation()}
                                                >
                                                    <Icon icon="lucide--zap" className="size-2" />
                                                    From Extraction
                                                </a>
                                            );
                                        })()}
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : versions.length === 1 ? (
                        <p className="text-sm text-base-content/70">
                            This is the initial version (no history yet)
                        </p>
                    ) : (
                        <p className="text-sm text-base-content/70">
                            No version history available
                        </p>
                    )}
                </div>

                {/* Actions */}
                <div className="flex flex-wrap justify-end gap-2 modal-action">
                    {onAccept && object && object.status !== 'accepted' && (
                        <button
                            className="gap-2 btn btn-success btn-sm"
                            onClick={() => {
                                onAccept(object.id);
                            }}
                        >
                            <Icon icon="lucide--check-circle" className="size-4" />
                            Accept
                        </button>
                    )}
                    <button className="gap-2 btn btn-ghost btn-sm" disabled>
                        <Icon icon="lucide--edit" className="size-4" />
                        Edit
                    </button>
                    <button className="gap-2 btn btn-ghost btn-sm" disabled>
                        <Icon icon="lucide--git-branch" className="size-4" />
                        View Graph
                    </button>
                    {onDelete && object && (
                        <button
                            className="gap-2 btn-outline btn btn-error btn-sm"
                            onClick={() => {
                                onDelete(object.id);
                            }}
                        >
                            <Icon icon="lucide--trash-2" className="size-4" />
                            Delete
                        </button>
                    )}
                    <button onClick={onClose} className="btn btn-primary btn-sm">
                        Close
                    </button>
                </div>
            </div>
            <form method="dialog" className="modal-backdrop" onClick={onClose}>
                <button type="button">close</button>
            </form>
        </dialog>
    );
};

export default ObjectDetailModal;
