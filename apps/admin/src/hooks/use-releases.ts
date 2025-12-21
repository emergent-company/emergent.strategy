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
