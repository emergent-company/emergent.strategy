import type { Meta, StoryObj } from '@storybook/react';
import { ImportConfigForm } from './ImportConfigForm';

const meta: Meta<typeof ImportConfigForm> = {
    title: 'Pages/Integrations/ClickUp/ImportConfigForm',
    component: ImportConfigForm,
    parameters: {
        layout: 'centered',
    },
    tags: ['autodocs'],
    argTypes: {
        config: { control: 'object' },
    },
    args: {
        onChange: () => { },
    },
};

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Default import configuration form.
 * Shows checkbox for including archived tasks and batch size slider.
 */
export const Default: Story = {
    args: {
        config: {
            includeArchived: false,
            batchSize: 100,
        },
    },
};

/**
 * Form with "Include Archived" enabled.
 */
export const WithArchivedTasks: Story = {
    args: {
        config: {
            includeArchived: true,
            batchSize: 100,
        },
    },
};

/**
 * Form with small batch size (for rate limiting).
 */
export const SmallBatchSize: Story = {
    args: {
        config: {
            includeArchived: false,
            batchSize: 10,
        },
    },
};

/**
 * Form with large batch size (for faster imports).
 */
export const LargeBatchSize: Story = {
    args: {
        config: {
            includeArchived: false,
            batchSize: 1000,
        },
    },
};

/**
 * Form with medium batch size (default recommendation).
 */
export const MediumBatchSize: Story = {
    args: {
        config: {
            includeArchived: false,
            batchSize: 100,
        },
    },
};

/**
 * Form with both options enabled.
 */
export const AllOptionsEnabled: Story = {
    args: {
        config: {
            includeArchived: true,
            batchSize: 500,
        },
    },
};

/**
 * Conservative settings for cautious import.
 * Small batch size, no archived tasks.
 */
export const ConservativeSettings: Story = {
    args: {
        config: {
            includeArchived: false,
            batchSize: 25,
        },
    },
};

/**
 * Aggressive settings for fast bulk import.
 * Large batch size, include everything.
 */
export const AggressiveSettings: Story = {
    args: {
        config: {
            includeArchived: true,
            batchSize: 1000,
        },
    },
};
