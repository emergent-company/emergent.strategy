/**
 * Hook for document parsing with Kreuzberg integration.
 *
 * Handles file uploads to the document-parsing-jobs API, job status polling,
 * and progress tracking for Kreuzberg-based document extraction.
 */
import { useState, useCallback, useRef, useEffect } from 'react';
import { useApi } from './use-api';

// Job status enum matching backend
export type DocumentParsingJobStatus =
  | 'pending'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'retry_pending';

// Job response from API
export interface DocumentParsingJob {
  id: string;
  organizationId: string;
  projectId: string;
  status: DocumentParsingJobStatus;
  sourceType: 'upload' | 'url';
  sourceFilename?: string | null;
  mimeType?: string | null;
  fileSizeBytes?: number | null;
  documentId?: string | null;
  errorMessage?: string | null;
  retryCount?: number;
  createdAt: string;
  startedAt?: string | null;
  completedAt?: string | null;
  updatedAt: string;
}

// Response type for document-first upload endpoint
export interface DocumentUploadResponse {
  document: {
    id: string;
    name: string;
    mimeType?: string | null;
    fileSizeBytes?: number | null;
    conversionStatus: string;
    conversionError?: string | null;
    storageKey?: string | null;
    createdAt: string;
  };
  isDuplicate: boolean;
  existingDocumentId?: string;
  parsingJob?: DocumentParsingJob;
}

// Upload options
export interface UploadDocumentOptions {
  autoExtract?: boolean;
  onProgress?: (job: DocumentParsingJob) => void;
  onComplete?: (job: DocumentParsingJob) => void;
  onError?: (error: Error, job?: DocumentParsingJob) => void;
}

// Single file upload state
export interface UploadState {
  file: File;
  job: DocumentParsingJob | null;
  status: 'uploading' | 'polling' | 'completed' | 'failed';
  error?: string;
}

// Batch upload state
export interface BatchUploadState {
  files: Array<{
    file: File;
    job: DocumentParsingJob | null;
    status: 'pending' | 'uploading' | 'polling' | 'completed' | 'failed';
    error?: string;
  }>;
  isProcessing: boolean;
  completed: number;
  total: number;
}

// Hook return type
export interface UseDocumentParsingReturn {
  // Upload functions
  uploadDocument: (
    file: File,
    options?: UploadDocumentOptions
  ) => Promise<DocumentParsingJob>;
  uploadBatch: (
    files: File[],
    options?: UploadDocumentOptions
  ) => Promise<DocumentParsingJob[]>;

  // State
  uploadState: UploadState | null;
  batchUploadState: BatchUploadState | null;
  isUploading: boolean;

  // Job management
  getJobStatus: (jobId: string) => Promise<DocumentParsingJob>;
  pollJobUntilComplete: (
    jobId: string,
    onProgress?: (job: DocumentParsingJob) => void
  ) => Promise<DocumentParsingJob>;

  // Control
  cancelUpload: () => void;
  clearState: () => void;
}

// Polling configuration
const POLL_INTERVAL_MS = 2000; // 2 seconds
const MAX_POLL_ATTEMPTS = 300; // 10 minutes max (300 * 2s)

