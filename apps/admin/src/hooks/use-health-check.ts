import { useState, useEffect, useCallback, useRef } from 'react';

export interface HealthCheckResponse {
  ok: boolean;
  model: string | null;
  db: 'up' | 'down';
  embeddings: 'enabled' | 'disabled';
  rls_policies_ok?: boolean;
  rls_policy_count?: number;
  rls_policy_hash?: string;
}

export type HealthStatus = 'healthy' | 'degraded' | 'unhealthy' | 'unknown';

export interface UseHealthCheckOptions {
  /** Polling interval in milliseconds (default: 30000 = 30 seconds) */
  interval?: number;
  /** Whether to start polling immediately (default: true) */
  enabled?: boolean;
}

export interface UseHealthCheckResult {
  /** Current health data from the API */
  data: HealthCheckResponse | null;
  /** Overall health status derived from the response */
  status: HealthStatus;
  /** Whether the health check is currently loading */
  isLoading: boolean;
  /** Error if the health check failed */
  error: Error | null;
  /** Last successful check timestamp */
  lastChecked: Date | null;
  /** Manually trigger a health check */
  refetch: () => Promise<void>;
}

/**
 * Hook to poll the backend health endpoint.
 *
 * @example
 * const { status, data, error, lastChecked, refetch } = useHealthCheck();
 *
 * @example
 * // Custom interval (every 10 seconds)
 * const { status } = useHealthCheck({ interval: 10000 });
 *
 * @example
 * // Disabled polling
 * const { status, refetch } = useHealthCheck({ enabled: false });
 */
export function useHealthCheck(
  options: UseHealthCheckOptions = {}
): UseHealthCheckResult {
  const { interval = 30000, enabled = true } = options;

  const [data, setData] = useState<HealthCheckResponse | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<Error | null>(null);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);

  const isMountedRef = useRef(true);

  const checkHealth = useCallback(async () => {
    setIsLoading(true);

    try {
      const apiBase = (import.meta as any).env?.VITE_API_URL || '';
      const response = await fetch(`${apiBase}/health`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`Health check failed: ${response.status}`);
      }

      const healthData: HealthCheckResponse = await response.json();

      if (isMountedRef.current) {
        setData(healthData);
        setError(null);
        setLastChecked(new Date());
      }
    } catch (err) {
      if (isMountedRef.current) {
        setError(err instanceof Error ? err : new Error(String(err)));
        // Don't clear data on error - keep last known state
      }
    } finally {
      if (isMountedRef.current) {
        setIsLoading(false);
      }
    }
  }, []);

  // Derive status from data and error
  const status: HealthStatus = (() => {
    if (error) {
      return 'unhealthy';
    }
    if (!data) {
      return 'unknown';
    }
    if (!data.ok || data.db === 'down') {
      return 'unhealthy';
    }
    if (data.rls_policies_ok === false) {
      return 'degraded';
    }
    return 'healthy';
  })();

  // Initial fetch and polling
  useEffect(() => {
    isMountedRef.current = true;

    if (enabled) {
      // Initial fetch
      checkHealth();

      // Set up polling
      const intervalId = setInterval(checkHealth, interval);

      return () => {
        isMountedRef.current = false;
        clearInterval(intervalId);
      };
    }

    return () => {
      isMountedRef.current = false;
    };
  }, [enabled, interval, checkHealth]);

  return {
    data,
    status,
    isLoading,
    error,
    lastChecked,
    refetch: checkHealth,
  };
}

export default useHealthCheck;
