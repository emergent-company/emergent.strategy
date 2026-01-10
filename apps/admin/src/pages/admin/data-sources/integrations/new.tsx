import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { Icon } from '@/components/atoms/Icon';
import { Spinner } from '@/components/atoms/Spinner';
import { PageContainer } from '@/components/layouts';
import { useApi } from '@/hooks/use-api';
import { useConfig } from '@/contexts/config';
import { useToast } from '@/hooks/use-toast';

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
 * OAuth config from schema x-oauth field
 */
interface OAuthConfig {
  provider: string;
  authUrl: string;
  configured: boolean;
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

type Step = 'select-provider' | 'configure' | 'test' | 'oauth-pending';

/**
 * Check if a provider uses OAuth based on its config schema
 */
function getOAuthConfig(schema: Record<string, any>): OAuthConfig | null {
  if (schema?.['x-oauth']) {
    return schema['x-oauth'] as OAuthConfig;
  }
  return null;
}

/**
 * Format a value from connection info for display
 * Handles primitives, arrays of objects with 'name' property, and nested objects
 */
function formatInfoValue(value: unknown): string {
  if (value === null || value === undefined) return '-';
  if (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return String(value);
  }
  if (Array.isArray(value)) {
    // For arrays of objects with 'name' field, show names as comma-separated list
    if (
      value.length > 0 &&
      typeof value[0] === 'object' &&
      value[0] !== null &&
      'name' in value[0]
    ) {
      return value.map((v) => (v as { name: string }).name).join(', ');
    }
    // For other arrays, show count
    return `${value.length} items`;
  }
  if (typeof value === 'object') {
    // For objects with 'name' field, show just the name
    if ('name' in value) {
      return (value as { name: string }).name;
    }
    // For other objects, show JSON (truncated if long)
    const json = JSON.stringify(value);
    return json.length > 50 ? json.substring(0, 47) + '...' : json;
  }
  return String(value);
}

export default function NewIntegrationPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { apiBase, fetchJson } = useApi();
  const { config } = useConfig();
  const { showToast } = useToast();

