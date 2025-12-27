import { useState, useEffect, useCallback } from 'react';
import { Icon } from '@/components/atoms/Icon';
import { Spinner } from '@/components/atoms/Spinner';
import { useApi } from '@/hooks/use-api';

interface ExternalService {
  name: string;
  url: string | null;
  enabled: boolean;
}

interface DeploymentInfo {
  environment: string;
  nodeVersion: string;
  adminPort: number;
  serverPort: number;
  adminUrl: string;
  serverUrl: string;
}

interface SystemConfig {
  externalServices: ExternalService[];
  deployment: DeploymentInfo;
}

const SERVICE_ICONS: Record<string, string> = {
  Langfuse: 'lucide--activity',
  SigNoz: 'lucide--chart-bar',
  Zitadel: 'lucide--shield',
};

export default function SuperadminDashboardPage() {
  const { fetchJson } = useApi();
  const [config, setConfig] = useState<SystemConfig | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchConfig = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await fetchJson<SystemConfig>(
        '/api/superadmin/system-config'
      );
      setConfig(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load configuration');
    } finally {
      setIsLoading(false);
    }
  }, [fetchJson]);

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  if (isLoading) {
    return (
      <div className="flex justify-center items-center min-h-[400px]">
        <Spinner size="lg" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="alert alert-error">
          <Icon icon="lucide--alert-circle" className="size-5" />
          <span>{error}</span>
        </div>
      </div>
    );
  }

  if (!config) {
    return (
      <div className="flex justify-center items-center min-h-[400px]">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3">
        <Icon icon="lucide--layout-dashboard" className="size-8 text-primary" />
        <h1 className="text-2xl font-bold">System Dashboard</h1>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {config.externalServices.map((service) => (
          <div
            key={service.name}
            className="card bg-base-100 shadow-sm border border-base-200"
          >
            <div className="card-body p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-base-200">
                    <Icon
                      icon={SERVICE_ICONS[service.name] || 'lucide--link'}
                      className="size-5 text-base-content"
                    />
                  </div>
                  <div>
                    <h3 className="font-semibold">{service.name}</h3>
                    {service.url ? (
                      <a
                        href={service.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-primary hover:underline truncate max-w-48 block"
                      >
                        {service.url}
                      </a>
                    ) : (
                      <span className="text-xs text-base-content/50">
                        Not configured
                      </span>
                    )}
                  </div>
                </div>
                <span
                  className={`badge ${
                    service.enabled ? 'badge-success' : 'badge-ghost'
                  }`}
                >
                  {service.enabled ? 'Enabled' : 'Disabled'}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="card bg-base-100 shadow-sm border border-base-200">
        <div className="card-body p-4">
          <div className="flex items-center gap-2 mb-4">
            <Icon icon="lucide--server" className="size-5 text-primary" />
            <h2 className="text-lg font-semibold">Deployment Information</h2>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            <div>
              <div className="text-xs text-base-content/60 uppercase tracking-wider">
                Environment
              </div>
              <div className="font-medium">
                <span
                  className={`badge ${
                    config.deployment.environment === 'production'
                      ? 'badge-error'
                      : config.deployment.environment === 'staging'
                      ? 'badge-warning'
                      : 'badge-info'
                  }`}
                >
                  {config.deployment.environment}
                </span>
              </div>
            </div>
            <div>
              <div className="text-xs text-base-content/60 uppercase tracking-wider">
                Node Version
              </div>
              <div className="font-medium font-mono text-sm">
                {config.deployment.nodeVersion}
              </div>
            </div>
            <div>
              <div className="text-xs text-base-content/60 uppercase tracking-wider">
                Admin Port
              </div>
              <div className="font-medium font-mono text-sm">
                {config.deployment.adminPort}
              </div>
            </div>
            <div>
              <div className="text-xs text-base-content/60 uppercase tracking-wider">
                Server Port
              </div>
              <div className="font-medium font-mono text-sm">
                {config.deployment.serverPort}
              </div>
            </div>
            <div>
              <div className="text-xs text-base-content/60 uppercase tracking-wider">
                Admin URL
              </div>
              <a
                href={config.deployment.adminUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-primary hover:underline truncate block"
              >
                {config.deployment.adminUrl}
              </a>
            </div>
            <div>
              <div className="text-xs text-base-content/60 uppercase tracking-wider">
                Server URL
              </div>
              <a
                href={config.deployment.serverUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-primary hover:underline truncate block"
              >
                {config.deployment.serverUrl}
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
