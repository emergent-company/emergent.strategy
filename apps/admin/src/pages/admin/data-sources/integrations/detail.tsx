import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { Icon } from '@/components/atoms/Icon';
import { Spinner } from '@/components/atoms/Spinner';
import { PageContainer } from '@/components/layouts';
import { useApi } from '@/hooks/use-api';
import { useConfig } from '@/contexts/config';
import { useToast } from '@/hooks/use-toast';
import { Modal } from '@/components/organisms/Modal/Modal';
import { SyncConfigModal } from './SyncConfigModal';
import { SyncConfigurationsModal } from './SyncConfigurationsModal';
import { SyncConfiguration } from './sync-config-types';

/**
 * Data source integration from the API
 */
interface DataSourceIntegration {
  id: string;
  projectId: string;
  providerType: string;
  sourceType: string;
  name: string;
  description?: string | null;
  syncMode: 'manual' | 'recurring';
  syncIntervalMinutes?: number | null;
  lastSyncedAt?: string | null;
  nextSyncAt?: string | null;
  status: 'active' | 'error' | 'disabled';
  errorMessage?: string | null;
  lastErrorAt?: string | null;
  errorCount: number;
  metadata: Record<string, any>;
  hasConfig: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * Provider metadata from the API
 */
interface ProviderMetadata {
  providerType: string;
  displayName: string;
  description: string;
  sourceType: string;
  icon: string;
  configSchema: Record<string, any>;
}

/**
 * Sync job from the API
 */
interface SyncJob {
  id: string;
  integrationId: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  totalItems: number;
  processedItems: number;
  successfulItems: number;
  failedItems: number;
  skippedItems: number;
  currentPhase: string | null;
  statusMessage: string | null;
  documentIds: string[];
  logs: Array<{
    timestamp: string;
    level: 'info' | 'warn' | 'error' | 'debug';
    message: string;
    details?: Record<string, any>;
  }>;
  errorMessage: string | null;
  triggerType: 'manual' | 'scheduled';
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
}

/**
 * JSON Schema property type
 */
interface SchemaProperty {
  type: string;
  title?: string;
  description?: string;
  default?: any;
  enum?: string[];
  minimum?: number;
  maximum?: number;
  format?: string;
}

const STATUS_CONFIG = {
  active: { label: 'Active', color: 'success', icon: 'lucide--check-circle' },
  error: { label: 'Error', color: 'error', icon: 'lucide--alert-circle' },
  disabled: { label: 'Disabled', color: 'ghost', icon: 'lucide--pause-circle' },
} as const;

export default function IntegrationDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { apiBase, fetchJson } = useApi();
  const { config } = useConfig();
  const { showToast } = useToast();

  // Data state
  const [integration, setIntegration] = useState<DataSourceIntegration | null>(
    null
  );
  const [provider, setProvider] = useState<ProviderMetadata | null>(null);
  const [syncJobs, setSyncJobs] = useState<SyncJob[]>([]);
  const [loadingSyncJobs, setLoadingSyncJobs] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Edit state
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState<{
    name: string;
    description: string;
    syncMode: 'manual' | 'recurring';
    syncIntervalMinutes: number;
    config: Record<string, any>;
  }>({
    name: '',
    description: '',
    syncMode: 'manual',
    syncIntervalMinutes: 60,
    config: {},
  });
  const [saving, setSaving] = useState(false);

  // Action state
  const [syncing, setSyncing] = useState(false);
  const [testing, setTesting] = useState(false);

  // Delete modal state
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Sync modal state
  const [syncModalOpen, setSyncModalOpen] = useState(false);

  // Sync configurations modal state
  const [configModalOpen, setConfigModalOpen] = useState(false);

