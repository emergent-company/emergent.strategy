// Setup page: Project creation
// Shown when user has organization but no project yet
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { useProjects } from '@/hooks/use-projects';
import { useConfig } from '@/contexts/config';
import { Icon } from '@/components/atoms/Icon';

export default function SetupProjectPage() {
    const navigate = useNavigate();
    const { createProject } = useProjects();
    const { config, setActiveProject } = useConfig();
    const [name, setName] = useState('');
    const [creating, setCreating] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Redirect to org setup if no org
    useEffect(() => {
        if (!config.activeOrgId) {
            navigate('/setup/organization', { replace: true });
        }
    }, [config.activeOrgId, navigate]);

    async function handleCreate(e: React.FormEvent) {
        e.preventDefault();
        const trimmed = name.trim();
        if (!trimmed || trimmed.length < 2) return;

        setError(null);
        setCreating(true);

        try {
            const proj = await createProject(trimmed);
            setActiveProject(proj.id, proj.name);

            // After project created, redirect to main app
            navigate('/admin/apps/documents', { replace: true });
        } catch (err) {
            const msg = err instanceof Error ? err.message : typeof err === 'string' ? err : JSON.stringify(err);
            setError(msg || 'Failed to create project');
        } finally {
            setCreating(false);
        }
    }

    // Don't render if no org (will redirect)
    if (!config.activeOrgId) {
        return (
            <div className="flex justify-center items-center min-h-screen">
                <span className="loading loading-spinner loading-lg" />
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
                                <Icon icon="lucide--folder-plus" className="size-8 text-primary" />
                            </div>
                            <h1 className="justify-center font-bold text-2xl card-title">
                                Create your first project
                            </h1>
                            <p className="mt-2 text-base-content/70">
                                A project groups your documents and scopes ingestion/search
                            </p>
                        </div>

                        <form onSubmit={handleCreate} className="space-y-4" data-testid="setup-project-form">
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
                                <div role="alert" className="alert alert-error" data-testid="setup-project-error">
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
                                {creating && <span className="loading loading-spinner loading-sm" />}
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
