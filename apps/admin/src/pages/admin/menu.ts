import { ISidebarMenuItem } from "@/components/admin-layout/SidebarMenuItem";

// Simplified menu showing only the Documents page for now
export const adminMenuItems: ISidebarMenuItem[] = [
    { id: "overview-label", isTitle: true, label: "Overview" },
    {
        id: "apps-documents",
        icon: "lucide--file-text",
        label: "Documents",
        url: "/admin/apps/documents",
    },
    {
        id: "apps-chunks",
        icon: "lucide--square-stack",
        label: "Chunks",
        url: "/admin/apps/chunks",
    },
    {
        id: "admin-chat",
        icon: "lucide--message-square",
        label: "Chat",
        url: "/admin/apps/chat",
    },
    { id: "settings-label", isTitle: true, label: "Settings" },
    {
        id: "admin-settings-ai-prompts",
        icon: "lucide--book-text",
        label: "AI Prompts",
        url: "/admin/settings/ai/prompts",
    },
];
