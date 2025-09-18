import type { Meta, StoryObj } from "@storybook/react";
import { useEffect } from "react";
import { useNavigate } from "react-router";
import { Sidebar } from "./Sidebar";
import { SidebarSection } from "./SidebarSection";
import { SidebarMenuItem } from "./SidebarMenuItem";
import { SidebarProjectDropdown } from "./SidebarProjectDropdown";

// Sets an initial route inside the single (global) MemoryRouter provided by .storybook/preview.tsx
const InitialRoute: React.FC<{ path: string }> = ({ path }) => {
  const navigate = useNavigate();
  useEffect(() => {
    navigate(path);
    // we only want to run once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
};

const meta: Meta<typeof Sidebar> = {
  title: "Layout/Sidebar",
  component: Sidebar,
  decorators: [
    (Story) => (
      <div className="h-[650px] w-[300px] bg-base-200 rounded-box overflow-hidden border border-base-300">
        {/* Ensure a consistent initial active item without creating a nested router */}
        <InitialRoute path="/admin/documents" />
        <Story />
      </div>
    ),
  ],
  parameters: {
    layout: "centered",
    docs: {
      description: {
        component:
          "Compositional Sidebar using <Sidebar> -> <SidebarSection> -> <SidebarMenuItem>. Activation is based on current router pathname. Nested items expand via internal state.",
      },
    },
  },
};
export default meta;

type Story = StoryObj<typeof Sidebar>;

// 1. Default basic sidebar
export const Default: Story = {
  render: () => (
    <Sidebar>
      <SidebarSection title="Overview">
        <SidebarMenuItem id="documents" url="/admin/documents" icon="lucide--file-text">
          Documents
        </SidebarMenuItem>
        <SidebarMenuItem id="chunks" url="/admin/chunks" icon="lucide--square-stack">
          Chunks
        </SidebarMenuItem>
        <SidebarMenuItem id="chat" url="/admin/chat" icon="lucide--message-square">
          Chat
        </SidebarMenuItem>
      </SidebarSection>
      <SidebarSection title="Settings">
        <SidebarMenuItem id="prompts" url="/admin/ai-prompts" icon="lucide--brain-circuit">
          AI Prompts
        </SidebarMenuItem>
      </SidebarSection>
    </Sidebar>
  ),
};

// 2. With project dropdown composed above sections
export const WithProjectDropdown: Story = {
  render: () => (
    <Sidebar>
      <SidebarProjectDropdown />
      <SidebarSection title="Overview">
        <SidebarMenuItem id="documents" url="/admin/documents" icon="lucide--file-text">
          Documents
        </SidebarMenuItem>
        <SidebarMenuItem id="chunks" url="/admin/chunks" icon="lucide--square-stack">
          Chunks
        </SidebarMenuItem>
      </SidebarSection>
      <SidebarSection title="Settings">
        <SidebarMenuItem id="prompts" url="/admin/ai-prompts" icon="lucide--brain-circuit">
          AI Prompts
        </SidebarMenuItem>
      </SidebarSection>
    </Sidebar>
  ),
};

// 3. Nested items (collapsible parent) example
export const WithNestedItems: Story = {
  render: () => (
    <Sidebar>
      <SidebarSection title="Knowledge Base">
        <SidebarMenuItem id="kb" icon="lucide--library" collapsible>
          Knowledge
          <SidebarMenuItem id="kb-docs" url="/admin/documents" icon="lucide--file-text">
            Documents
          </SidebarMenuItem>
          <SidebarMenuItem id="kb-chunks" url="/admin/chunks" icon="lucide--square-stack">
            Chunks
          </SidebarMenuItem>
          <SidebarMenuItem id="kb-stats" url="/admin/stats" icon="lucide--bar-chart-3" badges={["new"]}>
            Stats
          </SidebarMenuItem>
        </SidebarMenuItem>
        <SidebarMenuItem id="chat" url="/admin/chat" icon="lucide--message-square">
          Chat
        </SidebarMenuItem>
      </SidebarSection>
    </Sidebar>
  ),
};

// 4. Loading state (skeleton placeholders)
export const Loading: Story = {
  name: "Loading (skeleton)",
  render: () => (
    <Sidebar>
      <SidebarSection>
        <div className="flex items-center gap-2 px-2.5 py-1.5">
          <span className="skeleton w-4 h-4 rounded" />
          <span className="skeleton h-3 w-28" />
        </div>
        <div className="flex items-center gap-2 px-2.5 py-1.5">
          <span className="skeleton w-4 h-4 rounded" />
          <span className="skeleton h-3 w-24" />
        </div>
        <div className="flex items-center gap-2 px-2.5 py-1.5">
          <span className="skeleton w-4 h-4 rounded" />
          <span className="skeleton h-3 w-20" />
        </div>
      </SidebarSection>
    </Sidebar>
  ),
};

// 5. Empty state (no navigation items)
export const Empty: Story = {
  render: () => (
    <Sidebar>
      <SidebarSection title="Overview">
        <div className="px-3 py-2 text-xs text-base-content/60">No items available</div>
      </SidebarSection>
    </Sidebar>
  ),
};

// 6. Badges and mixed content
export const WithBadges: Story = {
  render: () => (
    <Sidebar>
      <SidebarSection title="Monitoring">
  <SidebarMenuItem id="jobs" url="/admin/jobs" icon="lucide--cpu" badges={["new"]}>
          Jobs
        </SidebarMenuItem>
  <SidebarMenuItem id="alerts" url="/admin/alerts" icon="lucide--bell" badges={["new", "beta"]}>
          Alerts
        </SidebarMenuItem>
  <SidebarMenuItem id="reports" icon="lucide--chart-pie" collapsible badges={["new"]}>
          Reports
          <SidebarMenuItem id="rep-daily" url="/admin/reports/daily" icon="lucide--sunrise">
            Daily
          </SidebarMenuItem>
          <SidebarMenuItem id="rep-monthly" url="/admin/reports/monthly" icon="lucide--calendar">
            Monthly
          </SidebarMenuItem>
        </SidebarMenuItem>
      </SidebarSection>
    </Sidebar>
  ),
};

// 7. Dense hover toggle demonstration (shows the hover trigger UI)
export const HoverToggle: Story = {
  render: () => (
    <Sidebar>
      <SidebarSection title="Overview">
        <SidebarMenuItem id="documents" url="/admin/documents" icon="lucide--file-text">
          Documents
        </SidebarMenuItem>
        <SidebarMenuItem id="chat" url="/admin/chat" icon="lucide--message-square">
          Chat
        </SidebarMenuItem>
      </SidebarSection>
    </Sidebar>
  ),
  parameters: {
    docs: {
      description: {
        story: "Hover the right edge (panel-left-dashed icon) to toggle the dense/hover sidebar mode.",
      },
    },
  },
};
