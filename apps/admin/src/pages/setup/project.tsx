// Setup page: Project creation
// Shown when user has organization but no project yet
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { useProjects } from '@/hooks/use-projects';
import { useConfig } from '@/contexts/config';
import { Icon } from '@/components/atoms/Icon';
import { Spinner } from '@/components/atoms/Spinner';

export default function SetupProjectPage() {
  const navigate = useNavigate();
  const { createProject, refresh } = useProjects();
  const { config, setActiveProject } = useConfig();
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shouldNavigate, setShouldNavigate] = useState(false);

  // Redirect to org setup if no org
  useEffect(() => {
    if (!config.activeOrgId) {
      navigate('/setup/organization', { replace: true });
    }
  }, [config.activeOrgId, navigate]);

  // Navigate after project is set in config
  useEffect(() => {
    console.log(
      '[SetupProjectPage] useEffect fired - shouldNavigate:',
      shouldNavigate,
      'activeProjectId:',
      config.activeProjectId
    );
    if (shouldNavigate && config.activeProjectId) {
      console.log(
        '[SetupProjectPage] Config updated with project, navigating now'
      );
      navigate('/admin/apps/documents', { replace: true });
      setShouldNavigate(false);
    }
  }, [shouldNavigate, config.activeProjectId, navigate]);

  async function handleCreate(e: React.FormEvent) {
    console.log('[SetupProjectPage] handleCreate called!');
    e.preventDefault();
    console.log('[SetupProjectPage] preventDefault called');

    const trimmed = name.trim();
    console.log(
      '[SetupProjectPage] trimmed name:',
      trimmed,
      'length:',
      trimmed.length
    );

    if (!trimmed || trimmed.length < 2) {
      console.log('[SetupProjectPage] Name too short, returning');
      return;
    }

    setError(null);
    setCreating(true);
    console.log('[SetupProjectPage] Set creating=true');

    try {
      console.log('[SetupProjectPage] Creating project:', trimmed);
      const proj = await createProject(trimmed);
      console.log('[SetupProjectPage] Project created:', proj);

      // Set the active project in config/localStorage
      setActiveProject(proj.id, proj.name);
      console.log('[SetupProjectPage] Set active project:', proj.id, proj.name);

      // CRITICAL: Refresh the projects list so SetupGuard sees the new project
      console.log('[SetupProjectPage] Refreshing projects list...');
      await refresh();
      console.log('[SetupProjectPage] Projects list refreshed');

      // Small delay to ensure state updates propagate
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Use React Router navigate instead of window.location to preserve React state
      console.log('[SetupProjectPage] Navigating with React Router');
      navigate('/admin/apps/documents', { replace: true });
    } catch (err) {
      console.error('[SetupProjectPage] Error creating project:', err);
      const msg =
        err instanceof Error
          ? err.message
          : typeof err === 'string'
          ? err
          : JSON.stringify(err);
      setError(msg || 'Failed to create project');
      setCreating(false);
    }
  }

  // Don't render if no org (will redirect)
  if (!config.activeOrgId) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="flex justify-center items-center bg-base-200 min-h-screen">
      <div className="mx-4 w-full max-w-lg">
        <div className="bg-base-100 shadow-xl border border-base-300 card">
          <div className="space-y-4 card-body">
            <div className="text-center">
              <div className="inline-flex bg-primary/10 mb-4 p-3 rounded-full">
                <Icon
                  icon="lucide--folder-plus"
                  className="size-8 text-primary"
                />
              </div>
              <h1 className="justify-center font-bold text-2xl card-title">
                Create your first project
              </h1>
              <p className="mt-2 text-base-content/70">
                A project groups your documents and scopes ingestion/search
              </p>
            </div>

            <form
              onSubmit={handleCreate}
              className="space-y-4"
              data-testid="setup-project-form"
            >
              <div className="form-control">
                <label className="label">
                  <span className="font-medium label-text">Project name</span>
                </label>
                <input
                  type="text"
                  className="w-full input input-bordered"
                  placeholder="e.g. Product Docs"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  minLength={2}
                  maxLength={100}
                  autoFocus
                  disabled={creating}
                  data-testid="setup-project-name-input"
                />
                <label className="label">
                  <span className="label-text-alt text-base-content/60">
                    Choose a name for your project
                  </span>
                </label>
              </div>

              {error && (
                <div
                  role="alert"
                  className="alert alert-error"
                  data-testid="setup-project-error"
                >
                  <Icon icon="lucide--alert-circle" className="size-5" />
                  <span>{error}</span>
                </div>
              )}

              <button
                type="submit"
                className="w-full btn btn-primary"
                disabled={creating || name.trim().length < 2}
                data-testid="setup-project-create-button"
              >
                {creating && <Spinner size="sm" />}
                Create project
              </button>
            </form>

            <div className="text-sm text-base-content/60 text-center">
              <p>You can create more projects later from settings</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
