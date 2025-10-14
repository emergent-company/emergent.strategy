import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { Icon } from "@/components/atoms/Icon";
import { useAuth } from "@/contexts/auth";
import { useApi } from "@/hooks/use-api";
import { PageTitle } from "@/components";
import { useConfig } from "@/contexts/config";
import { LoadingEffect, TableEmptyState } from "@/components";
import { OrgAndProjectGate } from "@/components/organisms/OrgAndProjectGate";
import { ExtractionConfigModal, type ExtractionConfig } from "@/components/organisms/ExtractionConfigModal";
import { createExtractionJobsClient } from "@/api/extraction-jobs";

type DocumentRow = {
    id: string;
    // Original (legacy snake_case) fields
    source_url?: string | null;
    filename?: string | null;
    mime_type?: string | null;
    created_at?: string;
    updated_at?: string;
    // New camelCase fields from Nest server
    name?: string | null;
    sourceUrl?: string | null;
    mimeType?: string | null;
    createdAt?: string;
    updatedAt?: string;
    chunks: number;
};

function normalize(doc: DocumentRow) {
    const filename = doc.filename || doc.name || null;
    const sourceUrl = doc.source_url ?? doc.sourceUrl ?? null;
    const mime = doc.mime_type || doc.mimeType || null;
    const createdRaw = doc.created_at || doc.createdAt || '';
    const updatedRaw = doc.updated_at || doc.updatedAt || '';
    return {
        ...doc,
        filename,
        source_url: sourceUrl,
        mime_type: mime,
        created_at: createdRaw,
        updated_at: updatedRaw,
    } as DocumentRow;
}

