// Router guard: Ensures org and project exist before accessing admin routes
// Redirects to /setup/* if missing, allowing tests to detect 302 vs 200
import { useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router';
import { useConfig } from '@/contexts/config';
import { useAccessTreeContext } from '@/contexts/access-tree';

export interface SetupGuardProps {
  children: React.ReactNode;
}

/**
 * SetupGuard ensures user has completed org and project setup before accessing admin routes.
 * Now using useAccessTreeContext() for single-source-of-truth data.
 *
 * Flow:
 * 1. Fetch access tree (orgs + projects) from shared context
 * 2. Validate localStorage IDs against tree data
 * 3. Auto-select first available org/project if stored IDs are invalid
 * 4. If no orgs exist → redirect to /setup/organization
 * 5. If no projects exist → redirect to /setup/project
 * 6. If both exist → render children (admin route)
 */
export function SetupGuard({ children }: SetupGuardProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { config, setActiveOrg, setActiveProject } = useConfig();
  const { orgs, projects, loading } = useAccessTreeContext();
  const hasRedirectedRef = useRef(false);

  useEffect(() => {
    console.log('[SetupGuard] useEffect triggered', {
      pathname: location.pathname,
      hasRedirected: hasRedirectedRef.current,
      loading,
      orgsCount: orgs.length,
      projectsCount: projects.length,
      storedOrgId: config.activeOrgId,
      storedProjectId: config.activeProjectId,
    });

    // Avoid redirect loops
    if (hasRedirectedRef.current) {
      return;
    }

    // Don't redirect during initial data loading
    if (loading) {
      return;
    }

    // Redirect to setup if missing org
    if (orgs.length === 0) {
      console.log('[SetupGuard] No orgs found, redirecting to org setup');
      hasRedirectedRef.current = true;
      navigate('/setup/organization', {
        replace: true,
        state: { returnTo: location.pathname },
      });
      return;
    }

    // Validate stored org ID and auto-select if invalid
    const storedOrgId = config.activeOrgId;
    const storedOrgExists =
      storedOrgId && orgs.some((org) => org.id === storedOrgId);

    if (!storedOrgExists) {
      console.warn(
        '[SetupGuard] Stored org ID not found in access tree, auto-selecting first org',
        { storedOrgId, availableOrgs: orgs.map((o) => o.id) }
      );
      const firstOrg = orgs[0];
      setActiveOrg(firstOrg.id, firstOrg.name);
      // Wait for next render with correct org
      return;
    }

    // Redirect to setup if missing projects
    if (projects.length === 0) {
      console.log(
        '[SetupGuard] No projects found, redirecting to project setup'
      );
      hasRedirectedRef.current = true;
      navigate('/setup/project', {
        replace: true,
        state: { returnTo: location.pathname },
      });
      return;
    }

    // Validate stored project ID and auto-select if invalid
    const storedProjectId = config.activeProjectId;
    const storedProjectExists =
      storedProjectId && projects.some((proj) => proj.id === storedProjectId);

    if (!storedProjectExists) {
      console.warn(
        '[SetupGuard] Stored project ID not found in access tree, auto-selecting first project',
        { storedProjectId, availableProjects: projects.map((p) => p.id) }
      );
      const firstProject = projects[0];
      setActiveProject(firstProject.id, firstProject.name);
    }

    console.log('[SetupGuard] Setup complete, rendering children');
  }, [
    orgs,
    projects,
    loading,
    navigate,
    location.pathname,
    config.activeOrgId,
    config.activeProjectId,
    setActiveOrg,
    setActiveProject,
  ]);

  // Show loading state while checking
  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <span className="loading loading-spinner loading-lg" />
      </div>
    );
  }

  // Only render children if setup complete
  if (orgs.length === 0 || projects.length === 0) {
    // Return null while redirect is processing
    return null;
  }

  return <>{children}</>;
}

export default SetupGuard;
