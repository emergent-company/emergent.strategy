import { IQuickIntegrationItem, QuickIntegrationItem } from "./QuickIntegrationItem";

const quickIntegrationItems: IQuickIntegrationItem[] = [
    {
        name: "Salesforce",
        image: "/images/brand-logo/salesforce.svg",
        description: "Salesforce provides customer relationship management software and application focused on sales",
        isConnected: false,
    },

    {
        name: "Asana",
        image: "/images/brand-logo/asana.svg",
        description: "Track, manage and connect your project across any team.",
        isConnected: true,
    },
    {
        name: "Slack",
        image: "/images/brand-logo/slack.svg",
        description: "Slack is a new way to communicate with your team.",
        isConnected: false,
    },
    {
        name: "Notion",
        image: "/images/brand-logo/notion.svg",
        description: "Notion is a freemium productivity and note-taking web application developed by Notion Lab Inc.",
        isConnected: true,
    },
    {
        name: "Hubspot",
        image: "/images/brand-logo/hubspot.svg",
        description: "Hubspot is a CRM platform with all the software, integrations and resources you need to connect",
        isConnected: true,
    },
];

export const QuickIntegrationCard = () => {
    return (
        <div className="card bg-base-100 shadow">
            <div className="card-body">
                <div className="flex items-center gap-2">
                    <span className="iconify lucide--unplug text-base-content/80 size-4.5" />
                    <p className="grow font-medium">Quick Integration</p>
                    <button className="btn btn-ghost btn-sm border-base-300">
                        <span className="iconify lucide--settings-2 size-3.5" />
                        Manage
                    </button>
                </div>
                <div className="mt-4 space-y-3.5">
                    {quickIntegrationItems.map((integration, index) => (
                        <QuickIntegrationItem {...integration} key={index} />
                    ))}
                </div>
            </div>
        </div>
    );
};
