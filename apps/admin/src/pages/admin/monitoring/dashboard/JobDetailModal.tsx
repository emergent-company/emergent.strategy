import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { useApi } from '@/hooks/use-api';
import { useConfig } from '@/contexts/config';
import { createMonitoringClient } from '@/api/monitoring';
import { JobDetailsView } from '@/components/organisms/JobDetailsView';
import type { ExtractionJobDetail } from '@/api/monitoring';

interface JobDetailModalProps {
    jobId: string;
    isOpen: boolean;
    onClose: () => void;
}

export const JobDetailModal: React.FC<JobDetailModalProps> = ({ jobId, isOpen, onClose }) => {
    const { apiBase, fetchJson } = useApi();
    const { config } = useConfig();
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [jobDetail, setJobDetail] = useState<ExtractionJobDetail | null>(null);

    const monitoringClient = useMemo(() => createMonitoringClient(
        apiBase,
        fetchJson,
        config.activeProjectId,
        config.activeOrgId
    ), [apiBase, fetchJson, config.activeProjectId, config.activeOrgId]);

    const loadJobDetail = useCallback(async () => {
        try {
            setLoading(true);
            setError(null);
            const detail = await monitoringClient.getExtractionJobDetail(jobId);
            setJobDetail(detail);
        } catch (err: any) {
            setError(err.message || 'Failed to load job details');
        } finally {
            setLoading(false);
        }
    }, [jobId, monitoringClient]);

    useEffect(() => {
        if (isOpen && jobId) {
            loadJobDetail();
        }
    }, [isOpen, jobId, loadJobDetail]);

    if (!isOpen) return null;

    return (
        <>
            {loading ? (
                <div className="z-50 fixed inset-0 flex justify-center items-center bg-base-100">
                    <span className="text-primary loading loading-spinner loading-lg"></span>
                </div>
            ) : error ? (
                <div className="z-50 fixed inset-0 flex justify-center items-center bg-base-100 p-6">
                    <div className="max-w-md">
                        <div className="alert alert-error">
                            <span className="iconify lucide--alert-circle"></span>
                            <span>{error}</span>
                        </div>
                        <button onClick={onClose} className="mt-4 w-full btn btn-ghost">
                            Close
                        </button>
                    </div>
                </div>
            ) : jobDetail ? (
                <JobDetailsView
                    job={jobDetail}
                    logs={jobDetail.logs}
                    llmCalls={jobDetail.llm_calls}
                    onClose={onClose}
                    onRefresh={loadJobDetail}
                />
            ) : null}
        </>
    );
};

