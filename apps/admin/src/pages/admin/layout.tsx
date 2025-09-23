import { type ReactNode, useEffect } from "react";
import { useAuth } from "@/contexts/auth";

import { Footer } from "@/components/organisms/Footer";
import { Rightbar } from "@/components/organisms/Rightbar";
import { Sidebar } from "@/components/organisms/Sidebar";
import { Topbar } from "@/components/organisms/Topbar";

import { OrgAndProjectGateRedirect } from "@/components/organisms/OrgAndProjectGate";

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
                    <Sidebar.ProjectDropdown />
                    <Sidebar.Section id="admin-primary" title="Overview">
                        <Sidebar.MenuItem id="apps-documents" url="/admin/apps/documents" icon="lucide--file-text">
                            Documents
                        </Sidebar.MenuItem>
                        <Sidebar.MenuItem id="apps-chunks" url="/admin/apps/chunks" icon="lucide--square-stack">
                            Chunks
                        </Sidebar.MenuItem>
                        <Sidebar.MenuItem id="admin-chat" url="/admin/apps/chat" icon="lucide--message-square">
                            Chat
                        </Sidebar.MenuItem>
                    </Sidebar.Section>
                    <Sidebar.Section id="admin-settings" title="Settings" className="mt-4">
                        <Sidebar.MenuItem
                            id="admin-settings-ai-prompts"
                            url="/admin/settings/ai/prompts"
                            icon="lucide--book-text"
                        >
                            AI Prompts
                        </Sidebar.MenuItem>
                    </Sidebar.Section>
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
