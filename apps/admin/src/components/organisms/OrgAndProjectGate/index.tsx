// Organism: OrgAndProjectGate
// Ensures an organization and a project are selected/created before rendering children.
// Now using useAccessTreeContext for single-source-of-truth data.
import { useState, useEffect, useRef, useLayoutEffect } from 'react';
import { useNavigate, useLocation } from 'react-router';
import { useAccessTreeContext } from '@/contexts/access-tree';
import { useConfig } from '@/contexts/config';
import { Icon } from '@/components/atoms/Icon';
import { useApi } from '@/hooks/use-api';
import { Spinner } from '@/components/atoms/Spinner';

export interface OrgAndProjectGateProps {
  children: React.ReactNode;
}

export function OrgAndProjectGate({ children }: OrgAndProjectGateProps) {
  const { apiBase, fetchJson } = useApi();
  const { orgs, projects, loading, refresh } = useAccessTreeContext();
  const { config, setActiveOrg, setActiveProject } = useConfig();

  const [orgName, setOrgName] = useState('');
  const [projectName, setProjectName] = useState('');
  const [creatingOrg, setCreatingOrg] = useState(false);
  const [creatingProject, setCreatingProject] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activeOrgId = config.activeOrgId;
  const activeProjectId = config.activeProjectId;

  // Pre-paint org selection to avoid flicker in UI showing unset state
  useLayoutEffect(() => {
    if (activeOrgId) return;
    if (orgs.length === 0) return;
    const first = orgs[0];
    setActiveOrg(first.id, first.name);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeOrgId, orgs.length]);

  const projectAutoOrgRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (!activeOrgId) return;
    if (activeProjectId) return;
    // Filter projects by active org
    const matching = projects.filter((p) => p.orgId === activeOrgId);
    if (loading && matching.length === 0) return;
    if (matching.length === 0) return; // no project yet – creation form handles
    if (projectAutoOrgRef.current === activeOrgId) return;
    const first = matching[0];
    setActiveProject(first.id, first.name);
    projectAutoOrgRef.current = activeOrgId;
  }, [activeOrgId, activeProjectId, projects, loading, setActiveProject]);

  async function onCreateOrg(e: React.FormEvent) {
    e.preventDefault();
    if (!orgName.trim()) return;
    setError(null);
    setCreatingOrg(true);
    try {
      const org = await fetchJson<
        { id: string; name: string },
        { name: string }
      >(`${apiBase}/api/orgs`, {
        method: 'POST',
        body: { name: orgName.trim() },
        credentials: 'include',
      });
      setActiveOrg(org.id, org.name);
      setOrgName('');
      await refresh(); // Refresh access tree
    } catch (e) {
      setError((e as Error).message || 'Failed to create organization');
    } finally {
      setCreatingOrg(false);
    }
  }

  async function onCreateProject(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = projectName.trim();
    if (!trimmed || !activeOrgId) return;
    setError(null);
    setCreatingProject(true);
    try {
      const proj = await fetchJson<
        { id: string; name: string },
        { name: string; orgId: string }
      >(`${apiBase}/api/projects`, {
        method: 'POST',
        body: { name: trimmed, orgId: activeOrgId },
        credentials: 'include',
      });
      setActiveProject(proj.id, proj.name);
      setProjectName('');
      await refresh(); // Refresh access tree
    } catch (e) {
      const msg =
        e instanceof Error
          ? e.message
          : typeof e === 'string'
          ? e
          : JSON.stringify(e);
      setError(msg || 'Failed to create project');
    } finally {
      setCreatingProject(false);
    }
  }

  if (loading && orgs.length === 0) {
    return (
      <div className="flex justify-center items-center min-h-[40vh]">
        <Spinner size="lg" />
      </div>
    );
  }

  if (orgs.length === 0) {
    return (
      <div
        className="mx-auto mt-20 border border-base-300 max-w-lg card"
        role="region"
        aria-labelledby="org-create-heading"
      >
        <div className="space-y-4 card-body">
          <h2
            id="org-create-heading"
            className="flex items-center gap-2 text-xl card-title"
          >
            <Icon icon="lucide--building-2" className="size-6" />
            Create your organization
          </h2>
          <p className="opacity-80 text-sm">
            Create your first organization to begin.
          </p>
          <form
            onSubmit={onCreateOrg}
            className="space-y-3"
            aria-label="Create organization form"
          >
            <label className="w-full form-control">
              <div className="py-1 label">
                <span className="font-medium label-text">
                  Organization name
                </span>
              </div>
              <input
                className="w-full input-bordered input"
                value={orgName}
                onChange={(e) => setOrgName(e.target.value)}
                required
                minLength={2}
                maxLength={100}
                placeholder="e.g. Acme Inc"
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
              disabled={creatingOrg || orgName.trim().length < 2}
              type="submit"
            >
              {creatingOrg && <Spinner size="sm" />} Create organization
            </button>
          </form>
        </div>
      </div>
    );
  }

  // Filter projects for active org
  const activeOrgProjects = projects.filter((p) => p.orgId === activeOrgId);

  if (
    activeOrgId &&
    !activeProjectId &&
    !loading &&
    activeOrgProjects.length === 0
  ) {
    return (
      <div
        className="mx-auto mt-20 border border-base-300 max-w-lg card"
        role="region"
        aria-labelledby="proj-create-heading"
      >
        <div className="space-y-4 card-body">
          <h2
            id="proj-create-heading"
            className="flex items-center gap-2 text-xl card-title"
          >
            <Icon icon="lucide--folder-plus" className="size-6" />
            Create first project
          </h2>
          <p className="opacity-80 text-sm">
            A project groups documents and scopes ingestion/search.
          </p>
          <form
            onSubmit={onCreateProject}
            className="space-y-3"
            aria-label="Create project form"
          >
            <label className="w-full form-control">
              <div className="py-1 label">
                <span className="font-medium label-text">Project name</span>
              </div>
              <input
                className="w-full input-bordered input"
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                required
                minLength={2}
                maxLength={100}
                placeholder="e.g. Product Docs"
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
              disabled={creatingProject || projectName.trim().length < 2}
              type="submit"
            >
              {creatingProject && <Spinner size="sm" />} Create project
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <>
      {children}

      <input
        type="checkbox"
        id="modal-create-project-inline"
        className="modal-toggle"
      />
      <div className="modal" role="dialog" aria-modal="true">
        <div className="modal-box">
          <h3 className="font-bold text-lg">Create Project</h3>
          {error && (
            <div className="mt-3 alert alert-error">
              <Icon icon="lucide--alert-triangle" className="size-4" />
              <span>{error}</span>
            </div>
          )}
          <form
            onSubmit={onCreateProject}
            className="space-y-3 mt-4"
            aria-label="Inline create project form"
          >
            <label className="form-control">
              <span className="mb-1 label-text">Project name</span>
              <input
                className="input-bordered input"
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                required
                minLength={2}
                maxLength={100}
                placeholder="Knowledge Base"
              />
            </label>
            <div className="modal-action">
              <label
                htmlFor="modal-create-project-inline"
                className="btn btn-ghost"
              >
                Cancel
              </label>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={creatingProject || projectName.trim().length < 2}
              >
                {creatingProject && <Spinner size="sm" className="me-2" />}
                Create
              </button>
            </div>
          </form>
        </div>
        <label className="modal-backdrop" htmlFor="modal-create-project-inline">
          Close
        </label>
      </div>
    </>
  );
}

