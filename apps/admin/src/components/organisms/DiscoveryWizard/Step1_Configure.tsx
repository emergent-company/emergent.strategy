/**
 * Step 1: Configure Discovery
 *
 * Select documents and configure discovery parameters
 */

import { useState, useEffect } from 'react';
import { Icon } from '@/components/atoms/Icon';
import { Spinner } from '@/components/atoms/Spinner';
import { useApi } from '@/hooks/use-api';
import type { DiscoveryConfig } from './DiscoveryWizard';

interface Step1Props {
  projectId: string;
  config: DiscoveryConfig;
  onConfigChange: (config: DiscoveryConfig) => void;
  onStart: () => void;
  onCancel: () => void;
}

interface Document {
  id: string;
  name: string;
  filename: string | null;
  source_url: string | null;
  sourceUrl: string | null;
  mime_type: string | null;
  mimeType: string | null;
  created_at: string | null;
  createdAt: string | null;
}

// Helper to safely format dates
function formatDate(dateString: string | null | undefined): string {
  if (!dateString) return 'Unknown date';

  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) {
      return 'Invalid date';
    }
    return date.toLocaleDateString();
  } catch {
    return 'Invalid date';
  }
}

export function Step1_Configure({
  projectId,
  config,
  onConfigChange,
  onStart,
  onCancel,
}: Step1Props) {
  const { apiBase, fetchJson } = useApi();
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Load documents
  useEffect(() => {
    const loadDocuments = async () => {
      try {
        setLoading(true);
        setError(null);
        const response = await fetchJson<{
          documents: Document[];
          total: number;
        }>(`${apiBase}/api/documents`);
        setDocuments(response.documents || []);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : 'Failed to load documents'
        );
      } finally {
        setLoading(false);
      }
    };

    loadDocuments();
  }, [projectId, apiBase, fetchJson]);

  // Toggle document selection
  const handleToggleDocument = (docId: string) => {
    onConfigChange({
      ...config,
      document_ids: config.document_ids.includes(docId)
        ? config.document_ids.filter((id) => id !== docId)
        : [...config.document_ids, docId],
    });
  };

  // Select all documents
  const handleSelectAll = () => {
    onConfigChange({
      ...config,
      document_ids: documents.map((d) => d.id),
    });
  };

  // Clear selection
  const handleClearAll = () => {
    onConfigChange({
      ...config,
      document_ids: [],
    });
  };

  const canStart = config.document_ids.length > 0;

  if (loading) {
    return (
      <div className="flex flex-col justify-center items-center py-12">
        <Spinner size="lg" />
        <p className="mt-4 text-sm text-base-content/70">
          Loading documents...
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div role="alert" className="alert alert-error">
        <Icon icon="lucide--alert-circle" className="size-5" />
        <span>{error}</span>
      </div>
    );
  }

  if (documents.length === 0) {
    return (
      <div className="flex flex-col justify-center items-center py-12 text-center">
        <Icon icon="lucide--file-x" className="size-16 text-base-content/30" />
        <p className="mt-4 font-medium">No Documents Found</p>
        <p className="mt-1 text-sm text-base-content/70">
          Upload some documents to this project before running discovery.
        </p>
        <button className="mt-4 btn btn-ghost" onClick={onCancel}>
          Close
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Document Selection */}
      <div>
        <div className="flex justify-between items-center mb-3">
          <h3 className="flex items-center gap-2 font-semibold">
            <Icon icon="lucide--files" className="size-5" />
            Select Documents
          </h3>
          <div className="flex gap-2">
            <button
              className="btn btn-ghost btn-sm"
              onClick={handleSelectAll}
              disabled={config.document_ids.length === documents.length}
            >
              Select All
            </button>
            <button
              className="btn btn-ghost btn-sm"
              onClick={handleClearAll}
              disabled={config.document_ids.length === 0}
            >
              Clear
            </button>
          </div>
        </div>

        <p className="mb-4 text-sm text-base-content/70">
          Select which documents to analyze. More documents = better type
          discovery.
        </p>

        <div className="space-y-2 max-h-64 overflow-y-auto">
          {documents.map((doc) => (
            <label
              key={doc.id}
              className="flex items-start gap-3 p-3 border border-base-300 hover:border-primary/50 rounded-lg transition-colors cursor-pointer"
            >
              <input
                type="checkbox"
                className="mt-0.5 checkbox checkbox-primary"
                checked={config.document_ids.includes(doc.id)}
                onChange={() => handleToggleDocument(doc.id)}
              />
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">
                  {doc.filename || doc.name || 'Untitled'}
                </div>
                {(doc.source_url || doc.sourceUrl) && (
                  <div className="mt-0.5 text-xs text-base-content/60 truncate">
                    {doc.source_url || doc.sourceUrl}
                  </div>
                )}
                <div className="flex items-center gap-2 mt-1 text-xs text-base-content/50">
                  {(doc.mime_type || doc.mimeType) && (
                    <span className="badge badge-ghost badge-xs">
                      {doc.mime_type || doc.mimeType}
                    </span>
                  )}
                  <span>{formatDate(doc.createdAt || doc.created_at)}</span>
                </div>
              </div>
            </label>
          ))}
        </div>

        <div className="mt-3 text-sm text-base-content/60">
          Selected:{' '}
          <span className="font-medium">{config.document_ids.length}</span> of{' '}
          <span className="font-medium">{documents.length}</span> documents
        </div>
      </div>

      {/* Advanced Settings */}
      <div className="pt-4 border-base-300 border-t">
        <button
          className="flex items-center gap-2 mb-3 btn btn-ghost btn-sm"
          onClick={() => setShowAdvanced(!showAdvanced)}
        >
          <Icon
            icon={
              showAdvanced ? 'lucide--chevron-down' : 'lucide--chevron-right'
            }
            className="size-4"
          />
          Advanced Settings
        </button>

        {showAdvanced && (
          <div className="space-y-4 pl-6">
            {/* Batch Size */}
            <div>
              <label className="label">
                <span className="font-medium label-text">Batch Size</span>
                <span className="label-text-alt">{config.batch_size}</span>
              </label>
              <input
                type="range"
                min="10"
                max="100"
                step="10"
                className="range range-primary range-sm"
                value={config.batch_size}
                onChange={(e) =>
                  onConfigChange({
                    ...config,
                    batch_size: parseInt(e.target.value),
                  })
                }
              />
              <div className="flex justify-between mt-1 text-xs text-base-content/60">
                <span>Smaller batches</span>
                <span>Larger batches</span>
              </div>
            </div>

            {/* Min Confidence */}
            <div>
              <label className="label">
                <span className="font-medium label-text">
                  Minimum Confidence
                </span>
                <span className="label-text-alt">
                  {config.min_confidence.toFixed(2)}
                </span>
              </label>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                className="range range-primary range-sm"
                value={config.min_confidence}
                onChange={(e) =>
                  onConfigChange({
                    ...config,
                    min_confidence: parseFloat(e.target.value),
                  })
                }
              />
              <div className="flex justify-between mt-1 text-xs text-base-content/60">
                <span>More results (0.0)</span>
                <span>Higher quality (1.0)</span>
              </div>
            </div>

            {/* Include Relationships */}
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                className="mt-0.5 checkbox checkbox-primary"
                checked={config.include_relationships}
                onChange={(e) =>
                  onConfigChange({
                    ...config,
                    include_relationships: e.target.checked,
                  })
                }
              />
              <div>
                <div className="font-medium">Discover Relationships</div>
                <div className="text-xs text-base-content/60">
                  Infer relationships between discovered types (recommended)
                </div>
              </div>
            </label>

            {/* Max Iterations */}
            <div>
              <label className="label">
                <span className="font-medium label-text">
                  Max Refinement Iterations
                </span>
                <span className="label-text-alt">{config.max_iterations}</span>
              </label>
              <input
                type="range"
                min="1"
                max="5"
                step="1"
                className="range range-primary range-sm"
                value={config.max_iterations}
                onChange={(e) =>
                  onConfigChange({
                    ...config,
                    max_iterations: parseInt(e.target.value),
                  })
                }
              />
              <div className="flex justify-between mt-1 text-xs text-base-content/60">
                <span>Faster (1)</span>
                <span>More refined (5)</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Action Buttons */}
      <div className="flex justify-between items-center gap-3 pt-4">
        <button className="btn btn-ghost" onClick={onCancel}>
          Cancel
        </button>
        <button
          className="gap-2 btn btn-primary"
          onClick={onStart}
          disabled={!canStart}
        >
          <Icon icon="lucide--play" className="size-4" />
          Start Discovery
        </button>
      </div>
    </div>
  );
}
