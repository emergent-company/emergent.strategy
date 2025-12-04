// Page: Project Settings - Document Processing (Chunking)
// Route: /admin/settings/project/chunking

import { useEffect, useState, useCallback } from 'react';
import { useConfig } from '@/contexts/config';
import { useApi } from '@/hooks/use-api';
import { Icon } from '@/components/atoms/Icon';
import type { Project } from '@/hooks/use-projects';
import { SettingsNav } from './SettingsNav';

// Chunking strategy options
const CHUNKING_STRATEGIES = [
  {
    value: 'character',
    label: 'Character-Based',
    description:
      'Split text at fixed character boundaries. Simple and predictable, works well for most content.',
    icon: 'lucide--text-cursor',
  },
  {
    value: 'sentence',
    label: 'Sentence-Based',
    description:
      'Split text at sentence boundaries (.!?). Preserves complete thoughts and improves readability.',
    icon: 'lucide--align-left',
  },
  {
    value: 'paragraph',
    label: 'Paragraph-Based',
    description:
      'Split text at paragraph boundaries. Best for structured documents with clear sections.',
    icon: 'lucide--pilcrow',
  },
] as const;

// Chunking presets based on use case
const CHUNKING_PRESETS = [
  {
    id: 'precise',
    label: 'Precise',
    description: 'Small chunks for fine-grained Q&A and precise retrieval',
    icon: 'lucide--target',
    color: 'primary',
    config: {
      strategy: 'sentence' as const,
      maxChunkSize: 800,
      minChunkSize: 100,
    },
    tokens: '~200 tokens per chunk',
  },
  {
    id: 'balanced',
    label: 'Balanced',
    description: 'Medium chunks balancing context and precision (recommended)',
    icon: 'lucide--scale',
    color: 'success',
    config: {
      strategy: 'sentence' as const,
      maxChunkSize: 1500,
      minChunkSize: 150,
    },
    tokens: '~375 tokens per chunk',
  },
  {
    id: 'comprehensive',
    label: 'Comprehensive',
    description: 'Large chunks for more context in summaries and analysis',
    icon: 'lucide--book-open',
    color: 'warning',
    config: {
      strategy: 'paragraph' as const,
      maxChunkSize: 4000,
      minChunkSize: 300,
    },
    tokens: '~1000 tokens per chunk',
  },
] as const;

// Default configuration
const DEFAULT_CONFIG = {
  strategy: 'character' as 'character' | 'sentence' | 'paragraph',
  maxChunkSize: 1200,
  minChunkSize: 100,
};

