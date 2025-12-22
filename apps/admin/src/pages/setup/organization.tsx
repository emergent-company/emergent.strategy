// Setup page: Organization creation
// Shown when user has no organization yet
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useOrganizations } from '@/hooks/use-organizations';
import { useConfig } from '@/contexts/config';
import { Icon } from '@/components/atoms/Icon';
import { Spinner } from '@/components/atoms/Spinner';

export default function SetupOrganizationPage() {
  const navigate = useNavigate();
  const { createOrg } = useOrganizations();
  const { setActiveOrg } = useConfig();
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || trimmed.length < 2) return;

    setError(null);
    setCreating(true);

    try {
      const org = await createOrg(trimmed);
      setActiveOrg(org.id, org.name);

      // After org created, redirect to project setup
      navigate('/setup/project', { replace: true });
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : typeof err === 'string'
          ? err
          : JSON.stringify(err);
      setError(msg || 'Failed to create organization');
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="flex justify-center items-center bg-base-200 min-h-screen">
      <div className="mx-4 w-full max-w-lg">
        <div className="bg-base-100 shadow-xl border border-base-300 card">
          <div className="space-y-4 card-body">
            <div className="text-center">
              <div className="inline-flex bg-primary/10 mb-4 p-3 rounded-full">
                <Icon
                  icon="lucide--building-2"
                  className="size-8 text-primary"
                />
              </div>
              <h1 className="justify-center font-bold text-2xl card-title">
                Welcome! Let's get started
              </h1>
              <p className="mt-2 text-base-content/70">
                First, create your organization to begin
              </p>
            </div>

            <form
              onSubmit={handleCreate}
              className="space-y-4"
              data-testid="setup-org-form"
            >
              <div className="form-control">
                <label className="label">
                  <span className="font-medium label-text">
                    Organization name
                  </span>
                </label>
                <input
                  type="text"
                  className="w-full input input-bordered"
                  placeholder="e.g. Acme Inc"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  minLength={2}
                  maxLength={100}
                  autoFocus
                  disabled={creating}
                  data-testid="setup-org-name-input"
                />
                <label className="label">
                  <span className="label-text-alt text-base-content/60">
                    Choose a name for your organization
                  </span>
                </label>
              </div>

              {error && (
                <div
                  role="alert"
                  className="alert alert-error"
                  data-testid="setup-org-error"
                >
                  <Icon icon="lucide--alert-circle" className="size-5" />
                  <span>{error}</span>
                </div>
              )}

              <button
                type="submit"
                className="w-full btn btn-primary"
                disabled={creating || name.trim().length < 2}
                data-testid="setup-org-create-button"
              >
                {creating && <Spinner size="sm" />}
                Create organization
              </button>
            </form>

            <div className="text-sm text-base-content/60 text-center">
              <p>
                After creating your organization, you'll set up your first
                project
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
