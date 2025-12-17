// Page: Project Settings - Document Processing (Chunking)
// Route: /admin/settings/project/chunking

import { useEffect, useState, useCallback } from 'react';
import { useConfig } from '@/contexts/config';
import { useApi } from '@/hooks/use-api';
import { Icon } from '@/components/atoms/Icon';
import { PageContainer } from '@/components/layouts';
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

// Chunking presets based on use case - aligned with LLM extraction batch sizes (1:4 ratio)
const CHUNKING_PRESETS = [
  {
    id: 'precise',
    label: 'Precise',
    description: 'Smaller chunks for fine-grained Q&A and precise retrieval',
    icon: 'lucide--target',
    color: 'primary',
    config: {
      strategy: 'sentence' as const,
      maxChunkSize: 3750,
      minChunkSize: 1500,
    },
    tokens: '~940 tokens per chunk',
    llmAlignment: 'Conservative (15K)',
  },
  {
    id: 'balanced',
    label: 'Balanced',
    description: 'Medium chunks balancing context and precision (recommended)',
    icon: 'lucide--scale',
    color: 'success',
    config: {
      strategy: 'sentence' as const,
      maxChunkSize: 7500,
      minChunkSize: 3000,
    },
    tokens: '~1,875 tokens per chunk',
    llmAlignment: 'Balanced (30K)',
  },
  {
    id: 'comprehensive',
    label: 'Comprehensive',
    description: 'Large chunks for more context in summaries and analysis',
    icon: 'lucide--book-open',
    color: 'warning',
    config: {
      strategy: 'paragraph' as const,
      maxChunkSize: 15000,
      minChunkSize: 6000,
    },
    tokens: '~3,750 tokens per chunk',
    llmAlignment: 'Aggressive (60K)',
  },
] as const;

// Default configuration - aligned with Balanced LLM preset (30K)
const DEFAULT_CONFIG = {
  strategy: 'sentence' as 'character' | 'sentence' | 'paragraph',
  maxChunkSize: 7500,
  minChunkSize: 3000,
};

// Default LLM chunk size when no project config exists
const DEFAULT_LLM_CHUNK_SIZE = 30000;

// Alignment ratio: Document max chunk = LLM batch size / 4
const LLM_TO_DOC_RATIO = 4;
// Min chunk = LLM batch size / 10
const LLM_TO_MIN_DOC_RATIO = 10;

// Calculate suggested document chunk sizes from LLM chunk size
function calculateSuggestedChunks(llmChunkSize: number): {
  maxChunkSize: number;
  minChunkSize: number;
} {
  return {
    maxChunkSize: Math.round(llmChunkSize / LLM_TO_DOC_RATIO),
    minChunkSize: Math.round(llmChunkSize / LLM_TO_MIN_DOC_RATIO),
  };
}

// Alignment status thresholds
type AlignmentStatus = 'aligned' | 'warning' | 'misaligned';

function getAlignmentStatus(
  currentMax: number,
  suggestedMax: number
): AlignmentStatus {
  const ratio = currentMax / suggestedMax;
  // Within 20% = aligned
  if (ratio >= 0.8 && ratio <= 1.2) return 'aligned';
  // Within 2x = warning
  if (ratio >= 0.5 && ratio <= 2.0) return 'warning';
  // More than 2x off = misaligned
  return 'misaligned';
}

// Alignment status configuration
const alignmentConfig: Record<
  AlignmentStatus,
  { icon: string; color: string; label: string; message: string }
