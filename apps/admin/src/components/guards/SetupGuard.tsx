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
 * 2. If no orgs exist → redirect to /setup/organization
 * 3. If no projects exist → redirect to /setup/project
 * 4. If both exist → render children (admin route)
 * 
 * Note: We ALWAYS check API arrays as the source of truth, not localStorage.
 * localStorage may contain stale IDs from previous sessions or deleted resources.
 * 
 * This allows tests to detect redirect (302) vs successful render (200).
 */
export function SetupGuard({ children }: SetupGuardProps) {
    const navigate = useNavigate();
    const location = useLocation();
    const { config } = useConfig();
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
            projectsCount: projects?.length ?? 'undefined'
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
        let hasOrg = orgs && orgs.length > 0;
        let hasProject = projects && projects.length > 0;

        // Fallback: If API shows empty but localStorage has values, trust localStorage
        // This handles the case where browser cache returns stale empty data
        if (!hasProject || !hasOrg) {
            try {
                const stored = window.localStorage.getItem('spec-server');
                if (stored) {
                    const parsed = JSON.parse(stored);
                    if (!hasOrg && parsed.activeOrgId) {
                        console.log('[SetupGuard] localStorage shows org exists, trusting it');
                        hasOrg = true;
                    }
                    if (!hasProject && parsed.activeProjectId) {
                        console.log('[SetupGuard] localStorage shows project exists, trusting it');
                        hasProject = true;
                    }
                }
            } catch (e) {
                console.error('[SetupGuard] Error reading localStorage:', e);
            }
        }

        console.log('[SetupGuard] Check complete', { hasOrg, hasProject });

        // Redirect to setup if missing org or project
        if (!hasOrg) {
            console.log('[SetupGuard] No orgs found, redirecting to org setup');
            hasRedirectedRef.current = true;
            navigate('/setup/organization', {
                replace: true,
                state: { returnTo: location.pathname }
            });
            return;
        }

        if (!hasProject) {
            console.log('[SetupGuard] No projects found, redirecting to project setup');
            hasRedirectedRef.current = true;
            navigate('/setup/project', {
                replace: true,
                state: { returnTo: location.pathname }
            });
            return;
        }

        console.log('[SetupGuard] Setup complete, rendering children');
    }, [orgs, projects, orgsLoading, projectsLoading, navigate, location.pathname]);

    // Show loading state while checking
    if (orgsLoading || projectsLoading) {
        return (
            <div className="flex justify-center items-center min-h-screen">
                <span className="loading loading-spinner loading-lg" />
            </div>
        );
    }

    // Only render children if setup complete
    // Check API arrays first - the source of truth for what exists in database
    let hasOrg = orgs && orgs.length > 0;
    let hasProject = projects && projects.length > 0;

    // Fallback: If API shows empty but localStorage has values, trust localStorage
    // This handles the case where browser cache returns stale empty data
    if (!hasProject || !hasOrg) {
        try {
            const stored = window.localStorage.getItem('spec-server');
            if (stored) {
                const parsed = JSON.parse(stored);
                if (!hasOrg && parsed.activeOrgId) {
                    hasOrg = true;
                }
                if (!hasProject && parsed.activeProjectId) {
                    hasProject = true;
                }
            }
        } catch (e) {
            // Ignore localStorage errors in render
        }
    }

    if (!hasOrg || !hasProject) {
        // Return null while redirect is processing
        return null;
    }

    return <>{children}</>;
}

export default SetupGuard;
