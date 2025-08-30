import { useCallback, useEffect, useMemo, useState } from "react";

import { useConfig } from "@/contexts/config";
import { useApi } from "@/hooks/use-api";

export type Project = {
    id: string;
    name: string;
    status?: string;
    createdAt?: string;
};

type CreateProjectPayload = {
    name: string;
    orgId: string;
};

export const useProjects = () => {
    const {
        config: { activeOrgId },
    } = useConfig();
    const { apiBase, fetchJson, buildHeaders } = useApi();

    const [projects, setProjects] = useState<Project[] | undefined>(undefined);
    const [loading, setLoading] = useState<boolean>(false);
    const [error, setError] = useState<string | undefined>(undefined);

    const headers = useMemo(() => buildHeaders({ json: true }), [buildHeaders]);

    const fetchProjects = useCallback(async () => {
        if (!activeOrgId) {
            setProjects([]);
            setError(undefined);
            return;
        }
        try {
            setLoading(true);
            setError(undefined);
            const data = await fetchJson<Project[]>(
                `${apiBase}/orgs/${encodeURIComponent(activeOrgId)}/projects`,
                { credentials: "include", headers, method: "GET", json: false },
            );
            setProjects(data);
        } catch (e) {
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
            const body: CreateProjectPayload = { name, orgId: activeOrgId };
            const created = await fetchJson<Project, CreateProjectPayload>(`${apiBase}/projects`, {
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