> = {
  aligned: {
    icon: 'lucide--check-circle',
    color: 'success',
    label: 'Aligned',
    message:
      'Document chunk sizes are well-aligned with LLM extraction settings.',
  },
  warning: {
    icon: 'lucide--alert-triangle',
    color: 'warning',
    label: 'Slightly Off',
    message:
      'Document chunks are somewhat misaligned with LLM settings. Consider adjusting for optimal performance.',
  },
  misaligned: {
    icon: 'lucide--alert-circle',
    color: 'error',
    label: 'Misaligned',
    message:
      'Document chunks are significantly misaligned with LLM settings. This may impact extraction quality.',
  },
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

  // Compute LLM alignment values
  const llmChunkSize =
    (project?.extraction_config as { chunkSize?: number } | undefined)
      ?.chunkSize ?? DEFAULT_LLM_CHUNK_SIZE;
  const suggested = calculateSuggestedChunks(llmChunkSize);
  const alignmentStatus = getAlignmentStatus(
    maxChunkSize,
    suggested.maxChunkSize
  );
  const alignment = alignmentConfig[alignmentStatus];

  // Apply suggested values
  const handleApplySuggested = () => {
    setMaxChunkSize(suggested.maxChunkSize);
    setMinChunkSize(suggested.minChunkSize);
  };

  if (!config.activeProjectId) {
    return (
      <PageContainer>
        <div className="alert alert-warning">
          <Icon icon="lucide--alert-triangle" className="size-5" />
          <span>
            Please select a project to configure document processing settings
          </span>
        </div>
      </PageContainer>
    );
  }

  return (
    <PageContainer maxWidth="4xl" testId="page-settings-chunking">
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
                      <div className="mt-1 text-xs text-base-content/50">
                        LLM: {preset.llmAlignment}
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

          {/* LLM Alignment Status */}
          <div
            className={`card border bg-base-100 ${
              alignmentStatus === 'aligned'
                ? 'border-success/50'
                : alignmentStatus === 'warning'
                ? 'border-warning/50'
                : 'border-error/50'
            }`}
          >
            <div className="card-body">
              <h3 className="flex items-center gap-2 mb-4 font-semibold">
                <Icon icon="lucide--link" className="size-5" />
                LLM Alignment
                <span className={`badge badge-sm badge-${alignment.color}`}>
                  {alignment.label}
                </span>
              </h3>

              <div className="flex items-start gap-3 mb-4">
                <Icon
                  icon={alignment.icon}
                  className={`size-5 mt-0.5 text-${alignment.color}`}
                />
                <div className="flex-1">
                  <p className="text-sm text-base-content/70">
                    {alignment.message}
                  </p>
                </div>
              </div>

              <div className="gap-4 grid md:grid-cols-3 mb-4">
                {/* Current LLM Setting */}
                <div className="bg-base-200 p-3 rounded-lg">
                  <div className="mb-1 text-xs text-base-content/60">
                    LLM Batch Size
                  </div>
                  <div className="font-mono font-semibold">
                    {llmChunkSize.toLocaleString()} chars
                  </div>
                  <div className="text-xs text-base-content/50">
                    ~{Math.round(llmChunkSize / 4).toLocaleString()} tokens
                  </div>
                </div>

                {/* Suggested Max Chunk */}
                <div className="bg-base-200 p-3 rounded-lg">
                  <div className="mb-1 text-xs text-base-content/60">
                    Suggested Max Chunk
                  </div>
                  <div className="font-mono font-semibold">
                    {suggested.maxChunkSize.toLocaleString()} chars
                  </div>
                  <div className="text-xs text-base-content/50">
                    Current: {maxChunkSize.toLocaleString()}
                  </div>
                </div>

                {/* Suggested Min Chunk */}
                <div className="bg-base-200 p-3 rounded-lg">
                  <div className="mb-1 text-xs text-base-content/60">
                    Suggested Min Chunk
                  </div>
                  <div className="font-mono font-semibold">
                    {suggested.minChunkSize.toLocaleString()} chars
                  </div>
                  <div className="text-xs text-base-content/50">
                    Current: {minChunkSize.toLocaleString()}
                  </div>
                </div>
              </div>

              {/* Apply Suggested Button */}
              {alignmentStatus !== 'aligned' && (
                <button
                  type="button"
                  className="btn btn-sm btn-outline btn-primary"
                  onClick={handleApplySuggested}
                >
                  <Icon icon="lucide--wand-2" className="size-4" />
                  Apply Suggested Values
                </button>
              )}

              <div className="mt-3 text-xs text-base-content/50">
                <Icon
                  icon="lucide--info"
                  className="inline-block mr-1 size-3"
                />
                For optimal extraction, document max chunk should be ~1/4 of LLM
                batch size.{' '}
                <a
                  href="/admin/settings/project/llm-settings"
                  className="link link-primary"
                >
                  Adjust LLM Settings
                </a>
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
                    max={25000}
                  />
                  <label className="label">
                    <span className="label-text-alt text-base-content/60">
                      Recommended: 3,750-15,000 characters (aligned with LLM)
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
                    max={10000}
                  />
                  <label className="label">
                    <span className="label-text-alt text-base-content/60">
                      Recommended: 1,500-6,000 characters (aligned with LLM)
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
    </PageContainer>
  );
}
