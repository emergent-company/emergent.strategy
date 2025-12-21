/**
 * Hook for managing pending invitations for the current user
 */
import { useState, useEffect, useCallback } from 'react';
import { useApi } from '@/hooks/use-api';
import { useAccessTreeContext } from '@/contexts/access-tree';

export interface PendingInvite {
  id: string;
  projectId?: string;
  projectName?: string;
  organizationId: string;
  organizationName?: string;
  role: string;
  token: string;
  createdAt: string;
  expiresAt?: string;
}

/**
 * Hook to fetch and manage pending invitations for the current user
 */
export function usePendingInvites() {
  const { apiBase, fetchJson } = useApi();
  const { refresh: refreshAccessTree } = useAccessTreeContext();

  const [invites, setInvites] = useState<PendingInvite[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [isAccepting, setIsAccepting] = useState(false);
  const [isDeclining, setIsDeclining] = useState(false);

  const refetch = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await fetchJson<PendingInvite[]>(
        `${apiBase}/api/invites/pending`,
        {
          credentials: 'include',
        }
      );
      setInvites(data);
    } catch (err) {
      const error = err as Error;
      setError(error);
      console.log('Failed to fetch pending invites:', error.message);
    } finally {
      setIsLoading(false);
    }
  }, [apiBase, fetchJson]);

  // Initial fetch
  useEffect(() => {
    refetch();
  }, [refetch]);

  const acceptInvite = useCallback(
    async (token: string) => {
      try {
        setIsAccepting(true);
        setError(null);
        const result = await fetchJson<{ status: string }>(
          `${apiBase}/api/invites/accept`,
          {
            method: 'POST',
            body: { token },
            credentials: 'include',
          }
        );
        // Refresh pending invites
        await refetch();
        // Refresh access tree to get new projects/orgs
        await refreshAccessTree();
        return result;
      } catch (err) {
        const error = err as Error;
        setError(error);
        throw error;
      } finally {
        setIsAccepting(false);
      }
    },
    [apiBase, fetchJson, refetch, refreshAccessTree]
  );

  const declineInvite = useCallback(
    async (inviteId: string) => {
      try {
        setIsDeclining(true);
        setError(null);
        const result = await fetchJson<{ status: string }>(
          `${apiBase}/api/invites/${inviteId}/decline`,
          {
            method: 'POST',
            credentials: 'include',
          }
        );
        // Refresh pending invites
        await refetch();
        return result;
      } catch (err) {
        const error = err as Error;
        setError(error);
        throw error;
      } finally {
        setIsDeclining(false);
      }
    },
    [apiBase, fetchJson, refetch]
  );

  return {
    invites,
    isLoading,
    error,
    refetch,
    acceptInvite,
    declineInvite,
    isAccepting,
    isDeclining,
  };
}
