import { useMemo, useCallback, useRef } from 'react';
import { useAuth } from '@/contexts/useAuth';
import { useConfig } from '@/contexts/config';
import { getViewAsUserId } from '@/contexts/view-as';
import { errorLogger } from '@/lib/error-logger';
import { ApiError } from '@/lib/api-error';

export type ApiHeadersOptions = {
  json?: boolean; // include Content-Type: application/json
};

export function useApi() {
  const { getAccessToken, refreshAccessToken, logout } = useAuth();
  const {
    config: { activeOrgId, activeProjectId },
  } = useConfig();

  // Track if we're currently refreshing to avoid multiple refreshes
  const isRefreshingRef = useRef(false);
  // Queue of requests waiting for token refresh
  const refreshPromiseRef = useRef<Promise<boolean> | null>(null);

  const apiBase = useMemo(() => {
    const env = (import.meta as any).env || {};
    // Always return empty string - services add their own /api/v1/xxx paths
    // This goes through Vite dev server proxy which forwards /api/* to backend
    // In production, /api/* is proxied by the web server
    return env.VITE_API_BASE || '';
  }, []);

  const buildHeaders = useCallback(
    (opts: ApiHeadersOptions = {}): Record<string, string> => {
      const h: Record<string, string> = {};
      if (opts.json !== false) h['Content-Type'] = 'application/json';
      const t = getAccessToken?.();
      if (t) h['Authorization'] = `Bearer ${t}`;
      // Note: X-Org-ID removed - backend now derives org ID from project ID automatically
      if (activeProjectId) h['X-Project-ID'] = activeProjectId;
      const viewAsUserId = getViewAsUserId();
      if (viewAsUserId) h['X-View-As-User-ID'] = viewAsUserId;
      return h;
    },
    [getAccessToken, activeProjectId]
  );

  type JsonMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  type FetchJsonInit<B> = {
    method?: JsonMethod;
    body?: B;
    headers?: Record<string, string>;
    credentials?: RequestCredentials;
    // When sending non-JSON (rare), set json to false and stringify yourself.
    json?: boolean;
    // Internal: skip retry on 401 (used for retry attempt)
    _skipRetry?: boolean;
    // Suppress error logging for expected errors (e.g., polling endpoints that return 404)
    suppressErrorLog?: boolean;
  };

  const fetchJson = useCallback(
    async <T, B = unknown>(
      url: string,
      init: FetchJsonInit<B> = {}
    ): Promise<T> => {
      const {
        method = 'GET',
        body,
        headers,
        credentials,
        json,
        _skipRetry,
        suppressErrorLog,
      } = init;

      try {
        const res = await fetch(url, {
          method,
          headers: {
            ...buildHeaders({ json: json !== false }),
            ...(headers || {}),
          },
          body:
            typeof body === 'undefined'
              ? undefined
              : json === false
              ? (body as unknown as BodyInit)
              : JSON.stringify(body as unknown),
          credentials,
        });

        if (!res.ok) {
          // Handle 401 Unauthorized - attempt token refresh and retry
          if (res.status === 401 && !_skipRetry) {
            console.log('[useApi] 401 received, attempting token refresh');

            // Use a shared promise for concurrent 401s
            if (!refreshPromiseRef.current) {
              refreshPromiseRef.current = refreshAccessToken();
            }

            try {
              const refreshed = await refreshPromiseRef.current;
              refreshPromiseRef.current = null;

              if (refreshed) {
                console.log('[useApi] Token refreshed, retrying request');
                // Retry the request with new token
                return fetchJson<T, B>(url, { ...init, _skipRetry: true });
              } else {
                console.log('[useApi] Token refresh failed, logging out');
                logout();
              }
            } catch (e) {
              console.error('[useApi] Token refresh error', e);
              refreshPromiseRef.current = null;
              logout();
            }
          }

          // Robust error extraction supporting nested { error: { code, message, details } }
          let message = `Request failed (${res.status})`;
          let responseData: unknown;

          // Special handling for 500 errors
          if (res.status === 500) {
            message =
              'Server error. Please try again later or contact support if the issue persists.';
          }

          try {
            const j = await res.json();
            responseData = j;
            // Shapes we handle:
            // 1. { error: "string" }
            // 2. { message: "string" }
            // 3. { error: { message, code, details } }
            // 4. { error: { details: { field: [..] } } }
            const nested = (j as any).error;
            if (typeof nested === 'string') {
              message = nested;
            } else if (nested && typeof nested === 'object') {
              if (nested.message) message = nested.message;
              // Append first field validation message if generic message present
              if (nested.details && typeof nested.details === 'object') {
                const firstKey = Object.keys(nested.details)[0];
                const arr = firstKey ? nested.details[firstKey] : undefined;
                if (Array.isArray(arr) && arr.length > 0) {
                  // Avoid duplicating identical message
                  if (
                    !message ||
                    message.toLowerCase().includes('validation')
                  ) {
                    message = arr[0];
                  } else {
                    message = `${message}: ${arr[0]}`;
                  }
                }
              }
              if (!message && nested.code) message = nested.code;
            } else if ((j as any).message) {
              message = (j as any).message;
            }

            // For 500 errors, preserve user-friendly message if server didn't provide one
            if (
              res.status === 500 &&
              (!message || message === `Request failed (${res.status})`)
            ) {
              message =
                'Server error. Please try again later or contact support if the issue persists.';
            }

            if (message && typeof message !== 'string') {
              message = JSON.stringify(message);
            }
          } catch {
            try {
              const txt = await res.text();
              if (txt) {
                // For 500 errors, don't expose raw error text to users
                if (res.status === 500) {
                  message =
                    'Server error. Please try again later or contact support if the issue persists.';
                  responseData = txt;
                } else {
                  message = txt;
                  responseData = txt;
                }
              }
            } catch {
              // ignore
            }
          }

          // Log API errors (unless suppressed for expected errors like polling 404s)
          if (!suppressErrorLog) {
            errorLogger.logApiError(url, method, res.status, responseData);
          }

          throw new ApiError(
            message || `Request failed (${res.status})`,
            res.status,
            responseData
          );
        }
        // If no content
        if (res.status === 204) return undefined as unknown as T;
        const data = (await res.json()) as T;
        return data;
      } catch (error) {
        // Log network errors
        if (
          error instanceof Error &&
          !error.message.includes('Request failed')
        ) {
          errorLogger.logNetworkError(url, method, error);
        }
        throw error;
      }
    },
    [buildHeaders, refreshAccessToken, logout]
  );

  const fetchForm = useCallback(
    async <T>(
      url: string,
      formData: FormData,
      init?: {
        method?: Exclude<JsonMethod, 'GET'>;
        headers?: Record<string, string>;
        credentials?: RequestCredentials;
      }
    ): Promise<T> => {
      const res = await fetch(url, {
        method: init?.method || 'POST',
        // Don't set Content-Type for FormData; browser will set proper boundary
        headers: { ...buildHeaders({ json: false }), ...(init?.headers || {}) },
        body: formData,
        credentials: init?.credentials,
      });
      if (!res.ok) {
        let message = `Request failed (${res.status})`;
        let responseData: unknown;
        try {
          const j = await res.json();
          responseData = j;
          // Handle nested error structures like { error: { message, code } }
          const nested = (j as any).error;
          if (typeof nested === 'string') {
            message = nested;
          } else if (nested && typeof nested === 'object') {
            // Extract message from nested error object
            if (nested.message) message = nested.message;
            else if (nested.code) message = nested.code;
          } else if ((j as any).message) {
            message = (j as any).message;
          }
          // Ensure message is a string
          if (message && typeof message !== 'string') {
            message = JSON.stringify(message);
          }
        } catch {
          try {
            const txt = await res.text();
            responseData = txt;
            message = txt || message;
          } catch {
            // ignore
          }
        }
        throw new ApiError(message, res.status, responseData);
      }
      // Some form endpoints may return JSON or nothing; attempt JSON, fallback to undefined
      try {
        return (await res.json()) as T;
      } catch {
        return undefined as unknown as T;
      }
    },
    [buildHeaders]
  );

  return { apiBase, buildHeaders, fetchJson, fetchForm } as const;
}
