import { JSX, LazyExoticComponent, lazy } from 'react';
import { Navigate, RouteProps } from 'react-router';

export type IRoutesProps = {
  path: RouteProps['path'];
  element: RouteProps['element'];
};

// Component Wrapper
const cw = (Component: LazyExoticComponent<() => JSX.Element>) => <Component />;

// Admin App routes (canonical)
const dashboardRoutes: IRoutesProps[] = [
  { path: '/admin', element: <Navigate to="/admin/apps/documents" replace /> },
  { path: '/admin/chat', element: <Navigate to="/admin/apps/chat" replace /> },
  {
    path: '/admin/apps/chat',
    element: cw(lazy(() => import('@/pages/admin/chat/home'))),
  },
  {
    path: '/admin/apps/chat/c/:id?',
    element: cw(lazy(() => import('@/pages/admin/chat/conversation'))),
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
    path: '/admin/profile',
    element: cw(lazy(() => import('@/pages/admin/profile'))),
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
    element: cw(lazy(() => import('@/pages/admin/pages/settings/ai-prompts'))),
  },
  {
    path: '/admin/settings/project',
    element: <Navigate to="/admin/settings/project/templates" replace />,
  },
  {
    path: '/admin/settings/project/templates',
    element: cw(
      lazy(() => import('@/pages/admin/pages/settings/project/templates'))
    ),
  },
  {
    path: '/admin/settings/project/auto-extraction',
    element: cw(
      lazy(() => import('@/pages/admin/pages/settings/project/auto-extraction'))
    ),
  },
  {
    path: '/admin/settings/project/chunking',
    element: cw(
      lazy(() => import('@/pages/admin/pages/settings/project/chunking'))
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
  {
    path: '/admin/theme-test',
    element: cw(lazy(() => import('@/pages/admin/pages/theme-test'))),
  },
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
  { path: '/chat', element: cw(lazy(() => import('@/pages/chat'))) },
  {
    path: '/chat-sdk/:id?',
    element: cw(lazy(() => import('@/pages/chat-sdk'))),
  },
  { path: '*', element: cw(lazy(() => import('@/pages/not-found'))) },
];

export const registerRoutes = {
  admin: [...dashboardRoutes, ...appRoutes, ...pagesRoutes],
  auth: authRoutes,
  setup: setupRoutes,
  other: otherRoutes,
};
