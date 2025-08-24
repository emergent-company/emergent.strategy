import { Suspense } from "react";
import { Route, RouteProps, Routes } from "react-router";

import AdminLayout from "@/pages/admin/layout";
import AuthLayout from "@/pages/auth/layout";
import ComponentLayout from "@/pages/components/layout";

import { registerRoutes } from "./register";

export const Router = (props: RouteProps) => {
    return (
        <Routes>
            <Route>
                {registerRoutes.admin.map((route, index) => (
                    <Route
                        key={"admin-" + index}
                        path={route.path}
                        element={
                            <AdminLayout {...props}>
                                <Suspense>{route.element}</Suspense>
                            </AdminLayout>
                        }
                    />
                ))}
            </Route>
            <Route>
                {registerRoutes.components.map((route, index) => (
                    <Route
                        key={"component-" + index}
                        path={route.path}
                        element={
                            <ComponentLayout {...props}>
                                <Suspense>{route.element}</Suspense>
                            </ComponentLayout>
                        }
                    />
                ))}
            </Route>
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

            <Route>
                {registerRoutes.other.map((route, index) => (
                    <Route key={"other-" + index} path={route.path} element={<Suspense>{route.element}</Suspense>} />
                ))}
            </Route>
        </Routes>
    );
};
