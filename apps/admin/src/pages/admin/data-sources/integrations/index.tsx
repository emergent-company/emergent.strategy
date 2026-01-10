import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { Icon } from '@/components/atoms/Icon';
import { PageContainer } from '@/components/layouts';
import { useApi } from '@/hooks/use-api';
import { useConfig } from '@/contexts/config';
import { useToast } from '@/hooks/use-toast';
import {
  DataTable,
  type ColumnDef,
  type RowAction,
} from '@/components/organisms/DataTable';
import { Modal } from '@/components/organisms/Modal/Modal';

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

const STATUS_CONFIG = {
  active: { label: 'Active', color: 'success', icon: 'lucide--check-circle' },
  error: { label: 'Error', color: 'error', icon: 'lucide--alert-circle' },
  disabled: { label: 'Disabled', color: 'ghost', icon: 'lucide--pause-circle' },
} as const;

const PROVIDER_ICONS: Record<string, string> = {
  imap: 'lucide--mail',
  gmail_api: 'simple-icons--gmail',
  default: 'lucide--plug-2',
};

export default function IntegrationsListPage() {
  const navigate = useNavigate();
  const { apiBase, fetchJson } = useApi();
  const { config } = useConfig();
  const { showToast } = useToast();

  const [integrations, setIntegrations] = useState<DataSourceIntegration[]>([]);
  const [providers, setProviders] = useState<ProviderMetadata[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Sync state
  const [syncing, setSyncing] = useState<Set<string>>(new Set());

  // Delete modal state
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [integrationToDelete, setIntegrationToDelete] =
    useState<DataSourceIntegration | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Load integrations and providers
  useEffect(() => {
    let cancelled = false;

    if (!config.activeProjectId) {
      setLoading(false);
      return () => {
        cancelled = true;
      };
    }

    async function load() {
      setLoading(true);
      setError(null);
      try {
        // Fetch integrations and providers in parallel
        const [integrationsRes, providersRes] = await Promise.all([
          fetchJson<DataSourceIntegration[]>(
            `${apiBase}/api/data-source-integrations`
          ),
          fetchJson<ProviderMetadata[]>(
            `${apiBase}/api/data-source-integrations/providers`
          ),
        ]);

        if (!cancelled) {
          setIntegrations(integrationsRes);
          setProviders(providersRes);
        }
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'Failed to load';
        if (!cancelled) setError(msg);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [apiBase, fetchJson, config.activeProjectId]);

  // Refresh integrations
  const refreshIntegrations = useCallback(async () => {
    if (!config.activeProjectId) return;

    try {
      const result = await fetchJson<DataSourceIntegration[]>(
        `${apiBase}/api/data-source-integrations`
      );
      setIntegrations(result);
    } catch (e) {
      console.error('Failed to refresh integrations:', e);
    }
  }, [apiBase, fetchJson, config.activeProjectId]);

  // Handle sync
  const handleSync = async (integration: DataSourceIntegration) => {
    setSyncing((prev) => new Set(prev).add(integration.id));

    try {
      await fetchJson(
        `${apiBase}/api/data-source-integrations/${integration.id}/sync`,
        {
          method: 'POST',
        }
      );

      showToast({
        message: `Sync started for "${integration.name}"`,
        variant: 'success',
      });

      // Refresh after a short delay to show updated status
      setTimeout(refreshIntegrations, 2000);
    } catch (e) {
      showToast({
        message: e instanceof Error ? e.message : 'Sync failed',
        variant: 'error',
      });
    } finally {
      setSyncing((prev) => {
        const next = new Set(prev);
        next.delete(integration.id);
        return next;
      });
    }
  };

  // Handle test connection
  const handleTestConnection = async (integration: DataSourceIntegration) => {
    try {
      const result = await fetchJson<{ success: boolean; error?: string }>(
        `${apiBase}/api/data-source-integrations/${integration.id}/test-connection`,
        { method: 'POST' }
      );

      if (result.success) {
        showToast({
          message: `Connection to "${integration.name}" successful!`,
          variant: 'success',
        });
      } else {
        showToast({
          message: result.error || 'Connection test failed',
          variant: 'error',
        });
      }
    } catch (e) {
      showToast({
        message: e instanceof Error ? e.message : 'Connection test failed',
        variant: 'error',
      });
    }
  };

  // Handle delete
  const handleDelete = (integration: DataSourceIntegration) => {
    setIntegrationToDelete(integration);
    setDeleteModalOpen(true);
  };

  const confirmDelete = async () => {
    if (!integrationToDelete) return;

    setDeleting(true);
    try {
      await fetchJson(
        `${apiBase}/api/data-source-integrations/${integrationToDelete.id}`,
        { method: 'DELETE' }
      );

      showToast({
        message: `"${integrationToDelete.name}" deleted successfully`,
        variant: 'success',
      });

      setDeleteModalOpen(false);
      setIntegrationToDelete(null);
      await refreshIntegrations();
    } catch (e) {
      showToast({
        message: e instanceof Error ? e.message : 'Delete failed',
        variant: 'error',
      });
    } finally {
      setDeleting(false);
    }
  };

  // Get provider display name
  const getProviderName = (providerType: string): string => {
    const provider = providers.find((p) => p.providerType === providerType);
    return provider?.displayName || providerType;
  };

  // Get provider icon
  const getProviderIcon = (providerType: string): string => {
    const provider = providers.find((p) => p.providerType === providerType);
    return (
      provider?.icon || PROVIDER_ICONS[providerType] || PROVIDER_ICONS.default
    );
  };

  // Render provider icon (handles both image paths and icon classes)
  const renderProviderIcon = (providerType: string, size = 'size-5') => {
    const icon = getProviderIcon(providerType);
    const provider = providers.find((p) => p.providerType === providerType);

    if (icon.startsWith('/')) {
      return (
        <img
          src={icon}
          alt={provider?.displayName || providerType}
          className={`${size} object-contain`}
        />
      );
    }
    return <Icon icon={icon} className={size} />;
  };

  // Table columns
  const columns: ColumnDef<DataSourceIntegration>[] = [
    {
      key: 'name',
      label: 'Integration',
      sortable: true,
      width: 'w-64',
      render: (integration) => (
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-base-200">
            {renderProviderIcon(integration.providerType)}
          </div>
          <div>
            <div className="font-medium">{integration.name}</div>
            <div className="text-sm text-base-content/60">
              {getProviderName(integration.providerType)}
            </div>
          </div>
        </div>
      ),
    },
    {
      key: 'status',
      label: 'Status',
      sortable: true,
      width: 'w-32',
      render: (integration) => {
        const statusConfig = STATUS_CONFIG[integration.status];
        return (
          <div className="flex items-center gap-2">
            <Icon
              icon={statusConfig.icon}
              className={`size-4 text-${statusConfig.color}`}
            />
            <span className={`badge badge-${statusConfig.color} badge-sm`}>
              {statusConfig.label}
            </span>
          </div>
        );
      },
    },
    {
      key: 'syncMode',
      label: 'Sync Mode',
      sortable: true,
      width: 'w-32',
      render: (integration) => (
        <span className="text-sm text-base-content/70 capitalize">
          {integration.syncMode}
          {integration.syncMode === 'recurring' &&
            integration.syncIntervalMinutes && (
              <span className="text-base-content/50">
                {' '}
                ({integration.syncIntervalMinutes}m)
              </span>
            )}
        </span>
      ),
    },
    {
      key: 'lastSyncedAt',
      label: 'Last Synced',
      sortable: true,
      width: 'w-40',
      render: (integration) => {
        if (!integration.lastSyncedAt) {
          return <span className="text-base-content/40">Never</span>;
        }
        const date = new Date(integration.lastSyncedAt);
        return (
          <span
            className="text-sm text-base-content/70"
            title={date.toISOString()}
          >
            {date.toLocaleString()}
          </span>
        );
      },
    },
    {
      key: 'createdAt',
      label: 'Created',
      sortable: true,
      width: 'w-32',
      render: (integration) => (
        <span className="text-sm text-base-content/70">
          {new Date(integration.createdAt).toLocaleDateString()}
        </span>
      ),
    },
  ];

  // Row actions
  const rowActions: RowAction<DataSourceIntegration>[] = [
    {
      label: 'Edit',
      icon: 'lucide--edit',
      onAction: (integration) =>
        navigate(`/admin/data-sources/integrations/${integration.id}`),
    },
    {
      label: 'Sync Now',
      icon: 'lucide--refresh-cw',
      onAction: handleSync,
      hidden: (integration) => integration.status === 'disabled',
    },
    {
      label: 'Test Connection',
      icon: 'lucide--plug-zap',
      onAction: handleTestConnection,
    },
    {
      label: 'Delete',
      icon: 'lucide--trash-2',
      variant: 'error',
      onAction: handleDelete,
    },
  ];

  return (
    <PageContainer maxWidth="full" className="px-4" testId="page-integrations">
      {/* Header */}
      <div className="flex justify-between items-start mb-6">
        <div>
          <h1 className="font-bold text-2xl inline-flex items-center gap-2">
            <Icon icon="lucide--plug-2" className="size-6" />
            Data Source Integrations
            {!loading && (
              <span className="badge badge-ghost badge-lg font-normal">
                {integrations.length}
              </span>
            )}
          </h1>
          <p className="mt-1 text-base-content/70">
            Connect external data sources to import documents automatically
          </p>
        </div>
        <button
          className="btn btn-primary"
          onClick={() => navigate('/admin/data-sources/integrations/new')}
        >
          <Icon icon="lucide--plus" className="size-4" />
          Add Integration
        </button>
      </div>

      {/* Error state */}
      {error && (
        <div className="alert alert-error mb-4">
          <Icon icon="lucide--alert-circle" className="size-5" />
          <span>{error}</span>
          <button
            className="btn btn-sm btn-ghost"
            onClick={refreshIntegrations}
          >
            Retry
          </button>
        </div>
      )}

      {/* Integrations Table */}
      <DataTable<DataSourceIntegration>
        data={integrations}
        columns={columns}
        loading={loading}
        enableSearch={true}
        getSearchText={(i) =>
          `${i.name} ${i.description || ''} ${i.providerType}`
        }
        rowActions={rowActions}
        useDropdownActions={true}
        onRowClick={(integration) =>
          navigate(`/admin/data-sources/integrations/${integration.id}`)
        }
        emptyMessage="No integrations yet"
        emptyIcon="lucide--plug-2"
      />

      {/* Delete Confirmation Modal */}
      <Modal
        open={deleteModalOpen}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteModalOpen(false);
            setIntegrationToDelete(null);
          }
        }}
        title="Delete Integration"
        sizeClassName="max-w-md"
        actions={[
          {
            label: 'Cancel',
            variant: 'ghost',
            onClick: () => {
              setDeleteModalOpen(false);
              setIntegrationToDelete(null);
            },
          },
          {
            label: deleting ? 'Deleting...' : 'Delete',
            variant: 'error' as const,
            onClick: confirmDelete,
            disabled: deleting,
          },
        ]}
      >
        <div className="space-y-4">
          <p>
            Are you sure you want to delete{' '}
            <strong>"{integrationToDelete?.name}"</strong>?
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
    </PageContainer>
  );
}
