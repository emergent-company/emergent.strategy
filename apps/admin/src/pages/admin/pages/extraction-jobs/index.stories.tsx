import type { Meta, StoryObj } from '@storybook/react';
import { ExtractionJobsPage } from './index';
import type { ExtractionJobCardProps } from '@/components/organisms/ExtractionJobCard';

const meta = {
    title: 'Pages/ExtractionJobsPage',
    component: ExtractionJobsPage,
    parameters: {
        layout: 'fullscreen',
    },
    tags: ['autodocs'],
} satisfies Meta<typeof ExtractionJobsPage>;

export default meta;
type Story = StoryObj<typeof meta>;

const mockJobs: ExtractionJobCardProps[] = [
    {
        id: 'job-1',
        status: 'running',
        sourceDocument: 'meeting-notes-2025-10-04.md',
        successfulItems: 15,
        failedItems: 0,
        processedItems: 15,
        totalItems: 50,
        discoveredTypes: ['Requirement', 'Decision', 'Task'],
        createdAt: '2025-10-04T10:30:00Z',
    },
    {
        id: 'job-2',
        status: 'completed',
        sourceDocument: 'requirements-document.pdf',
        successfulItems: 42,
        failedItems: 3,
        processedItems: 45,
        totalItems: 45,
        discoveredTypes: ['Requirement', 'Feature', 'Constraint', 'Stakeholder'],
        createdAt: '2025-10-04T09:20:00Z',
        completedAt: '2025-10-04T09:30:00Z',
    },
    {
        id: 'job-3',
        status: 'failed',
        sourceDocument: 'architecture-notes.txt',
        successfulItems: 5,
        failedItems: 1,
        processedItems: 6,
        totalItems: 50,
        discoveredTypes: ['Decision'],
        errorMessage: 'API authentication failed',
        createdAt: '2025-10-04T08:00:00Z',
    },
    {
        id: 'job-4',
        status: 'pending',
        sourceDocument: 'user-stories.md',
        successfulItems: 0,
        failedItems: 0,
        processedItems: 0,
        totalItems: 0,
        discoveredTypes: [],
        createdAt: '2025-10-04T10:50:00Z',
    },
    {
        id: 'job-5',
        status: 'requires_review',
        sourceDocument: 'technical-spec.docx',
        successfulItems: 38,
        failedItems: 0,
        processedItems: 38,
        totalItems: 38,
        discoveredTypes: ['Requirement', 'Decision', 'Feature', 'Task'],
        createdAt: '2025-10-03T14:20:00Z',
        completedAt: '2025-10-03T14:35:00Z',
    },
    {
        id: 'job-6',
        status: 'completed',
        sourceDocument: 'project-charter.pdf',
        successfulItems: 18,
        failedItems: 1,
        processedItems: 19,
        totalItems: 19,
        discoveredTypes: ['Requirement', 'Stakeholder', 'Constraint'],
        createdAt: '2025-10-03T11:00:00Z',
        completedAt: '2025-10-03T11:10:00Z',
    },
];

export const Default: Story = {
    args: {
        jobs: mockJobs,
        isLoading: false,
        totalCount: mockJobs.length,
    },
};

export const Loading: Story = {
    args: {
        jobs: [],
        isLoading: true,
        totalCount: 0,
    },
};

export const Empty: Story = {
    args: {
        jobs: [],
        isLoading: false,
        totalCount: 0,
    },
};

export const SingleJob: Story = {
    args: {
        jobs: [mockJobs[1]],
        isLoading: false,
        totalCount: 1,
    },
};

export const ManyJobs: Story = {
    args: {
        jobs: Array.from({ length: 25 }, (_, i) => ({
            ...mockJobs[i % mockJobs.length],
            id: `job-${i}`,
            createdAt: new Date(Date.now() - i * 3600000).toISOString(),
        })),
        isLoading: false,
        totalCount: 25,
    },
};
