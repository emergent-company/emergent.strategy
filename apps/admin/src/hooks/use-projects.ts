import { useCallback, useMemo } from 'react';
import { normalizeOrgId } from '@/utils/org-id';

import { useConfig } from '@/contexts/config';
import { useApi } from '@/hooks/use-api';
import { useAccessTreeContext } from '@/contexts/access-tree';

export type Project = {
  id: string;
  name: string;
  status?: string;
  createdAt?: string;
  orgId?: string;
  auto_extract_objects?: boolean;
  auto_extract_config?: {
    enabled_types?: string[];
    min_confidence?: number;
    require_review?: boolean;
    notify_on_complete?: boolean;
    notification_channels?: string[];
    entity_similarity_threshold?: number;
  };
  chunking_config?: {
    strategy?: 'character' | 'sentence' | 'paragraph';
    maxChunkSize?: number;
    minChunkSize?: number;
  };
  allow_parallel_extraction?: boolean;
  extraction_config?: {
    chunkSize?: number;
    method?: 'function_calling' | 'responseSchema';
    timeoutSeconds?: number;
  };
};

type CreateProjectPayload = {
  name: string;
  orgId: string;
};

/**
 * Hook to fetch projects (now backed by access tree context).
 * Filters projects by active org for backward compatibility.
 *
 * @deprecated Consider using useAccessTreeContext() directly for better performance
 */
export const useProjects = () => {
  const {
    config: { activeOrgId: rawActiveOrgId },
  } = useConfig();
  const activeOrgId = normalizeOrgId(rawActiveOrgId);
  const { apiBase, fetchJson } = useApi();
  const {
    projects: allProjects,
    loading,
    error,
    refresh: refreshTree,
  } = useAccessTreeContext();

  // Filter projects by active org (matching previous behavior)
  const projects = useMemo(() => {
    if (!activeOrgId) return [];
    // Normalize project orgIds and filter
    return allProjects
      .map((p) => ({
        ...p,
        orgId: p.orgId ? normalizeOrgId(p.orgId) : p.orgId,
      }))
      .filter((p) => p.orgId === activeOrgId);
  }, [allProjects, activeOrgId]);

  const createProject = useCallback(
    async (name: string): Promise<Project> => {
      if (!activeOrgId) {
        throw new Error(
          'No active organization - please select an organization first'
        );
      }
      const body: CreateProjectPayload = { name, orgId: activeOrgId };
      try {
        const created = await fetchJson<Project, CreateProjectPayload>(
          `${apiBase}/api/projects`,
          {
            method: 'POST',
            body,
            credentials: 'include',
          }
        );
        // Refresh access tree to get updated data
        await refreshTree();
        return created;
      } catch (error: any) {
        if (error?.error?.code === 'org-not-found') {
          console.error(
            '[createProject] Organization not found - localStorage may have stale data'
          );
          throw new Error(
            'Organization not found. Please refresh the page and select a valid organization.'
          );
        }
        throw error;
      }
    },
    [activeOrgId, refreshTree, apiBase, fetchJson]
  );

  return {
    projects,
    loading,
    error,
    refresh: refreshTree,
    createProject,
  } as const;
};
