// Organism: OrgAndProjectGate
// Ensures an organization and a project are selected/created before rendering children.
// Combines org + project selection with auto-selection heuristics.
import { useState, useEffect, useMemo, useRef, useLayoutEffect } from 'react';
import { normalizeOrgId, orgIdsMatch } from '@/utils/org-id';
import { useNavigate, useLocation } from 'react-router';
import { useOrganizations } from '@/hooks/use-organizations';
import { useProjects } from '@/hooks/use-projects';
import { useConfig } from '@/contexts/config';
import { Icon } from '@/components/atoms/Icon';

export interface OrgAndProjectGateProps { children: React.ReactNode }

export function OrgAndProjectGate({ children }: OrgAndProjectGateProps) {
    const { orgs, loading: orgLoading, createOrg } = useOrganizations();
    const { projects, loading: projLoading, createProject } = useProjects();
    const { config, setActiveOrg, setActiveProject } = useConfig();

    const [orgName, setOrgName] = useState('');
    const [projectName, setProjectName] = useState('');
    const [creatingOrg, setCreatingOrg] = useState(false);
    const [creatingProject, setCreatingProject] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const orgList = useMemo(() => orgs ?? [], [orgs]);
    const projectList = useMemo(() => projects ?? [], [projects]);
    const activeOrgId = normalizeOrgId(config.activeOrgId);
    const activeProjectId = config.activeProjectId;

    // Pre-paint org selection to avoid flicker in UI showing unset state
    useLayoutEffect(() => {
        if (activeOrgId) return;
        if (orgList.length === 0) return;
        const first = orgList[0];
        setActiveOrg(first.id, first.name);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeOrgId, orgList.length]);

    const projectAutoOrgRef = useRef<string | undefined>(undefined);

    useEffect(() => {
        if (!activeOrgId) return;
        if (activeProjectId) return;
        const matching = projectList.filter(p => !p.orgId || orgIdsMatch(p.orgId, activeOrgId));
        const hasExplicitMatch = matching.some(p => p.orgId && orgIdsMatch(p.orgId, activeOrgId));
        const candidateList = hasExplicitMatch ? matching.filter(p => p.orgId && orgIdsMatch(p.orgId, activeOrgId)) : matching;
        if (projLoading && candidateList.length === 0) return;
        if (candidateList.length === 0) return; // no project yet – creation form handles
        if (projectAutoOrgRef.current === activeOrgId) return;
        const first = candidateList[0];
        setActiveProject(first.id, first.name);
        projectAutoOrgRef.current = activeOrgId;
    }, [activeOrgId, activeProjectId, projectList, projLoading, setActiveProject]);

    async function onCreateOrg(e: React.FormEvent) {
        e.preventDefault();
        if (!orgName.trim()) return;
        setError(null);
        setCreatingOrg(true);
        try {
            const org = await createOrg(orgName.trim());
            setActiveOrg(org.id, org.name);
            setOrgName('');
        } catch (e) {
            setError((e as Error).message || 'Failed to create organization');
        } finally { setCreatingOrg(false); }
    }

    async function onCreateProject(e: React.FormEvent) {
        e.preventDefault();
        const trimmed = projectName.trim();
        if (!trimmed) return;
        setError(null);
        setCreatingProject(true);
        try {
            const proj = await createProject(trimmed);
            setActiveProject(proj.id, proj.name);
            setProjectName('');
        } catch (e) {
            const msg = e instanceof Error ? e.message : typeof e === 'string' ? e : JSON.stringify(e);
            setError(msg || 'Failed to create project');
        } finally { setCreatingProject(false); }
    }

    if (orgLoading && orgList.length === 0) {
        return <div className="flex justify-center items-center min-h-[40vh]"><span className="loading loading-spinner loading-lg" /></div>;
    }

    if (orgList.length === 0) {
        return (
            <div className="mx-auto mt-20 border border-base-300 max-w-lg card" role="region" aria-labelledby="org-create-heading">
                <div className="space-y-4 card-body">
                    <h2 id="org-create-heading" className="flex items-center gap-2 text-xl card-title"><Icon icon="lucide--building-2" className="size-6" />Create your organization</h2>
                    <p className="opacity-80 text-sm">Create your first organization to begin.</p>
                    <form onSubmit={onCreateOrg} className="space-y-3" aria-label="Create organization form">
                        <label className="w-full form-control">
                            <div className="py-1 label"><span className="font-medium label-text">Organization name</span></div>
                            <input className="input-bordered w-full input" value={orgName} onChange={e => setOrgName(e.target.value)} required minLength={2} maxLength={100} placeholder="e.g. Acme Inc" />
                        </label>
                        {error && <div role="alert" className="alert alert-error"><Icon icon="lucide--alert-circle" className="size-5" /><span>{error}</span></div>}
                        <button className="w-full btn btn-primary" disabled={creatingOrg || orgName.trim().length < 2} type="submit">{creatingOrg && <span className="loading loading-spinner loading-sm" />} Create organization</button>
                    </form>
                </div>
            </div>
        );
    }

    if (activeOrgId && !activeProjectId && !projLoading && projectList.length === 0) {
        return (
            <div className="mx-auto mt-20 border border-base-300 max-w-lg card" role="region" aria-labelledby="proj-create-heading">
                <div className="space-y-4 card-body">
                    <h2 id="proj-create-heading" className="flex items-center gap-2 text-xl card-title"><Icon icon="lucide--folder-plus" className="size-6" />Create first project</h2>
                    <p className="opacity-80 text-sm">A project groups documents and scopes ingestion/search.</p>
                    <form onSubmit={onCreateProject} className="space-y-3" aria-label="Create project form">
                        <label className="w-full form-control">
                            <div className="py-1 label"><span className="font-medium label-text">Project name</span></div>
                            <input className="input-bordered w-full input" value={projectName} onChange={e => setProjectName(e.target.value)} required minLength={2} maxLength={100} placeholder="e.g. Product Docs" />
                        </label>
                        {error && <div role="alert" className="alert alert-error"><Icon icon="lucide--alert-circle" className="size-5" /><span>{error}</span></div>}
                        <button className="w-full btn btn-primary" disabled={creatingProject || projectName.trim().length < 2} type="submit">{creatingProject && <span className="loading loading-spinner loading-sm" />} Create project</button>
                    </form>
                </div>
            </div>
        );
    }

    return (
        <>
            <div className="flex flex-wrap items-center gap-2 opacity-70 mb-4 text-sm">
                {activeOrgId && <span className="badge badge-neutral">Org: {config.activeOrgName}</span>}
                {activeProjectId && <span className="badge badge-primary">Project: {config.activeProjectName || projectList.find(p => p.id === activeProjectId)?.name}</span>}
                <div className="ml-auto join">
                    <details className="dropdown join-item">
                        <summary className="btn btn-xs">Org</summary>
                        <ul className="z-[1] bg-base-100 shadow p-2 rounded-box w-52 dropdown-content menu">
                            {orgList.map(o => (
                                <li key={o.id}>
                                    <button
                                        onClick={() => setActiveOrg(o.id, o.name)}
                                        aria-current={o.id === activeOrgId ? 'true' : undefined}
                                        className="flex justify-between items-center"
                                    >
                                        <span className="flex items-center gap-2">
                                            <Icon icon="lucide--building-2" className="size-4" />{o.name}
                                        </span>
                                        {o.id === activeOrgId && <Icon icon="lucide--check" className="size-4" />}
                                    </button>
                                </li>
                            ))}
                        </ul>
                    </details>
                    {activeOrgId && projectList.length > 0 && (
                        <details className="dropdown join-item">
                            <summary className="btn btn-xs">Project</summary>
                            <ul className="z-[1] bg-base-100 shadow p-2 rounded-box w-52 dropdown-content menu">
                                {projectList.map(p => (
                                    <li key={p.id}>
                                        <button
                                            onClick={() => setActiveProject(p.id, p.name)}
                                            aria-current={p.id === activeProjectId ? 'true' : undefined}
                                            className="flex justify-between items-center"
                                        >
                                            <span className="flex items-center gap-2"><Icon icon="lucide--folder" className="size-4" />{p.name}</span>
                                            {p.id === activeProjectId && <Icon icon="lucide--check" className="size-4" />}
                                        </button>
                                    </li>
                                ))}
                                <li className="mt-1 pt-1 border-t border-base-300">
                                    <label htmlFor="modal-create-project-inline" className="text-xs link link-primary">Add project</label>
                                </li>
                            </ul>
                        </details>
                    )}
                </div>
            </div>

            {projLoading && activeOrgId && projectList.length === 0 && (
                <div className="flex items-center gap-2 opacity-60 mb-4 text-xs"><span className="loading loading-dots loading-sm" /> Loading projects…</div>
            )}

            {children}

            <input type="checkbox" id="modal-create-project-inline" className="modal-toggle" />
            <div className="modal" role="dialog" aria-modal="true">
                <div className="modal-box">
                    <h3 className="font-bold text-lg">Create Project</h3>
                    {error && <div className="mt-3 alert alert-error"><Icon icon="lucide--alert-triangle" className="size-4" /><span>{error}</span></div>}
                    <form onSubmit={onCreateProject} className="space-y-3 mt-4" aria-label="Inline create project form">
                        <label className="form-control">
                            <span className="mb-1 label-text">Project name</span>
                            <input
                                className="input-bordered input"
                                value={projectName}
                                onChange={e => setProjectName(e.target.value)}
                                required
                                minLength={2}
                                maxLength={100}
                                placeholder="Knowledge Base"
                            />
                        </label>
                        <div className="modal-action">
                            <label htmlFor="modal-create-project-inline" className="btn btn-ghost">Cancel</label>
                            <button type="submit" className="btn btn-primary" disabled={creatingProject || projectName.trim().length < 2}>
                                {creatingProject && <span className="me-2 loading loading-spinner loading-sm" aria-hidden />}
                                Create
                            </button>
                        </div>
                    </form>
                </div>
                <label className="modal-backdrop" htmlFor="modal-create-project-inline">Close</label>
            </div>
        </>
    );
}

export interface OrgAndProjectGateRedirectProps { children: React.ReactNode }
export function OrgAndProjectGateRedirect({ children }: OrgAndProjectGateRedirectProps) {
    const { config } = useConfig();
    const navigate = useNavigate();
    const location = useLocation();
    const ready = !!config.activeOrgId && !!config.activeProjectId;
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
