import { useEffect, useMemo, useState } from "react";
import { PageTitle } from "@/components/PageTitle";
import { LoadingEffect } from "@/components/LoadingEffect";
import { TableEmptyState } from "@/components/TableEmptyState";

type DocumentRow = {
    id: string;
    source_url: string | null;
    filename: string | null;
    mime_type: string | null;
    created_at: string;
    updated_at: string;
    chunks: number;
};

export default function DocumentsPage() {
    const [data, setData] = useState<DocumentRow[] | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);

    const apiBase = useMemo(() => {
        const env = (import.meta as any).env || {};
        // Prefer explicit override; else default to common dev port 3001
        return env.VITE_API_BASE || `${window.location.protocol}//${window.location.hostname}:3001`;
    }, []);

    useEffect(() => {
        let cancelled = false;
        async function load() {
            setLoading(true);
            try {
                const res = await fetch(`${apiBase}/documents`);
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                const json = await res.json();
                if (!cancelled) setData(json.documents as DocumentRow[]);
            } catch (e: any) {
                if (!cancelled) setError(e.message || "Failed to load");
            } finally {
                if (!cancelled) setLoading(false);
            }
        }
        load();
        return () => {
            cancelled = true;
        };
    }, [apiBase]);

    return (
        <div className="mx-auto p-4 container">
            <PageTitle title="Documents" items={[{ label: "Apps" }, { label: "Documents", active: true }]} />

            <div className="mt-4 card">
                <div className="card-body">
                    {loading && (
                        <div className="space-y-2">
                            <LoadingEffect height={36} />
                            <LoadingEffect height={36} />
                            <LoadingEffect height={36} />
                        </div>
                    )}
                    {error && (
                        <div role="alert" className="alert alert-error">
                            <span className="size-5 iconify lucide--alert-circle" />
                            <span>{error}</span>
                        </div>
                    )}
                    {!loading && !error && (
                        <div className="overflow-x-auto">
                            <table className="table">
                                <thead>
                                    <tr>
                                        <th>Filename</th>
                                        <th>Source URL</th>
                                        <th>Mime</th>
                                        <th>Chunks</th>
                                        <th>Created</th>
                                        <th></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {data && data.length > 0 ? (
                                        data.map((d) => (
                                            <tr key={d.id}>
                                                <td className="font-medium">{d.filename || "(uploaded)"}</td>
                                                <td className="max-w-96 truncate">
                                                    {d.source_url ? (
                                                        <a href={d.source_url} target="_blank" className="link" rel="noreferrer">
                                                            {d.source_url}
                                                        </a>
                                                    ) : (
                                                        <span className="opacity-60">—</span>
                                                    )}
                                                </td>
                                                <td>{d.mime_type || "text/plain"}</td>
                                                <td>
                                                    <a
                                                        href={`/admin/apps/chunks?docId=${d.id}`}
                                                        className="badge-outline hover:underline no-underline badge"
                                                        title="View chunks for this document"
                                                    >
                                                        {d.chunks}
                                                    </a>
                                                </td>
                                                <td>{new Date(d.created_at).toLocaleString()}</td>
                                                <td className="text-right">
                                                    <a className="btn btn-sm" href={`/admin/apps/chunks?docId=${d.id}`}>
                                                        View chunks
                                                    </a>
                                                </td>
                                            </tr>
                                        ))
                                    ) : (
                                        <TableEmptyState colSpan={6} />
                                    )}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
