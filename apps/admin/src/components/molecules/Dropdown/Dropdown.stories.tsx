/**
 * Dropdown Component Stories
 */

import type { Meta, StoryObj } from '@storybook/react';
import { Dropdown } from './Dropdown';
import { Icon } from '@/components/atoms/Icon';

const meta = {
    title: 'Molecules/Dropdown',
    component: Dropdown,
    parameters: {
        layout: 'centered',
        docs: {
            description: {
                component: `
A flexible dropdown component using daisyUI classes with compound component pattern.

## Features
- Compound component API (Dropdown.Trigger, Dropdown.Menu, Dropdown.Item)
- Positioning control (top/bottom/left/right, start/end alignment)
- Click outside handling
- Keyboard navigation support
- Proper accessibility (ARIA roles)

## Usage
\`\`\`tsx
<Dropdown end vertical="top">
  <Dropdown.Trigger asButton variant="ghost" size="sm">
    Actions <Icon icon="lucide--chevron-down" />
  </Dropdown.Trigger>
  <Dropdown.Menu>
    <Dropdown.Item onClick={handleEdit}>
      <Icon icon="lucide--edit" /> Edit
    </Dropdown.Item>
    <Dropdown.Item onClick={handleDelete}>
      <Icon icon="lucide--trash" /> Delete
    </Dropdown.Item>
  </Dropdown.Menu>
</Dropdown>
\`\`\`
                `,
            },
        },
    },
    tags: ['autodocs'],
} satisfies Meta<typeof Dropdown>;

export default meta;
type Story = StoryObj<typeof Dropdown>;

/**
 * Default dropdown with basic actions
 */
export const Default: Story = {
    args: {},
    render: () => (
        <Dropdown>
            <Dropdown.Trigger asButton variant="ghost" size="sm">
                Actions
                <Icon icon="lucide--chevron-down" className="size-3" />
            </Dropdown.Trigger>
            <Dropdown.Menu>
                <Dropdown.Item onClick={() => alert('Edit clicked')}>
                    <Icon icon="lucide--edit" className="size-4" />
                    Edit
                </Dropdown.Item>
                <Dropdown.Item onClick={() => alert('View clicked')}>
                    <Icon icon="lucide--eye" className="size-4" />
                    View
                </Dropdown.Item>
                <Dropdown.Item onClick={() => alert('Delete clicked')}>
                    <Icon icon="lucide--trash-2" className="size-4" />
                    Delete
                </Dropdown.Item>
            </Dropdown.Menu>
        </Dropdown>
    ),
};

/**
 * Dropdown aligned to the end (right side)
 */
export const AlignedEnd: Story = {
    args: {},
    render: () => (
        <Dropdown end>
            <Dropdown.Trigger asButton variant="ghost" size="sm">
                Options
                <Icon icon="lucide--chevron-down" className="size-3" />
            </Dropdown.Trigger>
            <Dropdown.Menu>
                <Dropdown.Item onClick={() => console.log('Option 1')}>
                    Option 1
                </Dropdown.Item>
                <Dropdown.Item onClick={() => console.log('Option 2')}>
                    Option 2
                </Dropdown.Item>
                <Dropdown.Item onClick={() => console.log('Option 3')}>
                    Option 3
                </Dropdown.Item>
            </Dropdown.Menu>
        </Dropdown>
    ),
};

/**
 * Dropdown opening upward (top position)
 */
export const OpenUpward: Story = {
    args: {},
    render: () => (
        <div className="mt-32">
            <Dropdown end vertical="top">
                <Dropdown.Trigger asButton variant="outline" size="xs">
                    Actions
                    <Icon icon="lucide--chevron-up" className="size-3" />
                </Dropdown.Trigger>
                <Dropdown.Menu>
                    <Dropdown.Item onClick={() => console.log('Extract')}>
                        <Icon icon="lucide--sparkles" className="size-4" />
                        Extract
                    </Dropdown.Item>
                    <Dropdown.Item onClick={() => console.log('View chunks')}>
                        <Icon icon="lucide--list" className="size-4" />
                        View chunks
                    </Dropdown.Item>
                </Dropdown.Menu>
            </Dropdown>
        </div>
    ),
};

/**
 * Dropdown with different button variants
 */
export const ButtonVariants: Story = {
    args: {},
    render: () => (
        <div className="flex gap-4">
            <Dropdown>
                <Dropdown.Trigger asButton variant="primary" size="sm">
                    Primary
                </Dropdown.Trigger>
                <Dropdown.Menu>
                    <Dropdown.Item onClick={() => console.log('Action 1')}>
                        Action 1
                    </Dropdown.Item>
                    <Dropdown.Item onClick={() => console.log('Action 2')}>
                        Action 2
                    </Dropdown.Item>
                </Dropdown.Menu>
            </Dropdown>

            <Dropdown>
                <Dropdown.Trigger asButton variant="secondary" size="sm">
                    Secondary
                </Dropdown.Trigger>
                <Dropdown.Menu>
                    <Dropdown.Item onClick={() => console.log('Action 1')}>
                        Action 1
                    </Dropdown.Item>
                    <Dropdown.Item onClick={() => console.log('Action 2')}>
                        Action 2
                    </Dropdown.Item>
                </Dropdown.Menu>
            </Dropdown>

            <Dropdown>
                <Dropdown.Trigger asButton variant="accent" size="sm">
                    Accent
                </Dropdown.Trigger>
                <Dropdown.Menu>
                    <Dropdown.Item onClick={() => console.log('Action 1')}>
                        Action 1
                    </Dropdown.Item>
                    <Dropdown.Item onClick={() => console.log('Action 2')}>
                        Action 2
                    </Dropdown.Item>
                </Dropdown.Menu>
            </Dropdown>
        </div>
    ),
};

