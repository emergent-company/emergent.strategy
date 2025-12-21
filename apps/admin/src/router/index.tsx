import { Suspense } from 'react';
import { Route, RouteProps, Routes } from 'react-router';

import AdminLayout from '@/pages/admin/layout';
import AuthLayout from '@/pages/auth/layout';
import { SetupGuard } from '@/components/guards/SetupGuard';
import { ReverseSetupGuard } from '@/components/guards/ReverseSetupGuard';

import { registerRoutes } from './register';
import { useAuth } from '@/contexts/useAuth';
import { Navigate } from 'react-router';

function GuardedAdmin({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth();
  if (!isAuthenticated) return <Navigate to="/auth/login" replace />;
  return <SetupGuard>{children}</SetupGuard>;
}

export const Router = (props: RouteProps) => {
  return (
    <Routes>
      <Route>
        {registerRoutes.admin.map((route, index) => (
          <Route
            key={'admin-' + index}
            path={route.path}
            element={
              <GuardedAdmin>
                <AdminLayout {...props}>
                  <Suspense>{route.element}</Suspense>
                </AdminLayout>
              </GuardedAdmin>
            }
          />
        ))}
      </Route>
      {/* Components gallery routes removed (replaced by Storybook) */}
      <Route>
        {registerRoutes.auth.map((route, index) => (
          <Route
            key={'auth-' + index}
            path={route.path}
            element={
              <AuthLayout {...props}>
                <Suspense>{route.element}</Suspense>
              </AuthLayout>
            }
          />
        ))}
      </Route>

      {/* Setup routes - guarded to redirect existing users to admin */}
      <Route>
        {registerRoutes.setup.map((route, index) => (
          <Route
            key={'setup-' + index}
            path={route.path}
            element={
              <ReverseSetupGuard>
                <Suspense>{route.element}</Suspense>
              </ReverseSetupGuard>
            }
          />
        ))}
      </Route>

      {/* Invite routes - authenticated but not guarded (for new users accepting invitations) */}
      <Route>
        {registerRoutes.invites.map((route, index) => (
          <Route
            key={'invites-' + index}
            path={route.path}
            element={<Suspense>{route.element}</Suspense>}
          />
        ))}
      </Route>

      <Route>
        {registerRoutes.other.map((route, index) => (
          <Route
            key={'other-' + index}
            path={route.path}
            element={<Suspense>{route.element}</Suspense>}
          />
        ))}
      </Route>
    </Routes>
  );
};
