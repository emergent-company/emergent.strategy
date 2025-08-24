import { type ReactNode } from "react";

import { Footer } from "@/components/admin-layout/Footer";
import { Rightbar } from "@/components/admin-layout/Rightbar";
import { Sidebar } from "@/components/admin-layout/Sidebar";
import { Topbar } from "@/components/admin-layout/Topbar";

import { adminMenuItems } from "./menu";

const AdminLayout = ({ children }: { children: ReactNode }) => {
    return (
        <div className="size-full">
            <div className="flex">
                <Sidebar menuItems={adminMenuItems} />
                <div className="flex h-screen min-w-0 grow flex-col overflow-auto">
                    <Topbar />
                    <div id="layout-content">{children}</div>
                    <Footer />
                </div>
            </div>
            <Rightbar />
        </div>
    );
};

export default AdminLayout;
