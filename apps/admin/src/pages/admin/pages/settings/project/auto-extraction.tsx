// Page: Project Settings - Auto-Extraction
// Route: /admin/settings/project/auto-extraction

import { useEffect, useState, useCallback } from 'react';
import { useConfig } from '@/contexts/config';
import { useApi } from '@/hooks/use-api';
import { Icon } from '@/components/atoms/Icon';
import { Spinner } from '@/components/atoms/Spinner';
import { PageContainer } from '@/components/layouts';
import type { Project } from '@/hooks/use-projects';
import { KBPurposeEditor } from '@/components/organisms/KBPurposeEditor';
import { DiscoveryWizard } from '@/components/organisms/DiscoveryWizard';

// Type definition for object type option in the UI
interface ObjectTypeOption {
  value: string;
  label: string;
  description: string;
}

// Notification channels
const NOTIFICATION_CHANNELS = [
  { value: 'inbox', label: 'In-App Inbox', icon: 'lucide--inbox' },
  { value: 'email', label: 'Email', icon: 'lucide--mail' },
];

// Default configuration
const DEFAULT_CONFIG = {
  enabled_types: ['Requirement', 'Decision', 'Feature', 'Task'],
  min_confidence: 0.7,
  require_review: true,
  notify_on_complete: true,
  notification_channels: ['inbox'],
  entity_similarity_threshold: 0.7,
};

