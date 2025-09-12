import { useCallback, useEffect, useState } from "react";
import { normalizeOrgId } from "@/utils/org-id";
import { useApi } from "@/hooks/use-api";

export type Organization = {
    id: string;
    name: string;
    slug?: string;
};

// API currently returns a plain array (OrgDto[]) from GET /orgs. Accept legacy shape { orgs: [...] } as well.
type OrgsResponseFlexible = Organization[] | { orgs: Organization[] };

export function useOrganizations() {
    const { apiBase, fetchJson } = useApi();
    const [orgs, setOrgs] = useState<Organization[] | undefined>(undefined);
    const [loading, setLoading] = useState<boolean>(false);
    const [error, setError] = useState<string | undefined>(undefined);

    const refresh = useCallback(async () => {
        setLoading(true);
        setError(undefined);
        try {
            const data = await fetchJson<OrgsResponseFlexible>(`${apiBase}/orgs`, { credentials: "include" });
            const rawList: Organization[] = Array.isArray(data)
                ? data
                : Array.isArray((data as any)?.orgs)
                    ? (data as any).orgs
                    : [];
            const list = rawList.map(o => ({ ...o, id: normalizeOrgId(o.id) || o.id }));
            setOrgs(list);
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
            setOrgs((prev) => (prev ? [{ ...data, id: normalizeOrgId(data.id) || data.id }, ...prev] : [{ ...data, id: normalizeOrgId(data.id) || data.id }]));
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
