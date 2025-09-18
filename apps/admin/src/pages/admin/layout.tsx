import { type ReactNode, useEffect } from "react";
import { useAuth } from "@/contexts/auth";

import { Footer } from "@/components/layout/Footer";
import { Rightbar } from "@/components/layout/Rightbar";
import { Sidebar } from "@/components/layout/Sidebar";
import { SidebarProjectDropdown } from "@/components/layout/SidebarProjectDropdown";
import { SidebarSection } from "@/components/layout/SidebarSection";
import { SidebarMenuItem } from "@/components/layout/SidebarMenuItem";
import { Topbar } from "@/components/layout/Topbar";

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
                <Sidebar>
                    <SidebarProjectDropdown />
                    <SidebarSection id="admin-primary" title="Overview">
                        <SidebarMenuItem id="apps-documents" url="/admin/apps/documents" icon="lucide--file-text">
                            Documents
                        </SidebarMenuItem>
                        <SidebarMenuItem id="apps-chunks" url="/admin/apps/chunks" icon="lucide--square-stack">
                            Chunks
                        </SidebarMenuItem>
                        <SidebarMenuItem id="admin-chat" url="/admin/apps/chat" icon="lucide--message-square">
                            Chat
                        </SidebarMenuItem>
                    </SidebarSection>
                    <SidebarSection id="admin-settings" title="Settings" className="mt-4">
                        <SidebarMenuItem
                            id="admin-settings-ai-prompts"
                            url="/admin/settings/ai/prompts"
                            icon="lucide--book-text"
                        >
                            AI Prompts
                        </SidebarMenuItem>
                    </SidebarSection>
                </Sidebar>
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
