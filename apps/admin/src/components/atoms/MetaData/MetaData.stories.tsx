import type { Meta, StoryObj } from '@storybook/react';
import { MetaData } from './';

const meta: Meta<typeof MetaData> = {
    title: 'SEO/MetaData',
    component: MetaData,
    args: { title: 'Sample Page', noIndex: false },
    parameters: {
        docs: {
            description: {
                component: 'Injects head metadata (title, robots). Use within routed pages; values override defaults.',
            },
        },
    },
    tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const NoIndex: Story = { args: { noIndex: true } };
