/**
 * Extraction Job Card Component
 * 
 * Displays a summary card for an extraction job in the list view
 */

import { Link } from 'react-router';
import { Icon } from '@/components/atoms/Icon';
import { ExtractionJobStatusBadge, type ExtractionJobStatus } from '@/components/molecules/ExtractionJobStatusBadge';

export interface ExtractionJobCardProps {
    /** Job ID */
    id: string;
    /** Job status */
    status: ExtractionJobStatus;
    /** Source document filename */
    sourceDocument?: string;
    /** Number of entities successfully extracted */
    successfulItems: number;
    /** Number of failed extractions */
    failedItems: number;
    /** Total items processed */
    processedItems: number;
    /** Total items to process */
    totalItems: number;
    /** Discovered entity types */
    discoveredTypes: string[];
    /** Job created timestamp */
    createdAt: string;
    /** Job completed timestamp */
    completedAt?: string;
    /** Error message if failed */
    errorMessage?: string;
    /** Click handler */
    onClick?: () => void;
}

export function ExtractionJobCard({
    id,
    status,
    sourceDocument,
    successfulItems,
    failedItems,
    processedItems,
    totalItems,
    discoveredTypes,
    createdAt,
    completedAt,
    errorMessage,
    onClick,
}: ExtractionJobCardProps) {
    const progress = totalItems > 0 ? (processedItems / totalItems) * 100 : 0;
    const hasError = status === 'failed' && errorMessage;

    const cardContent = (
        <div className="hover:shadow-lg card-border transition-shadow card">
            <div className="card-body">
                {/* Header: Status and Timestamp */}
                <div className="flex justify-between items-start mb-4">
                    <ExtractionJobStatusBadge status={status} />
                    <time className="text-sm text-base-content/60" dateTime={createdAt}>
                        {new Date(createdAt).toLocaleString()}
                    </time>
                </div>

                {/* Source Document */}
                {sourceDocument && (
                    <div className="flex items-center gap-2 mb-3">
                        <Icon icon="lucide--file-text" className="text-base-content/60" />
                        <span className="font-medium text-sm truncate">{sourceDocument}</span>
                    </div>
                )}

                {/* Progress Bar (for running jobs) */}
                {status === 'running' && (
                    <div className="mb-3">
                        <div className="flex justify-between mb-1 text-xs text-base-content/60">
                            <span>Progress</span>
                            <span>{Math.round(progress)}%</span>
                        </div>
                        <progress
                            className="w-full progress progress-info"
                            value={progress}
                            max="100"
                        />
                    </div>
                )}

                {/* Stats */}
                <div className="gap-3 grid grid-cols-2 mb-3">
                    <div className="bg-base-200 p-3 rounded-lg stat">
                        <div className="text-xs stat-title">Extracted</div>
                        <div className="text-success text-lg stat-value">{successfulItems}</div>
                    </div>
                    {failedItems > 0 && (
                        <div className="bg-base-200 p-3 rounded-lg stat">
                            <div className="text-xs stat-title">Failed</div>
                            <div className="text-error text-lg stat-value">{failedItems}</div>
                        </div>
                    )}
                </div>

                {/* Discovered Types */}
                {discoveredTypes.length > 0 && (
                    <div className="mb-3">
                        <div className="mb-2 text-xs text-base-content/60">Entity Types:</div>
                        <div className="flex flex-wrap gap-1">
                            {discoveredTypes.slice(0, 5).map((type) => (
                                <span key={type} className="badge-outline badge badge-sm">
                                    {type}
                                </span>
                            ))}
                            {discoveredTypes.length > 5 && (
                                <span className="badge badge-sm badge-ghost">
                                    +{discoveredTypes.length - 5} more
                                </span>
                            )}
                        </div>
                    </div>
                )}

                {/* Error Message */}
                {hasError && (
                    <div className="text-xs alert alert-error alert-soft">
                        <Icon icon="lucide--alert-circle" />
                        <span className="truncate">{errorMessage}</span>
                    </div>
                )}

                {/* Completion Info */}
                {completedAt && status === 'completed' && (
                    <div className="flex items-center gap-1 text-xs text-base-content/60">
                        <Icon icon="lucide--check" />
                        <span>
                            Completed {new Date(completedAt).toLocaleString()}
                        </span>
                    </div>
                )}

                {/* Job ID (subtle) */}
                <div className="mt-2 font-mono text-xs text-base-content/40">
                    Job #{id.slice(0, 8)}
                </div>
            </div>
        </div>
    );

    if (onClick) {
        return (
            <button onClick={onClick} className="w-full text-left">
                {cardContent}
            </button>
        );
    }

    return (
        <Link to={`/admin/extraction-jobs/${id}`} className="block">
            {cardContent}
        </Link>
    );
}
