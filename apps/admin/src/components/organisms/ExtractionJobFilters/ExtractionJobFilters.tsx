/**
 * Extraction Job Filters Component
 * 
 * Provides filtering and search capabilities for extraction jobs list
 */

import type { ExtractionJobStatus } from '@/components/molecules/ExtractionJobStatusBadge';
import { Icon } from '@/components/atoms/Icon';

export interface ExtractionJobFiltersProps {
    /** Current status filter */
    statusFilter: ExtractionJobStatus | 'all';
    /** Current search query */
    searchQuery: string;
    /** Status filter change handler */
    onStatusFilterChange: (status: ExtractionJobStatus | 'all') => void;
    /** Search query change handler */
    onSearchQueryChange: (query: string) => void;
    /** Clear all filters handler */
    onClearFilters: () => void;
}

const STATUS_OPTIONS: Array<{ value: ExtractionJobStatus | 'all'; label: string }> = [
    { value: 'all', label: 'All Statuses' },
    { value: 'pending', label: 'Pending' },
    { value: 'running', label: 'Running' },
    { value: 'completed', label: 'Completed' },
    { value: 'requires_review', label: 'Needs Review' },
    { value: 'failed', label: 'Failed' },
    { value: 'cancelled', label: 'Cancelled' },
];

export function ExtractionJobFilters({
    statusFilter,
    searchQuery,
    onStatusFilterChange,
    onSearchQueryChange,
    onClearFilters,
}: ExtractionJobFiltersProps) {
    const hasActiveFilters = statusFilter !== 'all' || searchQuery.trim() !== '';

    return (
        <div className="card-border card">
            <div className="card-body">
                <div className="flex sm:flex-row flex-col gap-4">
                    {/* Search Input */}
                    <label className="flex flex-1 items-center gap-2 input input-ghost">
                        <Icon icon="lucide--search" className="text-base-content/60" />
                        <input
                            type="text"
                            className="grow"
                            placeholder="Search by source document..."
                            value={searchQuery}
                            onChange={(e) => onSearchQueryChange(e.target.value)}
                        />
                        {searchQuery && (
                            <button
                                type="button"
                                onClick={() => onSearchQueryChange('')}
                                className="btn btn-ghost btn-xs btn-circle"
                                aria-label="Clear search"
                            >
                                <Icon icon="lucide--x" />
                            </button>
                        )}
                    </label>

                    {/* Status Filter Dropdown */}
                    <label className="flex items-center gap-2 min-w-[200px]">
                        <Icon icon="lucide--filter" className="text-base-content/60" />
                        <select
                            className="w-full select-ghost select"
                            value={statusFilter}
                            onChange={(e) =>
                                onStatusFilterChange(e.target.value as ExtractionJobStatus | 'all')
                            }
                        >
                            {STATUS_OPTIONS.map(({ value, label }) => (
                                <option key={value} value={value}>
                                    {label}
                                </option>
                            ))}
                        </select>
                    </label>

                    {/* Clear Filters Button */}
                    {hasActiveFilters && (
                        <button
                            type="button"
                            onClick={onClearFilters}
                            className="btn btn-ghost btn-sm"
                            aria-label="Clear all filters"
                        >
                            <Icon icon="lucide--x-circle" />
                            Clear
                        </button>
                    )}
                </div>

                {/* Active Filters Summary */}
                {hasActiveFilters && (
                    <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-base-300">
                        <span className="text-sm text-base-content/60">Active filters:</span>
                        {statusFilter !== 'all' && (
                            <span className="badge badge-neutral badge-sm">
                                Status: {STATUS_OPTIONS.find((opt) => opt.value === statusFilter)?.label}
                            </span>
                        )}
                        {searchQuery.trim() && (
                            <span className="badge badge-neutral badge-sm">
                                Search: "{searchQuery}"
                            </span>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