/**
 * Dropdown with link items
 */
export const WithLinks: Story = {
    args: {},
    render: () => (
        <Dropdown>
            <Dropdown.Trigger asButton variant="ghost" size="sm">
                Navigate
                <Icon icon="lucide--chevron-down" className="size-3" />
            </Dropdown.Trigger>
            <Dropdown.Menu>
                <Dropdown.Item asLink href="/documents">
                    <Icon icon="lucide--file-text" className="size-4" />
                    Documents
                </Dropdown.Item>
                <Dropdown.Item asLink href="/chunks">
                    <Icon icon="lucide--list" className="size-4" />
                    Chunks
                </Dropdown.Item>
                <Dropdown.Item asLink href="/settings">
                    <Icon icon="lucide--settings" className="size-4" />
                    Settings
                </Dropdown.Item>
            </Dropdown.Menu>
        </Dropdown>
    ),
};

/**
 * Dropdown with disabled items
 */
export const WithDisabledItems: Story = {
    args: {},
    render: () => (
        <Dropdown>
            <Dropdown.Trigger asButton variant="ghost" size="sm">
                Actions
            </Dropdown.Trigger>
            <Dropdown.Menu>
                <Dropdown.Item onClick={() => console.log('Edit')}>
                    <Icon icon="lucide--edit" className="size-4" />
                    Edit
                </Dropdown.Item>
                <Dropdown.Item disabled>
                    <Icon icon="lucide--download" className="size-4" />
                    Download (Coming soon)
                </Dropdown.Item>
                <Dropdown.Item onClick={() => console.log('Delete')}>
                    <Icon icon="lucide--trash-2" className="size-4" />
                    Delete
                </Dropdown.Item>
            </Dropdown.Menu>
        </Dropdown>
    ),
};

/**
 * Dropdown that opens on hover
 */
export const HoverTrigger: Story = {
    args: {},
    render: () => (
        <Dropdown hover>
            <Dropdown.Trigger asButton variant="ghost" size="sm">
                Hover me
            </Dropdown.Trigger>
            <Dropdown.Menu>
                <Dropdown.Item onClick={() => console.log('Quick action 1')}>
                    Quick action 1
                </Dropdown.Item>
                <Dropdown.Item onClick={() => console.log('Quick action 2')}>
                    Quick action 2
                </Dropdown.Item>
            </Dropdown.Menu>
        </Dropdown>
    ),
};

/**
 * Dropdown with custom width
 */
export const CustomWidth: Story = {
    args: {},
    render: () => (
        <Dropdown>
            <Dropdown.Trigger asButton variant="ghost" size="sm">
                Wide menu
            </Dropdown.Trigger>
            <Dropdown.Menu width="w-96">
                <Dropdown.Item onClick={() => console.log('Action 1')}>
                    <div>
                        <div className="font-semibold">Action with description</div>
                        <div className="opacity-70 text-xs">
                            This is a longer description that needs more space
                        </div>
                    </div>
                </Dropdown.Item>
                <Dropdown.Item onClick={() => console.log('Action 2')}>
                    <div>
                        <div className="font-semibold">Another action</div>
                        <div className="opacity-70 text-xs">
                            With additional context information
                        </div>
                    </div>
                </Dropdown.Item>
            </Dropdown.Menu>
        </Dropdown>
    ),
};

/**
 * Dropdown without button styling (custom trigger)
 */
export const CustomTrigger: Story = {
    args: {},
    render: () => (
        <Dropdown>
            <Dropdown.Trigger asButton={false} className="hover:opacity-70 cursor-pointer">
                <div className="flex items-center gap-2 p-2 border border-base-300 rounded">
                    <Icon icon="lucide--more-vertical" className="size-5" />
                </div>
            </Dropdown.Trigger>
            <Dropdown.Menu>
                <Dropdown.Item onClick={() => console.log('Action 1')}>
                    Action 1
                </Dropdown.Item>
                <Dropdown.Item onClick={() => console.log('Action 2')}>
                    Action 2
                </Dropdown.Item>
            </Dropdown.Menu>
        </Dropdown>
    ),
};

/**
 * Real-world example: Table row actions (like in DataTable)
 */
export const TableRowActions: Story = {
    args: {},
    render: () => (
        <div className="border rounded overflow-x-auto">
            <table className="table">
                <thead>
                    <tr>
                        <th>Document</th>
                        <th>Created</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td>example-document.pdf</td>
                        <td>2025-10-22</td>
                        <td>
                            <Dropdown end vertical="top">
                                <Dropdown.Trigger asButton variant="ghost" size="xs">
                                    Actions
                                    <Icon icon="lucide--chevron-down" className="size-3" />
                                </Dropdown.Trigger>
                                <Dropdown.Menu>
                                    <Dropdown.Item onClick={() => alert('Extract')}>
                                        <Icon icon="lucide--sparkles" className="size-4" />
                                        Extract
                                    </Dropdown.Item>
                                    <Dropdown.Item asLink href="/chunks">
                                        <Icon icon="lucide--list" className="size-4" />
                                        View chunks
                                    </Dropdown.Item>
                                </Dropdown.Menu>
                            </Dropdown>
                        </td>
                    </tr>
                </tbody>
            </table>
        </div>
    ),
};
