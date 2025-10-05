/**
 * Extraction Job List Component
 * 
 * Displays a paginated list of extraction jobs with loading and empty states
 */

import { ExtractionJobCard, type ExtractionJobCardProps } from '../ExtractionJobCard';
import { Icon } from '@/components/atoms/Icon';

export interface ExtractionJobListProps {
    /** List of extraction jobs */
    jobs: ExtractionJobCardProps[];
    /** Loading state */
    isLoading: boolean;
    /** Current page (1-indexed) */
    currentPage: number;
    /** Total number of pages */
    totalPages: number;
    /** Total number of jobs */
    totalCount: number;
    /** Page change handler */
    onPageChange: (page: number) => void;
    /** Job click handler */
    onJobClick?: (jobId: string) => void;
}

export function ExtractionJobList({
    jobs,
    isLoading,
    currentPage,
    totalPages,
    totalCount,
    onPageChange,
    onJobClick,
}: ExtractionJobListProps) {
    // Loading state: Show skeleton cards
    if (isLoading) {
        return (
            <div className="space-y-4">
                {Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="card-border card">
                        <div className="card-body">
                            <div className="flex justify-between items-start mb-4">
                                <div className="w-20 h-6 skeleton" />
                                <div className="w-32 h-4 skeleton" />
                            </div>
                            <div className="mb-3 w-3/4 h-4 skeleton" />
                            <div className="mb-3 w-full h-2 skeleton" />
                            <div className="gap-3 grid grid-cols-2">
                                <div className="w-full h-16 skeleton" />
                                <div className="w-full h-16 skeleton" />
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        );
    }

    // Empty state: No jobs found
    if (jobs.length === 0) {
        return (
            <div className="card-border card">
                <div className="py-12 text-center card-body">
                    <div className="flex justify-center mb-4">
                        <Icon icon="lucide--inbox" className="text-base-content/40 text-6xl" />
                    </div>
                    <h3 className="mb-2 font-semibold text-xl">No extraction jobs found</h3>
                    <p className="text-base-content/60">
                        Try adjusting your filters or create a new extraction job.
                    </p>
                </div>
            </div>
        );
    }

    // Main list view
    return (
        <div className="space-y-6">
            {/* Results summary */}
            <div className="text-sm text-base-content/60">
                Showing {(currentPage - 1) * jobs.length + 1}–
                {Math.min(currentPage * jobs.length, totalCount)} of {totalCount} jobs
            </div>

            {/* Job cards */}
            <div className="space-y-4">
                {jobs.map((job) => (
                    <ExtractionJobCard
                        key={job.id}
                        {...job}
                        onClick={onJobClick ? () => onJobClick(job.id) : undefined}
                    />
                ))}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
                <div className="flex justify-center items-center gap-2 mt-6">
                    {/* Previous button */}
                    <button
                        className="btn btn-sm btn-ghost"
                        disabled={currentPage === 1}
                        onClick={() => onPageChange(currentPage - 1)}
                        aria-label="Previous page"
                    >
                        <Icon icon="lucide--chevron-left" />
                    </button>

                    {/* Page numbers */}
                    <div className="join">
                        {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                            // Show first, last, current, and nearby pages
                            let pageNum: number;
                            if (totalPages <= 7) {
                                pageNum = i + 1;
                            } else if (currentPage <= 4) {
                                pageNum = i + 1;
                            } else if (currentPage >= totalPages - 3) {
                                pageNum = totalPages - 6 + i;
                            } else {
                                pageNum = currentPage - 3 + i;
                            }

                            return (
                                <button
                                    key={pageNum}
                                    className={`join-item btn btn-sm ${pageNum === currentPage ? 'btn-primary' : 'btn-ghost'
                                        }`}
                                    onClick={() => onPageChange(pageNum)}
                                    aria-label={`Page ${pageNum}`}
                                    aria-current={pageNum === currentPage ? 'page' : undefined}
                                >
                                    {pageNum}
                                </button>
                            );
                        })}
                    </div>

                    {/* Next button */}
                    <button
                        className="btn btn-sm btn-ghost"
                        disabled={currentPage === totalPages}
                        onClick={() => onPageChange(currentPage + 1)}
                        aria-label="Next page"
                    >
                        <Icon icon="lucide--chevron-right" />
                    </button>
                </div>
            )}
        </div>
    );
}
