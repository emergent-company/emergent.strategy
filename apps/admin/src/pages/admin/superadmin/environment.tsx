import { useState, useEffect, useCallback } from 'react';
import { Icon } from '@/components/atoms/Icon';
import { Spinner } from '@/components/atoms/Spinner';
import { useApi } from '@/hooks/use-api';

interface EnvironmentVariable {
  name: string;
  value: string;
  sensitive: boolean;
  category: string;
}

interface SystemConfig {
  environmentVariables: EnvironmentVariable[];
}

export default function SuperadminEnvironmentPage() {
  const { fetchJson } = useApi();
  const [envVars, setEnvVars] = useState<EnvironmentVariable[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showSensitive, setShowSensitive] = useState(false);

  const fetchConfig = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await fetchJson<SystemConfig>(
        `/api/superadmin/system-config?reveal=${showSensitive}`
      );
      setEnvVars(data.environmentVariables);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load configuration');
    } finally {
      setIsLoading(false);
    }
  }, [fetchJson, showSensitive]);

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

  const groupedEnvVars = envVars.reduce((acc, envVar) => {
    if (!acc[envVar.category]) {
      acc[envVar.category] = [];
    }
    acc[envVar.category].push(envVar);
    return acc;
  }, {} as Record<string, EnvironmentVariable[]>);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Icon icon="lucide--settings" className="size-8 text-primary" />
          <h1 className="text-2xl font-bold">Environment Variables</h1>
        </div>
        <label className="label cursor-pointer gap-2">
          <span className="label-text">Show sensitive values</span>
          <input
            type="checkbox"
            className="toggle toggle-primary"
            checked={showSensitive}
            onChange={(e) => setShowSensitive(e.target.checked)}
          />
        </label>
      </div>

      <div className="card bg-base-100 shadow-sm border border-base-200">
        <div className="card-body p-4">
          <div className="overflow-x-auto">
            <table className="table table-sm">
              <thead>
                <tr>
                  <th className="w-64">Name</th>
                  <th>Value</th>
                  <th className="w-32">Type</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(groupedEnvVars).map(([category, vars]) => (
                  <>
                    <tr key={`header-${category}`} className="bg-base-200/50">
                      <td
                        colSpan={3}
                        className="font-semibold text-xs uppercase tracking-wider py-2"
                      >
                        {category}
                      </td>
                    </tr>
                    {vars.map((envVar) => (
                      <tr key={envVar.name} className="hover">
                        <td className="font-mono text-sm">{envVar.name}</td>
                        <td className="font-mono text-sm">
                          <span
                            className={
                              envVar.sensitive && !showSensitive
                                ? 'text-base-content/50'
                                : ''
                            }
                          >
                            {envVar.value || '-'}
                          </span>
                        </td>
                        <td>
                          {envVar.sensitive && (
                            <span className="badge badge-warning badge-sm">
                              <Icon
                                icon="lucide--lock"
                                className="size-3 mr-1"
                              />
                              Sensitive
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
