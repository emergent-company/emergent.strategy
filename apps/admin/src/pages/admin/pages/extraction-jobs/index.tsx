/**
 * Extraction Jobs Page
 * 
 * Main page for viewing and managing extraction jobs
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { Icon } from '@/components/atoms/Icon';
import { ExtractionJobFilters } from '@/components/organisms/ExtractionJobFilters';
import { ExtractionJobList } from '@/components/organisms/ExtractionJobList';
import type { ExtractionJobCardProps } from '@/components/organisms/ExtractionJobCard';
import type { ExtractionJobStatus } from '@/components/molecules/ExtractionJobStatusBadge';
import { useApi } from '@/hooks/use-api';
import { useConfig } from '@/contexts/config';
import { createExtractionJobsClient, type ExtractionJob } from '@/api/extraction-jobs';

export interface ExtractionJobsPageProps {
    /** Initial list of jobs (for Storybook) */
    jobs?: ExtractionJobCardProps[];
    /** Loading state (for Storybook) */
    isLoading?: boolean;
    /** Total count of jobs (for Storybook) */
    totalCount?: number;
    /** Page size */
    pageSize?: number;
}

/**
 * Convert API job to card props
 */
function jobToCardProps(job: ExtractionJob): ExtractionJobCardProps {
    return {
        id: job.id,
        status: job.status,
        sourceDocument: job.source_metadata?.filename || job.source_metadata?.name || undefined,
        successfulItems: job.successful_items,
        failedItems: job.failed_items,
        processedItems: job.processed_items,
        totalItems: job.total_items,
        discoveredTypes: job.discovered_types,
        createdAt: job.created_at,
        completedAt: job.completed_at,
        errorMessage: job.error_message,
    };
}

export function ExtractionJobsPage(props: ExtractionJobsPageProps = {}) {
    const {
        jobs: storybookJobs,
        isLoading: storybookLoading,
        totalCount: storybookTotalCount,
        pageSize = 10,
    } = props;
    const navigate = useNavigate();
    const { apiBase, fetchJson } = useApi();
    const { config } = useConfig();

    // Filter state
    const [statusFilter, setStatusFilter] = useState<ExtractionJobStatus | 'all'>('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [currentPage, setCurrentPage] = useState(1);

    // Data state
    const [jobs, setJobs] = useState<ExtractionJobCardProps[]>(storybookJobs || []);
    const [isLoading, setIsLoading] = useState(storybookLoading ?? false);
    const [totalCount, setTotalCount] = useState(storybookTotalCount ?? 0);
    const [error, setError] = useState<string | null>(null);

    // Fetch jobs from API
    useEffect(() => {
        // Skip if we're in Storybook mode
        if (storybookJobs !== undefined) return;

        // Need active project
        if (!config.activeProjectId) {
            setError('No active project selected');
            setIsLoading(false);
            return;
        }

        const fetchJobs = async () => {
            setIsLoading(true);
            setError(null);

            try {
                const client = createExtractionJobsClient(
                    apiBase,
                    fetchJson,
                    config.activeProjectId
                );

                const response = await client.listJobs(undefined, {
                    status: statusFilter === 'all' ? undefined : statusFilter,
                    page: currentPage,
                    limit: pageSize,
                });

                setJobs(response.jobs.map(jobToCardProps));
                setTotalCount(response.total);
            } catch (err) {
                console.error('Failed to fetch extraction jobs:', err);
                setError(err instanceof Error ? err.message : 'Failed to load extraction jobs');
                setJobs([]);
                setTotalCount(0);
            } finally {
                setIsLoading(false);
            }
        };

        fetchJobs();
    }, [config.activeProjectId, config.activeOrgId, statusFilter, currentPage, pageSize, storybookJobs, apiBase, fetchJson]);

    // Client-side search filtering (since API doesn't support search yet)
    const filteredJobs = jobs.filter((job) => {
        if (!searchQuery) return true;
        return job.sourceDocument?.toLowerCase().includes(searchQuery.toLowerCase()) || false;
    });

    const totalPages = Math.ceil((searchQuery ? filteredJobs.length : totalCount) / pageSize);
    const displayedJobs = searchQuery ? filteredJobs : jobs;

    // Clear all filters
    const handleClearFilters = () => {
        setStatusFilter('all');
        setSearchQuery('');
        setCurrentPage(1);
    };

    // Handle filter changes (reset to page 1)
    const handleStatusFilterChange = (status: ExtractionJobStatus | 'all') => {
        setStatusFilter(status);
        setCurrentPage(1);
    };

    const handleSearchQueryChange = (query: string) => {
        setSearchQuery(query);
        setCurrentPage(1);
    };

    // Handle job click
    const handleJobClick = (jobId: string) => {
        navigate(`/admin/extraction-jobs/${jobId}`);
    };

    // Show error state
    if (error && !isLoading) {
        return (
            <div className="mx-auto p-6 max-w-6xl container">
                <h1 className="mb-6 font-bold text-3xl">Extraction Jobs</h1>
                <div className="alert alert-error">
                    <Icon icon="lucide--alert-circle" />
                    <span>{error}</span>
                </div>
            </div>
        );
    }

    return (
        <div data-testid="page-extraction-jobs" className="mx-auto p-6 max-w-6xl container">
            {/* Page Header */}
            <div className="flex sm:flex-row flex-col justify-between items-start sm:items-center gap-4 mb-6">
                <div>
                    <h1 className="mb-2 font-bold text-3xl">Extraction Jobs</h1>
                    <p className="text-base-content/60">
                        View and manage AI-powered entity extraction jobs
                    </p>
                </div>
                <button className="btn btn-primary">
                    <Icon icon="lucide--plus" />
                    New Extraction
                </button>
            </div>

            {/* Filters */}
            <div className="mb-6">
                <ExtractionJobFilters
                    statusFilter={statusFilter}
                    searchQuery={searchQuery}
                    onStatusFilterChange={handleStatusFilterChange}
                    onSearchQueryChange={handleSearchQueryChange}
                    onClearFilters={handleClearFilters}
                />
            </div>

            {/* Job List */}
            <ExtractionJobList
                jobs={displayedJobs}
                isLoading={isLoading}
                currentPage={currentPage}
                totalPages={totalPages}
                totalCount={searchQuery ? filteredJobs.length : totalCount}
                onPageChange={setCurrentPage}
                onJobClick={handleJobClick}
            />
        </div>
    );
}

export default ExtractionJobsPage;
