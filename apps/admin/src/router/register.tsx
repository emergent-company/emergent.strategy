import { JSX, LazyExoticComponent, lazy, Suspense } from 'react';
import { Navigate, RouteProps, Outlet } from 'react-router';
import { SettingsLayout } from '@/pages/admin/pages/settings/components';
import { SuperadminLayout } from '@/pages/admin/superadmin/layout';
import { Spinner } from '@/components/atoms/Spinner';

export type IRoutesProps = {
  path: RouteProps['path'];
  element: RouteProps['element'];
  children?: IRoutesProps[];
};

// Component Wrapper
const cw = (Component: LazyExoticComponent<() => JSX.Element>) => <Component />;

// Settings page wrapper - wraps component with SettingsLayout
const sw = (Component: LazyExoticComponent<() => JSX.Element>) => (
  <SettingsLayout>
    <Suspense
      fallback={
        <div className="flex justify-center items-center py-12">
          <Spinner size="lg" />
        </div>
      }
    >
      <Component />
    </Suspense>
  </SettingsLayout>
);

// Admin App routes (canonical)
const dashboardRoutes: IRoutesProps[] = [
  { path: '/admin', element: <Navigate to="/admin/apps/documents" replace /> },
  {
    path: '/admin/chat-sdk/:id?',
    element: cw(lazy(() => import('@/pages/chat-sdk'))),
  },
  {
    path: '/admin/apps/documents',
    element: cw(lazy(() => import('@/pages/admin/apps/documents/index'))),
  },
  {
    path: '/admin/apps/chunks',
    element: cw(lazy(() => import('@/pages/admin/apps/chunks/index'))),
  },
  {
    path: '/admin/recent',
    element: cw(lazy(() => import('@/pages/admin/pages/recent/index'))),
  },
  {
    path: '/admin/objects',
    element: cw(lazy(() => import('@/pages/admin/pages/objects/index'))),
  },
  {
    path: '/admin/extraction-jobs',
    element: cw(lazy(() => import('@/pages/admin/pages/extraction-jobs'))),
  },
  {
    path: '/admin/extraction-jobs/:jobId',
    element: cw(
      lazy(() => import('@/pages/admin/pages/extraction-jobs/detail'))
    ),
  },
  {
    path: '/admin/integrations',
    element: cw(lazy(() => import('@/pages/admin/pages/integrations'))),
  },
  {
    path: '/admin/agents',
    element: cw(lazy(() => import('@/pages/admin/pages/agents'))),
  },
  {
    path: '/admin/inbox',
    element: cw(lazy(() => import('@/pages/admin/inbox/index'))),
  },
  {
    path: '/admin/tasks',
    element: cw(lazy(() => import('@/pages/admin/tasks/index'))),
  },
  {
    path: '/admin/settings',
    element: <Navigate to="/admin/settings/ai/prompts" replace />,
  },
  {
    path: '/admin/settings/profile',
    element: cw(
      lazy(() => import('@/pages/admin/pages/settings/ProfileSettings'))
    ),
  },
  {
    path: '/admin/settings/ai/prompts',
    element: sw(lazy(() => import('@/pages/admin/pages/settings/ai-prompts'))),
  },
  {
    path: '/admin/settings/project',
    element: <Navigate to="/admin/settings/project/templates" replace />,
  },
  {
    path: '/admin/settings/project/templates',
    element: sw(
      lazy(() => import('@/pages/admin/pages/settings/project/templates'))
    ),
  },
  {
    path: '/admin/settings/project/auto-extraction',
    element: sw(
      lazy(() => import('@/pages/admin/pages/settings/project/auto-extraction'))
    ),
  },
  {
    path: '/admin/settings/project/llm-settings',
    element: sw(
      lazy(() => import('@/pages/admin/pages/settings/project/llm-settings'))
    ),
  },
  {
    path: '/admin/settings/project/chunking',
    element: sw(
      lazy(() => import('@/pages/admin/pages/settings/project/chunking'))
    ),
  },
  {
    path: '/admin/settings/project/template-studio',
    element: sw(
      lazy(() => import('@/pages/admin/pages/settings/project/template-studio'))
    ),
  },
  {
    path: '/admin/settings/project/members',
    element: sw(
      lazy(() => import('@/pages/admin/pages/settings/project/members'))
    ),
  },
  {
    path: '/admin/monitoring/dashboard',
    element: cw(lazy(() => import('@/pages/admin/monitoring/dashboard'))),
  },
  {
    path: '/admin/monitoring/analytics',
    element: cw(lazy(() => import('@/pages/admin/monitoring/analytics'))),
  },
  // Superadmin routes - nested under SuperadminLayout
  {
    path: '/admin/superadmin',
    element: <SuperadminLayout />,
    children: [
      {
        path: '',
        element: <Navigate to="/admin/superadmin/users" replace />,
      },
      {
        path: 'users',
        element: cw(lazy(() => import('@/pages/admin/superadmin/users'))),
      },
      {
        path: 'organizations',
        element: cw(
          lazy(() => import('@/pages/admin/superadmin/organizations'))
        ),
      },
      {
        path: 'projects',
        element: cw(lazy(() => import('@/pages/admin/superadmin/projects'))),
      },
      {
        path: 'emails',
        element: cw(lazy(() => import('@/pages/admin/superadmin/emails'))),
      },
    ],
  },
  // Theme Editor - only available in development mode
  ...(import.meta.env.DEV
    ? [
        {
          path: '/admin/theme-test',
          element: cw(lazy(() => import('@/pages/admin/pages/theme-test'))),
        },
      ]
    : []),
];

