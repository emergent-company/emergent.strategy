import { useState, useEffect, useCallback, useMemo } from 'react';
import { getApiBase } from '@/lib/api-config';

/**
 * Release list item (minimal data for list view)
 */
export interface ReleaseListItem {
  id: string;
  version: string;
  commitCount: number;
  createdAt: string;
}

/**
 * Structured changelog data
 */
export interface ChangelogData {
  summary: string;
  features: string[];
  improvements: string[];
  bugFixes: string[];
  breakingChanges: string[];
  otherChanges: string[];
}

/**
 * Full release details
 */
export interface ReleaseDetail {
  id: string;
  version: string;
  fromCommit: string;
  toCommit: string;
  commitCount: number;
  changelogJson: ChangelogData | null;
  createdAt: string;
}

/**
 * Hook for fetching releases list.
 * Public endpoint - no auth required.
 */
export function useReleases(limit = 20, offset = 0) {
  const [releases, setReleases] = useState<ReleaseListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const apiBase = useMemo(() => getApiBase(), []);

  const fetchReleases = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `${apiBase}/api/releases?limit=${limit}&offset=${offset}`,
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to fetch releases: ${response.status}`);
      }

      const data: ReleaseListItem[] = await response.json();
      setReleases(data);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setIsLoading(false);
    }
  }, [apiBase, limit, offset]);

  useEffect(() => {
    fetchReleases();
  }, [fetchReleases]);

  return {
    releases,
    isLoading,
    error,
    refetch: fetchReleases,
  };
}

/**
 * Hook for fetching a single release by version.
 * Public endpoint - no auth required.
 */
export function useRelease(version: string | undefined) {
  const [release, setRelease] = useState<ReleaseDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const apiBase = useMemo(() => getApiBase(), []);

  const fetchRelease = useCallback(async () => {
    if (!version) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`${apiBase}/api/releases/${version}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        if (response.status === 404) {
          throw new Error(`Release ${version} not found`);
        }
        throw new Error(`Failed to fetch release: ${response.status}`);
      }

      const data: ReleaseDetail = await response.json();
      setRelease(data);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setIsLoading(false);
    }
  }, [apiBase, version]);

  useEffect(() => {
    fetchRelease();
  }, [fetchRelease]);

  return {
    release,
    isLoading,
    error,
    refetch: fetchRelease,
  };
}

/**
 * Hook for fetching the latest release.
 * Public endpoint - no auth required.
 */
export function useLatestRelease() {
  const [release, setRelease] = useState<ReleaseDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const apiBase = useMemo(() => getApiBase(), []);

  const fetchLatestRelease = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`${apiBase}/api/releases/latest`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        if (response.status === 404) {
          // No releases yet - not an error, just empty state
          setRelease(null);
          return;
        }
        throw new Error(`Failed to fetch latest release: ${response.status}`);
      }

      const data: ReleaseDetail = await response.json();
      setRelease(data);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setIsLoading(false);
    }
  }, [apiBase]);

  useEffect(() => {
    fetchLatestRelease();
  }, [fetchLatestRelease]);

  return {
    release,
    isLoading,
    error,
    refetch: fetchLatestRelease,
  };
}

/**
 * Email preview response from the API
 */
export interface EmailPreviewResponse {
  html: string;
  version: string;
}

/**
 * Hook for fetching email preview HTML for a release.
 * Public endpoint - no auth required.
 */
export function useReleaseEmailPreview(version: string | undefined) {
  const [emailPreview, setEmailPreview] = useState<EmailPreviewResponse | null>(
    null
  );
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const apiBase = useMemo(() => getApiBase(), []);

  const fetchEmailPreview = useCallback(
    async (recipientName?: string) => {
      if (!version) {
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        const params = new URLSearchParams();
        if (recipientName) {
          params.set('recipientName', recipientName);
        }
        const queryString = params.toString();
        const url = `${apiBase}/api/releases/${encodeURIComponent(
          version
        )}/email-preview${queryString ? `?${queryString}` : ''}`;

        const response = await fetch(url, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
        });

        if (!response.ok) {
          if (response.status === 404) {
            throw new Error(`Release ${version} not found`);
          }
          throw new Error(`Failed to fetch email preview: ${response.status}`);
        }

        const data: EmailPreviewResponse = await response.json();
        setEmailPreview(data);
        return data;
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        setError(error);
        throw error;
      } finally {
        setIsLoading(false);
      }
    },
    [apiBase, version]
  );

  // Auto-fetch when version changes
  useEffect(() => {
    if (version) {
      fetchEmailPreview();
    } else {
      setEmailPreview(null);
    }
  }, [version]); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    emailPreview,
    isLoading,
    error,
    refetch: fetchEmailPreview,
  };
}