export interface OrgAndProjectGateRedirectProps {
  children: React.ReactNode;
}
export function OrgAndProjectGateRedirect({
  children,
}: OrgAndProjectGateRedirectProps) {
  const { config } = useConfig();
  const navigate = useNavigate();
  const location = useLocation();

  // Check both React state AND localStorage (in case React state hasn't propagated yet)
  let ready = !!config.activeOrgId && !!config.activeProjectId;

  // Fallback: check localStorage directly if React state shows not ready
  if (!ready) {
    try {
      const stored = window.localStorage.getItem('spec-server');
      if (stored) {
        const parsed = JSON.parse(stored);
        ready = !!parsed.activeOrgId && !!parsed.activeProjectId;
        console.log(
          '[OrgAndProjectGateRedirect] localStorage fallback check - ready:',
          ready,
          'org:',
          parsed.activeOrgId,
          'project:',
          parsed.activeProjectId
        );
      }
    } catch (e) {
      console.error(
        '[OrgAndProjectGateRedirect] Error reading localStorage:',
        e
      );
    }
  }

  const redirectedRef = useRef(false);
  useEffect(() => {
    if (!ready) return;
    if (redirectedRef.current) return;
    const p = location.pathname;
    if (p === '/admin' || p === '/admin/apps' || p === '/admin/apps/') {
      navigate('/admin/apps/documents', { replace: true });
    }
    redirectedRef.current = true;
  }, [ready, location.pathname, navigate]);
  if (!ready) return <OrgAndProjectGate>{children}</OrgAndProjectGate>;
  return <>{children}</>;
}

export default OrgAndProjectGate;
