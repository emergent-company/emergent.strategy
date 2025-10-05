import type { Meta, StoryObj } from '@storybook/react';
import { ExtractionJobList } from './ExtractionJobList';
import type { ExtractionJobCardProps } from '../ExtractionJobCard';

const meta = {
    title: 'Organisms/ExtractionJobList',
    component: ExtractionJobList,
    parameters: {
        layout: 'padded',
    },
    tags: ['autodocs'],
    args: {
        onPageChange: () => { },
    },
} satisfies Meta<typeof ExtractionJobList>;

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
];

export const WithJobs: Story = {
    args: {
        jobs: mockJobs,
        isLoading: false,
        currentPage: 1,
        totalPages: 3,
        totalCount: 25,
    },
};

export const Loading: Story = {
    args: {
        jobs: [],
        isLoading: true,
        currentPage: 1,
        totalPages: 1,
        totalCount: 0,
    },
};

export const Empty: Story = {
    args: {
        jobs: [],
        isLoading: false,
        currentPage: 1,
        totalPages: 1,
        totalCount: 0,
    },
};

export const SinglePage: Story = {
    args: {
        jobs: mockJobs.slice(0, 2),
        isLoading: false,
        currentPage: 1,
        totalPages: 1,
        totalCount: 2,
    },
};

export const MultiplePages: Story = {
    args: {
        jobs: mockJobs,
        isLoading: false,
        currentPage: 2,
        totalPages: 10,
        totalCount: 100,
    },
};

export const LastPage: Story = {
    args: {
        jobs: mockJobs.slice(0, 1),
        isLoading: false,
        currentPage: 10,
        totalPages: 10,
        totalCount: 91,
    },
};
