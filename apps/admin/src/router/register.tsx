import { JSX, LazyExoticComponent, lazy } from "react";
import { Navigate, RouteProps, useParams } from "react-router";

export type IRoutesProps = {
    path: RouteProps["path"];
    element: RouteProps["element"];
};

// Component Wrapper
const cw = (Component: LazyExoticComponent<() => JSX.Element>) => {
    return <Component />;
};

// Admin App routes (canonical)
const dashboardRoutes: IRoutesProps[] = [
    // Admin default: /admin -> first sidebar link (Documents)
    {
        path: "/admin",
        element: <Navigate to="/admin/apps/documents" replace />,
    },
    // Chat
    // Legacy redirect for old chat URLs
    {
        path: "/admin/chat",
        element: <Navigate to="/admin/apps/chat" replace />,
    },
    {
        path: "/admin/chat/c/:id?",
        element: <LegacyChatConversationRedirect />,
    },
    {
        path: "/admin/apps/chat",
        element: cw(lazy(() => import("@/pages/admin/chat/home"))),
    },
    {
        path: "/admin/apps/chat/c/:id?",
        element: cw(lazy(() => import("@/pages/admin/chat/conversation"))),
    },
    // Documents
    {
        path: "/admin/apps/documents",
        element: cw(lazy(() => import("@/pages/admin/apps/documents/index"))),
    },
    // Chunks
    {
        path: "/admin/apps/chunks",
        element: cw(lazy(() => import("@/pages/admin/apps/chunks/index"))),
    },
    // My Profile
    {
        path: "/admin/profile",
        element: cw(lazy(() => import("@/pages/admin/profile"))),
    },
    // Settings
    {
        path: "/admin/settings",
        element: <Navigate to="/admin/settings/ai/prompts" replace />,
    },
    {
        path: "/admin/settings/ai/prompts",
        element: cw(lazy(() => import("@/pages/admin/pages/settings/ai-prompts"))),
    },
    // Admin tools
    {
        path: "/admin/tools/layout-builder",
        element: cw(lazy(() => import("@/pages/layout-builder"))),
    },
];

function LegacyChatConversationRedirect() {
    const { id } = useParams();
    const target = id ? `/admin/apps/chat/c/${id}` : "/admin/apps/chat/c/new";
    return <Navigate to={target} replace />;
}

// No legacy routes in spec; reserved for future app-specific routes
const appRoutes: IRoutesProps[] = [];

const componentRoutes: IRoutesProps[] = Object.entries(import.meta.glob("@/pages/components/**/*.tsx")).map(
    ([path, loader]) => {
        const routePath = path
            .replace(/^.*\/pages/, "")
            .replace(/\.tsx$/, "")
            .replace(/\/index$/, "");

        return {
            path: routePath,
            element: cw(lazy(loader as any)),
        };
    },
);

const authRoutes: IRoutesProps[] = [
    {
        path: "/auth/login",
        element: cw(lazy(() => import("@/pages/auth/login"))),
    },
    {
        path: "/auth/callback",
        element: cw(lazy(() => import("@/pages/auth/callback"))),
    },
    {
        path: "/auth/register",
        element: cw(lazy(() => import("@/pages/auth/register"))),
    },
    {
        path: "/auth/forgot-password",
        element: cw(lazy(() => import("@/pages/auth/forgot-password"))),
    },
    {
        path: "/auth/reset-password",
        element: cw(lazy(() => import("@/pages/auth/reset-password"))),
    },
];

const pagesRoutes: IRoutesProps[] = [];

const otherRoutes: IRoutesProps[] = [
    // Legacy redirect
    // no legacy path for layout builder in spec
    {
        path: "/",
        element: cw(lazy(() => import("@/pages/landing"))),
    },
    {
        path: "/landing",
        element: cw(lazy(() => import("@/pages/landing"))),
    },
    {
        path: "/ui/*",
        element: <Navigate to="/components/" replace />,
    },
    {
        path: "/*",
        element: cw(lazy(() => import("@/pages/not-found"))),
    },
];

export const registerRoutes = {
    admin: [...dashboardRoutes, ...appRoutes, ...pagesRoutes],
    components: componentRoutes,
    auth: authRoutes,
    other: otherRoutes,
};
