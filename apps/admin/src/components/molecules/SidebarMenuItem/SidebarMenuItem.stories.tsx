import type { Meta, StoryObj } from '@storybook/react';
import { SidebarMenuItem, type SidebarMenuItemProps } from './index';

const meta: Meta<typeof SidebarMenuItem> = {
    title: 'Molecules/Sidebar/SidebarMenuItem',
    component: SidebarMenuItem,
    decorators: [
        (Story) => (
            <div className="bg-base-200 p-4 rounded-box w-64">
                <Story />
            </div>
        ),
    ],
    args: {
        id: 'documents',
        url: '/admin/documents',
        icon: 'lucide--file-text',
        children: 'Documents',
        activated: new Set<string>(['documents']),
    } satisfies Partial<SidebarMenuItemProps>,
    parameters: {
        docs: {
            description: {
                component:
                    'Standalone SidebarMenuItem molecule. Demonstrates default, active, nested (collapsible) and badge variants without requiring the full Sidebar root.',
            },
        },
    },
};
export default meta;

type Story = StoryObj<typeof SidebarMenuItem>;

export const Default: Story = {};

export const Inactive: Story = {
    args: {
        activated: new Set<string>(),
    },
};

export const WithBadges: Story = {
    args: {
        badges: ['new'],
    },
};

export const CollapsibleWithChildren: Story = {
    args: {
        id: 'parent',
        icon: 'lucide--folder',
        children: [
            'Parent Item',
            <SidebarMenuItem key="child-a" id="child-a" url="/admin/a" children="Child A" />,
            <SidebarMenuItem key="child-b" id="child-b" url="/admin/b" children="Child B" />,
        ],
        collapsible: true,
        activated: new Set<string>(['parent', 'child-b']),
    },
};

export const WithToggleHandler: Story = {
    args: {
        id: 'toggle-parent',
        collapsible: true,
        children: [
            'Toggle Parent',
            <SidebarMenuItem key="child-c" id="child-c" url="/admin/c" children="Child C" />,
        ],
        onToggleActivated: (key: string) => alert(`Toggled: ${key}`),
        activated: new Set<string>(['toggle-parent']),
    },
    parameters: {
        docs: {
            description: {
                story: 'Shows how onToggleActivated is invoked for collapsible parents.',
            },
        },
    },
};
