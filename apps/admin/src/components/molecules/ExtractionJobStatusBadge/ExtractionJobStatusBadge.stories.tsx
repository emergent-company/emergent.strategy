import type { Meta, StoryObj } from '@storybook/react';
import { ExtractionJobStatusBadge } from './ExtractionJobStatusBadge';

const meta = {
    title: 'Molecules/ExtractionJobStatusBadge',
    component: ExtractionJobStatusBadge,
    parameters: {
        layout: 'centered',
    },
    tags: ['autodocs'],
} satisfies Meta<typeof ExtractionJobStatusBadge>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Pending: Story = {
    args: {
        status: 'pending',
    },
};

export const Running: Story = {
    args: {
        status: 'running',
    },
};

export const Completed: Story = {
    args: {
        status: 'completed',
    },
};

export const RequiresReview: Story = {
    args: {
        status: 'requires_review',
    },
};

export const Failed: Story = {
    args: {
        status: 'failed',
    },
};

export const Cancelled: Story = {
    args: {
        status: 'cancelled',
    },
};

export const AllStatuses: Story = {
    args: { status: 'completed' },
    render: () => (
        <div className="flex flex-col gap-4">
            <div className="flex items-center gap-2">
                <span className="w-32 text-sm">Pending:</span>
                <ExtractionJobStatusBadge status="pending" />
            </div>
            <div className="flex items-center gap-2">
                <span className="w-32 text-sm">Running:</span>
                <ExtractionJobStatusBadge status="running" />
            </div>
            <div className="flex items-center gap-2">
                <span className="w-32 text-sm">Completed:</span>
                <ExtractionJobStatusBadge status="completed" />
            </div>
            <div className="flex items-center gap-2">
                <span className="w-32 text-sm">Needs Review:</span>
                <ExtractionJobStatusBadge status="requires_review" />
            </div>
            <div className="flex items-center gap-2">
                <span className="w-32 text-sm">Failed:</span>
                <ExtractionJobStatusBadge status="failed" />
            </div>
            <div className="flex items-center gap-2">
                <span className="w-32 text-sm">Cancelled:</span>
                <ExtractionJobStatusBadge status="cancelled" />
            </div>
        </div>
    ),
};

export const WithoutIcons: Story = {
    args: { status: 'completed' },
    render: () => (
        <div className="flex gap-2">
            <ExtractionJobStatusBadge status="pending" showIcon={false} />
            <ExtractionJobStatusBadge status="running" showIcon={false} />
            <ExtractionJobStatusBadge status="completed" showIcon={false} />
            <ExtractionJobStatusBadge status="failed" showIcon={false} />
        </div>
    ),
};

export const Sizes: Story = {
    args: { status: 'running' },
    render: () => (
        <div className="flex flex-col gap-4">
            <div className="flex items-center gap-2">
                <span className="w-32 text-sm">Small:</span>
                <ExtractionJobStatusBadge status="running" size="sm" />
            </div>
            <div className="flex items-center gap-2">
                <span className="w-32 text-sm">Medium:</span>
                <ExtractionJobStatusBadge status="running" size="md" />
            </div>
            <div className="flex items-center gap-2">
                <span className="w-32 text-sm">Large:</span>
                <ExtractionJobStatusBadge status="running" size="lg" />
            </div>
        </div>
    ),
};
