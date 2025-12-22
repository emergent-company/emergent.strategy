import { useState, useEffect, useCallback } from 'react';
import { useApi } from './use-api';

export type SuperadminStatus = {
  isSuperadmin: boolean;
  isLoading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
};

/**
 * Hook to check if the current user is a superadmin.
 * Makes a single API call on mount and caches the result.
 */
export function useSuperadmin(): SuperadminStatus {
  const { apiBase, fetchJson } = useApi();
  const [isSuperadmin, setIsSuperadmin] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const checkSuperadminStatus = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const response = await fetchJson<{ isSuperadmin: boolean }>(
        `${apiBase}/api/superadmin/me`,
        { suppressErrorLog: true }
      );
      setIsSuperadmin(response.isSuperadmin);
    } catch (e) {
      // On error (including 403), user is not a superadmin
      setIsSuperadmin(false);
      setError(
        e instanceof Error ? e : new Error('Failed to check superadmin status')
      );
    } finally {
      setIsLoading(false);
    }
  }, [apiBase, fetchJson]);

  useEffect(() => {
    checkSuperadminStatus();
  }, [checkSuperadminStatus]);

  return {
    isSuperadmin,
    isLoading,
    error,
    refetch: checkSuperadminStatus,
  };
}
