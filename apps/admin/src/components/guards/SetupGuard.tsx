// Router guard: Ensures org and project exist before accessing admin routes
// Redirects to /setup/* if missing, allowing tests to detect 302 vs 200
// Also checks for pending invitations before redirecting new users to org setup
import { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router';
import { useConfig } from '@/contexts/config';
import { useAccessTreeContext } from '@/contexts/access-tree';
import { useAuth } from '@/contexts/useAuth';
import { Spinner } from '@/components/atoms/Spinner';

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
 * 4. If no orgs exist → check for pending invitations first
 *    - If pending invitations → redirect to /invites/pending
 *    - If no invitations → redirect to /setup/organization
 * 5. If no projects exist → redirect to /setup/project
 * 6. If both exist → render children (admin route)
 */
export function SetupGuard({ children }: SetupGuardProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { config, setActiveOrg, setActiveProject } = useConfig();
  const { orgs, projects, loading, error } = useAccessTreeContext();
  const { getAccessToken } = useAuth();
  const hasRedirectedRef = useRef(false);

  // State for invitation check
  const [checkingInvites, setCheckingInvites] = useState(false);
  const [invitesChecked, setInvitesChecked] = useState(false);

  /**
   * Check for pending invitations when user has no orgs.
   * If invitations exist, redirect to /invites/pending.
   * If no invitations, proceed with org setup redirect.
   */
  const checkPendingInvitations = useCallback(async (): Promise<boolean> => {
    console.log('[SetupGuard] Checking for pending invitations...');

    const token = getAccessToken();
    if (!token) {
      console.log('[SetupGuard] No access token, skipping invite check');
      return false;
    }

    try {
      const response = await fetch('/api/invites/pending', {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        console.warn(
          '[SetupGuard] Failed to fetch pending invitations:',
          response.status
        );
        return false;
      }

      const invites = await response.json();
      console.log('[SetupGuard] Pending invitations:', invites.length);

      return invites.length > 0;
    } catch (err) {
      console.error('[SetupGuard] Error checking pending invitations:', err);
      return false;
    }
  }, [getAccessToken]);

  useEffect(() => {
    const runGuard = async () => {
      console.log('[SetupGuard] useEffect triggered', {
        pathname: location.pathname,
        hasRedirected: hasRedirectedRef.current,
        loading,
        error,
        orgsCount: orgs.length,
        projectsCount: projects.length,
        storedOrgId: config.activeOrgId,
        storedProjectId: config.activeProjectId,
        checkingInvites,
        invitesChecked,
      });

      // Avoid redirect loops
      if (hasRedirectedRef.current) {
        return;
      }

      // Don't redirect during initial data loading
      if (loading) {
        return;
      }

      // If there's an API error, don't redirect - show error state instead
      if (error) {
        console.error(
          '[SetupGuard] API error detected, showing error state:',
          error
        );
        return;
      }

      // If no orgs exist, check for pending invitations first
      if (orgs.length === 0) {
        // Only check invites once
        if (!invitesChecked && !checkingInvites) {
          setCheckingInvites(true);
          const hasPendingInvites = await checkPendingInvitations();
          setInvitesChecked(true);
          setCheckingInvites(false);

          if (hasPendingInvites) {
            console.log(
              '[SetupGuard] Found pending invitations, redirecting to /invites/pending'
            );
            hasRedirectedRef.current = true;
            navigate('/invites/pending', {
              replace: true,
              state: { returnTo: location.pathname },
            });
            return;
          }
        }

        // If still checking invites, wait
        if (checkingInvites) {
          return;
        }

        // No invitations found, redirect to org setup
        console.log(
          '[SetupGuard] No orgs found and no pending invitations, redirecting to org setup'
        );
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
    };

    void runGuard();
  }, [
    orgs,
    projects,
    loading,
    error,
    navigate,
    location.pathname,
    config.activeOrgId,
    config.activeProjectId,
    setActiveOrg,
    setActiveProject,
    checkingInvites,
    invitesChecked,
    checkPendingInvitations,
  ]);

  // Show loading state while checking
  if (loading || checkingInvites) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <Spinner size="lg" />
      </div>
    );
  }

  // Show error state if API failed
  if (error) {
    return (
      <div className="flex justify-center items-center min-h-screen bg-base-200">
        <div className="mx-4 w-full max-w-md">
          <div className="bg-base-100 shadow-xl border border-base-300 card">
            <div className="space-y-4 card-body">
              <div className="text-center">
                <div className="inline-flex bg-error/10 mb-4 p-3 rounded-full">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="size-8 text-error"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                    />
                  </svg>
                </div>
                <h1 className="justify-center font-bold text-2xl card-title">
                  Server Error
                </h1>
                <p className="mt-2 text-base-content/70">
                  Unable to load your organizations and projects
                </p>
              </div>

              <div
                role="alert"
                className="alert alert-error"
                data-testid="setup-guard-error"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="size-5 flex-shrink-0"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                <span className="text-sm">{error}</span>
              </div>

              <div className="space-y-2">
                <button
                  onClick={() => window.location.reload()}
                  className="w-full btn btn-primary"
                  data-testid="setup-guard-retry"
                >
                  Retry
                </button>
                <p className="text-sm text-base-content/60 text-center">
                  If the problem persists, please contact support
                </p>
              </div>
            </div>
          </div>
        </div>
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
