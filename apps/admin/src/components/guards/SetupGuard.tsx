// Router guard: Ensures org and project exist before accessing admin routes
// Redirects to /setup/* if missing, allowing tests to detect 302 vs 200
import { useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router';
import { useConfig } from '@/contexts/config';
import { useOrganizations } from '@/hooks/use-organizations';
import { useProjects } from '@/hooks/use-projects';

export interface SetupGuardProps {
  children: React.ReactNode;
}

/**
 * SetupGuard ensures user has completed org and project setup before accessing admin routes.
 *
 * Flow:
 * 1. Fetch orgs and projects from API (via hooks)
 * 2. Validate localStorage IDs against API data
 * 3. If stored IDs are invalid, auto-select first available org/project and clear stale data
 * 4. If no orgs exist → redirect to /setup/organization
 * 5. If no projects exist → redirect to /setup/project
 * 6. If both exist → render children (admin route)
 *
 * This allows tests to detect redirect (302) vs successful render (200).
 */
export function SetupGuard({ children }: SetupGuardProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { config, setActiveOrg, setActiveProject } = useConfig();
  const { orgs, loading: orgsLoading } = useOrganizations();
  const { projects, loading: projectsLoading } = useProjects();
  const hasRedirectedRef = useRef(false);

  useEffect(() => {
    console.log('[SetupGuard] useEffect triggered', {
      pathname: location.pathname,
      hasRedirected: hasRedirectedRef.current,
      orgsLoading,
      projectsLoading,
      orgsCount: orgs?.length ?? 'undefined',
      projectsCount: projects?.length ?? 'undefined',
      storedOrgId: config.activeOrgId,
      storedProjectId: config.activeProjectId,
    });

    // Avoid redirect loops
    if (hasRedirectedRef.current) {
      console.log('[SetupGuard] Already redirected, skipping');
      return;
    }

    // Don't redirect during initial data loading
    if (orgsLoading || projectsLoading) {
      console.log('[SetupGuard] Still loading, waiting...');
      return;
    }

    // Check API arrays first - the source of truth for what exists in database
    const hasOrgs = orgs && orgs.length > 0;
    const hasProjects = projects && projects.length > 0;

    console.log('[SetupGuard] Data loaded', { hasOrgs, hasProjects });

    // Redirect to setup if missing org
    if (!hasOrgs) {
      console.log('[SetupGuard] No orgs found, redirecting to org setup');
      hasRedirectedRef.current = true;
      navigate('/setup/organization', {
        replace: true,
        state: { returnTo: location.pathname },
      });
      return;
    }

    // IMPORTANT: Validate org ID BEFORE checking if projects exist!
    // Invalid org ID will cause projects query to return 0 results
    const storedOrgId = config.activeOrgId;
    const storedOrgExists =
      storedOrgId && orgs?.some((org) => org.id === storedOrgId);

    // If stored org is invalid, auto-select first available org
    if (!storedOrgExists && orgs && orgs.length > 0) {
      console.warn(
        '[SetupGuard] Stored org ID not found in API data, auto-selecting first org',
        {
          storedOrgId,
          availableOrgs: orgs.map((o) => o.id),
        }
      );
      const firstOrg = orgs[0];
      setActiveOrg(firstOrg.id, firstOrg.name);
      // Don't check projects yet, wait for next render with correct org
      return;
    }

    // Now check if projects exist (after org validation)
    if (!hasProjects) {
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

    // Validate project ID (only runs if org is valid and projects exist)
    const storedProjectId = config.activeProjectId;
    const storedProjectExists =
      storedProjectId && projects?.some((proj) => proj.id === storedProjectId);

    // If stored project is invalid, auto-select first available project
    if (!storedProjectExists && projects && projects.length > 0) {
      console.warn(
        '[SetupGuard] Stored project ID not found in API data, auto-selecting first project',
        {
          storedProjectId,
          availableProjects: projects.map((p) => p.id),
        }
      );
      const firstProject = projects[0];
      setActiveProject(firstProject.id, firstProject.name);
    }

    console.log('[SetupGuard] Setup complete, rendering children');
  }, [
    orgs,
    projects,
    orgsLoading,
    projectsLoading,
    navigate,
    location.pathname,
    config.activeOrgId,
    config.activeProjectId,
    setActiveOrg,
    setActiveProject,
  ]);

  // Show loading state while checking
  if (orgsLoading || projectsLoading) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <span className="loading loading-spinner loading-lg" />
      </div>
    );
  }

  // Only render children if setup complete
  const hasOrgs = orgs && orgs.length > 0;
  const hasProjects = projects && projects.length > 0;

  if (!hasOrgs || !hasProjects) {
    // Return null while redirect is processing
    return null;
  }

  return <>{children}</>;
}

export default SetupGuard;
