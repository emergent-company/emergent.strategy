import { Icon } from '@/components/atoms/Icon';
import { GraphObject } from '../ObjectBrowser/ObjectBrowser';

export interface ObjectDetailModalProps {
    /** The object to display */
    object: GraphObject | null;
    /** Whether the modal is open */
    isOpen: boolean;
    /** Called when the modal should close */
    onClose: () => void;
    /** Called when delete is requested */
    onDelete?: (objectId: string) => void;
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
}) => {
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
                            {object.source && (
                                <span className="badge-outline badge badge-ghost">
                                    <Icon icon="lucide--file-text" className="mr-1 size-3" />
                                    {object.source}
                                </span>
                            )}
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

                            {/* Source Document Link */}
                            {typeof extractionMetadata._extraction_source_id === 'string' && (
                                <div className="flex justify-between items-center">
                                    <span className="font-medium text-sm">Source Document</span>
                                    <a
                                        href={`/admin/documents?id=${extractionMetadata._extraction_source_id}`}
                                        className="gap-1 btn btn-sm btn-ghost"
                                        onClick={(e) => e.stopPropagation()}
                                    >
                                        <Icon icon="lucide--external-link" className="size-3" />
                                        View Document
                                    </a>
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

                {/* Actions */}
                <div className="flex flex-wrap justify-end gap-2 modal-action">
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
