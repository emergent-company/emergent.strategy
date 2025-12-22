// Organism: ProjectGate
// Handles presence/selection/creation of a project before rendering gated children.
import { useState } from 'react';
import { useProjects } from '@/hooks/use-projects';
import { useConfig } from '@/contexts/config';
import { Icon } from '@/components/atoms/Icon';
import { Spinner } from '@/components/atoms/Spinner';

export interface ProjectGateProps {
  children: React.ReactNode;
}

export function ProjectGate({ children }: ProjectGateProps) {
  const { projects, loading, createProject } = useProjects();
  const { config, setActiveProject } = useConfig();
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasProject = (projects?.length || 0) > 0;
  const activeSelected =
    !!config.activeProjectId &&
    projects?.some((p) => p.id === config.activeProjectId);

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setError(null);
    setCreating(true);
    try {
      const proj = await createProject(name.trim());
      setActiveProject(proj.id, proj.name);
      setName('');
    } catch (e) {
      setError((e as Error).message || 'Failed to create project');
    } finally {
      setCreating(false);
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-[40vh]" aria-busy>
        <Spinner size="lg" />
      </div>
    );
  }

  if (!hasProject) {
    return (
      <div
        className="mx-auto mt-20 border border-base-300 max-w-lg card"
        role="region"
        aria-labelledby="pg-create-heading"
      >
        <div className="space-y-4 card-body">
          <h2
            id="pg-create-heading"
            className="flex items-center gap-2 text-xl card-title"
          >
            <Icon icon="lucide--folder-plus" className="size-6" />
            Create your first project
          </h2>
          <p className="opacity-80 text-sm leading-relaxed">
            You need at least one project before you can upload documents, run
            chat, or search. A project groups documents under an organization.
          </p>
          <form
            onSubmit={onCreate}
            className="space-y-3"
            aria-label="Create project form"
          >
            <label className="w-full form-control">
              <div className="py-1 label">
                <span className="font-medium label-text">Project name</span>
              </div>
              <input
                type="text"
                className="input-bordered w-full input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Customer Success Docs"
                required
                minLength={2}
                aria-required="true"
              />
            </label>
            {error && (
              <div role="alert" className="alert alert-error">
                <Icon icon="lucide--alert-circle" className="size-5" />
                <span>{error}</span>
              </div>
            )}
            <button
              className="w-full btn btn-primary"
              disabled={creating || name.trim().length < 2}
              type="submit"
            >
              {creating && <Spinner size="sm" />}
              Create project
            </button>
          </form>
        </div>
      </div>
    );
  }

  if (!activeSelected) {
    return (
      <div
        className="mx-auto mt-20 border border-base-300 max-w-lg card"
        role="region"
        aria-labelledby="pg-select-heading"
      >
        <div className="space-y-4 card-body">
          <h2
            id="pg-select-heading"
            className="flex items-center gap-2 text-xl card-title"
          >
            <Icon icon="lucide--list-tree" className="size-6" />
            Select a project
          </h2>
          <p className="opacity-80 text-sm">
            Choose the project you want to work with.
          </p>
          <div className="space-y-2" role="list">
            {projects?.map((p) => (
              <button
                key={p.id}
                onClick={() => setActiveProject(p.id, p.name)}
                className="justify-start w-full btn"
                role="listitem"
                aria-label={`Select project ${p.name}`}
              >
                <Icon icon="lucide--folder" className="size-4" /> {p.name}
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

export default ProjectGate;
