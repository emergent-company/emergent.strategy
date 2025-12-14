import type { Meta, StoryObj } from '@storybook/react';
import { SidebarSection, type SidebarSectionProps } from './index';
import { SidebarMenuItem } from '@/components/molecules/SidebarMenuItem';

const meta: Meta<typeof SidebarSection> = {
  title: 'Organisms/Sidebar/SidebarSection',
  component: SidebarSection,
  parameters: {
    layout: 'fullscreen',
    location: '/admin/documents',
  },
};

export default meta;
type Story = StoryObj<typeof SidebarSection>;

const items: SidebarSectionProps['children'] = (
  <>
    <SidebarMenuItem id="docs" icon="lucide--file-text" url="/admin/documents">
      Documents
    </SidebarMenuItem>
    <SidebarMenuItem
      id="chat"
      icon="lucide--message-square"
      url="/admin/chat-sdk"
    >
      Chat
    </SidebarMenuItem>
    <SidebarMenuItem
      id="settings"
      icon="lucide--settings"
      url="/admin/settings"
    >
      Settings
    </SidebarMenuItem>
  </>
);

export const Default: Story = {
  args: {
    title: 'General',
    children: items,
  },
};

export const WithActivatedExternal: Story = {
  name: 'Externally Managed Activation',
  args: {
    title: 'General',
    activated: new Set(['docs']),
    children: items,
  },
};