export function useDocumentParsing(): UseDocumentParsingReturn {
  const { fetchJson, fetchForm, apiBase } = useApi();

  // State
  const [uploadState, setUploadState] = useState<UploadState | null>(null);
  const [batchUploadState, setBatchUploadState] =
    useState<BatchUploadState | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  // Refs for cleanup
  const abortControllerRef = useRef<AbortController | null>(null);
  const pollTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (pollTimeoutRef.current) {
        clearTimeout(pollTimeoutRef.current);
      }
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  /**
   * Get job status by ID
   */
  const getJobStatus = useCallback(
    async (jobId: string): Promise<DocumentParsingJob> => {
      const job = await fetchJson<DocumentParsingJob>(
        `${apiBase}/api/document-parsing-jobs/${jobId}`,
        { suppressErrorLog: true } // Don't log 404s during polling
      );
      return job;
    },
    [fetchJson, apiBase]
  );

  /**
   * Poll job until it reaches a terminal state (completed/failed)
   *
   * Also handles retry_pending status - if a job has exhausted all retries
   * (retryCount >= maxRetries, typically 3), we treat it as a terminal failure
   * even if the status is still retry_pending (backend will update to failed on next attempt).
   */
  const pollJobUntilComplete = useCallback(
    async (
      jobId: string,
      onProgress?: (job: DocumentParsingJob) => void
    ): Promise<DocumentParsingJob> => {
      let attempts = 0;

      const poll = async (): Promise<DocumentParsingJob> => {
        if (attempts >= MAX_POLL_ATTEMPTS) {
          throw new Error('Job polling timed out');
        }

        const job = await getJobStatus(jobId);
        onProgress?.(job);

        // Terminal states - stop polling
        if (job.status === 'completed' || job.status === 'failed') {
          return job;
        }

        // Handle retry_pending: if retries exhausted, treat as failed
        // This provides immediate feedback to user instead of waiting for
        // the backend worker's next poll cycle to mark it as failed
        if (job.status === 'retry_pending') {
          const maxRetries = 3; // Default max retries from backend
          if (job.retryCount !== undefined && job.retryCount >= maxRetries) {
            // All retries exhausted - return as failed for immediate UI feedback
            return {
              ...job,
              status: 'failed',
            };
          }
          // Still has retries remaining - continue polling
        }

        attempts++;

        // Wait and poll again
        return new Promise((resolve, reject) => {
          pollTimeoutRef.current = setTimeout(async () => {
            try {
              const result = await poll();
              resolve(result);
            } catch (err) {
              reject(err);
            }
          }, POLL_INTERVAL_MS);
        });
      };

      return poll();
    },
    [getJobStatus]
  );

  /**
   * Upload a single document
   */
  const uploadDocument = useCallback(
    async (
      file: File,
      options: UploadDocumentOptions = {}
    ): Promise<DocumentParsingJob> => {
      const { autoExtract = false, onProgress, onComplete, onError } = options;

      setIsUploading(true);
      setUploadState({
        file,
        job: null,
        status: 'uploading',
      });

      try {
        // Create form data
        const formData = new FormData();
        formData.append('file', file);
        if (autoExtract) {
          formData.append('autoExtract', 'true');
        }

        // Upload file (document-first architecture)
        const response = await fetchForm<DocumentUploadResponse>(
          `${apiBase}/api/document-parsing-jobs/upload`,
          formData
        );

        // If no parsing job (plain text files or duplicates), create a synthetic "completed" job
        if (!response.parsingJob) {
          const syntheticJob: DocumentParsingJob = {
            id: response.document.id, // Use document ID as a placeholder
            organizationId: '',
            projectId: '',
            status: 'completed',
            sourceType: 'upload',
            sourceFilename: response.document.name,
            mimeType: response.document.mimeType,
            fileSizeBytes: response.document.fileSizeBytes,
            documentId: response.document.id,
            createdAt: response.document.createdAt,
            updatedAt: response.document.createdAt,
          };

          setUploadState({
            file,
            job: syntheticJob,
            status: 'completed',
          });
          onComplete?.(syntheticJob);
          return syntheticJob;
        }

        const job = response.parsingJob;

        setUploadState({
          file,
          job,
          status: 'polling',
        });

        onProgress?.(job);

        // Poll until complete
        const completedJob = await pollJobUntilComplete(jobId(job), (j) => {
          setUploadState((prev) =>
            prev ? { ...prev, job: j, status: 'polling' } : null
          );
          onProgress?.(j);
        });

        // Handle completion
        if (completedJob.status === 'failed') {
          const error = new Error(
            completedJob.errorMessage || 'Document parsing failed'
          );
          setUploadState({
            file,
            job: completedJob,
            status: 'failed',
            error: error.message,
          });
          onError?.(error, completedJob);
          throw error;
        }

        setUploadState({
          file,
          job: completedJob,
          status: 'completed',
        });
        onComplete?.(completedJob);

        return completedJob;
      } catch (err) {
        const error = err instanceof Error ? err : new Error('Upload failed');
        setUploadState((prev) =>
          prev
            ? { ...prev, status: 'failed', error: error.message }
            : { file, job: null, status: 'failed', error: error.message }
        );
        onError?.(error);
        throw error;
      } finally {
        setIsUploading(false);
      }
    },
    [fetchForm, apiBase, pollJobUntilComplete]
  );

  /**
   * Upload multiple documents in batch
   */
  const uploadBatch = useCallback(
    async (
      files: File[],
      options: UploadDocumentOptions = {}
    ): Promise<DocumentParsingJob[]> => {
      const { autoExtract = false, onProgress, onComplete, onError } = options;

      if (files.length === 0) {
        return [];
      }

      setIsUploading(true);
      setBatchUploadState({
        files: files.map((file) => ({
          file,
          job: null,
          status: 'pending',
        })),
        isProcessing: true,
        completed: 0,
        total: files.length,
      });

      const results: DocumentParsingJob[] = [];
      const errors: Array<{ file: File; error: Error }> = [];

      // Process files sequentially to avoid overwhelming the server
      for (let i = 0; i < files.length; i++) {
        const file = files[i];

        // Update state to show current file is uploading
        setBatchUploadState((prev) => {
          if (!prev) return null;
          const newFiles = [...prev.files];
          newFiles[i] = { ...newFiles[i], status: 'uploading' };
          return { ...prev, files: newFiles };
        });

        try {
          // Create form data
          const formData = new FormData();
          formData.append('file', file);
          if (autoExtract) {
            formData.append('autoExtract', 'true');
          }

          // Upload file (document-first architecture)
          const response = await fetchForm<DocumentUploadResponse>(
            `${apiBase}/api/document-parsing-jobs/upload`,
            formData
          );

          // If no parsing job (plain text files or duplicates), create a synthetic "completed" job
          if (!response.parsingJob) {
            const syntheticJob: DocumentParsingJob = {
              id: response.document.id,
              organizationId: '',
              projectId: '',
              status: 'completed',
              sourceType: 'upload',
              sourceFilename: response.document.name,
              mimeType: response.document.mimeType,
              fileSizeBytes: response.document.fileSizeBytes,
              documentId: response.document.id,
              createdAt: response.document.createdAt,
              updatedAt: response.document.createdAt,
            };

            setBatchUploadState((prev) => {
              if (!prev) return null;
              const newFiles = [...prev.files];
              newFiles[i] = {
                ...newFiles[i],
                job: syntheticJob,
                status: 'completed',
              };
              return {
                ...prev,
                files: newFiles,
                completed: prev.completed + 1,
              };
            });

            results.push(syntheticJob);
            onComplete?.(syntheticJob);
            continue;
          }

          const job = response.parsingJob;

          // Update state to polling
          setBatchUploadState((prev) => {
            if (!prev) return null;
            const newFiles = [...prev.files];
            newFiles[i] = { ...newFiles[i], job, status: 'polling' };
            return { ...prev, files: newFiles };
          });

          // Poll until complete
          const completedJob = await pollJobUntilComplete(jobId(job), (j) => {
            setBatchUploadState((prev) => {
              if (!prev) return null;
              const newFiles = [...prev.files];
              newFiles[i] = { ...newFiles[i], job: j };
              return { ...prev, files: newFiles };
            });
            onProgress?.(j);
          });

          // Update final state
          const isSuccess = completedJob.status === 'completed';
          setBatchUploadState((prev) => {
            if (!prev) return null;
            const newFiles = [...prev.files];
            newFiles[i] = {
              ...newFiles[i],
              job: completedJob,
              status: isSuccess ? 'completed' : 'failed',
              error: isSuccess
                ? undefined
                : completedJob.errorMessage || 'Failed',
            };
            return {
              ...prev,
              files: newFiles,
              completed: prev.completed + 1,
            };
          });

          if (isSuccess) {
            results.push(completedJob);
            onComplete?.(completedJob);
          } else {
            const error = new Error(
              completedJob.errorMessage || 'Document parsing failed'
            );
            errors.push({ file, error });
            onError?.(error, completedJob);
          }
        } catch (err) {
          const error = err instanceof Error ? err : new Error('Upload failed');
          errors.push({ file, error });

          setBatchUploadState((prev) => {
            if (!prev) return null;
            const newFiles = [...prev.files];
            newFiles[i] = {
              ...newFiles[i],
              status: 'failed',
              error: error.message,
            };
            return {
              ...prev,
              files: newFiles,
              completed: prev.completed + 1,
            };
          });

          onError?.(error);
        }
      }

      // Mark batch as complete
      setBatchUploadState((prev) =>
        prev ? { ...prev, isProcessing: false } : null
      );
      setIsUploading(false);

      // If all failed, throw
      if (results.length === 0 && errors.length > 0) {
        throw new Error(`All ${errors.length} uploads failed`);
      }

      return results;
    },
    [fetchForm, apiBase, pollJobUntilComplete]
  );

  /**
   * Cancel current upload/polling
   */
  const cancelUpload = useCallback(() => {
    if (pollTimeoutRef.current) {
      clearTimeout(pollTimeoutRef.current);
      pollTimeoutRef.current = null;
    }
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsUploading(false);
  }, []);

  /**
   * Clear upload state
   */
  const clearState = useCallback(() => {
    setUploadState(null);
    setBatchUploadState(null);
  }, []);

  return {
    uploadDocument,
    uploadBatch,
    uploadState,
    batchUploadState,
    isUploading,
    getJobStatus,
    pollJobUntilComplete,
    cancelUpload,
    clearState,
  };
}

// Helper to safely get job ID
function jobId(job: DocumentParsingJob): string {
  return job.id;
}