  // Load sync jobs for this integration
  const loadSyncJobs = useCallback(async () => {
    if (!config.activeProjectId || !id) return;

    setLoadingSyncJobs(true);
    try {
      const jobs = await fetchJson<SyncJob[]>(
        `${apiBase}/api/data-source-integrations/${id}/sync-jobs?limit=10`
      );
      setSyncJobs(jobs);
    } catch (e) {
      // Don't show error for sync jobs - just log it
      console.error('Failed to load sync jobs:', e);
    } finally {
      setLoadingSyncJobs(false);
    }
  }, [apiBase, fetchJson, config.activeProjectId, id]);

  // Load integration and provider data
  const loadData = useCallback(async () => {
    if (!config.activeProjectId || !id) return;

    setLoading(true);
    setError(null);

    try {
      // Load integration
      const integrationData = await fetchJson<DataSourceIntegration>(
        `${apiBase}/api/data-source-integrations/${id}`
      );
      setIntegration(integrationData);

      // Load providers to get schema
      const providers = await fetchJson<ProviderMetadata[]>(
        `${apiBase}/api/data-source-integrations/providers`
      );
      const providerData = providers.find(
        (p) => p.providerType === integrationData.providerType
      );
      setProvider(providerData || null);

      // Initialize form data
      setFormData({
        name: integrationData.name,
        description: integrationData.description || '',
        syncMode: integrationData.syncMode,
        syncIntervalMinutes: integrationData.syncIntervalMinutes || 60,
        config: {}, // Config is not returned for security - only set on update
      });

      // Load sync jobs after integration data is loaded
      loadSyncJobs();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load integration');
    } finally {
      setLoading(false);
    }
  }, [apiBase, fetchJson, config.activeProjectId, id, loadSyncJobs]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Update form field
  const updateField = (key: string, value: any) => {
    setFormData((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  // Update config field
  const updateConfigField = (key: string, value: any) => {
    setFormData((prev) => ({
      ...prev,
      config: {
        ...prev.config,
        [key]: value,
      },
    }));
  };

  // Handle save
  const handleSave = async () => {
    if (!integration) return;

    setSaving(true);
    try {
      // Build update payload - only include config if any fields were changed
      const updatePayload: Record<string, any> = {
        name: formData.name,
        description: formData.description || undefined,
        syncMode: formData.syncMode,
        syncIntervalMinutes:
          formData.syncMode === 'recurring'
            ? formData.syncIntervalMinutes
            : undefined,
      };

      // Only include config if user entered new values
      const configEntries = Object.entries(formData.config).filter(
        ([, v]) => v !== '' && v !== undefined
      );
      if (configEntries.length > 0) {
        updatePayload.config = Object.fromEntries(configEntries);
      }

      const updated = await fetchJson<DataSourceIntegration>(
        `${apiBase}/api/data-source-integrations/${integration.id}`,
        {
          method: 'PATCH',
          body: updatePayload,
        }
      );

      setIntegration(updated);
      setIsEditing(false);
      // Reset config fields after save
      setFormData((prev) => ({ ...prev, config: {} }));

      showToast({
        message: 'Integration updated successfully',
        variant: 'success',
      });
    } catch (e) {
      showToast({
        message: e instanceof Error ? e.message : 'Failed to update',
        variant: 'error',
      });
    } finally {
      setSaving(false);
    }
  };

  // Handle cancel edit
  const handleCancelEdit = () => {
    if (!integration) return;

    setFormData({
      name: integration.name,
      description: integration.description || '',
      syncMode: integration.syncMode,
      syncIntervalMinutes: integration.syncIntervalMinutes || 60,
      config: {},
    });
    setIsEditing(false);
  };

  // Handle sync - open modal instead of direct sync
  const handleSync = () => {
    if (!integration) return;
    console.log('[DEBUG] Opening sync modal for integration:', integration.id);
    setSyncModalOpen(true);
  };

  // Handle sync started (async job created)
  const handleSyncStarted = () => {
    showToast({
      message: 'Sync started! Check the sync history for progress.',
      variant: 'success',
    });
    // Reload sync jobs to show the new job
    loadSyncJobs();
  };

  // Handle running a sync configuration directly from the config management modal
  const handleConfigurationRun = async (config: SyncConfiguration) => {
    if (!integration) return;

    setSyncing(true);
    try {
      await fetchJson(
        `${apiBase}/api/data-source-integrations/${integration.id}/sync-configurations/${config.id}/run`,
        { method: 'POST' }
      );

      showToast({
        message: `Sync started using "${config.name}" configuration!`,
        variant: 'success',
      });

      // Reload sync jobs to show the new job
      loadSyncJobs();
    } catch (e) {
      showToast({
        message: e instanceof Error ? e.message : 'Failed to start sync',
        variant: 'error',
      });
    } finally {
      setSyncing(false);
    }
  };

  // Handle test connection
  const handleTestConnection = async () => {
    if (!integration) return;

    setTesting(true);
    try {
      const result = await fetchJson<{ success: boolean; error?: string }>(
        `${apiBase}/api/data-source-integrations/${integration.id}/test-connection`,
        { method: 'POST' }
      );

      if (result.success) {
        showToast({
          message: 'Connection successful!',
          variant: 'success',
        });
      } else {
        showToast({
          message: result.error || 'Connection test failed',
          variant: 'error',
        });
      }

      // Reload to update status
      await loadData();
    } catch (e) {
      showToast({
        message: e instanceof Error ? e.message : 'Connection test failed',
        variant: 'error',
      });
    } finally {
      setTesting(false);
    }
  };

  // Handle toggle status (enable/disable)
  const handleToggleStatus = async () => {
    if (!integration) return;

    const newStatus = integration.status === 'disabled' ? 'active' : 'disabled';

    try {
      const updated = await fetchJson<DataSourceIntegration>(
        `${apiBase}/api/data-source-integrations/${integration.id}`,
        {
          method: 'PATCH',
          body: { status: newStatus },
        }
      );

      setIntegration(updated);
      showToast({
        message: `Integration ${
          newStatus === 'disabled' ? 'disabled' : 'enabled'
        }`,
        variant: 'success',
      });
    } catch (e) {
      showToast({
        message: e instanceof Error ? e.message : 'Failed to update status',
        variant: 'error',
      });
    }
  };

  // Handle delete
  const handleDelete = async () => {
    if (!integration) return;

    setDeleting(true);
    try {
      await fetchJson(
        `${apiBase}/api/data-source-integrations/${integration.id}`,
        { method: 'DELETE' }
      );

      showToast({
        message: `"${integration.name}" deleted successfully`,
        variant: 'success',
      });

      navigate('/admin/data-sources/integrations');
    } catch (e) {
      showToast({
        message: e instanceof Error ? e.message : 'Delete failed',
        variant: 'error',
      });
    } finally {
      setDeleting(false);
    }
  };

  // Render config form fields from JSON schema
  const renderConfigFields = () => {
    if (!provider?.configSchema?.properties) return null;

    const properties = provider.configSchema.properties as Record<
      string,
      SchemaProperty
    >;

    return Object.entries(properties).map(([key, prop]) => {
      const value = formData.config[key] ?? '';
      const isPasswordField =
        key.toLowerCase().includes('password') ||
        key.toLowerCase().includes('secret') ||
        key.toLowerCase().includes('token');

      // Render based on property type
      if (prop.enum) {
        return (
          <div key={key} className="form-control">
            <label className="label">
              <span className="label-text">{prop.title || key}</span>
            </label>
            <select
              className="select select-bordered w-full"
              value={value}
              onChange={(e) => updateConfigField(key, e.target.value)}
            >
              <option value="">No change</option>
              {prop.enum.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
            {prop.description && (
              <label className="label">
                <span className="label-text-alt text-base-content/60">
                  {prop.description}
                </span>
              </label>
            )}
          </div>
        );
      }

      if (prop.type === 'boolean') {
        return (
          <div key={key} className="form-control">
            <label className="label cursor-pointer justify-start gap-3">
              <input
                type="checkbox"
                className="checkbox"
                checked={!!value}
                onChange={(e) => updateConfigField(key, e.target.checked)}
              />
              <span className="label-text">{prop.title || key}</span>
            </label>
            {prop.description && (
              <label className="label pt-0">
                <span className="label-text-alt text-base-content/60">
                  {prop.description}
                </span>
              </label>
            )}
          </div>
        );
      }

      if (prop.type === 'integer' || prop.type === 'number') {
        return (
          <div key={key} className="form-control">
            <label className="label">
              <span className="label-text">{prop.title || key}</span>
            </label>
            <input
              type="number"
              className="input input-bordered w-full"
              value={value}
              min={prop.minimum}
              max={prop.maximum}
              placeholder="No change"
              onChange={(e) =>
                updateConfigField(
                  key,
                  e.target.value ? Number(e.target.value) : ''
                )
              }
            />
            {prop.description && (
              <label className="label">
                <span className="label-text-alt text-base-content/60">
                  {prop.description}
                </span>
              </label>
            )}
          </div>
        );
      }

      // String input (default)
      const inputType = isPasswordField
        ? 'password'
        : prop.format === 'email'
        ? 'email'
        : 'text';

      return (
        <div key={key} className="form-control">
          <label className="label">
            <span className="label-text">{prop.title || key}</span>
          </label>
          <input
            type={inputType}
            className="input input-bordered w-full"
            value={value}
            placeholder={isPasswordField ? '••••••••' : 'No change'}
            onChange={(e) => updateConfigField(key, e.target.value)}
          />
          {prop.description && (
            <label className="label">
              <span className="label-text-alt text-base-content/60">
                {prop.description}
              </span>
            </label>
          )}
        </div>
      );
    });
  };

  // Loading state
  if (loading) {
    return (
      <PageContainer maxWidth="full" className="px-4">
        <div className="flex justify-center items-center py-24">
          <Spinner size="lg" />
        </div>
      </PageContainer>
    );
  }

  // Error state
  if (error || !integration) {
    return (
      <PageContainer maxWidth="full" className="px-4">
        <div className="text-center py-24">
          <Icon
            icon="lucide--alert-circle"
            className="size-12 mx-auto mb-4 text-error"
          />
          <h2 className="text-xl font-semibold mb-2">Failed to Load</h2>
          <p className="text-base-content/70 mb-4">
            {error || 'Integration not found'}
          </p>
          <button className="btn btn-outline" onClick={() => navigate(-1)}>
            <Icon icon="lucide--arrow-left" className="size-4" />
            Go Back
          </button>
        </div>
      </PageContainer>
    );
  }

  const statusConfig = STATUS_CONFIG[integration.status];

  return (
    <PageContainer
      maxWidth="full"
      className="px-4"
      testId="page-integration-detail"
    >
      {/* Header */}
      <div className="mb-6">
        <button
          className="btn btn-ghost btn-sm mb-4"
          onClick={() => navigate('/admin/data-sources/integrations')}
        >
          <Icon icon="lucide--arrow-left" className="size-4" />
          Back to Integrations
        </button>

        <div className="flex justify-between items-start">
          <div className="flex items-center gap-4">
            <div className="p-3 rounded-lg bg-base-200">
              {provider?.icon?.startsWith('/') ? (
                <img
                  src={provider.icon}
                  alt={provider.displayName}
                  className="size-8 object-contain"
                />
              ) : (
                <Icon
                  icon={provider?.icon || 'lucide--plug-2'}
                  className="size-8"
                />
              )}
            </div>
            <div>
              <h1 className="font-bold text-2xl">{integration.name}</h1>
              <div className="flex items-center gap-3 mt-1">
                <span className="text-base-content/70">
                  {provider?.displayName || integration.providerType}
                </span>
                <div className="flex items-center gap-1.5">
                  <Icon
                    icon={statusConfig.icon}
                    className={`size-4 text-${statusConfig.color}`}
                  />
                  <span
                    className={`badge badge-${statusConfig.color} badge-sm`}
                  >
                    {statusConfig.label}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-2">
            {!isEditing ? (
              <>
                <button
                  className="btn btn-outline btn-sm"
                  onClick={handleTestConnection}
                  disabled={testing}
                >
                  {testing ? (
                    <Spinner size="sm" />
                  ) : (
                    <Icon icon="lucide--plug-zap" className="size-4" />
                  )}
                  Test
                </button>
                <button
                  className="btn btn-outline btn-sm"
                  onClick={handleSync}
                  disabled={syncing || integration.status === 'disabled'}
                >
                  {syncing ? (
                    <Spinner size="sm" />
                  ) : (
                    <Icon icon="lucide--refresh-cw" className="size-4" />
                  )}
                  Sync Now
                </button>
                <button
                  className="btn btn-primary btn-sm"
                  onClick={() => setIsEditing(true)}
                >
                  <Icon icon="lucide--edit" className="size-4" />
                  Edit
                </button>
              </>
            ) : (
              <>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={handleCancelEdit}
                  disabled={saving}
                >
                  Cancel
                </button>
                <button
                  className="btn btn-primary btn-sm"
                  onClick={handleSave}
                  disabled={saving}
                >
                  {saving ? (
                    <>
                      <Spinner size="sm" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Icon icon="lucide--save" className="size-4" />
                      Save Changes
                    </>
                  )}
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Error banner */}
      {integration.status === 'error' && integration.errorMessage && (
        <div className="alert alert-error mb-6">
          <Icon icon="lucide--alert-circle" className="size-5" />
          <div>
            <div className="font-medium">Sync Error</div>
            <div className="text-sm opacity-90">{integration.errorMessage}</div>
            {integration.lastErrorAt && (
              <div className="text-xs opacity-70 mt-1">
                Last error: {new Date(integration.lastErrorAt).toLocaleString()}
              </div>
            )}
          </div>
        </div>
      )}

      <div className="space-y-6">
        {/* Status & Sync Info Card */}
        <div className="card bg-base-200">
          <div className="card-body">
            <h3 className="font-medium text-sm text-base-content/60 uppercase tracking-wide mb-4">
              Status & Sync Information
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <div className="text-sm text-base-content/60">Status</div>
                <div className="font-medium flex items-center gap-1.5 mt-1">
                  <Icon
                    icon={statusConfig.icon}
                    className={`size-4 text-${statusConfig.color}`}
                  />
                  {statusConfig.label}
                </div>
              </div>
              <div>
                <div className="text-sm text-base-content/60">Sync Mode</div>
                <div className="font-medium capitalize mt-1">
                  {integration.syncMode}
                  {integration.syncMode === 'recurring' &&
                    integration.syncIntervalMinutes && (
                      <span className="text-base-content/50 font-normal">
                        {' '}
                        (every {integration.syncIntervalMinutes}m)
                      </span>
                    )}
                </div>
              </div>
              <div>
                <div className="text-sm text-base-content/60">Last Synced</div>
                <div className="font-medium mt-1">
                  {integration.lastSyncedAt
                    ? new Date(integration.lastSyncedAt).toLocaleString()
                    : 'Never'}
                </div>
              </div>
              <div>
                <div className="text-sm text-base-content/60">Next Sync</div>
                <div className="font-medium mt-1">
                  {integration.nextSyncAt
                    ? new Date(integration.nextSyncAt).toLocaleString()
                    : integration.syncMode === 'manual'
                    ? 'Manual'
                    : 'N/A'}
                </div>
              </div>
            </div>
            {integration.errorCount > 0 && (
              <div className="mt-4 pt-4 border-t border-base-300">
                <div className="text-sm text-error">
                  Error count: {integration.errorCount}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Sync History Card */}
        <div className="card bg-base-200">
          <div className="card-body">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-medium text-sm text-base-content/60 uppercase tracking-wide">
                Sync History
              </h3>
              <button
                className="btn btn-ghost btn-xs"
                onClick={loadSyncJobs}
                disabled={loadingSyncJobs}
              >
                <Icon
                  icon="lucide--refresh-cw"
                  className={`size-3 ${loadingSyncJobs ? 'animate-spin' : ''}`}
                />
                Refresh
              </button>
            </div>

            {loadingSyncJobs && syncJobs.length === 0 ? (
              <div className="flex justify-center py-8">
                <Spinner size="md" />
              </div>
            ) : syncJobs.length === 0 ? (
              <div className="text-center py-8 text-base-content/60">
                <Icon
                  icon="lucide--history"
                  className="size-8 mx-auto mb-2 opacity-50"
                />
                <p>No sync history yet</p>
                <p className="text-sm">
                  Click "Sync Now" to start your first sync
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="table table-sm">
                  <thead>
                    <tr>
                      <th>Status</th>
                      <th>Progress</th>
                      <th>Results</th>
                      <th>Started</th>
                      <th>Duration</th>
                    </tr>
                  </thead>
                  <tbody>
                    {syncJobs.map((job) => {
                      const statusBadge = {
                        pending: 'badge-ghost',
                        running: 'badge-info',
                        completed: 'badge-success',
                        failed: 'badge-error',
                        cancelled: 'badge-warning',
                      }[job.status];

                      const duration =
                        job.startedAt && job.completedAt
                          ? Math.round(
                              (new Date(job.completedAt).getTime() -
                                new Date(job.startedAt).getTime()) /
                                1000
                            )
                          : job.startedAt && job.status === 'running'
                          ? Math.round(
                              (Date.now() - new Date(job.startedAt).getTime()) /
                                1000
                            )
                          : null;

                      return (
                        <tr key={job.id}>
                          <td>
                            <span className={`badge badge-sm ${statusBadge}`}>
                              {job.status}
                            </span>
                            {job.status === 'running' &&
                              job.currentPhase &&
                              job.currentPhase !== 'initializing' && (
                                <span className="text-xs text-base-content/60 ml-2">
                                  ({job.currentPhase})
                                </span>
                              )}
                          </td>
                          <td>
                            {job.totalItems > 0 ? (
                              <div className="flex items-center gap-2">
                                <progress
                                  className="progress progress-primary w-20"
                                  value={job.processedItems}
                                  max={job.totalItems}
                                />
                                <span className="text-xs text-base-content/60">
                                  {job.processedItems}/{job.totalItems}
                                </span>
                              </div>
                            ) : job.status === 'running' ? (
                              <span className="text-xs text-base-content/60">
                                {job.statusMessage || 'Initializing...'}
                              </span>
                            ) : (
                              <span className="text-xs text-base-content/40">
                                -
                              </span>
                            )}
                          </td>
                          <td>
                            {job.status === 'completed' ||
                            job.status === 'failed' ? (
                              <div className="flex gap-2 text-xs">
                                <span className="text-success">
                                  {job.successfulItems} imported
                                </span>
                                {job.skippedItems > 0 && (
                                  <span className="text-warning">
                                    {job.skippedItems} skipped
                                  </span>
                                )}
                                {job.failedItems > 0 && (
                                  <span className="text-error">
                                    {job.failedItems} failed
                                  </span>
                                )}
                              </div>
                            ) : (
                              <span className="text-xs text-base-content/40">
                                -
                              </span>
                            )}
                          </td>
                          <td className="text-xs text-base-content/60">
                            {job.startedAt
                              ? new Date(job.startedAt).toLocaleString()
                              : new Date(job.createdAt).toLocaleString()}
                          </td>
                          <td className="text-xs text-base-content/60">
                            {duration !== null
                              ? duration < 60
                                ? `${duration}s`
                                : `${Math.floor(duration / 60)}m ${
                                    duration % 60
                                  }s`
                              : '-'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Basic Information Card */}
        <div className="card bg-base-200">
          <div className="card-body">
            <h3 className="font-medium text-sm text-base-content/60 uppercase tracking-wide mb-4">
              Basic Information
            </h3>

            {isEditing ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="form-control">
                  <label className="label">
                    <span className="label-text">
                      Name <span className="text-error">*</span>
                    </span>
                  </label>
                  <input
                    type="text"
                    className="input input-bordered w-full"
                    value={formData.name}
                    onChange={(e) => updateField('name', e.target.value)}
                  />
                </div>
                <div className="form-control">
                  <label className="label">
                    <span className="label-text">Description</span>
                  </label>
                  <input
                    type="text"
                    className="input input-bordered w-full"
                    value={formData.description}
                    onChange={(e) => updateField('description', e.target.value)}
                    placeholder="Optional description"
                  />
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <div className="text-sm text-base-content/60">Name</div>
                  <div className="font-medium mt-1">{integration.name}</div>
                </div>
                <div>
                  <div className="text-sm text-base-content/60">
                    Description
                  </div>
                  <div className="font-medium mt-1">
                    {integration.description || (
                      <span className="text-base-content/40">None</span>
                    )}
                  </div>
                </div>
                <div>
                  <div className="text-sm text-base-content/60">Provider</div>
                  <div className="font-medium mt-1">
                    {provider?.displayName || integration.providerType}
                  </div>
                </div>
                <div>
                  <div className="text-sm text-base-content/60">
                    Source Type
                  </div>
                  <div className="font-medium mt-1 capitalize">
                    {integration.sourceType}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Sync Settings Card */}
        <div className="card bg-base-200">
          <div className="card-body">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-medium text-sm text-base-content/60 uppercase tracking-wide">
                Sync Settings
              </h3>
              {!isEditing && (
                <button
                  className="btn btn-ghost btn-xs"
                  onClick={() => setConfigModalOpen(true)}
                >
                  <Icon icon="lucide--settings-2" className="size-3 mr-1" />
                  Manage Configurations
                </button>
              )}
            </div>

            {isEditing ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="form-control">
                  <label className="label">
                    <span className="label-text">Sync Mode</span>
                  </label>
                  <select
                    className="select select-bordered w-full"
                    value={formData.syncMode}
                    onChange={(e) =>
                      updateField(
                        'syncMode',
                        e.target.value as 'manual' | 'recurring'
                      )
                    }
                  >
                    <option value="manual">Manual</option>
                    <option value="recurring">Recurring</option>
                  </select>
                </div>
                {formData.syncMode === 'recurring' && (
                  <div className="form-control">
                    <label className="label">
                      <span className="label-text">
                        Sync Interval (minutes)
                      </span>
                    </label>
                    <input
                      type="number"
                      className="input input-bordered w-full"
                      value={formData.syncIntervalMinutes}
                      min={15}
                      max={1440}
                      onChange={(e) =>
                        updateField(
                          'syncIntervalMinutes',
                          Number(e.target.value)
                        )
                      }
                    />
                  </div>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-sm text-base-content/60">Sync Mode</div>
                  <div className="font-medium mt-1 capitalize">
                    {integration.syncMode}
                  </div>
                </div>
                {integration.syncMode === 'recurring' && (
                  <div>
                    <div className="text-sm text-base-content/60">
                      Sync Interval
                    </div>
                    <div className="font-medium mt-1">
                      Every {integration.syncIntervalMinutes} minutes
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Connection Settings Card (only shown when editing) */}
        {isEditing && provider?.configSchema?.properties && (
          <div className="card bg-base-200">
            <div className="card-body">
              <h3 className="font-medium text-sm text-base-content/60 uppercase tracking-wide mb-2">
                Connection Settings
              </h3>
              <p className="text-sm text-base-content/60 mb-4">
                Leave fields empty to keep current values. Enter new values to
                update.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {renderConfigFields()}
              </div>
            </div>
          </div>
        )}

        {/* Metadata Card */}
        {integration.metadata &&
          Object.keys(integration.metadata).length > 0 && (
            <div className="card bg-base-200">
              <div className="card-body">
                <h3 className="font-medium text-sm text-base-content/60 uppercase tracking-wide mb-4">
                  Metadata
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {Object.entries(integration.metadata).map(([key, value]) => (
                    <div key={key}>
                      <div className="text-sm text-base-content/60">{key}</div>
                      <div className="font-medium mt-1">{String(value)}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

        {/* Timestamps Card */}
        <div className="card bg-base-200">
          <div className="card-body">
            <h3 className="font-medium text-sm text-base-content/60 uppercase tracking-wide mb-4">
              Timestamps
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-sm text-base-content/60">Created</div>
                <div className="font-medium mt-1">
                  {new Date(integration.createdAt).toLocaleString()}
                </div>
              </div>
              <div>
                <div className="text-sm text-base-content/60">Last Updated</div>
                <div className="font-medium mt-1">
                  {new Date(integration.updatedAt).toLocaleString()}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Danger Zone */}
        <div className="card bg-base-200 border border-error/20">
          <div className="card-body">
            <h3 className="font-medium text-sm text-error uppercase tracking-wide mb-4">
              Danger Zone
            </h3>
            <div className="flex flex-wrap gap-3">
              <button
                className="btn btn-outline btn-sm"
                onClick={handleToggleStatus}
              >
                <Icon
                  icon={
                    integration.status === 'disabled'
                      ? 'lucide--play'
                      : 'lucide--pause'
                  }
                  className="size-4"
                />
                {integration.status === 'disabled'
                  ? 'Enable Integration'
                  : 'Disable Integration'}
              </button>
              <button
                className="btn btn-error btn-outline btn-sm"
                onClick={() => setDeleteModalOpen(true)}
              >
                <Icon icon="lucide--trash-2" className="size-4" />
                Delete Integration
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      <Modal
        open={deleteModalOpen}
        onOpenChange={(open) => {
          if (!open) setDeleteModalOpen(false);
        }}
        title="Delete Integration"
        sizeClassName="max-w-md"
        actions={[
          {
            label: 'Cancel',
            variant: 'ghost',
            onClick: () => setDeleteModalOpen(false),
          },
          {
            label: deleting ? 'Deleting...' : 'Delete',
            variant: 'error' as const,
            onClick: handleDelete,
            disabled: deleting,
          },
        ]}
      >
        <div className="space-y-4">
          <p>
            Are you sure you want to delete{' '}
            <strong>"{integration.name}"</strong>?
          </p>
          <div className="alert alert-warning">
            <Icon icon="lucide--alert-triangle" className="size-5" />
            <span>
              This will not delete documents that were already imported from
              this integration.
            </span>
          </div>
        </div>
      </Modal>

      {/* Sync Configuration Modal */}
      {integration && (
        <SyncConfigModal
          open={syncModalOpen}
          integrationId={integration.id}
          integrationName={integration.name}
          sourceType={integration.sourceType}
          apiBase={apiBase}
          fetchJson={fetchJson}
          onClose={() => setSyncModalOpen(false)}
          onSyncStarted={handleSyncStarted}
          onManageConfigurations={() => {
            setSyncModalOpen(false);
            setConfigModalOpen(true);
          }}
        />
      )}

      {/* Sync Configurations Management Modal */}
      {integration && (
        <SyncConfigurationsModal
          open={configModalOpen}
          integrationId={integration.id}
          integrationName={integration.name}
          sourceType={integration.sourceType}
          apiBase={apiBase}
          fetchJson={fetchJson}
          onClose={() => setConfigModalOpen(false)}
          onConfigurationRun={handleConfigurationRun}
        />
      )}
    </PageContainer>
  );
}
