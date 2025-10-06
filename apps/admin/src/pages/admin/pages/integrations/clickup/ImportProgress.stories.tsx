import type { Meta, StoryObj } from '@storybook/react';
import { ImportProgress } from './ImportProgress';

const meta: Meta<typeof ImportProgress> = {
    title: 'Pages/Integrations/ClickUp/ImportProgress',
    component: ImportProgress,
    parameters: {
        layout: 'centered',
    },
    tags: ['autodocs'],
    argTypes: {
        syncing: { control: 'boolean' },
    },
};

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Default progress indicator (preparing state).
 */
export const Default: Story = {
    args: {
        syncing: false,
    },
};

/**
 * Progress indicator during active sync.
 */
export const Syncing: Story = {
    args: {
        syncing: true,
    },
};
