import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/contexts/auth";
import { useApi } from "@/hooks/use-api";
import { useSearchParams } from "react-router";
import { PageTitle } from "@/components";
import { LoadingEffect, TableEmptyState } from "@/components";
import { Icon } from "@/components/atoms/Icon";

interface ChunkRow {
    id: string;
    document_id: string;
    document_title: string;
    source_url: string | null;
    chunk_index: number;
    created_at: string;
    text: string;
}

interface ChunksResponse {
    items: ChunkRow[];
    page: number;
    pageSize: number;
    total: number;
}

interface DocumentRow {
    id: string;
    filename?: string | null;
    name?: string | null;
    source_url?: string | null;
    sourceUrl?: string | null;
}

function normalizeDoc(d: DocumentRow) {
    return {
        ...d,
        filename: d.filename || d.name || null,
        source_url: d.source_url ?? d.sourceUrl ?? null,
    } as DocumentRow;
}

export default function ChunksPage() {
    const { getAccessToken } = useAuth();
    const { buildHeaders, apiBase, fetchJson } = useApi();
    const [searchParams, setSearchParams] = useSearchParams();
    const [data, setData] = useState<ChunksResponse | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState<boolean>(true);
    const [preview, setPreview] = useState<ChunkRow | null>(null);
    const [docs, setDocs] = useState<DocumentRow[]>([]);

    const apiBaseMemo = useMemo(() => apiBase, [apiBase]);

    const page = Math.max(1, Number(searchParams.get("page") || 1));
    const pageSize = Math.min(100, Math.max(1, Number(searchParams.get("pageSize") || 25)));
    const q = (searchParams.get("q") || "").trim();
    const docId = (searchParams.get("docId") || "").trim();
    const sort = (searchParams.get("sort") || "created_at:desc").trim();

    // derive search terms for highlighting
    const terms = useMemo(() => {
        if (!q) return [] as string[];
        const ops = new Set(["and", "or", "not"]);
        // extract quoted phrases first
        const quoted: string[] = [];
        q.replace(/"([^"]+)"/g, (_m, p1) => {
            quoted.push(p1);
            return "";
        });
        // words excluding operators and very short tokens
        const words = q
            .replace(/"[^"]+"/g, " ")
            .split(/[^\p{L}\p{N}_]+/u)
            .filter((w) => !!w && !ops.has(w.toLowerCase()) && w.length > 1);
        const all = [...quoted, ...words];
        // dedupe
        return Array.from(new Set(all)).slice(0, 10);
    }, [q]);

    // Load documents for dropdown
    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const t = getAccessToken();
                const json = await fetchJson<DocumentRow[] | { documents: DocumentRow[] }>(`${apiBase}/api/documents`, {
                    headers: t ? { ...buildHeaders({ json: false }) } : {},
                    json: false,
                });
                if (!cancelled) setDocs((Array.isArray(json) ? json : (json.documents || [])).map(normalizeDoc));
            } catch {
                // ignore optional
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [apiBase, apiBaseMemo, getAccessToken, buildHeaders, fetchJson]);

    useEffect(() => {
        let cancelled = false;
        async function load() {
            setLoading(true);
            setError(null);
            try {
                const qs = new URLSearchParams();
                if (docId) qs.set("docId", docId);
                if (q) qs.set("q", q);
                qs.set("page", String(page));
                qs.set("pageSize", String(pageSize));
                if (sort) qs.set("sort", sort);
                const t = getAccessToken();
                // Accept both unified paginated shape and legacy/alternate array responses
                const json = await fetchJson<any>(`${apiBase}/api/chunks?${qs.toString()}`, {
                    headers: t ? { ...buildHeaders({ json: false }) } : {},
                    json: false,
                });
                if (!cancelled) {
                    let next: ChunksResponse | null = null;
                    if (Array.isArray(json)) {
                        // Legacy simple array (e.g. Nest chunks list). Map to expected richer shape with fallbacks.
                        const mapped: ChunkRow[] = json.map((c: any): ChunkRow => ({
                            id: String(c.id),
                            document_id: c.document_id || c.documentId || 'unknown',
                            document_title: c.document_title || c.documentTitle || c.filename || c.source_url || c.sourceUrl || c.document_id || c.documentId || 'document',
                            source_url: c.source_url || c.sourceUrl || null,
                            chunk_index: typeof c.chunk_index === 'number' ? c.chunk_index : (typeof c.index === 'number' ? c.index : 0),
                            created_at: c.created_at || c.createdAt || new Date().toISOString(),
                            text: c.text || '',
                        }));
                        next = { items: mapped, page: 1, pageSize: mapped.length || pageSize, total: mapped.length };
                    } else if (json && typeof json === 'object' && Array.isArray(json.items)) {
                        // Canonical paginated shape
                        const items: ChunkRow[] = json.items.map((c: any): ChunkRow => ({
                            id: String(c.id),
                            document_id: c.document_id || c.documentId || 'unknown',
                            document_title: c.document_title || c.documentTitle || c.filename || c.source_url || c.sourceUrl || c.document_id || c.documentId || 'document',
                            source_url: c.source_url || c.sourceUrl || null,
                            chunk_index: typeof c.chunk_index === 'number' ? c.chunk_index : (typeof c.index === 'number' ? c.index : 0),
                            created_at: c.created_at || c.createdAt || new Date().toISOString(),
                            text: c.text || '',
                        }));
                        next = {
                            items,
                            page: Number(json.page) || page,
                            pageSize: Number(json.pageSize) || (items.length || pageSize),
                            total: Number(json.total) || items.length,
                        };
                    }
                    setData(next);
                }
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
    }, [apiBase, apiBaseMemo, page, pageSize, q, docId, sort, getAccessToken, buildHeaders, fetchJson]);

    function updateParam(key: string, value: string) {
        const next = new URLSearchParams(searchParams);
        if (value) next.set(key, value);
        else next.delete(key);
        // reset to first page when filters (other than page) change
        if (key !== "page") next.set("page", "1");
        setSearchParams(next);
    }

    const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

    function escapeRegExp(s: string): string {
        return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    }

    function HighlightedText({ text, terms }: { text: string; terms: string[] }) {
        if (!terms || terms.length === 0) return <>{text}</>;
        const pattern = new RegExp(`(${terms.map(escapeRegExp).join("|")})`, "gi");
        const parts = text.split(pattern);
        return (
            <>
                {parts.map((part, idx) =>
                    pattern.test(part) ? (
                        <mark key={idx} className="bg-warning/30 px-0.5 rounded">
                            {part}
                        </mark>
                    ) : (
                        <span key={idx}>{part}</span>
                    )
                )}
            </>
        );
    }

    return (
        <div data-testid="page-chunks" className="mx-auto p-4 container">
            <PageTitle title="Chunks" items={[{ label: "Apps" }, { label: "Chunks", active: true }]} />

            {/* Filters */}
            <div className="gap-3 grid sm:grid-cols-3 mt-4">
                <label className="input">
                    <span className="label">Document</span>
                    <select
                        className="select"
                        value={docId}
                        onChange={(e) => updateParam("docId", e.target.value)}
                    >
                        <option value="">All documents</option>
                        {docs.map((d) => (
                            <option key={d.id} value={d.id}>
                                {d.filename || d.source_url || d.id}
                            </option>
                        ))}
                    </select>
                </label>
                <label className="sm:col-span-2 input">
                    <span className="label">Search</span>
                    <input
                        className="input"
                        type="search"
                        placeholder="websearch query (AND/OR/quotes)"
                        value={q}
                        onChange={(e) => updateParam("q", e.target.value)}
                    />
                </label>
                <label className="input">
                    <span className="label">Sort</span>
                    <select
                        className="select"
                        value={sort}
                        onChange={(e) => updateParam("sort", e.target.value)}
                    >
                        <option value="created_at:desc">Newest first</option>
                        <option value="created_at:asc">Oldest first</option>
                        <option value="chunk_index:asc">Chunk index ↑</option>
                        <option value="chunk_index:desc">Chunk index ↓</option>
                    </select>
                </label>
                <label className="input">
                    <span className="label">Page size</span>
                    <select
                        className="select"
                        value={String(pageSize)}
                        onChange={(e) => updateParam("pageSize", e.target.value)}
                    >
                        <option value="10">10</option>
                        <option value="25">25</option>
                        <option value="50">50</option>
                        <option value="100">100</option>
                    </select>
                </label>
            </div>

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
                                        <th>Doc</th>
                                        <th>Index</th>
                                        <th>Snippet</th>
                                        <th>Created</th>
                                        <th></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {data && data.items.length > 0 ? (
                                        data.items.map((c) => (
                                            <tr key={c.id}>
                                                <td className="max-w-80 truncate">
                                                    {c.source_url ? (
                                                        c.source_url.includes('clickup.com') || c.source_url.includes('app.clickup.com') ? (
                                                            <div className="flex items-center gap-2">
                                                                <span className="font-medium">{c.document_title}</span>
                                                                <a
                                                                    href={c.source_url}
                                                                    target="_blank"
                                                                    rel="noreferrer"
                                                                    className="inline-flex items-center gap-1 text-sm transition-colors link hover:link-primary"
                                                                    title={c.source_url}
                                                                >
                                                                    <Icon icon="simple-icons--clickup" className="w-3.5 h-3.5 text-purple-500" />
                                                                    <span>Link</span>
                                                                </a>
                                                            </div>
                                                        ) : (
                                                            <a
                                                                href={c.source_url}
                                                                target="_blank"
                                                                className="link"
                                                                rel="noreferrer"
                                                                title={c.source_url}
                                                            >
                                                                {c.document_title}
                                                            </a>
                                                        )
                                                    ) : (
                                                        <span className="font-medium">{c.document_title}</span>
                                                    )}
                                                </td>
                                                <td className="w-24">{c.chunk_index}</td>
                                                <td className="max-w-xl truncate">
                                                    <HighlightedText text={c.text} terms={terms} />
                                                </td>
                                                <td className="whitespace-nowrap">{new Date(c.created_at).toLocaleString()}</td>
                                                <td className="text-right">
                                                    <button className="btn btn-sm" onClick={() => setPreview(c)}>
                                                        Preview
                                                    </button>
                                                </td>
                                            </tr>
                                        ))
                                    ) : (
                                        <TableEmptyState colSpan={5} />
                                    )}
                                </tbody>
                            </table>
                        </div>
                    )}

                    {/* Pagination */}
                    {!loading && !error && data && data.total > 0 && (
                        <div className="flex justify-between items-center mt-4">
                            <div className="opacity-70">
                                Page {data.page} of {totalPages} • {data.total} results
                            </div>
                            <div className="join">
                                <button
                                    className="btn btn-sm join-item"
                                    disabled={page <= 1}
                                    onClick={() => updateParam("page", String(page - 1))}
                                >
                                    Prev
                                </button>
                                <button
                                    className="btn btn-sm join-item"
                                    disabled={page >= totalPages}
                                    onClick={() => updateParam("page", String(page + 1))}
                                >
                                    Next
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Preview modal */}
            {preview && (
                <dialog className="modal" open>
                    <div className="max-w-3xl modal-box">
                        <h3 className="card-title">{preview.document_title}</h3>
                        <div className="opacity-70 mt-2 text-sm">Chunk #{preview.chunk_index}</div>
                        <pre className="mt-4 text-sm whitespace-pre-wrap">
                            <HighlightedText text={preview.text} terms={terms} />
                        </pre>
                        <div className="modal-action">
                            <button className="btn" onClick={() => setPreview(null)}>
                                Close
                            </button>
                        </div>
                    </div>
                    <form method="dialog" className="modal-backdrop" onSubmit={() => setPreview(null)}>
                        <button>close</button>
                    </form>
                </dialog>
            )}
        </div>
    );
}
