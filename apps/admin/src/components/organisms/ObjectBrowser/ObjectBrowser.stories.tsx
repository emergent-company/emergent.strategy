import type { Meta, StoryObj } from '@storybook/react';
import { ObjectBrowser } from './ObjectBrowser';
import { GraphObject } from './ObjectBrowser';

const sampleObjects: GraphObject[] = [
    {
        id: '1',
        name: 'User Authentication Service',
        type: 'Component',
        source: 'Architecture',
        updated_at: '2025-10-03T10:30:00Z',
        relationship_count: 12,
    },
    {
        id: '2',
        name: 'Payment Gateway Integration',
        type: 'Feature',
        source: 'Requirements',
        updated_at: '2025-10-02T14:20:00Z',
        relationship_count: 5,
    },
    {
        id: '3',
        name: 'API Rate Limiting',
        type: 'Capability',
        source: 'TOGAF',
        updated_at: '2025-10-01T09:15:00Z',
        relationship_count: 8,
    },
    {
        id: '4',
        name: 'GDPR Compliance Requirement',
        type: 'Requirement',
        source: 'Regulatory',
        updated_at: '2025-09-30T16:45:00Z',
        relationship_count: 3,
    },
    {
        id: '5',
        name: 'Database Connection Pool',
        type: 'Component',
        source: 'Architecture',
        updated_at: '2025-09-29T11:00:00Z',
        relationship_count: 15,
    },
    {
        id: '6',
        name: 'User Profile Management',
        type: 'Feature',
        source: 'Product',
        updated_at: '2025-09-28T13:30:00Z',
        relationship_count: 7,
    },
    {
        id: '7',
        name: 'Email Notification System',
        type: 'Service',
        source: 'Architecture',
        updated_at: '2025-09-27T08:20:00Z',
        relationship_count: 9,
    },
    {
        id: '8',
        name: 'Mobile App Accessibility',
        type: 'Requirement',
        source: 'UX',
        updated_at: '2025-09-26T15:10:00Z',
        relationship_count: 4,
    },
];

const availableTypes = ['Component', 'Feature', 'Capability', 'Requirement', 'Service'];

const meta: Meta<typeof ObjectBrowser> = {
    title: 'Organisms/ObjectBrowser',
    component: ObjectBrowser,
    parameters: {
        docs: {
            description: {
                component: 'A powerful object browser for exploring and managing graph objects with filtering, search, bulk actions, and multiple view modes.',
            },
        },
        layout: 'padded',
    },
    tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Default state with sample objects
 */
export const Default: Story = {
    args: {
        objects: sampleObjects,
        availableTypes: availableTypes,
    },
};

/**
 * Loading state shows skeleton rows
 */
export const Loading: Story = {
    args: {
        objects: [],
        loading: true,
        availableTypes: availableTypes,
    },
};

/**
 * Empty state when no objects match filters
 */
export const Empty: Story = {
    args: {
        objects: [],
        loading: false,
        availableTypes: availableTypes,
    },
};

/**
 * Error state when loading fails
 */
export const Error: Story = {
    args: {
        objects: [],
        loading: false,
        error: 'Failed to load objects. Please try again later.',
        availableTypes: availableTypes,
    },
};

/**
 * Large dataset with many objects
 */
export const LargeDataset: Story = {
    args: {
        objects: Array.from({ length: 50 }, (_, i) => ({
            id: `obj-${i}`,
            name: `Object ${i + 1}`,
            type: availableTypes[i % availableTypes.length],
            source: i % 3 === 0 ? 'Architecture' : i % 3 === 1 ? 'Requirements' : 'Product',
            updated_at: new Date(Date.now() - i * 86400000).toISOString(),
            relationship_count: Math.floor(Math.random() * 20),
        })),
        availableTypes: availableTypes,
    },
};

/**
 * With interaction handlers
 */
export const WithHandlers: Story = {
    args: {
        objects: sampleObjects,
        availableTypes: availableTypes,
        onObjectClick: (obj) => console.log('Object clicked:', obj),
        onBulkSelect: (ids) => console.log('Selected IDs:', ids),
        onSearchChange: (query) => console.log('Search query:', query),
        onTypeFilterChange: (types) => console.log('Selected types:', types),
    },
};

/**
 * Minimal data (objects without optional fields)
 */
export const MinimalData: Story = {
    args: {
        objects: [
            {
                id: '1',
                name: 'Simple Object 1',
                type: 'Component',
                updated_at: '2025-10-03T10:30:00Z',
            },
            {
                id: '2',
                name: 'Simple Object 2',
                type: 'Feature',
                updated_at: '2025-10-02T14:20:00Z',
            },
            {
                id: '3',
                name: 'Simple Object 3',
                type: 'Requirement',
                updated_at: '2025-10-01T09:15:00Z',
            },
        ],
        availableTypes: availableTypes,
    },
};
