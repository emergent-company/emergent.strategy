import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/contexts/useAuth';
import { useApi } from '@/hooks/use-api';
import { useSearchParams } from 'react-router';
import { Icon } from '@/components/atoms/Icon';
import { DataTable } from '@/components/organisms/DataTable';
import type {
  ColumnDef,
  RowAction,
} from '@/components/organisms/DataTable/types';

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

export default function ChunksPage() {
  const { getAccessToken } = useAuth();
  const { buildHeaders, apiBase, fetchJson } = useApi();
  const [searchParams, setSearchParams] = useSearchParams();
  const [data, setData] = useState<ChunksResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [preview, setPreview] = useState<ChunkRow | null>(null);

  const apiBaseMemo = useMemo(() => apiBase, [apiBase]);

  const page = Math.max(1, Number(searchParams.get('page') || 1));
  const pageSize = 25; // Fixed page size

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const qs = new URLSearchParams();
        qs.set('page', String(page));
        qs.set('pageSize', String(pageSize));
        const t = getAccessToken();
        // Accept both unified paginated shape and legacy/alternate array responses
        const json = await fetchJson<any>(
          `${apiBase}/api/chunks?${qs.toString()}`,
          {
            headers: t ? { ...buildHeaders({ json: false }) } : {},
            json: false,
          }
        );
        if (!cancelled) {
          let next: ChunksResponse | null = null;
          if (Array.isArray(json)) {
            // Legacy simple array (e.g. Nest chunks list). Map to expected richer shape with fallbacks.
            const mapped: ChunkRow[] = json.map(
              (c: any): ChunkRow => ({
                id: String(c.id),
                document_id: c.document_id || c.documentId || 'unknown',
                document_title:
                  c.document_title ||
                  c.documentTitle ||
                  c.filename ||
                  c.source_url ||
                  c.sourceUrl ||
                  c.document_id ||
                  c.documentId ||
                  'document',
                source_url: c.source_url || c.sourceUrl || null,
                chunk_index:
                  typeof c.chunk_index === 'number'
                    ? c.chunk_index
                    : typeof c.index === 'number'
                    ? c.index
                    : 0,
                created_at:
                  c.created_at || c.createdAt || new Date().toISOString(),
                text: c.text || '',
              })
            );
            next = {
              items: mapped,
              page: 1,
              pageSize: mapped.length || pageSize,
              total: mapped.length,
            };
          } else if (
            json &&
            typeof json === 'object' &&
            Array.isArray(json.items)
          ) {
            // Canonical paginated shape
            const items: ChunkRow[] = json.items.map(
              (c: any): ChunkRow => ({
                id: String(c.id),
                document_id: c.document_id || c.documentId || 'unknown',
                document_title:
                  c.document_title ||
                  c.documentTitle ||
                  c.filename ||
                  c.source_url ||
                  c.sourceUrl ||
                  c.document_id ||
                  c.documentId ||
                  'document',
                source_url: c.source_url || c.sourceUrl || null,
                chunk_index:
                  typeof c.chunk_index === 'number'
                    ? c.chunk_index
                    : typeof c.index === 'number'
                    ? c.index
                    : 0,
                created_at:
                  c.created_at || c.createdAt || new Date().toISOString(),
                text: c.text || '',
              })
            );
            next = {
              items,
              page: Number(json.page) || page,
              pageSize: Number(json.pageSize) || items.length || pageSize,
              total: Number(json.total) || items.length,
            };
          }
          setData(next);
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
    page,
    pageSize,
    getAccessToken,
    buildHeaders,
    fetchJson,
  ]);

  const totalPages = data
    ? Math.max(1, Math.ceil(data.total / data.pageSize))
    : 1;

  function updateParam(key: string, value: string) {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value);
    else next.delete(key);
    setSearchParams(next);
  }

  const columns: ColumnDef<ChunkRow>[] = [
    {
      key: 'chunk_index',
      label: 'Index',
      width: 'w-24',
      render: (chunk) => <span>{chunk.chunk_index}</span>,
    },
    {
      key: 'document_title',
      label: 'Document',
      width: 'max-w-80',
      render: (chunk) => (
        <div className="truncate">
          {chunk.source_url ? (
            chunk.source_url.includes('clickup.com') ||
            chunk.source_url.includes('app.clickup.com') ? (
              <div className="flex items-center gap-2">
                <span className="font-medium">{chunk.document_title}</span>
                <a
                  href={chunk.source_url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-sm transition-colors link hover:link-primary"
                  title={chunk.source_url}
                  onClick={(e) => e.stopPropagation()}
                >
                  <Icon
                    icon="simple-icons--clickup"
                    className="w-3.5 h-3.5 text-purple-500"
                  />
                  <span>Link</span>
                </a>
              </div>
            ) : (
              <a
                href={chunk.source_url}
                target="_blank"
                className="link"
                rel="noreferrer"
                title={chunk.source_url}
                onClick={(e) => e.stopPropagation()}
              >
                {chunk.document_title}
              </a>
            )
          ) : (
            <span className="font-medium">{chunk.document_title}</span>
          )}
        </div>
      ),
    },
    {
      key: 'text',
      label: 'Length',
      width: 'w-32',
      render: (chunk) => (
        <span>{chunk.text.length.toLocaleString()} chars</span>
      ),
    },
    {
      key: 'created_at',
      label: 'Created',
      cellClassName: 'whitespace-nowrap',
      render: (chunk) => (
        <span>{new Date(chunk.created_at).toLocaleString()}</span>
      ),
    },
  ];

  const rowActions: RowAction<ChunkRow>[] = [
    {
      label: 'Preview',
      icon: 'lucide--eye',
      variant: 'ghost',
      size: 'xs',
      onAction: (chunk) => setPreview(chunk),
    },
  ];

  return (
    <div data-testid="page-chunks" className="mx-auto max-w-7xl container">
      {/* Header */}
      <div className="mb-6">
        <h1 className="font-bold text-2xl">Chunks</h1>
        <p className="mt-1 text-base-content/70">
          Browse and manage text chunks extracted from your documents
        </p>
      </div>

      {/* DataTable */}
      <DataTable
        data={data?.items || []}
        columns={columns}
        loading={loading}
        error={error}
        rowActions={rowActions}
        useDropdownActions={true}
        onRowClick={(chunk) => setPreview(chunk)}
        enableSearch={true}
        searchPlaceholder="Search chunks..."
        getSearchText={(chunk) => `${chunk.document_title} ${chunk.text}`}
        emptyMessage="No chunks found"
        noResultsMessage="No chunks match your search"
      />

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
              onClick={() => updateParam('page', String(page - 1))}
            >
              Prev
            </button>
            <button
              className="btn btn-sm join-item"
              disabled={page >= totalPages}
              onClick={() => updateParam('page', String(page + 1))}
            >
              Next
            </button>
          </div>
        </div>
      )}

      {/* Preview modal */}
      {preview && (
        <dialog className="modal" open>
          <div className="max-w-3xl modal-box">
            <h3 className="card-title">{preview.document_title}</h3>
            <div className="opacity-70 mt-2 text-sm">
              Chunk #{preview.chunk_index}
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
    </div>
  );
}