  // State
  const [step, setStep] = useState<Step>('select-provider');
  const [providers, setProviders] = useState<ProviderMetadata[]>([]);
  const [loadingProviders, setLoadingProviders] = useState(true);
  const [selectedProvider, setSelectedProvider] =
    useState<ProviderMetadata | null>(null);
  const [formData, setFormData] = useState<Record<string, any>>({
    name: '',
    description: '',
    syncMode: 'manual',
    syncIntervalMinutes: 60,
    config: {},
  });
  const [creating, setCreating] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    error?: string;
    info?: Record<string, any>;
  } | null>(null);
  const [startingOAuth, setStartingOAuth] = useState(false);

  // Handle URL params (OAuth callback results)
  useEffect(() => {
    const error = searchParams.get('error');
    const success = searchParams.get('success');
    const email = searchParams.get('email');
    const integrationId = searchParams.get('integrationId');

    if (error) {
      showToast({
        message: decodeURIComponent(error),
        variant: 'error',
      });
      // Clear params
      navigate('/admin/data-sources/integrations/new', { replace: true });
    } else if (success === 'true' && integrationId) {
      showToast({
        message: `Successfully connected ${email || 'account'}!`,
        variant: 'success',
      });
      // Redirect to the new integration
      navigate(`/admin/data-sources/integrations/${integrationId}`, {
        replace: true,
      });
    }
  }, [searchParams, navigate, showToast]);

  // Load providers
  useEffect(() => {
    if (!config.activeProjectId) return;

    async function loadProviders() {
      setLoadingProviders(true);
      try {
        const result = await fetchJson<ProviderMetadata[]>(
          `${apiBase}/api/data-source-integrations/providers`
        );
        setProviders(result);
      } catch (e) {
        showToast({
          message: e instanceof Error ? e.message : 'Failed to load providers',
          variant: 'error',
        });
      } finally {
        setLoadingProviders(false);
      }
    }

    loadProviders();
  }, [apiBase, fetchJson, config.activeProjectId, showToast]);

  // Select provider
  const handleSelectProvider = (provider: ProviderMetadata) => {
    setSelectedProvider(provider);
    setFormData((prev) => ({
      ...prev,
      name: `${provider.displayName} Integration`,
    }));

    // Check if OAuth provider
    const oauth = getOAuthConfig(provider.configSchema);
    if (oauth) {
      // For OAuth providers, we still show the configure step for name/description
      setStep('configure');
    } else {
      setStep('configure');
    }
  };

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

  // Start OAuth flow
  const handleStartOAuth = async () => {
    if (!selectedProvider) return;

    setStartingOAuth(true);

    try {
      const result = await fetchJson<{ authUrl: string; state: string }>(
        `${apiBase}/api/data-source-integrations/oauth/google/start`,
        {
          method: 'POST',
          body: {
            providerType: selectedProvider.providerType,
            name:
              formData.name || `${selectedProvider.displayName} Integration`,
            description: formData.description,
            returnUrl: '/admin/data-sources/integrations/new',
          },
        }
      );

      // Redirect to Google OAuth
      window.location.href = result.authUrl;
    } catch (e) {
      showToast({
        message: e instanceof Error ? e.message : 'Failed to start OAuth',
        variant: 'error',
      });
      setStartingOAuth(false);
    }
  };

  // Test connection
  const handleTestConnection = async () => {
    if (!selectedProvider) return;

    setTesting(true);
    setTestResult(null);

    try {
      // First create a temporary integration for testing
      const result = await fetchJson<{
        success: boolean;
        error?: string;
        info?: Record<string, any>;
      }>(`${apiBase}/api/data-source-integrations/test-config`, {
        method: 'POST',
        body: {
          providerType: selectedProvider.providerType,
          config: formData.config,
        },
      });

      setTestResult(result);

      if (result.success) {
        showToast({
          message: 'Connection successful!',
          variant: 'success',
        });
        setStep('test');
      } else {
        showToast({
          message: result.error || 'Connection failed',
          variant: 'error',
        });
      }
    } catch (e) {
      const error = e instanceof Error ? e.message : 'Connection test failed';
      setTestResult({ success: false, error });
      showToast({
        message: error,
        variant: 'error',
      });
    } finally {
      setTesting(false);
    }
  };

  // Create integration
  const handleCreate = async () => {
    if (!selectedProvider) return;

    setCreating(true);

    try {
      const result = await fetchJson<{ id: string }>(
        `${apiBase}/api/data-source-integrations`,
        {
          method: 'POST',
          body: {
            providerType: selectedProvider.providerType,
            sourceType: selectedProvider.sourceType,
            name: formData.name,
            description: formData.description || undefined,
            config: formData.config,
            syncMode: formData.syncMode,
            syncIntervalMinutes:
              formData.syncMode === 'recurring'
                ? formData.syncIntervalMinutes
                : undefined,
          },
        }
      );

      showToast({
        message: `Integration "${formData.name}" created successfully!`,
        variant: 'success',
      });

      navigate(`/admin/data-sources/integrations/${result.id}`);
    } catch (e) {
      showToast({
        message:
          e instanceof Error ? e.message : 'Failed to create integration',
        variant: 'error',
      });
    } finally {
      setCreating(false);
    }
  };

  // Render config form fields from JSON schema
  const renderConfigFields = () => {
    if (!selectedProvider) return null;

    const schema = selectedProvider.configSchema;
    if (!schema?.properties) return null;

    // Skip x-oauth field
    const properties = schema.properties as Record<string, SchemaProperty>;
    const required = (schema.required || []) as string[];

    return Object.entries(properties)
      .filter(([key]) => key !== 'x-oauth')
      .map(([key, prop]) => {
        const isRequired = required.includes(key);
        const value = formData.config[key] ?? prop.default ?? '';

        // Render based on property type
        if (prop.enum) {
          return (
            <div key={key} className="form-control">
              <label className="label">
                <span className="label-text">
                  {prop.title || key}
                  {isRequired && <span className="text-error">*</span>}
                </span>
              </label>
              <select
                className="select select-bordered w-full"
                value={value}
                onChange={(e) => updateConfigField(key, e.target.value)}
              >
                <option value="">Select...</option>
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
                <span className="label-text">
                  {prop.title || key}
                  {isRequired && <span className="text-error">*</span>}
                </span>
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
                <span className="label-text">
                  {prop.title || key}
                  {isRequired && <span className="text-error">*</span>}
                </span>
              </label>
              <input
                type="number"
                className="input input-bordered w-full"
                value={value}
                min={prop.minimum}
                max={prop.maximum}
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
        const inputType =
          key.toLowerCase().includes('password') ||
          key.toLowerCase().includes('secret') ||
          key.toLowerCase().includes('token')
            ? 'password'
            : prop.format === 'email'
            ? 'email'
            : 'text';

        return (
          <div key={key} className="form-control">
            <label className="label">
              <span className="label-text">
                {prop.title || key}
                {isRequired && <span className="text-error">*</span>}
              </span>
            </label>
            <input
              type={inputType}
              className="input input-bordered w-full"
              value={value}
              placeholder={prop.description || ''}
              onChange={(e) => updateConfigField(key, e.target.value)}
            />
            {prop.description && inputType !== 'text' && (
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

  // Provider selection step
  const renderProviderSelection = () => (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Choose a Provider</h2>
        <p className="text-base-content/70 mt-1">
          Select the type of data source you want to connect.
        </p>
      </div>

      {loadingProviders ? (
        <div className="flex justify-center py-12">
          <Spinner size="lg" />
        </div>
      ) : providers.length === 0 ? (
        <div className="text-center py-12 text-base-content/60">
          <Icon
            icon="lucide--plug-2"
            className="size-12 mx-auto mb-4 opacity-40"
          />
          <p>No providers available</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {providers.map((provider) => {
            const oauth = getOAuthConfig(provider.configSchema);
            return (
              <button
                key={provider.providerType}
                onClick={() => handleSelectProvider(provider)}
                className="card bg-base-200 hover:bg-base-300 transition-colors cursor-pointer text-left"
              >
                <div className="card-body p-4">
                  <div className="flex items-start gap-3">
                    <div className="p-3 rounded-lg bg-base-100">
                      {provider.icon.startsWith('/') ? (
                        <img
                          src={provider.icon}
                          alt={provider.displayName}
                          className="size-6 object-contain"
                        />
                      ) : (
                        <Icon icon={provider.icon} className="size-6" />
                      )}
                    </div>
                    <div className="flex-1">
                      <h3 className="font-semibold">{provider.displayName}</h3>
                      <p className="text-sm text-base-content/70 mt-1">
                        {provider.description}
                      </p>
                      <div className="mt-2 flex gap-2 flex-wrap">
                        <span className="badge badge-ghost badge-sm">
                          {provider.sourceType}
                        </span>
                        {oauth && (
                          <span className="badge badge-primary badge-sm">
                            OAuth
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );

  // Configuration step
  const renderConfiguration = () => {
    const oauth = selectedProvider
      ? getOAuthConfig(selectedProvider.configSchema)
      : null;
    const isOAuthProvider = !!oauth;

    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => {
              setStep('select-provider');
              setSelectedProvider(null);
              setTestResult(null);
            }}
          >
            <Icon icon="lucide--arrow-left" className="size-4" />
            Back
          </button>
          <div>
            <h2 className="text-lg font-semibold">
              Configure {selectedProvider?.displayName}
            </h2>
            <p className="text-base-content/70 mt-1">
              {isOAuthProvider
                ? 'Name your integration and connect your account.'
                : 'Enter your connection details and settings.'}
            </p>
          </div>
        </div>

        <div className="card bg-base-200">
          <div className="card-body">
            {/* Basic info */}
            <h3 className="font-medium text-sm text-base-content/60 uppercase tracking-wide mb-4">
              Basic Information
            </h3>
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
                  placeholder="My Integration"
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

            {/* Sync settings */}
            <h3 className="font-medium text-sm text-base-content/60 uppercase tracking-wide mt-6 mb-4">
              Sync Settings
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="form-control">
                <label className="label">
                  <span className="label-text">Sync Mode</span>
                </label>
                <select
                  className="select select-bordered w-full"
                  value={formData.syncMode}
                  onChange={(e) => updateField('syncMode', e.target.value)}
                >
                  <option value="manual">Manual</option>
                  <option value="recurring">Recurring</option>
                </select>
              </div>
              {formData.syncMode === 'recurring' && (
                <div className="form-control">
                  <label className="label">
                    <span className="label-text">Sync Interval (minutes)</span>
                  </label>
                  <input
                    type="number"
                    className="input input-bordered w-full"
                    value={formData.syncIntervalMinutes}
                    min={15}
                    max={1440}
                    onChange={(e) =>
                      updateField('syncIntervalMinutes', Number(e.target.value))
                    }
                  />
                </div>
              )}
            </div>

            {/* OAuth or provider-specific config */}
            {isOAuthProvider ? (
              <>
                <h3 className="font-medium text-sm text-base-content/60 uppercase tracking-wide mt-6 mb-4">
                  Account Connection
                </h3>
                {oauth?.configured ? (
                  <div className="bg-base-100 rounded-lg p-6 text-center">
                    <Icon
                      icon="logos--google-icon"
                      className="size-12 mx-auto mb-4"
                    />
                    <p className="text-base-content/70 mb-4">
                      Click the button below to securely connect your Google
                      account. You'll be redirected to Google to authorize
                      access.
                    </p>
                    <button
                      className="btn btn-primary"
                      onClick={handleStartOAuth}
                      disabled={startingOAuth || !formData.name}
                    >
                      {startingOAuth ? (
                        <>
                          <Spinner size="sm" />
                          Connecting...
                        </>
                      ) : (
                        <>
                          <Icon icon="logos--google-icon" className="size-5" />
                          Connect with Google
                        </>
                      )}
                    </button>
                  </div>
                ) : (
                  <div className="alert alert-warning">
                    <Icon icon="lucide--alert-triangle" className="size-5" />
                    <div>
                      <h4 className="font-semibold">OAuth Not Configured</h4>
                      <p className="text-sm">
                        Google OAuth is not configured on the server. Please set
                        GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET
                        environment variables.
                      </p>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <>
                <h3 className="font-medium text-sm text-base-content/60 uppercase tracking-wide mt-6 mb-4">
                  Connection Settings
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {renderConfigFields()}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Test result */}
        {testResult && !testResult.success && (
          <div className="alert alert-error">
            <Icon icon="lucide--alert-circle" className="size-5" />
            <span>{testResult.error}</span>
          </div>
        )}

        {/* Actions - only for non-OAuth providers */}
        {!isOAuthProvider && (
          <div className="flex justify-end gap-3">
            <button
              className="btn btn-ghost"
              onClick={() => navigate('/admin/data-sources/integrations')}
            >
              Cancel
            </button>
            <button
              className="btn btn-outline"
              onClick={handleTestConnection}
              disabled={testing || !formData.name}
            >
              {testing ? (
                <>
                  <Spinner size="sm" />
                  Testing...
                </>
              ) : (
                <>
                  <Icon icon="lucide--plug-zap" className="size-4" />
                  Test Connection
                </>
              )}
            </button>
          </div>
        )}

        {/* Cancel for OAuth providers */}
        {isOAuthProvider && (
          <div className="flex justify-end gap-3">
            <button
              className="btn btn-ghost"
              onClick={() => navigate('/admin/data-sources/integrations')}
            >
              Cancel
            </button>
          </div>
        )}
      </div>
    );
  };

  // Test result / confirmation step
  const renderTestResult = () => (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <button
          className="btn btn-ghost btn-sm"
          onClick={() => setStep('configure')}
        >
          <Icon icon="lucide--arrow-left" className="size-4" />
          Back
        </button>
        <div>
          <h2 className="text-lg font-semibold">Connection Verified</h2>
          <p className="text-base-content/70 mt-1">
            Your integration is ready to be created.
          </p>
        </div>
      </div>

      <div className="card bg-base-200">
        <div className="card-body">
          <div className="flex items-center gap-4 mb-4">
            <div className="p-3 rounded-full bg-success/20">
              <Icon
                icon="lucide--check-circle"
                className="size-8 text-success"
              />
            </div>
            <div>
              <h3 className="font-semibold text-lg">Connection Successful</h3>
              <p className="text-base-content/70">
                The connection to {selectedProvider?.displayName} has been
                verified.
              </p>
            </div>
          </div>

          {testResult?.info && Object.keys(testResult.info).length > 0 && (
            <div className="border-t border-base-300 pt-4 mt-4">
              <h4 className="font-medium text-sm mb-2">Connection Info</h4>
              <div className="grid grid-cols-2 gap-2 text-sm">
                {Object.entries(testResult.info).map(([key, value]) => (
                  <div key={key}>
                    <span className="text-base-content/60">{key}:</span>{' '}
                    <span className="font-medium">
                      {formatInfoValue(value)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="border-t border-base-300 pt-4 mt-4">
            <h4 className="font-medium text-sm mb-2">Summary</h4>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>
                <span className="text-base-content/60">Name:</span>{' '}
                <span className="font-medium">{formData.name}</span>
              </div>
              <div>
                <span className="text-base-content/60">Provider:</span>{' '}
                <span className="font-medium">
                  {selectedProvider?.displayName}
                </span>
              </div>
              <div>
                <span className="text-base-content/60">Sync Mode:</span>{' '}
                <span className="font-medium capitalize">
                  {formData.syncMode}
                </span>
              </div>
              {formData.syncMode === 'recurring' && (
                <div>
                  <span className="text-base-content/60">Interval:</span>{' '}
                  <span className="font-medium">
                    Every {formData.syncIntervalMinutes} minutes
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-3">
        <button
          className="btn btn-ghost"
          onClick={() => navigate('/admin/data-sources/integrations')}
        >
          Cancel
        </button>
        <button
          className="btn btn-primary"
          onClick={handleCreate}
          disabled={creating}
        >
          {creating ? (
            <>
              <Spinner size="sm" />
              Creating...
            </>
          ) : (
            <>
              <Icon icon="lucide--plus" className="size-4" />
              Create Integration
            </>
          )}
        </button>
      </div>
    </div>
  );

  return (
    <PageContainer
      maxWidth="3xl"
      className="px-4"
      testId="page-new-integration"
    >
      {/* Header */}
      <div className="mb-6">
        <h1 className="font-bold text-2xl inline-flex items-center gap-2">
          <Icon icon="lucide--plug-2" className="size-6" />
          New Integration
        </h1>
        <p className="mt-1 text-base-content/70">
          Connect a new data source to import documents.
        </p>
      </div>

      {/* Steps indicator */}
      <div className="mb-8">
        <ul className="steps steps-horizontal w-full">
          <li
            className={`step ${
              step === 'select-provider' ||
              step === 'configure' ||
              step === 'test'
                ? 'step-primary'
                : ''
            }`}
          >
            Select Provider
          </li>
          <li
            className={`step ${
              step === 'configure' || step === 'test' ? 'step-primary' : ''
            }`}
          >
            Configure
          </li>
          <li className={`step ${step === 'test' ? 'step-primary' : ''}`}>
            Confirm
          </li>
        </ul>
      </div>

      {/* Step content */}
      {step === 'select-provider' && renderProviderSelection()}
      {step === 'configure' && renderConfiguration()}
      {step === 'test' && renderTestResult()}
    </PageContainer>
  );
}
