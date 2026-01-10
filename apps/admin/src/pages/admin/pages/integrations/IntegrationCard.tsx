import { Icon } from '@/components/atoms/Icon';
import type { AvailableIntegration, Integration } from '@/api/integrations';

export interface IntegrationCardProps {
  integration: AvailableIntegration;
  configuredInstance?: Integration;
  onConfigure: () => void;
  onToggle?: () => void;
  onDelete?: () => void;
  onSync?: () => void;
  'data-testid'?: string;
}

const integrationIcons: Record<string, string> = {
  clickup: 'simple-icons--clickup',
  github: 'lucide--github',
  jira: 'lucide--list-checks',
  slack: 'lucide--message-circle',
  default: 'lucide--plug',
};

export function IntegrationCard({
  integration,
  configuredInstance,
  onConfigure,
  onToggle,
  onDelete,
  onSync,
  'data-testid': dataTestId,
}: IntegrationCardProps) {
  const isConfigured = !!configuredInstance;
  const isEnabled = configuredInstance?.enabled ?? false;
  const icon = integrationIcons[integration.name] || integrationIcons.default;

  return (
    <div
      className="bg-base-100 border hover:border-primary/50 border-base-300 transition-colors card"
      data-testid={dataTestId}
    >
      <div className="card-body">
        {/* Header */}
        <div className="flex items-start gap-4">
          <div className="flex flex-shrink-0 justify-center items-center bg-base-200 rounded-lg w-12 h-12">
            <Icon icon={icon} className="w-6 h-6 text-base-content" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h3 className="font-semibold truncate">
                {integration.displayName}
              </h3>
              {isConfigured && (
                <div
                  className={`badge badge-sm ${
                    isEnabled ? 'badge-success' : 'badge-ghost'
                  }`}
                >
                  {isEnabled ? 'Active' : 'Disabled'}
                </div>
              )}
            </div>
            <p className="text-sm text-base-content/70 line-clamp-2">
              {integration.description ||
                `Connect to ${integration.displayName}`}
            </p>
          </div>
        </div>

        {/* Capabilities */}
        <div className="flex flex-wrap gap-2 mt-4">
          {integration.capabilities.supportsImport && (
            <div className="badge badge-sm badge-ghost">
              <Icon icon="lucide--download" className="mr-1 w-3 h-3" />
              Import
            </div>
          )}
          {integration.capabilities.supportsWebhooks && (
            <div className="badge badge-sm badge-ghost">
              <Icon icon="lucide--webhook" className="mr-1 w-3 h-3" />
              Webhooks
            </div>
          )}
          {integration.capabilities.supportsBidirectionalSync && (
            <div className="badge badge-sm badge-ghost">
              <Icon icon="lucide--arrow-left-right" className="mr-1 w-3 h-3" />
              Bi-directional
            </div>
          )}
          {integration.capabilities.supportsIncrementalSync && (
            <div className="badge badge-sm badge-ghost">
              <Icon icon="lucide--refresh-cw" className="mr-1 w-3 h-3" />
              Incremental
            </div>
          )}
        </div>

        {/* Last Sync Status */}
        {configuredInstance?.last_sync_at && (
          <div className="mt-2 text-xs text-base-content/60">
            Last sync:{' '}
            {new Date(configuredInstance.last_sync_at).toLocaleString()}
            {configuredInstance.last_sync_status && (
              <span
                className={`ml-2 font-medium ${
                  configuredInstance.last_sync_status === 'success'
                    ? 'text-success'
                    : configuredInstance.last_sync_status === 'failed'
                    ? 'text-error'
                    : 'text-warning'
                }`}
              >
                {configuredInstance.last_sync_status}
              </span>
            )}
          </div>
        )}

        {/* Error Message */}
        {configuredInstance?.error_message && (
          <div className="mt-2 alert alert-error alert-sm">
            <Icon icon="lucide--alert-circle" className="w-4 h-4" />
            <span className="text-xs truncate">
              {configuredInstance.error_message}
            </span>
          </div>
        )}

        {/* Actions */}
        <div className="justify-end mt-4 pt-4 border-t border-base-300 card-actions">
          {isConfigured ? (
            <>
              {onToggle && (
                <button className="btn btn-sm btn-ghost" onClick={onToggle}>
                  {isEnabled ? 'Disable' : 'Enable'}
                </button>
              )}
              <button className="btn btn-sm btn-primary" onClick={onConfigure}>
                <Icon icon="lucide--settings" className="w-4 h-4" />
                Configure
              </button>
              {onSync &&
                isEnabled &&
                integration.capabilities.supportsImport && (
                  <button
                    className="btn-outline btn btn-sm"
                    onClick={onSync}
                    disabled={
                      configuredInstance?.last_sync_status === 'running'
                    }
                  >
                    <Icon icon="lucide--refresh-cw" className="w-4 h-4" />
                    Sync Now
                  </button>
                )}
              {onDelete && (
                <button
                  className="btn btn-sm btn-ghost btn-error"
                  onClick={onDelete}
                >
                  <Icon icon="lucide--trash-2" className="w-4 h-4" />
                </button>
              )}
            </>
          ) : (
            <button className="btn btn-sm btn-primary" onClick={onConfigure}>
              <Icon icon="lucide--plus" className="w-4 h-4" />
              Connect
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
