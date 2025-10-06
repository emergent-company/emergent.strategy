import { type ReactNode, useEffect } from "react";
import { useAuth } from "@/contexts/auth";
import { useNotificationCounts } from "@/hooks/useNotifications";
import { useExtractionJobsCount } from "@/hooks/useExtractionJobsCount";
import { useConfig } from "@/contexts/config";
import { useProjects } from "@/hooks/use-projects";

import { Footer } from "@/components/organisms/Footer";
import { Rightbar } from "@/components/organisms/Rightbar";
import { Sidebar } from "@/components/organisms/Sidebar";
import { Topbar } from "@/components/organisms/Topbar";

import { OrgAndProjectGateRedirect } from "@/components/organisms/OrgAndProjectGate";

const AdminLayout = ({ children }: { children: ReactNode }) => {
    const { ensureAuthenticated, isAuthenticated } = useAuth();
    const { data: notificationCounts } = useNotificationCounts();
    const { counts: extractionJobsCounts } = useExtractionJobsCount();
    const { config, setActiveProject } = useConfig();
    const { projects, loading: projectsLoading, error: projectsError } = useProjects();

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

    // Calculate total unread notifications
    const totalUnread = (notificationCounts?.important || 0) + (notificationCounts?.other || 0);

    return (
        <div className="size-full">
            <div className="flex">
                <Sidebar>
                    <Sidebar.ProjectDropdown
                        activeProjectId={config.activeProjectId}
                        activeProjectName={config.activeProjectName}
                        projects={projects}
                        loading={projectsLoading}
                        errorMsg={projectsError}
                        onSelectProject={(id: string, name: string) => setActiveProject(id, name)}
                    />
                    <Sidebar.Section id="admin-primary" title="Overview">
                        <Sidebar.MenuItem id="apps-documents" url="/admin/apps/documents" icon="lucide--file-text">
                            Documents
                        </Sidebar.MenuItem>
                        <Sidebar.MenuItem id="apps-chunks" url="/admin/apps/chunks" icon="lucide--square-stack">
                            Chunks
                        </Sidebar.MenuItem>
                        <Sidebar.MenuItem id="apps-objects" url="/admin/objects" icon="lucide--box">
                            Objects
                        </Sidebar.MenuItem>
                        <Sidebar.MenuItem
                            id="extraction-jobs"
                            url="/admin/extraction-jobs"
                            icon="lucide--workflow"
                            badges={extractionJobsCounts.total > 0 ? [
                                {
                                    label: extractionJobsCounts.total > 99 ? '99+' : extractionJobsCounts.total.toString(),
                                    variant: extractionJobsCounts.running > 0 ? 'info' : 'warning'
                                }
                            ] : undefined}
                        >
                            Extraction Jobs
                        </Sidebar.MenuItem>
                        <Sidebar.MenuItem id="admin-chat" url="/admin/apps/chat" icon="lucide--message-square">
                            Chat
                        </Sidebar.MenuItem>
                        <Sidebar.MenuItem
                            id="admin-inbox"
                            url="/admin/inbox"
                            icon="lucide--inbox"
                            badges={totalUnread > 0 ? [
                                {
                                    label: totalUnread > 99 ? '99+' : totalUnread.toString(),
                                    variant: notificationCounts?.important ? 'primary' : 'neutral'
                                }
                            ] : undefined}
                        >
                            Inbox
                        </Sidebar.MenuItem>
                    </Sidebar.Section>
                    <Sidebar.Section id="admin-settings" title="Settings" className="mt-4">
                        <Sidebar.MenuItem
                            id="admin-integrations"
                            url="/admin/integrations"
                            icon="lucide--plug"
                        >
                            Integrations
                        </Sidebar.MenuItem>
                        <Sidebar.MenuItem
                            id="admin-settings-project"
                            url="/admin/settings/project"
                            icon="lucide--settings"
                        >
                            Project Settings
                        </Sidebar.MenuItem>
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
