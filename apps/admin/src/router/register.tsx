import { JSX, LazyExoticComponent, lazy } from "react";
import { Navigate, RouteProps, useParams } from "react-router";

export type IRoutesProps = {
    path: RouteProps["path"];
    element: RouteProps["element"];
};

// Component Wrapper
const cw = (Component: LazyExoticComponent<() => JSX.Element>) => <Component />;

// Admin App routes (canonical)
const dashboardRoutes: IRoutesProps[] = [
    { path: "/admin", element: <Navigate to="/admin/apps/documents" replace /> },
    { path: "/admin/chat", element: <Navigate to="/admin/apps/chat" replace /> },
    { path: "/admin/chat/c/:id?", element: <LegacyChatConversationRedirect /> },
    { path: "/admin/apps/chat", element: cw(lazy(() => import("@/pages/admin/chat/home"))) },
    { path: "/admin/apps/chat/c/:id?", element: cw(lazy(() => import("@/pages/admin/chat/conversation"))) },
    { path: "/admin/apps/documents", element: cw(lazy(() => import("@/pages/admin/apps/documents/index"))) },
    { path: "/admin/apps/chunks", element: cw(lazy(() => import("@/pages/admin/apps/chunks/index"))) },
    { path: "/admin/profile", element: cw(lazy(() => import("@/pages/admin/profile"))) },
    { path: "/admin/settings", element: <Navigate to="/admin/settings/ai/prompts" replace /> },
    { path: "/admin/settings/ai/prompts", element: cw(lazy(() => import("@/pages/admin/pages/settings/ai-prompts"))) },
];

function LegacyChatConversationRedirect() {
    const { id } = useParams();
    const target = id ? `/admin/apps/chat/c/${id}` : "/admin/apps/chat/c/new";
    return <Navigate to={target} replace />;
}

const appRoutes: IRoutesProps[] = [];

const authRoutes: IRoutesProps[] = [
    { path: "/auth/login", element: cw(lazy(() => import("@/pages/auth/login"))) },
    { path: "/auth/callback", element: cw(lazy(() => import("@/pages/auth/callback"))) },
    { path: "/auth/register", element: cw(lazy(() => import("@/pages/auth/register"))) },
    { path: "/auth/forgot-password", element: cw(lazy(() => import("@/pages/auth/forgot-password"))) },
    { path: "/auth/reset-password", element: cw(lazy(() => import("@/pages/auth/reset-password"))) },
];

const pagesRoutes: IRoutesProps[] = [];

const otherRoutes: IRoutesProps[] = [
    { path: "/", element: cw(lazy(() => import("@/pages/landing"))) },
    { path: "/landing", element: cw(lazy(() => import("@/pages/landing"))) },
    { path: "*", element: cw(lazy(() => import("@/pages/not-found"))) },
];

export const registerRoutes = {
    admin: [...dashboardRoutes, ...appRoutes, ...pagesRoutes],
    auth: authRoutes,
    other: otherRoutes,
};
