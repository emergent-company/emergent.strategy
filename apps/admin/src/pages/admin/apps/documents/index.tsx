import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/contexts/auth";
import { useApi } from "@/hooks/use-api";
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
    const { getAccessToken } = useAuth();
    const { buildHeaders, apiBase, fetchJson, fetchForm } = useApi();
    const [data, setData] = useState<DocumentRow[] | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [uploadError, setUploadError] = useState<string | null>(null);
    const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);
    const [uploading, setUploading] = useState<boolean>(false);
    const [dragOver, setDragOver] = useState<boolean>(false);
    const fileInputRef = useRef<HTMLInputElement | null>(null);

    const apiBaseMemo = useMemo(() => apiBase, [apiBase]);

    useEffect(() => {
        let cancelled = false;
        async function load() {
            setLoading(true);
            try {
                const t = getAccessToken();
                const json = await fetchJson<{ documents: DocumentRow[] }>(`${apiBase}/documents`, {
                    headers: t ? { ...buildHeaders({ json: false }) } : {},
                    json: false,
                });
                if (!cancelled) setData(json.documents);
            } catch (e: unknown) {
                const msg = e instanceof Error ? e.message : "Failed to load";
                if (!cancelled) setError(msg);
            } finally {
                if (!cancelled) setLoading(false);
            }
        }
        load();
        return () => {
            cancelled = true;
        };
    }, [apiBase, apiBaseMemo, getAccessToken, buildHeaders, fetchJson]);

    const acceptedMimeTypes = useMemo(
        () => [
            "application/pdf",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document", // .docx
            "application/vnd.openxmlformats-officedocument.presentationml.presentation", // .pptx
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", // .xlsx
            "text/plain",
            "text/markdown",
            "text/html",
        ],
        []
    );

    const acceptedExtensions = useMemo(() => [".pdf", ".docx", ".pptx", ".xlsx", ".txt", ".md", ".html", ".htm"], []);

    function isAccepted(file: File): boolean {
        const byMime = file.type ? acceptedMimeTypes.includes(file.type) : true; // Some browsers may not set type reliably (e.g., .md)
        const name = file.name.toLowerCase();
        const byExt = acceptedExtensions.some((ext) => name.endsWith(ext));
        return byMime || byExt;
    }

    async function handleUpload(file: File): Promise<void> {
        setUploadError(null);
        setUploadSuccess(null);
        if (!isAccepted(file)) {
            setUploadError("Unsupported file type. Allowed: pdf, docx, pptx, xlsx, md, html, txt.");
            return;
        }
        const max = 10 * 1024 * 1024; // 10MB
        if (file.size > max) {
            setUploadError("File is larger than 10MB limit.");
            return;
        }
        setUploading(true);
        try {
            const fd = new FormData();
            fd.append("file", file);
            const t = getAccessToken();
            await fetchForm<void>(`${apiBase}/ingest/upload`, fd, { method: "POST", headers: t ? buildHeaders({ json: false }) : {} });
            setUploadSuccess("Upload successful. Refreshing list...");
            // Reload documents
            try {
                const t2 = getAccessToken();
                const json = await fetchJson<{ documents: DocumentRow[] }>(`${apiBase}/documents`, {
                    headers: t2 ? { ...buildHeaders({ json: false }) } : {},
                    json: false,
                });
                setData(json.documents);
            } catch (e: unknown) {
                const msg = e instanceof Error ? e.message : "Failed to refresh list";
                setError(msg);
            }
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : "Upload failed";
            setUploadError(msg);
        } finally {
            setUploading(false);
        }
    }

    function onFileInputChange(e: React.ChangeEvent<HTMLInputElement>): void {
        const f = e.target.files?.[0];
        if (f) void handleUpload(f);
        // reset input so selecting the same file again re-triggers change
        if (fileInputRef.current) fileInputRef.current.value = "";
    }

    function onDrop(e: React.DragEvent<HTMLDivElement>): void {
        e.preventDefault();
        e.stopPropagation();
        setDragOver(false);
        const f = e.dataTransfer.files?.[0];
        if (f) void handleUpload(f);
    }

    function onDragOver(e: React.DragEvent<HTMLDivElement>): void {
        e.preventDefault();
        e.stopPropagation();
        setDragOver(true);
    }

    function onDragLeave(e: React.DragEvent<HTMLDivElement>): void {
        e.preventDefault();
        e.stopPropagation();
        setDragOver(false);
    }

    function openChooser(): void {
        fileInputRef.current?.click();
    }

    return (
        <div className="mx-auto p-4 container">
            <PageTitle title="Documents" items={[{ label: "Apps" }, { label: "Documents", active: true }]} />

            {/* Upload controls */}
            <div
                className={
                    "mt-4 border-2 border-dashed rounded-box p-6 transition-colors " +
                    (dragOver ? "border-primary bg-primary/5" : "border-base-300 bg-base-200/50")
                }
                onDragOver={onDragOver}
                onDragEnter={onDragOver}
                onDragLeave={onDragLeave}
                onDrop={onDrop}
                role="button"
                aria-label="Upload document. Click to choose a file or drag and drop."
                tabIndex={0}
                onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        openChooser();
                    }
                }}
            >
                <div className="flex justify-between items-center gap-4">
                    <div className="flex items-center gap-3">
                        <span className="size-6 iconify lucide--upload-cloud" aria-hidden="true" />
                        <div>
                            <div className="font-medium">Click to upload or drag & drop</div>
                            <div className="opacity-70 text-sm">
                                Accepted: pdf, docx, pptx, xlsx, md, html, txt. Max 10MB.
                            </div>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <button className="btn btn-primary" onClick={openChooser} disabled={uploading}>
                            {uploading ? (
                                <>
                                    <span className="loading loading-spinner loading-sm" />
                                    Uploading...
                                </>
                            ) : (
                                "Upload document"
                            )}
                        </button>
                        <input
                            ref={fileInputRef}
                            type="file"
                            className="hidden"
                            accept={[
                                ...acceptedMimeTypes,
                                ...acceptedExtensions,
                            ].join(",")}
                            onChange={onFileInputChange}
                        />
                    </div>
                </div>
                {uploadError && (
                    <div role="alert" className="mt-4 alert alert-error">
                        <span className="size-5 iconify lucide--alert-circle" />
                        <span>{uploadError}</span>
                    </div>
                )}
                {uploadSuccess && (
                    <div role="alert" className="mt-4 alert alert-success">
                        <span className="size-5 iconify lucide--check-circle" />
                        <span>{uploadSuccess}</span>
                    </div>
                )}
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
