import { useCallback, useEffect, useState } from "react";
import { useApi } from "@/hooks/use-api";

export type Organization = {
    id: string;
    name: string;
    slug?: string;
};

type OrgsResponse = { orgs: Organization[] };

export function useOrganizations() {
    const { apiBase, fetchJson } = useApi();
    const [orgs, setOrgs] = useState<Organization[] | undefined>(undefined);
    const [loading, setLoading] = useState<boolean>(false);
    const [error, setError] = useState<string | undefined>(undefined);

    const refresh = useCallback(async () => {
        setLoading(true);
        setError(undefined);
        try {
            const data = await fetchJson<OrgsResponse>(`${apiBase}/orgs`, { credentials: "include" });
            setOrgs(Array.isArray(data.orgs) ? data.orgs : []);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Unknown error");
        } finally {
            setLoading(false);
        }
    }, [apiBase, fetchJson]);

    const createOrg = useCallback(
        async (name: string): Promise<Organization> => {
            const data = await fetchJson<Organization, { name: string }>(`${apiBase}/orgs`, {
                method: "POST",
                body: { name },
                credentials: "include",
            });
            // Optimistically add to list
            setOrgs((prev) => (prev ? [data, ...prev] : [data]));
            return data;
        },
        [apiBase, fetchJson],
    );

    useEffect(() => {
        // Eager load once mounted
        refresh().catch(() => void 0);
    }, [refresh]);

    return { orgs, loading, error, refresh, createOrg } as const;
}
