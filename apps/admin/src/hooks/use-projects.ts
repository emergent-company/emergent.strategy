import { useCallback, useEffect, useMemo, useState } from "react";
import { normalizeOrgId, orgIdsMatch } from "@/utils/org-id";

import { useConfig } from "@/contexts/config";
import { useApi } from "@/hooks/use-api";

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
        duplicate_strategy?: 'skip' | 'merge';
        require_review?: boolean;
        notify_on_complete?: boolean;
        notification_channels?: string[];
    };
};

type CreateProjectPayload = {
    name: string;
    orgId: string;
};

export const useProjects = () => {
    const { config: { activeOrgId: rawActiveOrgId } } = useConfig();
    const activeOrgId = normalizeOrgId(rawActiveOrgId);
    const { apiBase, fetchJson, buildHeaders } = useApi();

    const [projects, setProjects] = useState<Project[] | undefined>(undefined);
    const [loading, setLoading] = useState<boolean>(true); // Start as true to prevent guards from checking before first load
    const [error, setError] = useState<string | undefined>(undefined);

    const headers = useMemo(() => buildHeaders({ json: true }), [buildHeaders]);

    const fetchProjects = useCallback(async () => {
        console.log('[useProjects] fetchProjects() called, activeOrgId:', activeOrgId);
        if (!activeOrgId) {
            console.log('[useProjects] No activeOrgId, setting empty projects');
            setProjects([]);
            setError(undefined);
            setLoading(false); // No org selected, so we're "done loading" (with empty result)
            return;
        }
        try {
            setLoading(true);
            setError(undefined);
            // If orgId looks like a UUID, fetch filtered from server, else fetch all and let future logic adjust.
            const uuidRegex = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
            let data: Project[] = [];
            if (uuidRegex.test(activeOrgId)) {
                const url = `${apiBase}/api/projects?limit=500&orgId=${encodeURIComponent(activeOrgId)}`;
                console.log('[useProjects] Fetching filtered projects from:', url);
                data = await fetchJson<Project[]>(url, { credentials: "include", headers, method: "GET", json: false });
            } else {
                // fallback: fetch global list
                const url = `${apiBase}/api/projects?limit=500`;
                console.log('[useProjects] Fetching all projects from:', url);
                data = await fetchJson<Project[]>(url, { credentials: "include", headers, method: "GET", json: false });
            }
            console.log('[useProjects] Response:', data.length, 'projects');
            // Normalize project orgId fields for consistent comparisons
            const normalized = data.map(p => ({ ...p, orgId: p.orgId ? normalizeOrgId(p.orgId) : p.orgId }));
            setProjects(normalized);
        } catch (e) {
            console.error('[useProjects] Error:', e);
            setError((e as Error).message || "Failed to load projects");
        } finally {
            setLoading(false);
        }
    }, [activeOrgId, headers, apiBase, fetchJson]);

    useEffect(() => {
        void fetchProjects();
    }, [fetchProjects]);

    const refresh = useCallback(async () => {
        await fetchProjects();
    }, [fetchProjects]);

    const createProject = useCallback(
        async (name: string): Promise<Project> => {
            if (!activeOrgId) throw new Error("No active organization");
            // Always send orgId; backend will validate existence. If it's not a UUID (legacy slug), backend will likely fallback or reject; client will handle error.
            const body: CreateProjectPayload = { name, orgId: activeOrgId };
            if ((import.meta as any).env?.DEV) {
                // Debug log to verify payload actually includes name/orgId before sending
                console.debug("[createProject] payload", body);
            }
            const created = await fetchJson<Project, CreateProjectPayload>(`${apiBase}/api/projects`, {
                method: "POST",
                body,
                credentials: "include",
            });
            // refresh list in background; ignore errors
            void refresh();
            return created;
        },
        [activeOrgId, refresh, apiBase, fetchJson],
    );

    return { projects, loading, error, refresh, createProject } as const;
};
