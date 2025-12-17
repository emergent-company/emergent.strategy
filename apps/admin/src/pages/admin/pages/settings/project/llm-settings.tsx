// Page: Project Settings - LLM Settings
// Route: /admin/settings/project/llm-settings

import { useEffect, useState, useCallback } from 'react';
import { useConfig } from '@/contexts/config';
import { useApi } from '@/hooks/use-api';
import { Icon } from '@/components/atoms/Icon';
import { PageContainer } from '@/components/layouts';
import type { Project } from '@/hooks/use-projects';
import { SettingsNav } from './SettingsNav';

// Extraction method options
const EXTRACTION_METHODS = [
  {
    value: 'json_freeform',
    label: 'JSON Freeform',
    description:
      'Best property extraction. Uses JSON mode without schema enforcement - model follows prompt instructions.',
    icon: 'lucide--file-json',
    recommended: true,
  },
  {
    value: 'function_calling',
    label: 'Function Calling',
    description:
      'Uses function calling API with schema enforcement. Faster but may skip optional properties.',
    icon: 'lucide--function-square',
    recommended: false,
  },
  {
    value: 'responseSchema',
    label: 'Response Schema',
    description:
      'Uses response schema with strict validation. Fastest but may skip optional properties.',
    icon: 'lucide--braces',
    recommended: false,
  },
] as const;

// Chunk size presets
const CHUNK_SIZE_PRESETS = [
  {
    id: 'conservative',
    label: 'Conservative',
    description: 'Lower variability, more consistent results',
    icon: 'lucide--shield',
    color: 'success',
    value: 15000,
    tokens: '~3,750 tokens',
  },
  {
    id: 'balanced',
    label: 'Balanced',
    description: 'Good balance of speed and consistency (recommended)',
    icon: 'lucide--scale',
    color: 'primary',
    value: 30000,
    tokens: '~7,500 tokens',
  },
  {
    id: 'aggressive',
    label: 'Aggressive',
    description: 'Faster processing, but higher variability',
    icon: 'lucide--zap',
    color: 'warning',
    value: 60000,
    tokens: '~15,000 tokens',
  },
] as const;

// Default configuration (matches server defaults)
const DEFAULT_CONFIG = {
  chunkSize: 30000,
  method: 'json_freeform' as
    | 'json_freeform'
    | 'function_calling'
    | 'responseSchema',
  timeoutSeconds: 180,
};

