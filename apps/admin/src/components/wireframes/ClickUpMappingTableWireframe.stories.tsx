import type { Meta, StoryObj } from '@storybook/react';
import { ClickUpMappingTableWireframe, ClickUpMappingTableWireframeProps } from './ClickUpMappingTableWireframe';

const meta: Meta<typeof ClickUpMappingTableWireframe> = {
    title: 'Wireframes/ClickUp/MappingTable',
    component: ClickUpMappingTableWireframe,
    args: { state: 'default', rows: 5 } satisfies Partial<ClickUpMappingTableWireframeProps>,
    parameters: {
        docs: { description: { component: 'Low‑fi wireframe for ClickUp integration mapping & sync states.' } },
    },
};
export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const NoSpace: Story = { args: { state: 'no-space' } };
export const Syncing: Story = { args: { state: 'syncing' } };