const appRoutes: IRoutesProps[] = [];

const authRoutes: IRoutesProps[] = [
  {
    path: '/auth/login',
    element: cw(lazy(() => import('@/pages/auth/login'))),
  },
  {
    path: '/auth/callback',
    element: cw(lazy(() => import('@/pages/auth/callback'))),
  },
  {
    path: '/auth/logged-out',
    element: cw(lazy(() => import('@/pages/auth/logged-out'))),
  },
  {
    path: '/auth/register',
    element: cw(lazy(() => import('@/pages/auth/register'))),
  },
  {
    path: '/auth/forgot-password',
    element: cw(lazy(() => import('@/pages/auth/forgot-password'))),
  },
  {
    path: '/auth/reset-password',
    element: cw(lazy(() => import('@/pages/auth/reset-password'))),
  },
];

// Setup routes for org/project creation (not guarded - entry point for new users)
const setupRoutes: IRoutesProps[] = [
  {
    path: '/setup/organization',
    element: cw(lazy(() => import('@/pages/setup/organization'))),
  },
  {
    path: '/setup/project',
    element: cw(lazy(() => import('@/pages/setup/project'))),
  },
];

// Invitation routes (not guarded - for accepting invitations before org setup)
const inviteRoutes: IRoutesProps[] = [
  {
    path: '/invites/pending',
    element: cw(lazy(() => import('@/pages/invites/pending'))),
  },
  {
    path: '/invites/accept',
    element: cw(lazy(() => import('@/pages/invites/accept'))),
  },
];

const pagesRoutes: IRoutesProps[] = [];

const otherRoutes: IRoutesProps[] = [
  { path: '/', element: cw(lazy(() => import('@/pages/landing'))) },
  { path: '/landing', element: cw(lazy(() => import('@/pages/landing'))) },
  {
    path: '/automation',
    element: cw(lazy(() => import('@/pages/automation'))),
  },
  {
    path: '/emergent-core',
    element: cw(lazy(() => import('@/pages/emergent-core'))),
  },
  {
    path: '/product-framework',
    element: cw(lazy(() => import('@/pages/product-framework'))),
  },
  // Public release notes pages (no auth required)
  {
    path: '/releases',
    element: cw(lazy(() => import('@/pages/releases'))),
  },
  {
    path: '/releases/:version',
    element: cw(lazy(() => import('@/pages/releases/[version]'))),
  },
  // Public email unsubscribe page (no auth required)
  {
    path: '/unsubscribe/:token',
    element: cw(lazy(() => import('@/pages/unsubscribe'))),
  },
  { path: '*', element: cw(lazy(() => import('@/pages/not-found'))) },
];

export const registerRoutes = {
  admin: [...dashboardRoutes, ...appRoutes, ...pagesRoutes],
  auth: authRoutes,
  setup: setupRoutes,
  invites: inviteRoutes,
  other: otherRoutes,
};
