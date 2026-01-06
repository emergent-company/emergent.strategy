import { useState, useEffect, useRef } from 'react';
import { Icon } from '@/components/atoms/Icon';
import { Spinner } from '@/components/atoms/Spinner';
import type {
  AvailableIntegration,
  Integration,
  IntegrationsClient,
} from '@/api/integrations';

export interface ConfigureIntegrationModalProps {
  integration: AvailableIntegration;
  configuredInstance: Integration | null;
  onClose: () => void;
  onSuccess: () => void;
  client: IntegrationsClient;
  orgId?: string;
  projectId?: string;
  'data-testid'?: string;
}

export function ConfigureIntegrationModal({
  integration,
  configuredInstance,
  onClose,
  onSuccess,
  client,
  orgId,
  projectId,
  'data-testid': dataTestId,
}: ConfigureIntegrationModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [settings, setSettings] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);

  // Mount/Unmount handling for dialog
  // Note: We only call showModal() on mount. We don't call close() in cleanup
  // because that triggers the onClose event which would set selectedIntegration
  // to null. In React 18 StrictMode, effects run twice (mount, cleanup, mount),
  // so calling close() in cleanup would close the dialog before the second mount.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (!dialog.open) {
      dialog.showModal();
    }
    // Intentionally NOT closing in cleanup - the dialog closes via:
    // 1. User clicking close button (calls onClose prop)
    // 2. User clicking backdrop (form method="dialog" calls onClose)
    // 3. Pressing Escape (native dialog behavior, triggers onClose event)
  }, []);

  // Initialize settings from configured instance or defaults
  useEffect(() => {
    if (configuredInstance) {
      setSettings(configuredInstance.settings || {});
    } else {
      // Initialize with optional settings defaults
      const defaults: Record<string, any> = {};
      Object.entries(integration.optionalSettings || {}).forEach(
        ([key, value]) => {
          defaults[key] = value;
        }
      );
      setSettings(defaults);
    }
  }, [configuredInstance, integration]);

  const handleSettingChange = (key: string, value: any) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
    setTestResult(null); // Clear test result when settings change
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    setError(null);

    try {
      // If not configured yet, we can't test without saving first
      if (!configuredInstance) {
        setTestResult({
          success: false,
          message: 'Please save the integration first before testing',
        });
        return;
      }

      const result = await client.testConnection(integration.name);
      setTestResult(result);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Test failed';
      setTestResult({ success: false, message: msg });
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async () => {
    setLoading(true);
    setError(null);
    setTestResult(null);

    try {
      // Validate required settings
      const missingRequired = integration.requiredSettings.filter(
        (key) => !settings[key] || settings[key].toString().trim() === ''
      );

      if (missingRequired.length > 0) {
        throw new Error(
          `Missing required settings: ${missingRequired.join(', ')}`
        );
      }

      if (configuredInstance) {
        // Update existing integration
        await client.updateIntegration(integration.name, { settings });
      } else {
        // Create new integration
        if (!orgId || !projectId) {
          throw new Error('Organization and project must be selected');
        }
        await client.createIntegration({
          name: integration.name,
          display_name: integration.displayName,
          settings,
          enabled: true,
          description: integration.description,
        });
      }

      onSuccess();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to save integration';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const allSettings = [
    ...integration.requiredSettings.map((key) => ({ key, required: true })),
    ...Object.keys(integration.optionalSettings || {}).map((key) => ({
      key,
      required: false,
    })),
  ];

  return (
    <dialog
      ref={dialogRef}
      className="modal"
      onClose={onClose}
      data-testid={dataTestId}
    >
      <div className="max-w-2xl modal-box">
        {/* Header */}
        <div className="flex justify-between items-center mb-6">
          <h3 className="font-bold text-lg">
            {configuredInstance ? 'Configure' : 'Connect'}{' '}
            {integration.displayName}
          </h3>
          <button
            className="btn btn-sm btn-circle btn-ghost"
            onClick={onClose}
            disabled={loading}
          >
            <Icon icon="lucide--x" className="w-4 h-4" />
          </button>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="mb-4 alert alert-error">
            <Icon icon="lucide--alert-circle" className="w-5 h-5" />
            <span>{error}</span>
          </div>
        )}

        {/* Test Result */}
        {testResult && (
          <div
            className={`alert ${
              testResult.success ? 'alert-success' : 'alert-warning'
            } mb-4`}
          >
            <Icon
              icon={
                testResult.success
                  ? 'lucide--check-circle'
                  : 'lucide--alert-circle'
              }
              className="w-5 h-5"
            />
            <span>{testResult.message}</span>
          </div>
        )}

        {/* Settings Form */}
        <div className="space-y-4">
          {allSettings.map(({ key, required }) => {
            const value = settings[key] ?? '';
            const isBoolean =
              typeof integration.optionalSettings?.[key] === 'boolean';
            const isNumber =
              typeof integration.optionalSettings?.[key] === 'number';

            // Format label: convert snake_case to Title Case
            const label = key
              .split('_')
              .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
              .join(' ');

            if (isBoolean) {
              return (
                <div key={key} className="form-control">
                  <label className="justify-start gap-4 cursor-pointer label">
                    <input
                      type="checkbox"
                      className="checkbox checkbox-primary"
                      checked={!!value}
                      onChange={(e) =>
                        handleSettingChange(key, e.target.checked)
                      }
                      disabled={loading}
                    />
                    <div>
                      <span className="font-medium label-text">{label}</span>
                      {!required && (
                        <span className="opacity-60 ml-2 label-text-alt">
                          (Optional)
                        </span>
                      )}
                    </div>
                  </label>
                </div>
              );
            }

            return (
              <div key={key} className="form-control">
                <label className="label">
                  <span className="font-medium label-text">
                    {label}
                    {required && <span className="ml-1 text-error">*</span>}
                  </span>
                </label>
                <input
                  type={
                    key.toLowerCase().includes('token') ||
                    key.toLowerCase().includes('secret') ||
                    key.toLowerCase().includes('password')
                      ? 'password'
                      : isNumber
                      ? 'number'
                      : 'text'
                  }
                  className="input-bordered w-full input"
                  value={value}
                  onChange={(e) =>
                    handleSettingChange(
                      key,
                      isNumber
                        ? parseInt(e.target.value, 10) || 0
                        : e.target.value
                    )
                  }
                  placeholder={`Enter ${label.toLowerCase()}`}
                  required={required}
                  disabled={loading}
                  data-testid={`${integration.name}-${key}-input`}
                />
              </div>
            );
          })}
        </div>

        {/* Actions */}
        <div className="modal-action">
          <button
            className="btn btn-ghost"
            onClick={onClose}
            disabled={loading || testing}
          >
            Cancel
          </button>
          {configuredInstance && (
            <button
              className="btn-outline btn"
              onClick={handleTest}
              disabled={loading || testing}
            >
              {testing && <Spinner size="sm" />}
              {testing ? 'Testing...' : 'Test Connection'}
            </button>
          )}
          <button
            className="btn btn-primary"
            onClick={handleSave}
            disabled={loading || testing}
            data-testid={`${integration.name}-save-button`}
          >
            {loading && <Spinner size="sm" />}
            {loading
              ? 'Saving...'
              : configuredInstance
              ? 'Save Changes'
              : 'Connect'}
          </button>
        </div>
      </div>
      <form method="dialog" className="modal-backdrop" onClick={onClose}>
        <button>close</button>
      </form>
    </dialog>
  );
}
