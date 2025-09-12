import { type ReactNode, useEffect } from "react";
import { useAuth } from "@/contexts/auth";

import { Footer } from "@/components/admin-layout/Footer";
import { Rightbar } from "@/components/admin-layout/Rightbar";
import { Sidebar } from "@/components/admin-layout/Sidebar";
import { Topbar } from "@/components/admin-layout/Topbar";

import { adminMenuItems } from "./menu";
import { OrgAndProjectGateRedirect } from "@/components/OrgAndProjectGate";

const AdminLayout = ({ children }: { children: ReactNode }) => {
    const { ensureAuthenticated, isAuthenticated } = useAuth();
    useEffect(() => {
        ensureAuthenticated();
    }, [ensureAuthenticated]);
    if (!isAuthenticated) {
        return (
            <div className="flex justify-center items-center min-h-screen">
                <div className="loading loading-spinner loading-lg" />
            </div>
        );
    }
    return (
        <div className="size-full">
            <div className="flex">
                <Sidebar menuItems={adminMenuItems} />
                <div className="flex flex-col min-w-0 h-screen overflow-auto grow">
                    <Topbar />
                    <div id="layout-content" className="flex-1 overflow-auto">
                        <OrgAndProjectGateRedirect>{children}</OrgAndProjectGateRedirect>
                    </div>
                    <Footer />
                </div>
            </div>
            <Rightbar />
        </div>
    );
};

export default AdminLayout;