export default function ProjectLLMSettingsPage() {
  const { config } = useConfig();
  const { apiBase, fetchJson } = useApi();

  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Form state
  const [chunkSize, setChunkSize] = useState(DEFAULT_CONFIG.chunkSize);
  const [method, setMethod] = useState<
    'json_freeform' | 'function_calling' | 'responseSchema'
  >(DEFAULT_CONFIG.method);
  const [timeoutSeconds, setTimeoutSeconds] = useState(
    DEFAULT_CONFIG.timeoutSeconds
  );

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
      const extractionConfig = projectData.extraction_config || {};
      setChunkSize(extractionConfig.chunkSize ?? DEFAULT_CONFIG.chunkSize);
      setMethod(extractionConfig.method ?? DEFAULT_CONFIG.method);
      setTimeoutSeconds(
        extractionConfig.timeoutSeconds ?? DEFAULT_CONFIG.timeoutSeconds
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

    setSaving(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const updatedProject = await fetchJson<Project>(
        `${apiBase}/api/projects/${config.activeProjectId}`,
        {
          method: 'PATCH',
          body: {
            extraction_config: {
              chunkSize,
              method,
              timeoutSeconds,
            },
          },
        }
      );

      setProject(updatedProject);
      setSuccessMessage('LLM settings saved successfully');

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
    if (!window.confirm('Reset all LLM settings to defaults?')) {
      return;
    }

    setChunkSize(DEFAULT_CONFIG.chunkSize);
    setMethod(DEFAULT_CONFIG.method);
    setTimeoutSeconds(DEFAULT_CONFIG.timeoutSeconds);
  };

  // Check if settings have changed
  const hasChanges = () => {
    if (!project) return false;

    const currentConfig = project.extraction_config || {};
    return (
      chunkSize !== (currentConfig.chunkSize ?? DEFAULT_CONFIG.chunkSize) ||
      method !== (currentConfig.method ?? DEFAULT_CONFIG.method) ||
      timeoutSeconds !==
        (currentConfig.timeoutSeconds ?? DEFAULT_CONFIG.timeoutSeconds)
    );
  };

  if (!config.activeProjectId) {
    return (
      <PageContainer>
        <div className="alert alert-warning">
          <Icon icon="lucide--alert-triangle" className="size-5" />
          <span>Please select a project to configure LLM settings</span>
        </div>
      </PageContainer>
    );
  }

  return (
    <PageContainer maxWidth="4xl" testId="page-settings-llm">
      {/* Settings Navigation */}
      <SettingsNav />

      {/* Header */}
      <div className="mb-6">
        <h1 className="font-bold text-2xl">LLM Settings</h1>
        <p className="mt-1 text-base-content/70">
          Configure LLM extraction processing settings for this project
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
          {/* Extraction Chunk Size Presets */}
          <div className="bg-base-100 border border-base-300 card">
            <div className="card-body">
              <h3 className="flex items-center gap-2 mb-4 font-semibold">
                <Icon icon="lucide--ruler" className="size-5" />
                Extraction Chunk Size
              </h3>
              <p className="mb-4 text-sm text-base-content/70">
                Controls how documents are split for LLM extraction. Smaller
                chunks mean more consistent results but slower processing.
              </p>

              <div className="gap-4 grid md:grid-cols-3 mb-4">
                {CHUNK_SIZE_PRESETS.map((preset) => {
                  const isActive = chunkSize === preset.value;

                  return (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => setChunkSize(preset.value)}
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
                        {preset.value.toLocaleString()} chars ({preset.tokens})
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

              {/* Custom Chunk Size */}
              <div className="form-control">
                <label className="label">
                  <span className="label-text font-medium">
                    Custom Chunk Size
                  </span>
                  <span className="label-text-alt text-base-content/60">
                    characters (5,000 - 100,000)
                  </span>
                </label>
                <input
                  type="number"
                  className="input input-bordered w-full"
                  value={chunkSize}
                  onChange={(e) =>
                    setChunkSize(
                      Math.max(
                        5000,
                        Math.min(100000, parseInt(e.target.value) || 5000)
                      )
                    )
                  }
                  min={5000}
                  max={100000}
                  step={1000}
                />
              </div>
            </div>
          </div>

          {/* Extraction Method */}
          <div className="bg-base-100 border border-base-300 card">
            <div className="card-body">
              <h3 className="flex items-center gap-2 mb-4 font-semibold">
                <Icon icon="lucide--settings-2" className="size-5" />
                Extraction Method
              </h3>
              <p className="mb-4 text-sm text-base-content/70">
                Choose how the LLM extracts structured data from documents
              </p>

              <div className="space-y-3">
                {EXTRACTION_METHODS.map((m) => (
                  <label
                    key={m.value}
                    className={`flex items-start gap-3 p-4 border rounded-lg cursor-pointer transition-colors ${
                      method === m.value
                        ? 'border-primary bg-primary/5'
                        : 'border-base-300 hover:border-base-400'
                    }`}
                  >
                    <input
                      type="radio"
                      name="extraction-method"
                      className="mt-0.5 radio radio-primary"
                      checked={method === m.value}
                      onChange={() =>
                        setMethod(
                          m.value as 'function_calling' | 'responseSchema'
                        )
                      }
                    />
                    <div className="flex-1">
                      <div className="flex items-center gap-2 font-medium">
                        <Icon icon={m.icon} className="size-4" />
                        {m.label}
                        {m.recommended && (
                          <span className="badge badge-success badge-sm">
                            Recommended
                          </span>
                        )}
                      </div>
                      <div className="mt-1 text-sm text-base-content/70">
                        {m.description}
                      </div>
                    </div>
                  </label>
                ))}
              </div>
            </div>
          </div>

          {/* Timeout Settings */}
          <div className="bg-base-100 border border-base-300 card">
            <div className="card-body">
              <h3 className="flex items-center gap-2 mb-4 font-semibold">
                <Icon icon="lucide--timer" className="size-5" />
                Timeout Settings
              </h3>
              <p className="mb-4 text-sm text-base-content/70">
                Maximum time to wait for each LLM call. Increase for very large
                documents or slow connections.
              </p>

              <div className="form-control">
                <label className="label">
                  <span className="label-text font-medium">
                    Timeout per LLM Call
                  </span>
                  <span className="label-text-alt text-base-content/60">
                    seconds (60 - 600)
                  </span>
                </label>
                <div className="flex items-center gap-4">
                  <input
                    type="range"
                    min="60"
                    max="600"
                    step="30"
                    className="flex-1 range range-primary"
                    value={timeoutSeconds}
                    onChange={(e) =>
                      setTimeoutSeconds(parseInt(e.target.value))
                    }
                  />
                  <div className="bg-base-200 px-4 py-2 rounded min-w-[5rem] font-mono text-lg text-center">
                    {timeoutSeconds}s
                  </div>
                </div>
                <div className="flex justify-between mt-2 text-xs text-base-content/60">
                  <span>Faster timeout (60s)</span>
                  <span>More patient (600s)</span>
                </div>
              </div>

              {/* Timeout recommendation based on chunk size */}
              <div className="bg-base-200 mt-3 p-3 rounded-lg text-sm">
                <Icon
                  icon="lucide--info"
                  className="inline-block mr-1 size-4 text-info"
                />
                {chunkSize > 50000 ? (
                  <>
                    With chunk size of {chunkSize.toLocaleString()} chars, a
                    timeout of at least 180s is recommended.
                  </>
                ) : chunkSize > 30000 ? (
                  <>
                    With chunk size of {chunkSize.toLocaleString()} chars, a
                    timeout of at least 120s is recommended.
                  </>
                ) : (
                  <>
                    With chunk size of {chunkSize.toLocaleString()} chars, the
                    default timeout of 180s should be sufficient.
                  </>
                )}
              </div>
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
                  {'  '}"chunkSize": {chunkSize.toLocaleString()},
                  <br />
                  {'  '}"method": "{method}",
                  <br />
                  {'  '}"timeoutSeconds": {timeoutSeconds}
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
                disabled={saving || !hasChanges()}
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
                  How LLM Extraction Works
                </p>
                <p className="mt-1 text-base-content/70">
                  When extracting entities and relationships from documents, the
                  LLM processes text in chunks. Larger chunks can capture more
                  context but may have higher variability. The function calling
                  method provides more reliable structured output than response
                  schema with most providers.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </PageContainer>
  );
}
