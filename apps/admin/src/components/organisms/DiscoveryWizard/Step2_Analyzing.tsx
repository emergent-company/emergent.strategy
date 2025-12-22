/**
 * Step 2: Analyzing Documents
 *
 * Shows progress and polls job status
 */

import { useState, useEffect, useRef } from 'react';
import { Icon } from '@/components/atoms/Icon';
import { Spinner } from '@/components/atoms/Spinner';
import { useApi } from '@/hooks/use-api';
import type { DiscoveryJob } from './DiscoveryWizard';

interface Step2Props {
  jobId: string;
  onComplete: (job: DiscoveryJob) => void;
  onCancel: () => void;
}

export function Step2_Analyzing({ jobId, onComplete, onCancel }: Step2Props) {
  const { apiBase, fetchJson } = useApi();
  const [job, setJob] = useState<DiscoveryJob | null>(null);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  // Poll job status
  useEffect(() => {
    const pollJob = async () => {
      try {
        const jobData = await fetchJson<DiscoveryJob>(
          `${apiBase}/api/discovery-jobs/${jobId}`
        );
        setJob(jobData);
        setError(null);

        // Check if complete
        if (jobData.status === 'completed') {
          if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
          }
          onComplete(jobData);
        } else if (jobData.status === 'failed') {
          if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
          }
          setError(jobData.error || 'Discovery failed');
        }
      } catch (err) {
        setError(
          err instanceof Error ? err.message : 'Failed to check job status'
        );
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
      }
    };

    // Initial poll
    pollJob();

    // Set up interval polling
    intervalRef.current = setInterval(pollJob, 2000);

    // Cleanup on unmount
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [jobId, apiBase, fetchJson, onComplete]);

  const handleCancel = async () => {
    try {
      await fetchJson(`${apiBase}/api/discovery-jobs/${jobId}`, {
        method: 'DELETE',
      });
      onCancel();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to cancel job');
    }
  };

  if (error) {
    return (
      <div className="space-y-6">
        <div role="alert" className="alert alert-error">
          <Icon icon="lucide--alert-circle" className="size-5" />
          <span>{error}</span>
        </div>
        <div className="flex justify-center">
          <button className="btn btn-ghost" onClick={onCancel}>
            Close
          </button>
        </div>
      </div>
    );
  }

  if (!job) {
    return (
      <div className="flex flex-col justify-center items-center py-12">
        <Spinner size="lg" />
        <p className="mt-4 text-sm text-base-content/70">
          Loading job status...
        </p>
      </div>
    );
  }

  const progress = job.progress || {
    current_step: 0,
    total_steps: 1,
    message: 'Initializing...',
  };
  const progressPercent = (progress.current_step / progress.total_steps) * 100;

  // Status icon
  const getStatusIcon = () => {
    switch (job.status) {
      case 'pending':
        return 'lucide--clock';
      case 'analyzing_documents':
        return 'lucide--brain';
      case 'extracting_types':
        return 'lucide--extract';
      case 'refining_types':
        return 'lucide--sparkles';
      case 'creating_pack':
        return 'lucide--package-plus';
      default:
        return 'lucide--loader-circle';
    }
  };

  return (
    <div className="space-y-8 py-6">
      {/* Status Header */}
      <div className="flex flex-col justify-center items-center text-center">
        <div className="flex justify-center items-center bg-primary/10 mb-4 rounded-full w-20 h-20">
          <Icon
            icon={getStatusIcon()}
            className="size-10 text-primary animate-pulse"
          />
        </div>
        <h3 className="font-semibold text-xl capitalize">{job.status}</h3>
        <p className="mt-2 text-base-content/70">{progress.message}</p>
      </div>

      {/* Progress Bar */}
      <div>
        <div className="flex justify-between items-center mb-2 text-sm">
          <span>
            Step {progress.current_step} of {progress.total_steps}
          </span>
          <span className="font-medium">{Math.round(progressPercent)}%</span>
        </div>
        <progress
          className="w-full progress progress-primary"
          value={progress.current_step}
          max={progress.total_steps}
        ></progress>
      </div>

      {/* Stats Cards */}
      <div className="gap-4 grid grid-cols-2">
        <div className="p-4 border border-base-300 rounded-lg text-center">
          <div className="font-bold text-primary text-3xl">
            {job.discovered_types?.length || 0}
          </div>
          <div className="mt-1 text-sm text-base-content/70">
            Types Discovered
          </div>
        </div>
        <div className="p-4 border border-base-300 rounded-lg text-center">
          <div className="font-bold text-secondary text-3xl">
            {job.discovered_relationships?.length || 0}
          </div>
          <div className="mt-1 text-sm text-base-content/70">
            Relationships Found
          </div>
        </div>
      </div>

      {/* Discovered Types Preview (if any) */}
      {job.discovered_types && job.discovered_types.length > 0 && (
        <div>
          <h4 className="flex items-center gap-2 mb-3 font-medium">
            <Icon icon="lucide--layers" className="size-4" />
            Discovered Types
          </h4>
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {job.discovered_types.map((type, idx) => (
              <div
                key={idx}
                className="flex justify-between items-center gap-3 p-3 border border-base-300 rounded-lg"
              >
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{type.type_name}</div>
                  <div className="text-sm text-base-content/60 truncate">
                    {type.description}
                  </div>
                </div>
                <div className="font-medium text-primary text-sm">
                  {Math.round(type.confidence * 100)}%
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Cancel Button */}
      <div className="flex justify-center">
        <button className="gap-2 btn btn-ghost" onClick={handleCancel}>
          <Icon icon="lucide--x" className="size-4" />
          Cancel Discovery
        </button>
      </div>
    </div>
  );
}
