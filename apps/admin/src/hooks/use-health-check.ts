import { useState, useEffect, useCallback, useRef } from 'react';
import { useDataUpdatesContext } from '@/contexts/data-updates';

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
  /**
   * Fallback polling interval in milliseconds (default: 60000 = 60 seconds)
   * HTTP polling only occurs when SSE is not connected or hasn't sent health data recently
   */
  fallbackInterval?: number;
  /** Whether to enable health checking (default: true) */
  enabled?: boolean;
  /**
   * Maximum age of SSE health data before triggering HTTP fallback (default: 45000 = 45 seconds)
   * This should be slightly longer than the SSE heartbeat interval (30 seconds)
   */
  maxHealthDataAge?: number;
}

export interface UseHealthCheckResult {
  /** Current health data from the API or SSE heartbeat */
  data: HealthCheckResponse | null;
  /** Overall health status derived from the response */
  status: HealthStatus;
  /** Whether the health check is currently loading (HTTP fetch only) */
  isLoading: boolean;
  /** Error if the health check failed */
  error: Error | null;
  /** Last successful check timestamp */
  lastChecked: Date | null;
  /** Manually trigger an HTTP health check */
  refetch: () => Promise<void>;
  /** Whether health data is coming from SSE (true) or HTTP polling (false) */
  isFromSSE: boolean;
}

/**
 * Derive health status from health data and error state
 */
function deriveHealthStatus(
  data: HealthCheckResponse | null,
  error: Error | null
): HealthStatus {
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
}

/**
 * Hook for health status monitoring.
 *
 * Primarily uses health data delivered via SSE heartbeats (every 30 seconds).
 * Falls back to HTTP polling when:
 * - SSE connection is not established
 * - SSE connection has errors
 * - No health data received via SSE for longer than maxHealthDataAge
 *
 * This approach reduces unnecessary HTTP requests while ensuring
 * health data is always available.
 *
 * @example
 * const { status, data, error, lastChecked, refetch, isFromSSE } = useHealthCheck();
 *
 * @example
 * // Disable health checking
 * const { status, refetch } = useHealthCheck({ enabled: false });
 */
export function useHealthCheck(
  options: UseHealthCheckOptions = {}
): UseHealthCheckResult {
  const {
    fallbackInterval = 60000, // 60 seconds fallback polling
    enabled = true,
    maxHealthDataAge = 45000, // 45 seconds (SSE heartbeat is 30s)
  } = options;

  // Get SSE health data from context
  const {
    connectionState,
    healthData: sseHealthData,
    lastHealthUpdate,
  } = useDataUpdatesContext();

  // Local state for HTTP fallback
  const [httpData, setHttpData] = useState<HealthCheckResponse | null>(null);
  const [httpLastChecked, setHttpLastChecked] = useState<Date | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<Error | null>(null);

  const isMountedRef = useRef(true);

  // HTTP fallback fetch
  const checkHealthViaHttp = useCallback(async () => {
    setIsLoading(true);

    try {
      // Use VITE_API_BASE for consistency with other API calls
      const apiBase = (import.meta as any).env?.VITE_API_BASE || '';
      // Use /api/health to go through Vite proxy in development
      const response = await fetch(`${apiBase}/api/health`, {
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
        setHttpData(healthData);
        setError(null);
        setHttpLastChecked(new Date());
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

  // Determine if we should use SSE data or need HTTP fallback
  const sseDataIsStale = useCallback(() => {
    if (!lastHealthUpdate) return true;
    const age = Date.now() - lastHealthUpdate.getTime();
    return age > maxHealthDataAge;
  }, [lastHealthUpdate, maxHealthDataAge]);

  const shouldUseSseData =
    connectionState === 'connected' && sseHealthData && !sseDataIsStale();

  // Use SSE data when available, otherwise fall back to HTTP data
  const data: HealthCheckResponse | null = shouldUseSseData
    ? sseHealthData
    : httpData;
  const lastChecked: Date | null = shouldUseSseData
    ? lastHealthUpdate
    : httpLastChecked;

  // Derive status
  const status = deriveHealthStatus(data, error);

  // Clear error when SSE data becomes available
  useEffect(() => {
    if (shouldUseSseData && error) {
      setError(null);
    }
  }, [shouldUseSseData, error]);

  // HTTP fallback polling - only when SSE is not providing health data
  useEffect(() => {
    isMountedRef.current = true;

    if (!enabled) {
      return () => {
        isMountedRef.current = false;
      };
    }

    // Initial HTTP fetch if we don't have SSE data
    if (!shouldUseSseData && !httpData) {
      checkHealthViaHttp();
    }

    // Set up fallback polling - only runs when SSE data is not available
    const intervalId = setInterval(() => {
      // Only poll via HTTP if SSE data is stale or unavailable
      if (!shouldUseSseData || sseDataIsStale()) {
        checkHealthViaHttp();
      }
    }, fallbackInterval);

    return () => {
      isMountedRef.current = false;
      clearInterval(intervalId);
    };
  }, [
    enabled,
    fallbackInterval,
    checkHealthViaHttp,
    shouldUseSseData,
    sseDataIsStale,
    httpData,
  ]);

  return {
    data,
    status,
    isLoading,
    error,
    lastChecked,
    refetch: checkHealthViaHttp,
    isFromSSE: shouldUseSseData ?? false,
  };
}

export default useHealthCheck;
