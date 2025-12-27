import { useState, useEffect, useCallback } from 'react';
import { useApi } from './use-api';
import type { PaginationMeta } from '@/types/superadmin';

export type EmailJobStatus = 'pending' | 'processing' | 'sent' | 'failed';

export type EmailDeliveryStatus =
  | 'pending'
  | 'delivered'
  | 'opened'
  | 'clicked'
  | 'bounced'
  | 'soft_bounced'
  | 'complained'
  | 'unsubscribed'
  | 'failed';

export interface SuperadminEmailJob {
  id: string;
  templateName: string;
  toEmail: string;
  toName: string | null;
  subject: string;
  status: EmailJobStatus;
  attempts: number;
  maxAttempts: number;
  lastError: string | null;
  createdAt: string;
  processedAt: string | null;
  sourceType: string | null;
  sourceId: string | null;
  deliveryStatus: EmailDeliveryStatus | null;
  deliveryStatusAt: string | null;
}

export interface ListEmailJobsResponse {
  emailJobs: SuperadminEmailJob[];
  meta: PaginationMeta;
}

export interface EmailJobPreviewResponse {
  html: string;
  subject: string;
  toEmail: string;
  toName: string | null;
}

export interface UseSuperadminEmailsResult {
  emailJobs: SuperadminEmailJob[];
  meta: PaginationMeta | null;
  isLoading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

export function useSuperadminEmails(
  params: {
    page?: number;
    limit?: number;
    status?: EmailJobStatus;
    recipient?: string;
    fromDate?: string;
    toDate?: string;
  } = {}
): UseSuperadminEmailsResult {
  const { apiBase, fetchJson } = useApi();
  const [emailJobs, setEmailJobs] = useState<SuperadminEmailJob[]>([]);
  const [meta, setMeta] = useState<PaginationMeta | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const { page = 1, limit = 20, status, recipient, fromDate, toDate } = params;

  const fetchEmails = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const queryParams = new URLSearchParams();
      queryParams.set('page', String(page));
      queryParams.set('limit', String(limit));
      if (status) {
        queryParams.set('status', status);
      }
      if (recipient) {
        queryParams.set('recipient', recipient);
      }
      if (fromDate) {
        queryParams.set('fromDate', fromDate);
      }
      if (toDate) {
        queryParams.set('toDate', toDate);
      }

      const response = await fetchJson<ListEmailJobsResponse>(
        `${apiBase}/api/superadmin/email-jobs?${queryParams.toString()}`
      );

      setEmailJobs(response.emailJobs);
      setMeta(response.meta);
    } catch (e) {
      setError(
        e instanceof Error ? e : new Error('Failed to fetch email jobs')
      );
      setEmailJobs([]);
    } finally {
      setIsLoading(false);
    }
  }, [apiBase, fetchJson, page, limit, status, recipient, fromDate, toDate]);

  useEffect(() => {
    fetchEmails();
  }, [fetchEmails]);

  return {
    emailJobs,
    meta,
    isLoading,
    error,
    refetch: fetchEmails,
  };
}

export interface UseSuperadminEmailPreviewResult {
  preview: EmailJobPreviewResponse | null;
  isLoading: boolean;
  error: Error | null;
  fetchPreview: (emailJobId: string) => Promise<void>;
  clearPreview: () => void;
}

export function useSuperadminEmailPreview(): UseSuperadminEmailPreviewResult {
  const { apiBase, fetchJson } = useApi();
  const [preview, setPreview] = useState<EmailJobPreviewResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchPreview = useCallback(
    async (emailJobId: string) => {
      try {
        setIsLoading(true);
        setError(null);

        const response = await fetchJson<EmailJobPreviewResponse>(
          `${apiBase}/api/superadmin/email-jobs/${emailJobId}/preview-json`
        );

        setPreview(response);
      } catch (e) {
        setError(
          e instanceof Error ? e : new Error('Failed to fetch email preview')
        );
        setPreview(null);
      } finally {
        setIsLoading(false);
      }
    },
    [apiBase, fetchJson]
  );

  const clearPreview = useCallback(() => {
    setPreview(null);
    setError(null);
  }, []);

  return {
    preview,
    isLoading,
    error,
    fetchPreview,
    clearPreview,
  };
}
