import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/contexts/useAuth';
import { useApi } from '@/hooks/use-api';
import { useConfig } from '@/contexts/config';
import { useDataUpdates } from '@/contexts/data-updates';
import { Icon } from '@/components/atoms/Icon';
import { Spinner } from '@/components/atoms/Spinner';
import { PageContainer } from '@/components/layouts';

interface ChunkData {
  id: string;
  documentId: string;
  documentTitle: string;
  index: number;
  size: number;
  hasEmbedding: boolean;
  text: string;
  createdAt?: string;
  totalChars?: number;
  chunkCount?: number;
  embeddedChunks?: number;
}

interface DocumentGroup {
  documentId: string;
  documentTitle: string;
  totalChars: number;
  chunkCount: number;
  embeddedChunks: number;
  chunks: ChunkData[];
}

export default function ChunksPage() {
  const { getAccessToken } = useAuth();
  const { buildHeaders, apiBase, fetchJson } = useApi();
  const { config } = useConfig();
  const [data, setData] = useState<ChunkData[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [preview, setPreview] = useState<ChunkData | null>(null);
  const [expandedDocs, setExpandedDocs] = useState<Set<string>>(new Set());

  const apiBaseMemo = useMemo(() => apiBase, [apiBase]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const t = getAccessToken();
        const json = await fetchJson<ChunkData[]>(`${apiBase}/api/chunks`, {
          headers: t ? { ...buildHeaders({ json: false }) } : {},
          json: false,
        });
        if (!cancelled) {
          setData(Array.isArray(json) ? json : []);
        }
      } catch (e: any) {
        if (!cancelled) setError(e.message || 'Failed to load');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [
    apiBase,
    apiBaseMemo,
    getAccessToken,
    buildHeaders,
    fetchJson,
    config.activeProjectId,
    config.activeOrgId,
  ]);

  // Refresh chunks function for real-time updates (silent refresh without loading state)
  const refreshChunks = useCallback(async () => {
    try {
      const t = getAccessToken();
      const json = await fetchJson<ChunkData[]>(
        `${apiBase}/api/chunks?_t=${Date.now()}`,
        {
          headers: t ? { ...buildHeaders({ json: false }) } : {},
          json: false,
        }
      );
      setData(Array.isArray(json) ? json : []);
    } catch (e: any) {
      console.error('[Chunks] Failed to refresh:', e);
    }
  }, [apiBase, getAccessToken, buildHeaders, fetchJson]);

  // Subscribe to real-time chunk updates (embedding completion, etc.)
  useDataUpdates(
    'chunk:*',
    (event) => {
      console.debug('[Chunks] Real-time event:', event.type, event.id);
      // Refresh on any chunk change
      void refreshChunks();
    },
    [refreshChunks]
  );

  // Group chunks by document
  const documentGroups = useMemo(() => {
    const groups = new Map<string, DocumentGroup>();

    data.forEach((chunk) => {
      if (!groups.has(chunk.documentId)) {
        groups.set(chunk.documentId, {
          documentId: chunk.documentId,
          documentTitle: chunk.documentTitle,
          totalChars: chunk.totalChars || 0,
          chunkCount: chunk.chunkCount || 0,
          embeddedChunks: chunk.embeddedChunks || 0,
          chunks: [],
        });
      }
      groups.get(chunk.documentId)!.chunks.push(chunk);
    });

    return Array.from(groups.values());
  }, [data]);

  const toggleDocument = (documentId: string) => {
    const next = new Set(expandedDocs);
    if (next.has(documentId)) {
      next.delete(documentId);
    } else {
      next.add(documentId);
    }
    setExpandedDocs(next);
  };

  const renderEmbeddingStatus = (hasEmbedding: boolean) => {
    if (hasEmbedding) {
      return (
        <Icon
          icon="lucide--check-circle"
          className="w-5 h-5 text-success"
          title="Embedded"
        />
      );
    }
    return (
      <Icon
        icon="lucide--clock"
        className="w-5 h-5 text-warning"
        title="Pending"
      />
    );
  };

  const renderEmbeddingStats = (embeddedChunks: number, chunkCount: number) => {
    const hasAll = embeddedChunks === chunkCount;
    return (
      <div className="flex items-center gap-2">
        {hasAll ? (
          <Icon
            icon="lucide--check-circle"
            className="w-5 h-5 text-success"
            title="All embedded"
          />
        ) : (
          <Icon
            icon="lucide--clock"
            className="w-5 h-5 text-warning"
            title="Partially embedded"
          />
        )}
        <span className="text-sm">
          {embeddedChunks}/{chunkCount}
        </span>
      </div>
    );
  };

  return (
    <PageContainer maxWidth="full" className="px-4" testId="page-chunks">
      {/* Header */}
      <div className="mb-6">
        <h1 className="font-bold text-2xl">Chunks</h1>
        <p className="mt-1 text-base-content/70">
          Browse and manage text chunks extracted from your documents
        </p>
      </div>

      {/* Loading State */}
      {loading && (
        <div className="flex justify-center items-center py-12">
          <Spinner size="lg" />
        </div>
      )}

      {/* Error State */}
      {error && (
        <div className="alert alert-error">
          <Icon icon="lucide--alert-circle" className="w-5 h-5" />
          <span>{error}</span>
        </div>
      )}

      {/* Table */}
      {!loading && !error && (
        <div className="overflow-x-auto">
          <table className="table table-zebra">
            <thead>
              <tr>
                <th className="w-12"></th>
                <th>Document</th>
                <th className="w-32">Chars</th>
                <th className="w-32">Embeddings</th>
                <th className="w-24">Chunks</th>
                <th className="w-24">Actions</th>
              </tr>
            </thead>
            <tbody>
              {documentGroups.length === 0 && (
                <tr>
                  <td
                    colSpan={6}
                    className="text-center py-8 text-base-content/70"
                  >
                    No chunks found
                  </td>
                </tr>
              )}
              {documentGroups.map((doc) => {
                const isExpanded = expandedDocs.has(doc.documentId);
                return (
                  <Fragment key={doc.documentId}>
                    {/* Document Row */}
                    <tr
                      className="hover cursor-pointer font-medium"
                      onClick={() => toggleDocument(doc.documentId)}
                    >
                      <td>
                        <Icon
                          icon={
                            isExpanded
                              ? 'lucide--chevron-down'
                              : 'lucide--chevron-right'
                          }
                          className="w-5 h-5"
                        />
                      </td>
                      <td className="truncate max-w-md">{doc.documentTitle}</td>
                      <td>{doc.totalChars.toLocaleString()}</td>
                      <td>
                        {renderEmbeddingStats(
                          doc.embeddedChunks,
                          doc.chunkCount
                        )}
                      </td>
                      <td>{doc.chunkCount}</td>
                      <td></td>
                    </tr>

                    {/* Chunk Rows (when expanded) */}
                    {isExpanded &&
                      doc.chunks.map((chunk) => (
                        <tr
                          key={chunk.id}
                          className="hover"
                          onClick={() => setPreview(chunk)}
                        >
                          <td></td>
                          <td className="pl-8 text-sm text-base-content/70">
                            Chunk #{chunk.index}
                          </td>
                          <td className="text-sm">
                            {chunk.size.toLocaleString()}
                          </td>
                          <td>{renderEmbeddingStatus(chunk.hasEmbedding)}</td>
                          <td></td>
                          <td>
                            <button
                              className="btn btn-ghost btn-xs"
                              onClick={(e) => {
                                e.stopPropagation();
                                setPreview(chunk);
                              }}
                            >
                              <Icon icon="lucide--eye" className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      ))}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Preview modal */}
      {preview && (
        <dialog className="modal" open>
          <div className="max-w-3xl modal-box">
            <h3 className="card-title">{preview.documentTitle}</h3>
            <div className="opacity-70 mt-2 text-sm">
              Chunk #{preview.index} • {preview.size.toLocaleString()} chars
            </div>
            <pre className="mt-4 text-sm whitespace-pre-wrap">
              {preview.text}
            </pre>
            <div className="modal-action">
              <button className="btn" onClick={() => setPreview(null)}>
                Close
              </button>
            </div>
          </div>
          <form
            method="dialog"
            className="modal-backdrop"
            onSubmit={() => setPreview(null)}
          >
            <button>close</button>
          </form>
        </dialog>
      )}
    </PageContainer>
  );
}
