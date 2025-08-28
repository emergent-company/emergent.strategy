import { JSX, LazyExoticComponent, lazy } from "react";
import { Navigate, RouteProps } from "react-router";

export type IRoutesProps = {
    path: RouteProps["path"];
    element: RouteProps["element"];
};

// Component Wrapper
const cw = (Component: LazyExoticComponent<() => JSX.Element>) => {
    return <Component />;
};

// Keep only the Documents page in admin for now
const dashboardRoutes: IRoutesProps[] = [
    {
        path: "/admin/chat",
        element: cw(lazy(() => import("@/pages/admin/chat/home"))),
    },
    {
        path: "/admin/chat/c/:id?",
        element: cw(lazy(() => import("@/pages/admin/chat/conversation"))),
    },
];

const appRoutes: IRoutesProps[] = [
    {
        path: "/apps/documents",
        element: cw(lazy(() => import("@/pages/admin/apps/documents/index"))),
    },
];

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
    {
        path: "/layout-builder",
        element: cw(lazy(() => import("@/pages/layout-builder"))),
    },
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
