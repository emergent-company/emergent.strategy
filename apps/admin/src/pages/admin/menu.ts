import { ISidebarMenuItem } from "@/components/admin-layout/SidebarMenuItem";

// Simplified menu showing only the Documents page for now
export const adminMenuItems: ISidebarMenuItem[] = [
    { id: "overview-label", isTitle: true, label: "Overview" },
    {
        id: "apps-documents",
        icon: "lucide--file-text",
        label: "Documents",
        url: "/apps/documents",
    },
    {
        id: "admin-chat",
        icon: "lucide--message-square",
        label: "Chat",
        url: "/admin/chat",
    },
];
