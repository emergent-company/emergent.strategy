import type { Meta, StoryObj } from '@storybook/react';
import { ExtractionJobFilters } from './ExtractionJobFilters';

const meta = {
    title: 'Organisms/ExtractionJobFilters',
    component: ExtractionJobFilters,
    parameters: {
        layout: 'padded',
    },
    tags: ['autodocs'],
    args: {
        onStatusFilterChange: () => { },
        onSearchQueryChange: () => { },
        onClearFilters: () => { },
    },
} satisfies Meta<typeof ExtractionJobFilters>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
    args: {
        statusFilter: 'all',
        searchQuery: '',
    },
};

export const WithStatusFilter: Story = {
    args: {
        statusFilter: 'running',
        searchQuery: '',
    },
};

export const WithSearch: Story = {
    args: {
        statusFilter: 'all',
        searchQuery: 'meeting-notes',
    },
};

export const WithBothFilters: Story = {
    args: {
        statusFilter: 'completed',
        searchQuery: 'requirements',
    },
};

export const FailedJobsOnly: Story = {
    args: {
        statusFilter: 'failed',
        searchQuery: '',
    },
};

export const NeedsReviewFilter: Story = {
    args: {
        statusFilter: 'requires_review',
        searchQuery: '',
    },
};
