import type { Meta, StoryObj } from '@storybook/react';
import { ObjectBrowserTableWireframe, ObjectBrowserTableWireframeProps } from './ObjectBrowserTableWireframe';

const meta: Meta<typeof ObjectBrowserTableWireframe> = {
    title: 'Wireframes/ObjectBrowser/Table',
    component: ObjectBrowserTableWireframe,
    args: { state: 'default', rows: 5 } satisfies Partial<ObjectBrowserTableWireframeProps>,
    parameters: {
        docs: { description: { component: 'Low‑fi wireframe for Object Browser table view states.' } },
    },
};
export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Loading: Story = { args: { state: 'loading' } };
export const Empty: Story = { args: { state: 'empty' } };
export const Error: Story = { args: { state: 'error' } };
export const Bulk: Story = { args: { state: 'bulk' } };
