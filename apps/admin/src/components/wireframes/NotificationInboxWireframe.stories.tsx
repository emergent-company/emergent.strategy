import type { Meta, StoryObj } from '@storybook/react';
import { NotificationInboxWireframe, NotificationInboxWireframeProps } from './NotificationInboxWireframe';

const meta: Meta<typeof NotificationInboxWireframe> = {
    title: 'Wireframes/NotificationInbox',
    component: NotificationInboxWireframe,
    args: { state: 'default' } satisfies Partial<NotificationInboxWireframeProps>,
    parameters: {
        layout: 'fullscreen',
        docs: { description: { component: 'Low‑fi wireframe matching ClickUp inbox: single-column, grouped by time, tabs with counts.' } },
    },
};
export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Loading: Story = { args: { state: 'loading' } };
export const Empty: Story = { args: { state: 'empty' } };
