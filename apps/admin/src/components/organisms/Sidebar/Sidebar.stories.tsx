import type { Meta, StoryObj } from '@storybook/react';
import { Sidebar } from './index';
import { SidebarSection } from '@/components/organisms/SidebarSection';
import { SidebarMenuItem } from '@/components/molecules/SidebarMenuItem';
import { SidebarProjectDropdown } from '@/components/organisms/SidebarProjectDropdown';

const meta: Meta<typeof Sidebar> = {
    title: 'Organisms/Sidebar/CompleteExample',
    component: Sidebar,
    // Global MemoryRouter supplied in .storybook/preview.tsx – avoid nesting routers.
    decorators: [
        (Story) => (
            <div className="border border-base-300 rounded-box w-72 h-[600px] overflow-hidden">
                <Story />
            </div>
        ),
    ],
    parameters: {
        docs: {
            description: {
                component: 'Composed Sidebar organism using atomic-layer sections, menu items, and project dropdown.'
            }
        }
    }
};
export default meta;

type Story = StoryObj<typeof Sidebar>;

export const Default: Story = {
    render: () => (
        <Sidebar>
            <SidebarProjectDropdown
                projects={[
                    { id: 'p-1', name: 'Core API', status: 'active' },
                    { id: 'p-2', name: 'Indexer', status: 'paused' },
                ]}
                activeProjectId="p-1"
                onSelectProject={() => { }}
                loading={false}
            />
            <SidebarSection title="General">
                <SidebarMenuItem id="documents" url="/admin/documents" icon="lucide--file-text">Documents</SidebarMenuItem>
                <SidebarMenuItem id="settings" url="/admin/settings" icon="lucide--settings">Settings</SidebarMenuItem>
            </SidebarSection>
            <SidebarSection title="Collapsible">
                <SidebarMenuItem id="parent" icon="lucide--folder" collapsible>
                    Parent
                    <SidebarMenuItem id="child-a" url="/admin/a">Child A</SidebarMenuItem>
                    <SidebarMenuItem id="child-b" url="/admin/b">Child B</SidebarMenuItem>
                </SidebarMenuItem>
            </SidebarSection>
        </Sidebar>
    )
};