export default function DocumentsPage() {
    const navigate = useNavigate();
    const { getAccessToken, user } = useAuth();
    const { buildHeaders, apiBase, fetchJson, fetchForm } = useApi();
    const { config } = useConfig();
    const [data, setData] = useState<DocumentRow[] | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [uploadError, setUploadError] = useState<string | null>(null);
    const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);
    const [uploading, setUploading] = useState<boolean>(false);
    const [dragOver, setDragOver] = useState<boolean>(false);
    const fileInputRef = useRef<HTMLInputElement | null>(null);

    // Extraction modal state
    const [isExtractionModalOpen, setIsExtractionModalOpen] = useState(false);
    const [selectedDocumentForExtraction, setSelectedDocumentForExtraction] = useState<DocumentRow | null>(null);
    const [isStartingExtraction, setIsStartingExtraction] = useState(false);

    const extractionClient = createExtractionJobsClient(
        apiBase,
        fetchJson,
        config.activeProjectId
    );

    const apiBaseMemo = useMemo(() => apiBase, [apiBase]);

    // Load documents only when an active org & project are selected (prevents 403 on first-login with no org).
    useEffect(() => {
        let cancelled = false;
        // Require both org & project (project scoping) to fetch; gate handles creation/select flows.
        if (!config.activeOrgId || !config.activeProjectId) {
            return () => { cancelled = true; };
        }
        async function load() {
            setLoading(true);
            setError(null);
            try {
                const t = getAccessToken();
                const json = await fetchJson<DocumentRow[] | { documents: DocumentRow[] }>(`${apiBase}/api/documents`, {
                    headers: t ? { ...buildHeaders({ json: false }) } : {},
                    json: false,
                });
                const docs = (Array.isArray(json) ? json : json.documents).map(normalize);
                if (!cancelled) setData(docs);
            } catch (e: unknown) {
                const msg = e instanceof Error ? e.message : "Failed to load";
                if (!cancelled) setError(msg);
            } finally {
                if (!cancelled) setLoading(false);
            }
        }
        load();
        return () => { cancelled = true; };
    }, [apiBase, apiBaseMemo, getAccessToken, buildHeaders, fetchJson, config.activeOrgId, config.activeProjectId]);

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

    // Handle extract objects button click
    const handleExtractObjects = (document: DocumentRow) => {
        setSelectedDocumentForExtraction(document);
        setIsExtractionModalOpen(true);
    };

    // Handle extraction confirmation
    const handleExtractionConfirm = async (extractionConfig: ExtractionConfig) => {
        if (!selectedDocumentForExtraction || !config.activeProjectId || !config.activeOrgId) return;

        setIsStartingExtraction(true);
        try {
            // Only include subject_id if user.sub is a valid UUID
            const isValidUuid = user?.sub && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(user.sub);

            const job = await extractionClient.createJob({
                source_type: 'document',
                source_id: selectedDocumentForExtraction.id,
                source_metadata: {
                    filename: selectedDocumentForExtraction.filename || 'unknown',
                    mime_type: selectedDocumentForExtraction.mime_type || 'application/octet-stream',
                },
                extraction_config: extractionConfig,
                ...(isValidUuid && { subject_id: user.sub }), // Canonical internal user ID (UUID)
            });

            // Close modal and navigate to job detail page
            setIsExtractionModalOpen(false);
            setSelectedDocumentForExtraction(null);

            // Show success message briefly before navigation
            setUploadSuccess(`Extraction job created successfully! Redirecting...`);
            setTimeout(() => {
                navigate(`/admin/extraction-jobs/${job.id}`);
            }, 1000);
        } catch (err) {
            console.error('Failed to create extraction job:', err);
            setUploadError(err instanceof Error ? err.message : 'Failed to create extraction job');
        } finally {
            setIsStartingExtraction(false);
        }
    };

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
            if (config.activeProjectId) fd.append("projectId", config.activeProjectId);
            const t = getAccessToken();
            await fetchForm<void>(`${apiBase}/api/ingest/upload`, fd, { method: "POST", headers: t ? buildHeaders({ json: false }) : {} });
            setUploadSuccess("Upload successful. Updating list...");
            // Reload documents
            setLoading(true);
            try {
                const t2 = getAccessToken();
                const json = await fetchJson<DocumentRow[] | { documents: DocumentRow[] }>(`${apiBase}/api/documents`, {
                    headers: t2 ? { ...buildHeaders({ json: false }) } : {},
                    json: false,
                });
                const docs = (Array.isArray(json) ? json : json.documents).map(normalize);
                setData(docs);
                setUploadSuccess("Upload successful.");
                // Auto clear after 3s
                setTimeout(() => setUploadSuccess(null), 3000);
            } catch (e: unknown) {
                const msg = e instanceof Error ? e.message : "Failed to refresh list";
                setError(msg);
                // Clear success if refresh failed to avoid stale message
                setUploadSuccess(null);
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

    const ready = !!config.activeOrgId && !!config.activeProjectId;

    // Until gate selects/creates org & project, just show gate (children ignored).
    if (!ready) {
        return <OrgAndProjectGate><div /></OrgAndProjectGate>;
    }

    return (
        <OrgAndProjectGate>
            <div data-testid="page-documents" className="mx-auto p-4 container">
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
                            <Icon icon="lucide--upload-cloud" className="size-6" aria-hidden />
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
                            <Icon icon="lucide--alert-circle" className="size-5" aria-hidden />
                            <span>{uploadError}</span>
                        </div>
                    )}
                    {uploadSuccess && (
                        <div role="alert" className="mt-4 alert alert-success">
                            <Icon icon="lucide--check-circle" className="size-5" aria-hidden />
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
                                <Icon icon="lucide--alert-circle" className="size-5" aria-hidden />
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
                                                    <td className="font-medium">{d.filename || "(no name)"}</td>
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
                                                    <td>{d.created_at ? new Date(d.created_at).toLocaleString() : "—"}</td>
                                                    <td className="text-right">
                                                        <div className="flex justify-end gap-2">
                                                            <button
                                                                className="btn btn-sm btn-primary"
                                                                onClick={() => handleExtractObjects(d)}
                                                                title="Extract objects using AI"
                                                            >
                                                                <Icon icon="lucide--sparkles" />
                                                                Extract
                                                            </button>
                                                            <a className="btn btn-sm btn-ghost" href={`/admin/apps/chunks?docId=${d.id}`}>
                                                                View chunks
                                                            </a>
                                                        </div>
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

            {/* Extraction Configuration Modal */}
            <ExtractionConfigModal
                isOpen={isExtractionModalOpen}
                onClose={() => {
                    setIsExtractionModalOpen(false);
                    setSelectedDocumentForExtraction(null);
                }}
                onConfirm={handleExtractionConfirm}
                isLoading={isStartingExtraction}
                documentName={selectedDocumentForExtraction?.filename || undefined}
            />
        </OrgAndProjectGate>
    );
}
