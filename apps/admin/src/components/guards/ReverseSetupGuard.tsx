// ReverseSetupGuard: Redirects users who already have orgs/projects away from setup pages
// This prevents authenticated users with existing data from accidentally landing on setup pages
import { useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router';
import { useAccessTreeContext } from '@/contexts/access-tree';
import { useAuth } from '@/contexts/useAuth';
import { Spinner } from '@/components/atoms/Spinner';

export interface ReverseSetupGuardProps {
  children: React.ReactNode;
}

/**
 * ReverseSetupGuard ensures that users who already have organizations and projects
 * are redirected away from setup pages to the admin dashboard.
 *
 * Flow:
 * 1. Wait for auth and access tree to load
 * 2. If user has orgs and projects → redirect to /admin
 * 3. If user has no orgs → allow access to /setup/organization
 * 4. If user has orgs but no projects → allow access to /setup/project
 */
export function ReverseSetupGuard({ children }: ReverseSetupGuardProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { orgs, projects, loading } = useAccessTreeContext();
  const { isAuthenticated, isInitialized } = useAuth();
  const hasRedirectedRef = useRef(false);

  useEffect(() => {
    console.log('[ReverseSetupGuard] useEffect triggered', {
      pathname: location.pathname,
      hasRedirected: hasRedirectedRef.current,
      loading,
      isAuthenticated,
      isInitialized,
      orgsCount: orgs.length,
      projectsCount: projects.length,
    });

    // Avoid redirect loops
    if (hasRedirectedRef.current) {
      return;
    }

    // Wait for auth to initialize
    if (!isInitialized) {
      return;
    }

    // If not authenticated, let them stay on setup (they'll be redirected to login anyway)
    if (!isAuthenticated) {
      return;
    }

    // Wait for access tree to load
    if (loading) {
      return;
    }

    // Determine which setup page we're on
    const isOrgSetup = location.pathname === '/setup/organization';
    const isProjectSetup = location.pathname === '/setup/project';

    // User on org setup but already has orgs → redirect to admin (or project setup if no projects)
    if (isOrgSetup && orgs.length > 0) {
      hasRedirectedRef.current = true;
      if (projects.length > 0) {
        console.log(
          '[ReverseSetupGuard] User has orgs and projects, redirecting to admin'
        );
        navigate('/admin', { replace: true });
      } else {
        console.log(
          '[ReverseSetupGuard] User has orgs but no projects, redirecting to project setup'
        );
        navigate('/setup/project', { replace: true });
      }
      return;
    }

    // User on project setup but already has projects → redirect to admin
    if (isProjectSetup && orgs.length > 0 && projects.length > 0) {
      console.log(
        '[ReverseSetupGuard] User has orgs and projects, redirecting to admin'
      );
      hasRedirectedRef.current = true;
      navigate('/admin', { replace: true });
      return;
    }

    // User on project setup but has no orgs → redirect to org setup
    if (isProjectSetup && orgs.length === 0) {
      console.log(
        '[ReverseSetupGuard] User has no orgs, redirecting to org setup'
      );
      hasRedirectedRef.current = true;
      navigate('/setup/organization', { replace: true });
      return;
    }

    console.log('[ReverseSetupGuard] Allowing access to setup page');
  }, [
    orgs,
    projects,
    loading,
    navigate,
    location.pathname,
    isAuthenticated,
    isInitialized,
  ]);

  // Show loading state while checking
  if (!isInitialized || loading) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <Spinner size="lg" />
      </div>
    );
  }

  return <>{children}</>;
}

export default ReverseSetupGuard;
