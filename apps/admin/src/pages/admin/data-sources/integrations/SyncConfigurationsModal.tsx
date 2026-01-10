import { useState, useEffect, useCallback } from 'react';
import { Modal } from '@/components/organisms/Modal/Modal';
import { Icon } from '@/components/atoms/Icon';
import { Spinner } from '@/components/atoms/Spinner';
import {
  SyncConfiguration,
  SyncConfigurationListResponse,
  CreateSyncConfigurationPayload,
  UpdateSyncConfigurationPayload,
  SyncOptions,
} from './sync-config-types';

/**
 * FetchJson init options - matches useApi hook
 */
type FetchJsonInit<B = unknown> = {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: B;
  headers?: Record<string, string>;
  credentials?: RequestCredentials;
  json?: boolean;
};

export interface SyncConfigurationsModalProps {
  open: boolean;
  integrationId: string;
  integrationName: string;
  sourceType: 'email' | 'drive' | 'clickup-document' | string;
  apiBase: string;
  fetchJson: <T, B = unknown>(
    url: string,
    init?: FetchJsonInit<B>
  ) => Promise<T>;
  onClose: () => void;
  onConfigurationSelect?: (config: SyncConfiguration) => void;
  onConfigurationRun?: (config: SyncConfiguration) => void;
}

type ViewMode = 'list' | 'create' | 'edit';

/**
 * Modal for managing sync configurations (named presets)
 */
