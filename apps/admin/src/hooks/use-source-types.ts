import { useState, useEffect, useCallback, useMemo } from 'react';
import { useApi } from '@/hooks/use-api';
import { useConfig } from '@/contexts/config';
import {
  getSourceTypePlugin,
  getAllSourceTypePlugins,
  type SourceTypePlugin,
} from '@/lib/source-type-plugins';

/**
 * Source type with count from the API.
 */
export interface SourceTypeWithCount {
  sourceType: string;
  count: number;
  /** Plugin configuration if registered */
  plugin?: SourceTypePlugin;
}

/**
 * Response from GET /api/documents/source-types endpoint.
 */
interface SourceTypesResponse {
  sourceTypes: Array<{
    sourceType: string;
    count: number;
  }>;
}

export interface UseSourceTypesOptions {
  /** Whether to fetch on mount (default: true) */
  enabled?: boolean;
}

export interface UseSourceTypesReturn {
  /** Source types with counts, enriched with plugin info */
  sourceTypes: SourceTypeWithCount[];
  /** All registered source type plugins (even if no documents exist) */
  allPlugins: SourceTypePlugin[];
  /** Whether the data is loading */
  loading: boolean;
  /** Error message if fetch failed */
  error: string | null;
  /** Refetch the source types */
  refetch: () => Promise<void>;
  /** Get plugin for a specific source type */
  getPlugin: (sourceType: string) => SourceTypePlugin | undefined;
  /** Total document count across all source types */
  totalCount: number;
}

/**
 * Hook to fetch document source types with counts from the API.
 *
 * @example
 * ```tsx
 * const { sourceTypes, loading, error } = useSourceTypes();
 *
 * // sourceTypes = [
 * //   { sourceType: 'upload', count: 42, plugin: { displayName: 'Documents', ... } },
 * //   { sourceType: 'email', count: 15, plugin: { displayName: 'Emails', ... } },
 * // ]
 * ```
 */
export function useSourceTypes(
  options: UseSourceTypesOptions = {}
): UseSourceTypesReturn {
  const { enabled = true } = options;
  const { fetchJson, apiBase } = useApi();
  const { config } = useConfig();

  const [sourceTypes, setSourceTypes] = useState<SourceTypeWithCount[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const allPlugins = useMemo(() => getAllSourceTypePlugins(), []);

  const fetchSourceTypes = useCallback(async () => {
    if (!config.activeProjectId) {
      setSourceTypes([]);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetchJson<SourceTypesResponse>(
        `${apiBase}/api/documents/source-types`
      );

      // Enrich with plugin information
      const enriched: SourceTypeWithCount[] = response.sourceTypes.map(
        (item) => ({
          sourceType: item.sourceType,
          count: item.count,
          plugin: getSourceTypePlugin(item.sourceType),
        })
      );

      // Sort by plugin priority (if exists), then by count
      enriched.sort((a, b) => {
        const priorityA = a.plugin?.priority ?? 999;
        const priorityB = b.plugin?.priority ?? 999;
        if (priorityA !== priorityB) return priorityA - priorityB;
        return b.count - a.count;
      });

      setSourceTypes(enriched);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to load source types';
      setError(message);
      console.error('[useSourceTypes] Failed to fetch:', err);
    } finally {
      setLoading(false);
    }
  }, [fetchJson, apiBase, config.activeProjectId]);

  useEffect(() => {
    if (enabled && config.activeProjectId) {
      void fetchSourceTypes();
    }
  }, [enabled, config.activeProjectId, fetchSourceTypes]);

  const getPlugin = useCallback(
    (sourceType: string) => getSourceTypePlugin(sourceType),
    []
  );

  const totalCount = useMemo(
    () => sourceTypes.reduce((sum, st) => sum + st.count, 0),
    [sourceTypes]
  );

  return {
    sourceTypes,
    allPlugins,
    loading,
    error,
    refetch: fetchSourceTypes,
    getPlugin,
    totalCount,
  };
}