/**
 * Git commit from preview response
 */
export interface GitCommit {
  hash: string;
  shortHash: string;
  subject: string;
  body: string;
  authorName: string;
  authorEmail: string;
  date: string;
}

/**
 * Changelog item structure
 */
export interface ChangelogItem {
  title: string;
  description?: string;
}

/**
 * Preview response from the API
 */
export interface PreviewResponse {
  version: string;
  commitCount: number;
  fromCommit: string;
  toCommit: string;
  commits: GitCommit[];
  changelog: {
    summary: string;
    features: ChangelogItem[];
    improvements: ChangelogItem[];
    bugFixes: ChangelogItem[];
    breakingChanges: ChangelogItem[];
  };
}

/**
 * Hook for previewing release commits
 */
export function useReleasePreview() {
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const apiBase = useMemo(() => getApiBase(), []);

  const fetchPreview = useCallback(
    async (since: string, until?: string, rawCommits = true) => {
      setIsLoading(true);
      setError(null);

      try {
        const response = await fetch(`${apiBase}/api/releases/preview`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ since, until, rawCommits }),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(
            errorData.message || `Failed to preview release: ${response.status}`
          );
        }

        const data: PreviewResponse = await response.json();
        setPreview(data);
        return data;
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        setError(error);
        throw error;
      } finally {
        setIsLoading(false);
      }
    },
    [apiBase]
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

/**
 * Create release payload
 */
export interface CreateReleasePayload {
  fromCommit?: string;
  toCommit?: string;
  since?: string;
  until?: string;
}

/**
 * Create release response
 */
export interface CreateReleaseResponse {
  success: boolean;
  releaseId?: string;
  version?: string;
  error?: string;
}

/**
 * Send notifications payload
 */
export interface SendNotificationsPayload {
  userId?: string;
  projectId?: string;
  allUsers?: boolean;
  dryRun?: boolean;
  force?: boolean;
  resend?: boolean;
}

/**
 * Send notifications response
 */
export interface SendNotificationsResponse {
  success: boolean;
  releaseId?: string;
  version?: string;
  recipientCount: number;
  emailsSent: number;
  emailsFailed: number;
  inAppSent: number;
  skippedUsers: number;
  dryRun: boolean;
  error?: string;
}

/**
 * Hook for release actions (create, send notifications, delete)
 */
export function useReleaseActions() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const apiBase = useMemo(() => getApiBase(), []);

  const createRelease = useCallback(
    async (payload: CreateReleasePayload): Promise<CreateReleaseResponse> => {
      setIsLoading(true);
      setError(null);

      try {
        const response = await fetch(`${apiBase}/api/releases`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(
            errorData.message || `Failed to create release: ${response.status}`
          );
        }

        return await response.json();
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        setError(error);
        throw error;
      } finally {
        setIsLoading(false);
      }
    },
    [apiBase]
  );

  const sendNotifications = useCallback(
    async (
      version: string,
      payload: SendNotificationsPayload
    ): Promise<SendNotificationsResponse> => {
      setIsLoading(true);
      setError(null);

      try {
        const response = await fetch(
          `${apiBase}/api/releases/${encodeURIComponent(version)}/send`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
          }
        );

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(
            errorData.message ||
              `Failed to send notifications: ${response.status}`
          );
        }

        return await response.json();
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        setError(error);
        throw error;
      } finally {
        setIsLoading(false);
      }
    },
    [apiBase]
  );

  const deleteRelease = useCallback(
    async (version: string): Promise<void> => {
      setIsLoading(true);
      setError(null);

      try {
        const response = await fetch(
          `${apiBase}/api/releases/${encodeURIComponent(version)}`,
          {
            method: 'DELETE',
            headers: {
              'Content-Type': 'application/json',
            },
          }
        );

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(
            errorData.message || `Failed to delete release: ${response.status}`
          );
        }
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        setError(error);
        throw error;
      } finally {
        setIsLoading(false);
      }
    },
    [apiBase]
  );

  return {
    isLoading,
    error,
    createRelease,
    sendNotifications,
    deleteRelease,
  };
}
