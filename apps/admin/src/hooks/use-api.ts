import { useMemo, useCallback } from "react";
import { useAuth } from "@/contexts/auth";
import { useConfig } from "@/contexts/config";

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
        return env.VITE_API_BASE || `${window.location.protocol}//${window.location.hostname}:3001`;
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
            const res = await fetch(url, {
                method,
                headers: { ...buildHeaders({ json: json !== false }), ...(headers || {}) },
                body: typeof body === "undefined" ? undefined : json === false ? (body as unknown as BodyInit) : JSON.stringify(body as unknown),
                credentials,
            });
            if (!res.ok) {
                // Try to parse standard error shape; fallback to text/status
                let message = `Request failed (${res.status})`;
                try {
                    const j = (await res.json()) as { error?: string; message?: string };
                    message = j.error || j.message || message;
                } catch {
                    try {
                        message = (await res.text()) || message;
                    } catch {
                        // ignore
                    }
                }
                throw new Error(message);
            }
            // If no content
            if (res.status === 204) return undefined as unknown as T;
            const data = (await res.json()) as T;
            return data;
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
                    const j = (await res.json()) as { error?: string; message?: string };
                    message = j.error || j.message || message;
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