export default function ProjectChunkingSettingsPage() {
  const { config } = useConfig();
  const { apiBase, fetchJson } = useApi();

  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Form state
  const [strategy, setStrategy] = useState<
    'character' | 'sentence' | 'paragraph'
  >(DEFAULT_CONFIG.strategy);
  const [maxChunkSize, setMaxChunkSize] = useState(DEFAULT_CONFIG.maxChunkSize);
  const [minChunkSize, setMinChunkSize] = useState(DEFAULT_CONFIG.minChunkSize);

  // Load project settings
  const loadProject = useCallback(async () => {
    if (!config.activeProjectId) return;

    setLoading(true);
    setError(null);

    try {
      const projectData = await fetchJson<Project>(
        `${apiBase}/api/projects/${config.activeProjectId}`
      );

      setProject(projectData);

      // Populate form with current settings
      const chunkingConfig = projectData.chunking_config || {};
      setStrategy(chunkingConfig.strategy || DEFAULT_CONFIG.strategy);
      setMaxChunkSize(
        chunkingConfig.maxChunkSize ?? DEFAULT_CONFIG.maxChunkSize
      );
      setMinChunkSize(
        chunkingConfig.minChunkSize ?? DEFAULT_CONFIG.minChunkSize
      );
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to load project settings'
      );
    } finally {
      setLoading(false);
    }
  }, [config.activeProjectId, apiBase, fetchJson]);

  useEffect(() => {
    loadProject();
  }, [loadProject]);

  // Save settings
  const handleSave = async () => {
    if (!config.activeProjectId) return;

    // Validate settings
    if (minChunkSize >= maxChunkSize) {
      setError('Minimum chunk size must be less than maximum chunk size');
      return;
    }

    setSaving(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const updatedProject = await fetchJson<Project>(
        `${apiBase}/api/projects/${config.activeProjectId}`,
        {
          method: 'PATCH',
          body: {
            chunking_config: {
              strategy,
              maxChunkSize,
              minChunkSize,
            },
          },
        }
      );

      setProject(updatedProject);
      setSuccessMessage('Document processing settings saved successfully');

      // Clear success message after 3 seconds
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  // Reset to defaults
  const handleReset = () => {
    if (
      !window.confirm('Reset all document processing settings to defaults?')
    ) {
      return;
    }

    setStrategy(DEFAULT_CONFIG.strategy);
    setMaxChunkSize(DEFAULT_CONFIG.maxChunkSize);
    setMinChunkSize(DEFAULT_CONFIG.minChunkSize);
  };

  // Check if settings have changed
  const hasChanges = () => {
    if (!project) return false;

    const currentConfig = project.chunking_config || {};
    return (
      strategy !== (currentConfig.strategy || DEFAULT_CONFIG.strategy) ||
      maxChunkSize !==
        (currentConfig.maxChunkSize ?? DEFAULT_CONFIG.maxChunkSize) ||
      minChunkSize !==
        (currentConfig.minChunkSize ?? DEFAULT_CONFIG.minChunkSize)
    );
  };

  if (!config.activeProjectId) {
    return (
      <div className="mx-auto container">
        <div className="alert alert-warning">
          <Icon icon="lucide--alert-triangle" className="size-5" />
          <span>
            Please select a project to configure document processing settings
          </span>
        </div>
      </div>
    );
  }

  return (
    <div
      data-testid="page-settings-chunking"
      className="mx-auto max-w-4xl container"
    >
      {/* Settings Navigation */}
      <SettingsNav />

      {/* Header */}
      <div className="mb-6">
        <h1 className="font-bold text-2xl">Document Processing</h1>
        <p className="mt-1 text-base-content/70">
          Configure how documents are split into chunks for storage and
          retrieval
        </p>
      </div>

      {/* Success Message */}
      {successMessage && (
        <div role="alert" className="mb-4 alert alert-success">
          <Icon icon="lucide--check-circle" className="size-5" />
          <span>{successMessage}</span>
        </div>
      )}

      {/* Error Alert */}
      {error && (
        <div role="alert" className="mb-4 alert alert-error">
          <Icon icon="lucide--alert-circle" className="size-5" />
          <span>{error}</span>
          <button
            className="btn btn-sm btn-ghost"
            onClick={() => setError(null)}
            aria-label="Dismiss error"
          >
            <Icon icon="lucide--x" className="size-4" />
          </button>
        </div>
      )}

      {/* Loading State */}
      {loading ? (
        <div className="flex justify-center items-center py-12">
          <span className="loading loading-spinner loading-lg"></span>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Quick Presets */}
          <div className="bg-base-100 border border-base-300 card">
            <div className="card-body">
              <h3 className="flex items-center gap-2 mb-4 font-semibold">
                <Icon icon="lucide--zap" className="size-5" />
                Quick Presets
              </h3>
              <p className="mb-4 text-sm text-base-content/70">
                Choose a preset optimized for your use case, or customize the
                settings below
              </p>

              <div className="gap-4 grid md:grid-cols-3">
                {CHUNKING_PRESETS.map((preset) => {
                  const isActive =
                    strategy === preset.config.strategy &&
                    maxChunkSize === preset.config.maxChunkSize &&
                    minChunkSize === preset.config.minChunkSize;

                  return (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => {
                        setStrategy(preset.config.strategy);
                        setMaxChunkSize(preset.config.maxChunkSize);
                        setMinChunkSize(preset.config.minChunkSize);
                      }}
                      className={`flex flex-col items-center p-4 border rounded-lg cursor-pointer transition-all text-left ${
                        isActive
                          ? `border-${preset.color} bg-${preset.color}/10 ring-2 ring-${preset.color}/30`
                          : 'border-base-300 hover:border-base-400 hover:bg-base-200/50'
                      }`}
                    >
                      <div
                        className={`p-2 rounded-full mb-2 ${
                          isActive
                            ? `bg-${preset.color}/20 text-${preset.color}`
                            : 'bg-base-200 text-base-content/60'
                        }`}
                      >
                        <Icon icon={preset.icon} className="size-6" />
                      </div>
                      <div className="font-medium text-center">
                        {preset.label}
                      </div>
                      <div className="mt-1 text-center text-sm text-base-content/70">
                        {preset.description}
                      </div>
                      <div
                        className={`mt-2 text-xs font-mono ${
                          isActive
                            ? `text-${preset.color}`
                            : 'text-base-content/50'
                        }`}
                      >
                        {preset.tokens}
                      </div>
                      {isActive && (
                        <div className="flex items-center gap-1 mt-2 text-success text-xs">
                          <Icon icon="lucide--check" className="size-3" />
                          Active
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Chunking Strategy */}
          <div className="bg-base-100 border border-base-300 card">
            <div className="card-body">
              <h3 className="flex items-center gap-2 mb-4 font-semibold">
                <Icon icon="lucide--scissors" className="size-5" />
                Chunking Strategy
              </h3>
              <p className="mb-4 text-sm text-base-content/70">
                Choose how documents should be split into smaller chunks for
                processing and retrieval
              </p>

              <div className="space-y-3">
                {CHUNKING_STRATEGIES.map((strat) => (
                  <label
                    key={strat.value}
                    className={`flex items-start gap-3 p-4 border rounded-lg cursor-pointer transition-colors ${
                      strategy === strat.value
                        ? 'border-primary bg-primary/5'
                        : 'border-base-300 hover:border-base-400'
                    }`}
                  >
                    <input
                      type="radio"
                      name="chunking-strategy"
                      className="mt-0.5 radio radio-primary"
                      checked={strategy === strat.value}
                      onChange={() =>
                        setStrategy(
                          strat.value as 'character' | 'sentence' | 'paragraph'
                        )
                      }
                    />
                    <div className="flex-1">
                      <div className="flex items-center gap-2 font-medium">
                        <Icon icon={strat.icon} className="size-4" />
                        {strat.label}
                      </div>
                      <div className="mt-1 text-sm text-base-content/70">
                        {strat.description}
                      </div>
                    </div>
                  </label>
                ))}
              </div>
            </div>
          </div>

          {/* Chunk Size Settings */}
          <div className="bg-base-100 border border-base-300 card">
            <div className="card-body">
              <h3 className="flex items-center gap-2 mb-4 font-semibold">
                <Icon icon="lucide--ruler" className="size-5" />
                Chunk Size Limits
              </h3>
              <p className="mb-4 text-sm text-base-content/70">
                Configure the minimum and maximum size of text chunks in
                characters
              </p>

              <div className="gap-6 grid md:grid-cols-2">
                {/* Maximum Chunk Size */}
                <div className="form-control">
                  <label className="label">
                    <span className="label-text font-medium">
                      Maximum Chunk Size
                    </span>
                    <span className="label-text-alt text-base-content/60">
                      characters
                    </span>
                  </label>
                  <input
                    type="number"
                    className="input input-bordered w-full"
                    value={maxChunkSize}
                    onChange={(e) =>
                      setMaxChunkSize(
                        Math.max(100, parseInt(e.target.value) || 0)
                      )
                    }
                    min={100}
                    max={10000}
                  />
                  <label className="label">
                    <span className="label-text-alt text-base-content/60">
                      Recommended: 800-2000 characters
                    </span>
                  </label>
                </div>

                {/* Minimum Chunk Size */}
                <div className="form-control">
                  <label className="label">
                    <span className="label-text font-medium">
                      Minimum Chunk Size
                    </span>
                    <span className="label-text-alt text-base-content/60">
                      characters
                    </span>
                  </label>
                  <input
                    type="number"
                    className="input input-bordered w-full"
                    value={minChunkSize}
                    onChange={(e) =>
                      setMinChunkSize(
                        Math.max(10, parseInt(e.target.value) || 0)
                      )
                    }
                    min={10}
                    max={1000}
                  />
                  <label className="label">
                    <span className="label-text-alt text-base-content/60">
                      Prevents very small chunks
                    </span>
                  </label>
                </div>
              </div>

              {/* Validation Warning */}
              {minChunkSize >= maxChunkSize && (
                <div className="mt-3 alert alert-warning">
                  <Icon icon="lucide--alert-triangle" className="size-5" />
                  <span>
                    Minimum chunk size must be less than maximum chunk size
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Preview */}
          <div className="bg-base-100 border border-base-300 card">
            <div className="card-body">
              <h3 className="flex items-center gap-2 mb-4 font-semibold">
                <Icon icon="lucide--eye" className="size-5" />
                Configuration Preview
              </h3>
              <div className="bg-base-200 p-4 rounded-lg font-mono text-sm">
                <div className="text-base-content/60">
                  {'{'} <br />
                  {'  '}"strategy": "{strategy}",
                  <br />
                  {'  '}"maxChunkSize": {maxChunkSize},
                  <br />
                  {'  '}"minChunkSize": {minChunkSize}
                  <br />
                  {'}'}
                </div>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex justify-between items-center gap-4 pt-4">
            <button
              className="btn btn-ghost"
              onClick={handleReset}
              disabled={saving}
            >
              <Icon icon="lucide--rotate-ccw" className="size-4" />
              Reset to Defaults
            </button>
            <div className="flex gap-3">
              <button
                className="btn btn-primary"
                onClick={handleSave}
                disabled={
                  saving || !hasChanges() || minChunkSize >= maxChunkSize
                }
              >
                {saving ? (
                  <>
                    <span className="loading loading-spinner loading-sm"></span>
                    Saving...
                  </>
                ) : (
                  <>
                    <Icon icon="lucide--save" className="size-4" />
                    Save Settings
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Info Box */}
          <div className="bg-info/10 p-4 border-info border-l-4 rounded">
            <div className="flex gap-3">
              <Icon icon="lucide--info" className="mt-0.5 size-5 text-info" />
              <div className="text-sm">
                <p className="font-medium text-info">
                  How Document Processing Works
                </p>
                <p className="mt-1 text-base-content/70">
                  When documents are uploaded, they are split into smaller
                  chunks based on these settings. Chunks are then indexed for
                  semantic search and used for AI-powered chat and extraction.
                  The chunking strategy affects retrieval quality and context
                  relevance.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
