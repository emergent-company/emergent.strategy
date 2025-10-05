import type { Meta, StoryObj } from '@storybook/react';
import { ExtractionJobCard } from './ExtractionJobCard';

const meta = {
    title: 'Organisms/ExtractionJobCard',
    component: ExtractionJobCard,
    parameters: {
        layout: 'padded',
    },
    tags: ['autodocs'],
    decorators: [
        (Story) => (
            <div className="max-w-md">
                <Story />
            </div>
        ),
    ],
} satisfies Meta<typeof ExtractionJobCard>;

export default meta;
type Story = StoryObj<typeof meta>;

const baseProps = {
    id: '550e8400-e29b-41d4-a716-446655440000',
    sourceDocument: 'meeting-notes-2025-10-04.md',
    createdAt: '2025-10-04T10:30:00Z',
};

export const Pending: Story = {
    args: {
        ...baseProps,
        status: 'pending',
        successfulItems: 0,
        failedItems: 0,
        processedItems: 0,
        totalItems: 0,
        discoveredTypes: [],
    },
};

export const Running: Story = {
    args: {
        ...baseProps,
        status: 'running',
        successfulItems: 15,
        failedItems: 2,
        processedItems: 17,
        totalItems: 50,
        discoveredTypes: ['Requirement', 'Decision', 'Task'],
    },
};

export const Completed: Story = {
    args: {
        ...baseProps,
        status: 'completed',
        successfulItems: 42,
        failedItems: 3,
        processedItems: 45,
        totalItems: 45,
        discoveredTypes: ['Requirement', 'Decision', 'Feature', 'Task', 'Risk', 'Stakeholder'],
        completedAt: '2025-10-04T10:35:00Z',
    },
};

export const Failed: Story = {
    args: {
        ...baseProps,
        status: 'failed',
        successfulItems: 5,
        failedItems: 1,
        processedItems: 6,
        totalItems: 50,
        discoveredTypes: ['Requirement'],
        errorMessage: 'LLM API rate limit exceeded. Please try again later.',
        completedAt: '2025-10-04T10:32:00Z',
    },
};

export const RequiresReview: Story = {
    args: {
        ...baseProps,
        status: 'requires_review',
        successfulItems: 38,
        failedItems: 0,
        processedItems: 38,
        totalItems: 38,
        discoveredTypes: ['Requirement', 'Decision', 'Feature', 'Task'],
        completedAt: '2025-10-04T10:35:00Z',
    },
};

export const WithManyTypes: Story = {
    args: {
        ...baseProps,
        status: 'completed',
        successfulItems: 127,
        failedItems: 8,
        processedItems: 135,
        totalItems: 135,
        discoveredTypes: [
            'Requirement',
            'Decision',
            'Feature',
            'Task',
            'Risk',
            'Issue',
            'Stakeholder',
            'Constraint',
        ],
        completedAt: '2025-10-04T10:45:00Z',
    },
};

export const NoSourceDocument: Story = {
    args: {
        id: '550e8400-e29b-41d4-a716-446655440001',
        status: 'completed',
        successfulItems: 25,
        failedItems: 0,
        processedItems: 25,
        totalItems: 25,
        discoveredTypes: ['Requirement', 'Feature'],
        createdAt: '2025-10-04T09:00:00Z',
        completedAt: '2025-10-04T09:05:00Z',
    },
};

/**
 * Multiple cards in a list view
 */
export const ListView: Story = {
    args: {
        ...baseProps,
        status: 'completed',
        successfulItems: 0,
        failedItems: 0,
        processedItems: 0,
        totalItems: 0,
        discoveredTypes: [],
    },
    render: () => (
        <div className="flex flex-col gap-4">
            <ExtractionJobCard
                {...baseProps}
                id="job-1"
                status="running"
                successfulItems={15}
                failedItems={0}
                processedItems={15}
                totalItems={50}
                discoveredTypes={['Requirement', 'Decision']}
            />
            <ExtractionJobCard
                {...baseProps}
                id="job-2"
                status="completed"
                sourceDocument="requirements-document.pdf"
                successfulItems={42}
                failedItems={3}
                processedItems={45}
                totalItems={45}
                discoveredTypes={['Requirement', 'Feature', 'Constraint']}
                completedAt="2025-10-04T09:30:00Z"
                createdAt="2025-10-04T09:20:00Z"
            />
            <ExtractionJobCard
                {...baseProps}
                id="job-3"
                status="failed"
                sourceDocument="architecture-notes.txt"
                successfulItems={5}
                failedItems={1}
                processedItems={6}
                totalItems={50}
                discoveredTypes={['Decision']}
                errorMessage="API authentication failed"
                createdAt="2025-10-04T08:00:00Z"
            />
            <ExtractionJobCard
                {...baseProps}
                id="job-4"
                status="pending"
                sourceDocument="user-stories.md"
                successfulItems={0}
                failedItems={0}
                processedItems={0}
                totalItems={0}
                discoveredTypes={[]}
                createdAt="2025-10-04T10:50:00Z"
            />
        </div>
    ),
};