export function SyncConfigurationsModal({
  open,
  integrationId,
  integrationName,
  sourceType,
  apiBase,
  fetchJson,
  onClose,
  onConfigurationSelect,
  onConfigurationRun,
}: SyncConfigurationsModalProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [configurations, setConfigurations] = useState<SyncConfiguration[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Edit/create form state
  const [editingConfig, setEditingConfig] = useState<SyncConfiguration | null>(
    null
  );
  const [formData, setFormData] = useState<{
    name: string;
    description: string;
    isDefault: boolean;
    limit: number;
    incrementalOnly: boolean;
  }>({
    name: '',
    description: '',
    isDefault: false,
    limit: 100,
    incrementalOnly: true,
  });

  // Delete confirmation
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const baseUrl = `${apiBase}/api/data-source-integrations/${integrationId}/sync-configurations`;

  // Load configurations
  const loadConfigurations = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetchJson<SyncConfigurationListResponse>(baseUrl);
      setConfigurations(response.configurations);
    } catch (err) {
      const e = err as Error;
      setError(e.message || 'Failed to load configurations');
    } finally {
      setLoading(false);
    }
  }, [baseUrl, fetchJson]);

  // Load on open
  useEffect(() => {
    if (open) {
      setViewMode('list');
      setEditingConfig(null);
      setDeleteConfirmId(null);
      loadConfigurations();
    }
  }, [open, loadConfigurations]);

  // Reset form for create
  const startCreate = () => {
    setFormData({
      name: '',
      description: '',
      isDefault: configurations.length === 0, // First config is default
      limit: 100,
      incrementalOnly: true,
    });
    setEditingConfig(null);
    setViewMode('create');
  };

  // Load form for edit
  const startEdit = (config: SyncConfiguration) => {
    setFormData({
      name: config.name,
      description: config.description || '',
      isDefault: config.isDefault,
      limit: config.options.limit || 100,
      incrementalOnly: config.options.incrementalOnly !== false,
    });
    setEditingConfig(config);
    setViewMode('edit');
  };

  // Save configuration (create or update)
  const handleSave = async () => {
    if (!formData.name.trim()) {
      setError('Name is required');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const options: SyncOptions = {
        limit: formData.limit,
        incrementalOnly: formData.incrementalOnly,
      };

      if (viewMode === 'create') {
        const payload: CreateSyncConfigurationPayload = {
          name: formData.name.trim(),
          description: formData.description.trim() || undefined,
          isDefault: formData.isDefault,
          options,
        };

        await fetchJson<SyncConfiguration, CreateSyncConfigurationPayload>(
          baseUrl,
          {
            method: 'POST',
            body: payload,
          }
        );
      } else if (editingConfig) {
        const payload: UpdateSyncConfigurationPayload = {
          name: formData.name.trim(),
          description: formData.description.trim() || undefined,
          isDefault: formData.isDefault,
          options,
        };

        await fetchJson<SyncConfiguration, UpdateSyncConfigurationPayload>(
          `${baseUrl}/${editingConfig.id}`,
          {
            method: 'PATCH',
            body: payload,
          }
        );
      }

      // Reload and go back to list
      await loadConfigurations();
      setViewMode('list');
      setEditingConfig(null);
    } catch (err) {
      const e = err as Error;
      setError(e.message || 'Failed to save configuration');
    } finally {
      setSaving(false);
    }
  };

  // Delete configuration
  const handleDelete = async (configId: string) => {
    setDeleting(true);
    setError(null);

    try {
      await fetchJson<void>(`${baseUrl}/${configId}`, {
        method: 'DELETE',
      });

      await loadConfigurations();
      setDeleteConfirmId(null);
    } catch (err) {
      const e = err as Error;
      setError(e.message || 'Failed to delete configuration');
    } finally {
      setDeleting(false);
    }
  };

  // Run a configuration
  const handleRun = (config: SyncConfiguration) => {
    if (onConfigurationRun) {
      onConfigurationRun(config);
      onClose();
    }
  };

  // Select a configuration (for use in SyncConfigModal)
  const handleSelect = (config: SyncConfiguration) => {
    if (onConfigurationSelect) {
      onConfigurationSelect(config);
      onClose();
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString();
  };

  const getSourceTypeLabel = () => {
    switch (sourceType) {
      case 'email':
        return 'emails';
      case 'drive':
        return 'files';
      case 'clickup-document':
        return 'docs';
      default:
        return 'items';
    }
  };

  // Render list view
  const renderList = () => {
    if (loading) {
      return (
        <div className="flex items-center justify-center py-12">
          <Spinner size="lg" />
          <span className="ml-3">Loading configurations...</span>
        </div>
      );
    }

    if (configurations.length === 0) {
      return (
        <div className="text-center py-12">
          <Icon
            icon="lucide--settings-2"
            className="w-12 h-12 mx-auto mb-4 opacity-50"
          />
          <h3 className="text-lg font-medium mb-2">No Sync Configurations</h3>
          <p className="text-base-content/70 mb-6">
            Create named configurations to save your sync settings and run them
            with one click.
          </p>
          <button className="btn btn-primary" onClick={startCreate}>
            <Icon icon="lucide--plus" className="w-4 h-4 mr-2" />
            Create Configuration
          </button>
        </div>
      );
    }

    return (
      <div className="space-y-3">
        {configurations.map((config) => (
          <div
            key={config.id}
            className="bg-base-200 rounded-lg p-4 hover:bg-base-300 transition-colors"
          >
            {/* Delete confirmation overlay */}
            {deleteConfirmId === config.id && (
              <div className="flex items-center justify-between bg-error/10 -m-4 p-4 rounded-lg">
                <span className="text-error">
                  Delete &quot;{config.name}&quot;?
                </span>
                <div className="space-x-2">
                  <button
                    className="btn btn-sm btn-ghost"
                    onClick={() => setDeleteConfirmId(null)}
                    disabled={deleting}
                  >
                    Cancel
                  </button>
                  <button
                    className="btn btn-sm btn-error"
                    onClick={() => handleDelete(config.id)}
                    disabled={deleting}
                  >
                    {deleting ? <Spinner size="xs" /> : 'Delete'}
                  </button>
                </div>
              </div>
            )}

            {/* Normal view */}
            {deleteConfirmId !== config.id && (
              <>
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h4 className="font-medium">{config.name}</h4>
                      {config.isDefault && (
                        <span className="badge badge-primary badge-sm">
                          Default
                        </span>
                      )}
                    </div>
                    {config.description && (
                      <p className="text-sm text-base-content/70 mt-1">
                        {config.description}
                      </p>
                    )}
                    <div className="text-xs text-base-content/50 mt-2">
                      Limit: {config.options.limit || 100}{' '}
                      {getSourceTypeLabel()}
                      {config.options.incrementalOnly !== false && (
                        <span className="ml-2">| Incremental only</span>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1">
                    {onConfigurationRun && (
                      <button
                        className="btn btn-sm btn-primary"
                        onClick={() => handleRun(config)}
                        title="Run this configuration"
                      >
                        <Icon icon="lucide--play" className="w-4 h-4" />
                      </button>
                    )}
                    {onConfigurationSelect && (
                      <button
                        className="btn btn-sm btn-ghost"
                        onClick={() => handleSelect(config)}
                        title="Use this configuration"
                      >
                        <Icon icon="lucide--check" className="w-4 h-4" />
                      </button>
                    )}
                    <button
                      className="btn btn-sm btn-ghost"
                      onClick={() => startEdit(config)}
                      title="Edit configuration"
                    >
                      <Icon icon="lucide--pencil" className="w-4 h-4" />
                    </button>
                    <button
                      className="btn btn-sm btn-ghost text-error"
                      onClick={() => setDeleteConfirmId(config.id)}
                      title="Delete configuration"
                    >
                      <Icon icon="lucide--trash-2" className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <div className="text-xs text-base-content/50 mt-2">
                  Updated: {formatDate(config.updatedAt)}
                </div>
              </>
            )}
          </div>
        ))}
      </div>
    );
  };

  // Render create/edit form
  const renderForm = () => {
    const isEdit = viewMode === 'edit';

    return (
      <div className="space-y-4">
        {/* Name */}
        <div className="form-control">
          <label className="label">
            <span className="label-text font-medium">Name *</span>
          </label>
          <input
            type="text"
            placeholder="e.g., Quick Daily Check"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            className="input input-bordered"
            maxLength={100}
          />
        </div>

        {/* Description */}
        <div className="form-control">
          <label className="label">
            <span className="label-text">Description</span>
          </label>
          <textarea
            placeholder="Optional description of what this configuration does"
            value={formData.description}
            onChange={(e) =>
              setFormData({ ...formData, description: e.target.value })
            }
            className="textarea textarea-bordered"
            rows={2}
            maxLength={500}
          />
        </div>

        <div className="divider">Sync Options</div>

        {/* Limit */}
        <div className="form-control">
          <label className="label">
            <span className="label-text">
              Maximum {getSourceTypeLabel()} to sync
            </span>
            <span className="label-text-alt">{formData.limit}</span>
          </label>
          <input
            type="range"
            min="10"
            max="500"
            step="10"
            value={formData.limit}
            onChange={(e) =>
              setFormData({ ...formData, limit: parseInt(e.target.value) })
            }
            className="range range-primary"
          />
          <div className="flex justify-between text-xs px-2 mt-1">
            <span>10</span>
            <span>100</span>
            <span>250</span>
            <span>500</span>
          </div>
        </div>

        {/* Incremental Only (email-specific but shown for all) */}
        <div className="form-control">
          <label className="label cursor-pointer">
            <div className="flex flex-col">
              <span className="label-text">Incremental sync only</span>
              <span className="label-text text-xs opacity-60">
                {formData.incrementalOnly
                  ? 'Only syncs items received after last sync'
                  : 'Re-scans all items (can re-import deleted items)'}
              </span>
            </div>
            <input
              type="checkbox"
              checked={formData.incrementalOnly}
              onChange={(e) =>
                setFormData({ ...formData, incrementalOnly: e.target.checked })
              }
              className="checkbox checkbox-primary"
            />
          </label>
        </div>

        {/* Default Toggle */}
        <div className="form-control">
          <label className="label cursor-pointer">
            <div className="flex flex-col">
              <span className="label-text">Set as default</span>
              <span className="label-text text-xs opacity-60">
                Default configuration is used when running quick sync
              </span>
            </div>
            <input
              type="checkbox"
              checked={formData.isDefault}
              onChange={(e) =>
                setFormData({ ...formData, isDefault: e.target.checked })
              }
              className="checkbox checkbox-primary"
            />
          </label>
        </div>
      </div>
    );
  };

  const getTitle = () => {
    switch (viewMode) {
      case 'list':
        return `Sync Configurations - ${integrationName}`;
      case 'create':
        return 'Create Configuration';
      case 'edit':
        return `Edit: ${editingConfig?.name}`;
    }
  };

  const getActions = () => {
    if (viewMode === 'list') {
      return [
        {
          label: 'Close',
          variant: 'ghost' as const,
          onClick: onClose,
        },
        {
          label: 'New Configuration',
          variant: 'primary' as const,
          icon: 'lucide--plus',
          onClick: startCreate,
        },
      ];
    }

    // Create/Edit view
    return [
      {
        label: 'Cancel',
        variant: 'ghost' as const,
        onClick: () => {
          setViewMode('list');
          setEditingConfig(null);
          setError(null);
        },
      },
      {
        label: saving ? 'Saving...' : 'Save',
        variant: 'primary' as const,
        icon: saving ? undefined : 'lucide--save',
        disabled: saving || !formData.name.trim(),
        onClick: handleSave,
      },
    ];
  };

  return (
    <Modal
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) {
          onClose();
        }
      }}
      title={getTitle()}
      sizeClassName="max-w-xl"
      actions={getActions()}
    >
      {/* Error message */}
      {error && (
        <div className="alert alert-error mb-4">
          <Icon icon="lucide--alert-circle" className="w-5 h-5" />
          <span>{error}</span>
          <button
            className="btn btn-sm btn-ghost"
            onClick={() => setError(null)}
          >
            <Icon icon="lucide--x" className="w-4 h-4" />
          </button>
        </div>
      )}

      {viewMode === 'list' ? renderList() : renderForm()}
    </Modal>
  );
}
