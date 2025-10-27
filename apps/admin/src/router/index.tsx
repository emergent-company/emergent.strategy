import { Suspense } from "react";
import { Route, RouteProps, Routes } from "react-router";

import AdminLayout from "@/pages/admin/layout";
import AuthLayout from "@/pages/auth/layout";
import { SetupGuard } from "@/components/guards/SetupGuard";

import { registerRoutes } from "./register";
import { useAuth } from "@/contexts/auth";
import { Navigate } from "react-router";

function GuardedAdmin({ children }: { children: React.ReactNode }) {
    const { isAuthenticated } = useAuth();
    if (!isAuthenticated) return <Navigate to="/auth/login" replace />;
    return (
        <SetupGuard>
            {children}
        </SetupGuard>
    );
}

export const Router = (props: RouteProps) => {
    return (
        <Routes>
            <Route>
                {registerRoutes.admin.map((route, index) => (
                    <Route
                        key={"admin-" + index}
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
                        key={"auth-" + index}
                        path={route.path}
                        element={
                            <AuthLayout {...props}>
                                <Suspense>{route.element}</Suspense>
                            </AuthLayout>
                        }
                    />
                ))}
            </Route>

            {/* Setup routes - not guarded, entry point for new users */}
            <Route>
                {registerRoutes.setup.map((route, index) => (
                    <Route
                        key={"setup-" + index}
                        path={route.path}
                        element={<Suspense>{route.element}</Suspense>}
                    />
                ))}
            </Route>

            <Route>
                {registerRoutes.other.map((route, index) => (
                    <Route key={"other-" + index} path={route.path} element={<Suspense>{route.element}</Suspense>} />
                ))}
            </Route>
        </Routes>
    );
};