export default function ProjectAutoExtractionSettingsPage() {
  const { config } = useConfig();
  const { apiBase, fetchJson } = useApi();

  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Available object types from template packs
  const [availableObjectTypes, setAvailableObjectTypes] = useState<
    ObjectTypeOption[]
  >([]);
  const [loadingTypes, setLoadingTypes] = useState(false);

  // Form state
  const [autoExtractEnabled, setAutoExtractEnabled] = useState(false);
  const [enabledTypes, setEnabledTypes] = useState<string[]>(
    DEFAULT_CONFIG.enabled_types
  );
  const [minConfidence, setMinConfidence] = useState(
    DEFAULT_CONFIG.min_confidence
  );
  const [requireReview, setRequireReview] = useState(
    DEFAULT_CONFIG.require_review
  );
  const [notifyOnComplete, setNotifyOnComplete] = useState(
    DEFAULT_CONFIG.notify_on_complete
  );
  const [notificationChannels, setNotificationChannels] = useState<string[]>(
    DEFAULT_CONFIG.notification_channels
  );

  // Entity similarity threshold for matching existing entities
  const [entitySimilarityThreshold, setEntitySimilarityThreshold] = useState(
    DEFAULT_CONFIG.entity_similarity_threshold
  );

  // Discovery Wizard state
  const [showDiscoveryWizard, setShowDiscoveryWizard] = useState(false);

  // Parallel extraction state
  const [allowParallelExtraction, setAllowParallelExtraction] = useState(false);

  // Load available object types from template packs
  const loadAvailableObjectTypes = useCallback(async () => {
    if (!config.activeProjectId) return;

    setLoadingTypes(true);

    try {
      const compiledTypes = await fetchJson<Record<string, any>>(
        `${apiBase}/api/template-packs/projects/${config.activeProjectId}/compiled-types`
      );

      // Transform compiled types into UI options
      const typeOptions: ObjectTypeOption[] = Object.entries(compiledTypes).map(
        ([typeName, schema]) => ({
          value: typeName,
          label: typeName + 's', // Pluralize for display (e.g., "Person" -> "Persons")
          description:
            schema.description || `${typeName} entities from your documents`,
        })
      );

      // Sort alphabetically by label
      typeOptions.sort((a, b) => a.label.localeCompare(b.label));

      setAvailableObjectTypes(typeOptions);
    } catch (err) {
      console.error('Failed to load object types from template packs:', err);
      // Fall back to empty array - user can still use Discovery Wizard
      setAvailableObjectTypes([]);
    } finally {
      setLoadingTypes(false);
    }
  }, [config.activeProjectId, apiBase, fetchJson]);

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
      setAutoExtractEnabled(projectData.auto_extract_objects || false);

      const extractConfig = projectData.auto_extract_config || {};
      setEnabledTypes(
        extractConfig.enabled_types || DEFAULT_CONFIG.enabled_types
      );
      setMinConfidence(
        extractConfig.min_confidence ?? DEFAULT_CONFIG.min_confidence
      );
      setRequireReview(
        extractConfig.require_review ?? DEFAULT_CONFIG.require_review
      );
      setNotifyOnComplete(
        extractConfig.notify_on_complete ?? DEFAULT_CONFIG.notify_on_complete
      );
      setNotificationChannels(
        extractConfig.notification_channels ||
          DEFAULT_CONFIG.notification_channels
      );
      setEntitySimilarityThreshold(
        extractConfig.entity_similarity_threshold ??
          DEFAULT_CONFIG.entity_similarity_threshold
      );

      // Load parallel extraction setting
      setAllowParallelExtraction(
        projectData.allow_parallel_extraction || false
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
    loadAvailableObjectTypes();
  }, [loadProject, loadAvailableObjectTypes]);

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
            auto_extract_objects: autoExtractEnabled,
            auto_extract_config: {
              enabled_types: enabledTypes,
              min_confidence: minConfidence,
              require_review: requireReview,
              notify_on_complete: notifyOnComplete,
              notification_channels: notificationChannels,
              entity_similarity_threshold: entitySimilarityThreshold,
            },
            allow_parallel_extraction: allowParallelExtraction,
          },
        }
      );

      setProject(updatedProject);
      setSuccessMessage('Auto-extraction settings saved successfully');

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
    if (!window.confirm('Reset all auto-extraction settings to defaults?')) {
      return;
    }

    setAutoExtractEnabled(false);
    setEnabledTypes(DEFAULT_CONFIG.enabled_types);
    setMinConfidence(DEFAULT_CONFIG.min_confidence);
    setRequireReview(DEFAULT_CONFIG.require_review);
    setNotifyOnComplete(DEFAULT_CONFIG.notify_on_complete);
    setNotificationChannels(DEFAULT_CONFIG.notification_channels);
    setEntitySimilarityThreshold(DEFAULT_CONFIG.entity_similarity_threshold);
    setAllowParallelExtraction(false);
  };

  // Toggle object type
  const handleToggleType = (type: string) => {
    setEnabledTypes((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]
    );
  };

  // Toggle notification channel
  const handleToggleChannel = (channel: string) => {
    setNotificationChannels((prev) =>
      prev.includes(channel)
        ? prev.filter((c) => c !== channel)
        : [...prev, channel]
    );
  };

  // Check if settings have changed
  const hasChanges = () => {
    if (!project) return false;

    const currentConfig = project.auto_extract_config || {};
    return (
      autoExtractEnabled !== (project.auto_extract_objects || false) ||
      JSON.stringify(enabledTypes) !==
        JSON.stringify(
          currentConfig.enabled_types || DEFAULT_CONFIG.enabled_types
        ) ||
      minConfidence !==
        (currentConfig.min_confidence ?? DEFAULT_CONFIG.min_confidence) ||
      requireReview !==
        (currentConfig.require_review ?? DEFAULT_CONFIG.require_review) ||
      notifyOnComplete !==
        (currentConfig.notify_on_complete ??
          DEFAULT_CONFIG.notify_on_complete) ||
      JSON.stringify(notificationChannels) !==
        JSON.stringify(
          currentConfig.notification_channels ||
            DEFAULT_CONFIG.notification_channels
        ) ||
      entitySimilarityThreshold !==
        (currentConfig.entity_similarity_threshold ??
          DEFAULT_CONFIG.entity_similarity_threshold) ||
      allowParallelExtraction !== (project.allow_parallel_extraction || false)
    );
  };

  if (!config.activeProjectId) {
    return (
      <PageContainer>
        <div className="alert alert-warning">
          <Icon icon="lucide--alert-triangle" className="size-5" />
          <span>
            Please select a project to configure auto-extraction settings
          </span>
        </div>
      </PageContainer>
    );
  }

  return (
    <PageContainer maxWidth="4xl" testId="page-settings-auto-extraction">
      {/* Header */}
      <div className="mb-6">
        <h1 className="font-bold text-2xl">Auto-Extraction Settings</h1>
        <p className="mt-1 text-base-content/70">
          Configure automatic extraction of structured objects from uploaded
          documents
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
          <Spinner size="lg" />
        </div>
      ) : (
        <div className="space-y-6">
          {/* Knowledge Base Purpose */}
          <div className="bg-base-100 border border-base-300 card">
            <div className="card-body">
              <h2 className="flex items-center gap-2 mb-4 font-semibold text-lg">
                <Icon
                  icon="lucide--lightbulb"
                  className="size-5 text-primary"
                />
                Knowledge Base Purpose
              </h2>
              <p className="mb-4 text-sm text-base-content/70">
                Describe the purpose and domain of this knowledge base. This
                helps the AI understand context when discovering object types
                and relationships.
              </p>
              {config.activeProjectId && (
                <KBPurposeEditor projectId={config.activeProjectId} />
              )}
            </div>
          </div>

          {/* Auto-Discovery */}
          <div className="bg-gradient-to-br from-primary/5 to-secondary/5 border border-primary/20 card">
            <div className="card-body">
              <div className="flex justify-between items-start gap-4">
                <div className="flex-1">
                  <h2 className="flex items-center gap-2 mb-2 font-semibold text-lg">
                    <Icon
                      icon="lucide--sparkles"
                      className="size-5 text-primary"
                    />
                    Auto-Discovery
                    <span className="badge badge-primary badge-sm">New</span>
                  </h2>
                  <p className="text-sm text-base-content/70">
                    Let AI analyze your documents to automatically discover
                    object types, properties, and relationships. Save hours of
                    manual template pack configuration.
                  </p>
                  <div className="flex flex-wrap gap-2 mt-3">
                    <div className="flex items-center gap-1.5 text-xs text-base-content/60">
                      <Icon
                        icon="lucide--check"
                        className="size-3.5 text-success"
                      />
                      <span>Discovers types automatically</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-base-content/60">
                      <Icon
                        icon="lucide--check"
                        className="size-3.5 text-success"
                      />
                      <span>Infers relationships</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-base-content/60">
                      <Icon
                        icon="lucide--check"
                        className="size-3.5 text-success"
                      />
                      <span>Generates template pack</span>
                    </div>
                  </div>
                </div>
                <button
                  className="gap-2 btn btn-primary"
                  onClick={() => setShowDiscoveryWizard(true)}
                >
                  <Icon icon="lucide--wand-sparkles" className="size-4" />
                  Run Discovery
                </button>
              </div>
            </div>
          </div>

          {/* Enable/Disable Auto-Extraction */}
          <div className="bg-base-100 border border-base-300 card">
            <div className="card-body">
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  <h2 className="flex items-center gap-2 font-semibold text-lg">
                    <Icon
                      icon="lucide--sparkles"
                      className="size-5 text-primary"
                    />
                    Enable Auto-Extraction
                  </h2>
                  <p className="mt-1 text-sm text-base-content/70">
                    Automatically extract structured objects from documents when
                    they are uploaded or updated
                  </p>
                </div>
                <input
                  type="checkbox"
                  className="toggle toggle-primary toggle-lg"
                  checked={autoExtractEnabled}
                  onChange={(e) => setAutoExtractEnabled(e.target.checked)}
                />
              </div>
            </div>
          </div>

          {/* Configuration Settings (only visible when enabled) */}
          {autoExtractEnabled && (
            <>
              {/* Object Types */}
              <div className="bg-base-100 border border-base-300 card">
                <div className="card-body">
                  <h3 className="flex items-center gap-2 mb-4 font-semibold">
                    <Icon icon="lucide--layers" className="size-5" />
                    Object Types to Extract
                  </h3>
                  <p className="mb-4 text-sm text-base-content/70">
                    Select which types of structured objects should be
                    automatically extracted
                  </p>

                  {loadingTypes ? (
                    <div className="flex justify-center items-center py-8">
                      <Spinner size="md" />
                    </div>
                  ) : availableObjectTypes.length === 0 ? (
                    <div className="bg-warning/5 p-4 border border-warning/20 rounded-lg">
                      <div className="flex gap-3">
                        <Icon
                          icon="lucide--alert-triangle"
                          className="mt-0.5 size-5 text-warning"
                        />
                        <div className="text-sm">
                          <p className="font-medium text-warning">
                            No Object Types Available
                          </p>
                          <p className="mt-1 text-base-content/70">
                            No template packs are installed for this project.
                            Use the Auto-Discovery feature above to
                            automatically generate object types from your
                            documents.
                          </p>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="gap-3 grid sm:grid-cols-2">
                      {availableObjectTypes.map((type) => (
                        <label
                          key={type.value}
                          className={`flex items-start gap-3 p-4 border rounded-lg cursor-pointer transition-colors ${
                            enabledTypes.includes(type.value)
                              ? 'border-primary bg-primary/5'
                              : 'border-base-300 hover:border-base-400'
                          }`}
                        >
                          <input
                            type="checkbox"
                            className="mt-0.5 checkbox checkbox-primary"
                            checked={enabledTypes.includes(type.value)}
                            onChange={() => handleToggleType(type.value)}
                          />
                          <div className="flex-1">
                            <div className="font-medium">{type.label}</div>
                            <div className="text-xs text-base-content/60">
                              {type.description}
                            </div>
                          </div>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Confidence Threshold */}
              <div className="bg-base-100 border border-base-300 card">
                <div className="card-body">
                  <h3 className="flex items-center gap-2 mb-4 font-semibold">
                    <Icon icon="lucide--gauge" className="size-5" />
                    Confidence Threshold
                  </h3>
                  <p className="mb-4 text-sm text-base-content/70">
                    Minimum confidence score (0.0 - 1.0) required for extracted
                    objects. Higher values mean more precision but may miss some
                    objects.
                  </p>
                  <div className="flex items-center gap-4">
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.05"
                      className="flex-1 range range-primary"
                      value={minConfidence}
                      onChange={(e) =>
                        setMinConfidence(parseFloat(e.target.value))
                      }
                    />
                    <div className="bg-base-200 px-4 py-2 rounded min-w-[4rem] font-mono text-lg text-center">
                      {minConfidence.toFixed(2)}
                    </div>
                  </div>
                  <div className="flex justify-between mt-2 text-xs text-base-content/60">
                    <span>More results (0.0)</span>
                    <span>Higher quality (1.0)</span>
                  </div>
                </div>
              </div>

              {/* Entity Similarity Threshold */}
              <div className="bg-base-100 border border-base-300 card">
                <div className="card-body">
                  <h3 className="flex items-center gap-2 mb-4 font-semibold">
                    <Icon icon="lucide--git-merge" className="size-5" />
                    Entity Similarity Threshold
                  </h3>
                  <p className="mb-4 text-sm text-base-content/70">
                    Minimum similarity score (0.0 - 1.0) required when matching
                    extracted entities against existing ones. Higher values
                    require closer matches to link entities together.
                  </p>
                  <div className="flex items-center gap-4">
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.05"
                      className="flex-1 range range-primary"
                      value={entitySimilarityThreshold}
                      onChange={(e) =>
                        setEntitySimilarityThreshold(parseFloat(e.target.value))
                      }
                    />
                    <div className="bg-base-200 px-4 py-2 rounded min-w-[4rem] font-mono text-lg text-center">
                      {entitySimilarityThreshold.toFixed(2)}
                    </div>
                  </div>
                  <div className="flex justify-between mt-2 text-xs text-base-content/60">
                    <span>More matches (0.0)</span>
                    <span>Stricter matching (1.0)</span>
                  </div>
                  <div className="bg-base-200 mt-3 p-3 rounded-lg text-sm">
                    <Icon
                      icon="lucide--info"
                      className="inline-block mr-1 size-4 text-info"
                    />
                    Lower values will match more entities together (e.g.,
                    &quot;John Smith&quot; might match &quot;J. Smith&quot;).
                    Higher values require closer name matches. Default is 0.7.
                  </div>
                </div>
              </div>

              {/* Review & Notification Settings */}
              <div className="bg-base-100 border border-base-300 card">
                <div className="card-body">
                  <h3 className="flex items-center gap-2 mb-4 font-semibold">
                    <Icon icon="lucide--settings" className="size-5" />
                    Additional Settings
                  </h3>
                  <div className="space-y-4">
                    {/* Require Review */}
                    <label className="flex items-start gap-3 p-4 border border-base-300 hover:border-base-400 rounded-lg transition-colors cursor-pointer">
                      <input
                        type="checkbox"
                        className="mt-0.5 checkbox checkbox-primary"
                        checked={requireReview}
                        onChange={(e) => setRequireReview(e.target.checked)}
                      />
                      <div className="flex-1">
                        <div className="font-medium">Require Manual Review</div>
                        <div className="mt-1 text-sm text-base-content/70">
                          Extracted objects will be marked for review before
                          being added to the knowledge base
                        </div>
                      </div>
                    </label>

                    {/* Notify on Complete */}
                    <label className="flex items-start gap-3 p-4 border border-base-300 hover:border-base-400 rounded-lg transition-colors cursor-pointer">
                      <input
                        type="checkbox"
                        className="mt-0.5 checkbox checkbox-primary"
                        checked={notifyOnComplete}
                        onChange={(e) => setNotifyOnComplete(e.target.checked)}
                      />
                      <div className="flex-1">
                        <div className="font-medium">Notify When Complete</div>
                        <div className="mt-1 text-sm text-base-content/70">
                          Send a notification when auto-extraction finishes
                        </div>
                      </div>
                    </label>
                  </div>

                  {/* Notification Channels */}
                  {notifyOnComplete && (
                    <div className="mt-4 pt-4 border-base-300 border-t">
                      <div className="mb-3 font-medium text-sm">
                        Notification Channels
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {NOTIFICATION_CHANNELS.map((channel) => (
                          <button
                            key={channel.value}
                            type="button"
                            className={`btn btn-sm gap-2 ${
                              notificationChannels.includes(channel.value)
                                ? 'btn-primary'
                                : 'btn-outline'
                            }`}
                            onClick={() => handleToggleChannel(channel.value)}
                          >
                            <Icon icon={channel.icon} className="size-4" />
                            {channel.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Job Processing Settings */}
              <div className="bg-base-100 border border-base-300 card">
                <div className="card-body">
                  <h3 className="flex items-center gap-2 mb-4 font-semibold">
                    <Icon icon="lucide--layers" className="size-5" />
                    Job Processing
                  </h3>
                  <div className="space-y-4">
                    {/* Parallel Extraction */}
                    <label className="flex items-start gap-3 p-4 border border-base-300 hover:border-base-400 rounded-lg transition-colors cursor-pointer">
                      <input
                        type="checkbox"
                        className="mt-0.5 checkbox checkbox-primary"
                        checked={allowParallelExtraction}
                        onChange={(e) =>
                          setAllowParallelExtraction(e.target.checked)
                        }
                      />
                      <div className="flex-1">
                        <div className="font-medium">
                          Allow Parallel Extraction
                        </div>
                        <div className="mt-1 text-sm text-base-content/70">
                          When enabled, multiple extraction jobs can run
                          simultaneously. When disabled (default), jobs are
                          queued and processed one at a time to reduce system
                          load.
                        </div>
                      </div>
                    </label>
                  </div>
                  <div className="bg-base-200 mt-3 p-3 rounded-lg text-sm">
                    <Icon
                      icon="lucide--info"
                      className="inline-block mr-1 size-4 text-info"
                    />
                    {allowParallelExtraction ? (
                      <>
                        Parallel processing is faster for large batches but uses
                        more system resources. Recommended for projects with
                        dedicated infrastructure.
                      </>
                    ) : (
                      <>
                        Sequential processing prevents resource contention and
                        is recommended for most projects. Jobs will be queued
                        and processed in order.
                      </>
                    )}
                  </div>
                </div>
              </div>
            </>
          )}

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
                    <Spinner size="sm" />
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
                  How Auto-Extraction Works
                </p>
                <p className="mt-1 text-base-content/70">
                  When a document is uploaded, the system uses AI to identify
                  and extract structured objects based on your configuration.
                  Extracted objects can be reviewed, edited, or approved before
                  being added to your knowledge base.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Discovery Wizard Modal */}
      {config.activeProjectId && (
        <DiscoveryWizard
          projectId={config.activeProjectId}
          isOpen={showDiscoveryWizard}
          onClose={() => setShowDiscoveryWizard(false)}
        />
      )}
    </PageContainer>
  );
}
