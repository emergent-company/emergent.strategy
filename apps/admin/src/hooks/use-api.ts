import { useMemo, useCallback } from "react";
import { useAuth } from "@/contexts/auth";
import { useConfig } from "@/contexts/config";
import { errorLogger } from "@/lib/error-logger";

export type ApiHeadersOptions = {
    json?: boolean; // include Content-Type: application/json
};

export function useApi() {
    const { getAccessToken } = useAuth();
    const {
        config: { activeOrgId, activeProjectId },
    } = useConfig();

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
            if (opts.json !== false) h["Content-Type"] = "application/json";
            const t = getAccessToken?.();
            if (t) h["Authorization"] = `Bearer ${t}`;
            if (activeOrgId) h["X-Org-ID"] = activeOrgId;
            if (activeProjectId) h["X-Project-ID"] = activeProjectId;
            return h;
        },
        [getAccessToken, activeOrgId, activeProjectId]
    );

    type JsonMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
    type FetchJsonInit<B> = {
        method?: JsonMethod;
        body?: B;
        headers?: Record<string, string>;
        credentials?: RequestCredentials;
        // When sending non-JSON (rare), set json to false and stringify yourself.
        json?: boolean;
    };

    const fetchJson = useCallback(
        async <T, B = unknown>(url: string, init: FetchJsonInit<B> = {}): Promise<T> => {
            const { method = "GET", body, headers, credentials, json } = init;

            try {
                const res = await fetch(url, {
                    method,
                    headers: { ...buildHeaders({ json: json !== false }), ...(headers || {}) },
                    body: typeof body === "undefined" ? undefined : json === false ? (body as unknown as BodyInit) : JSON.stringify(body as unknown),
                    credentials,
                });

                if (!res.ok) {
                    // Robust error extraction supporting nested { error: { code, message, details } }
                    let message = `Request failed (${res.status})`;
                    let responseData: unknown;
                    try {
                        const j = await res.json();
                        responseData = j;
                        // Shapes we handle:
                        // 1. { error: "string" }
                        // 2. { message: "string" }
                        // 3. { error: { message, code, details } }
                        // 4. { error: { details: { field: [..] } } }
                        const nested = (j as any).error;
                        if (typeof nested === "string") {
                            message = nested;
                        } else if (nested && typeof nested === "object") {
                            if (nested.message) message = nested.message;
                            // Append first field validation message if generic message present
                            if (nested.details && typeof nested.details === "object") {
                                const firstKey = Object.keys(nested.details)[0];
                                const arr = firstKey ? nested.details[firstKey] : undefined;
                                if (Array.isArray(arr) && arr.length > 0) {
                                    // Avoid duplicating identical message
                                    if (!message || message.toLowerCase().includes("validation")) {
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
                        if (message && typeof message !== "string") {
                            message = JSON.stringify(message);
                        }
                    } catch {
                        try {
                            const txt = await res.text();
                            if (txt) {
                                message = txt;
                                responseData = txt;
                            }
                        } catch {
                            // ignore
                        }
                    }

                    // Log API errors
                    errorLogger.logApiError(url, method, res.status, responseData);

                    throw new Error(message || `Request failed (${res.status})`);
                }
                // If no content
                if (res.status === 204) return undefined as unknown as T;
                const data = (await res.json()) as T;
                return data;
            } catch (error) {
                // Log network errors
                if (error instanceof Error && !error.message.includes('Request failed')) {
                    errorLogger.logNetworkError(url, method, error);
                }
                throw error;
            }
        },
        [buildHeaders]
    );

    const fetchForm = useCallback(
        async <T>(url: string, formData: FormData, init?: { method?: Exclude<JsonMethod, "GET">; headers?: Record<string, string>; credentials?: RequestCredentials }): Promise<T> => {
            const res = await fetch(url, {
                method: init?.method || "POST",
                // Don't set Content-Type for FormData; browser will set proper boundary
                headers: { ...buildHeaders({ json: false }), ...(init?.headers || {}) },
                body: formData,
                credentials: init?.credentials,
            });
            if (!res.ok) {
                let message = `Request failed (${res.status})`;
                try {
                    const j = await res.json();
                    // Handle nested error structures like { error: { message, code } }
                    const nested = (j as any).error;
                    if (typeof nested === "string") {
                        message = nested;
                    } else if (nested && typeof nested === "object") {
                        // Extract message from nested error object
                        if (nested.message) message = nested.message;
                        else if (nested.code) message = nested.code;
                    } else if ((j as any).message) {
                        message = (j as any).message;
                    }
                    // Ensure message is a string
                    if (message && typeof message !== "string") {
                        message = JSON.stringify(message);
                    }
                } catch {
                    try {
                        message = (await res.text()) || message;
                    } catch {
                        // ignore
                    }
                }
                throw new Error(message);
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
