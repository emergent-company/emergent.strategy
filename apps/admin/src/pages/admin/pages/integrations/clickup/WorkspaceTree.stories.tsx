import type { Meta, StoryObj } from '@storybook/react';
import { WorkspaceTree } from './WorkspaceTree';
import type { ClickUpWorkspaceStructure } from '@/api/integrations';

const meta: Meta<typeof WorkspaceTree> = {
    title: 'Pages/Integrations/ClickUp/WorkspaceTree',
    component: WorkspaceTree,
    parameters: {
        layout: 'padded',
    },
    tags: ['autodocs'],
    argTypes: {
        structure: { control: 'object' },
        selectedListIds: { control: 'object' },
    },
    args: {
        onSelectionChange: () => { },
    },
};

export default meta;
type Story = StoryObj<typeof meta>;

const mockWorkspaceStructure: ClickUpWorkspaceStructure = {
    workspace: {
        id: 'workspace_123',
        name: 'Engineering Team',
    },
    spaces: [
        {
            id: 'space_1',
            name: 'Product Development',
            archived: false,
            folders: [
                {
                    id: 'folder_1',
                    name: 'Backend',
                    archived: false,
                    lists: [
                        {
                            id: 'list_1',
                            name: 'API Development',
                            task_count: 42,
                            archived: false,
                        },
                        {
                            id: 'list_2',
                            name: 'Database Schema',
                            task_count: 18,
                            archived: false,
                        },
                    ],
                },
                {
                    id: 'folder_2',
                    name: 'Frontend',
                    archived: false,
                    lists: [
                        {
                            id: 'list_3',
                            name: 'UI Components',
                            task_count: 35,
                            archived: false,
                        },
                        {
                            id: 'list_4',
                            name: 'User Experience',
                            task_count: 27,
                            archived: false,
                        },
                    ],
                },
            ],
            lists: [
                {
                    id: 'list_5',
                    name: 'General Tasks',
                    task_count: 15,
                    archived: false,
                },
            ],
        },
        {
            id: 'space_2',
            name: 'Marketing',
            archived: false,
            folders: [],
            lists: [
                {
                    id: 'list_6',
                    name: 'Campaigns',
                    task_count: 23,
                    archived: false,
                },
                {
                    id: 'list_7',
                    name: 'Content Creation',
                    task_count: 31,
                    archived: false,
                },
            ],
        },
    ],
};

/**
 * Default workspace tree with no selections.
 * Shows hierarchical structure with checkboxes.
 */
export const Default: Story = {
    args: {
        structure: mockWorkspaceStructure,
        selectedListIds: [],
    },
};

/**
 * Tree with some lists selected.
 * Demonstrates tri-state checkbox behavior (checked, unchecked, indeterminate).
 */
export const PartialSelection: Story = {
    args: {
        structure: mockWorkspaceStructure,
        selectedListIds: ['list_1', 'list_2', 'list_6'],
    },
};

/**
 * All lists selected (Select All state).
 */
export const AllSelected: Story = {
    args: {
        structure: mockWorkspaceStructure,
        selectedListIds: ['list_1', 'list_2', 'list_3', 'list_4', 'list_5', 'list_6', 'list_7'],
    },
};

/**
 * Workspace with deeply nested structure.
 * Tests expand/collapse and indentation rendering.
 */
export const DeeplyNested: Story = {
    args: {
        structure: {
            workspace: {
                id: 'workspace_deep',
                name: 'Complex Organization',
            },
            spaces: [
                {
                    id: 'space_deep',
                    name: 'Engineering',
                    archived: false,
                    folders: [
                        {
                            id: 'folder_deep_1',
                            name: 'Platform',
                            archived: false,
                            lists: [
                                { id: 'list_deep_1', name: 'Infrastructure', task_count: 25, archived: false },
                                { id: 'list_deep_2', name: 'Security', task_count: 18, archived: false },
                                { id: 'list_deep_3', name: 'Monitoring', task_count: 12, archived: false },
                            ],
                        },
                        {
                            id: 'folder_deep_2',
                            name: 'Applications',
                            archived: false,
                            lists: [
                                { id: 'list_deep_4', name: 'Web App', task_count: 67, archived: false },
                                { id: 'list_deep_5', name: 'Mobile App', task_count: 54, archived: false },
                                { id: 'list_deep_6', name: 'Desktop App', task_count: 43, archived: false },
                            ],
                        },
                        {
                            id: 'folder_deep_3',
                            name: 'Data',
                            archived: false,
                            lists: [
                                { id: 'list_deep_7', name: 'ETL Pipelines', task_count: 31, archived: false },
                                { id: 'list_deep_8', name: 'Analytics', task_count: 28, archived: false },
                                { id: 'list_deep_9', name: 'ML Models', task_count: 22, archived: false },
                            ],
                        },
                    ],
                    lists: [
                        { id: 'list_deep_10', name: 'Engineering Ops', task_count: 19, archived: false },
                    ],
                },
            ],
        },
        selectedListIds: ['list_deep_1', 'list_deep_4', 'list_deep_7'],
    },
};

/**
 * Workspace with no folders (flat structure).
 * Lists are directly under spaces.
 */
export const FlatStructure: Story = {
    args: {
        structure: {
            workspace: {
                id: 'workspace_flat',
                name: 'Startup Team',
            },
            spaces: [
                {
                    id: 'space_flat_1',
                    name: 'Operations',
                    archived: false,
                    folders: [],
                    lists: [
                        { id: 'list_flat_1', name: 'To Do', task_count: 8, archived: false },
                        { id: 'list_flat_2', name: 'In Progress', task_count: 5, archived: false },
                        { id: 'list_flat_3', name: 'Done', task_count: 24, archived: false },
                    ],
                },
                {
                    id: 'space_flat_2',
                    name: 'Sales',
                    archived: false,
                    folders: [],
                    lists: [
                        { id: 'list_flat_4', name: 'Leads', task_count: 42, archived: false },
                        { id: 'list_flat_5', name: 'Qualified', task_count: 18, archived: false },
                    ],
                },
            ],
        },
        selectedListIds: ['list_flat_1', 'list_flat_4'],
    },
};

/**
 * Lists with very high task counts.
 * Tests number formatting and display.
 */
export const HighTaskCounts: Story = {
    args: {
        structure: {
            workspace: {
                id: 'workspace_large',
                name: 'Enterprise Workspace',
            },
            spaces: [
                {
                    id: 'space_large',
                    name: 'Product',
                    archived: false,
                    folders: [
                        {
                            id: 'folder_large',
                            name: 'Backlog',
                            archived: false,
                            lists: [
                                { id: 'list_large_1', name: 'Features', task_count: 1234, archived: false },
                                { id: 'list_large_2', name: 'Bugs', task_count: 567, archived: false },
                                { id: 'list_large_3', name: 'Technical Debt', task_count: 890, archived: false },
                            ],
                        },
                    ],
                    lists: [],
                },
            ],
        },
        selectedListIds: ['list_large_1'],
    },
};

/**
 * Lists with zero tasks.
 * Tests display of empty lists.
 */
export const EmptyLists: Story = {
    args: {
        structure: {
            workspace: {
                id: 'workspace_empty',
                name: 'New Workspace',
            },
            spaces: [
                {
                    id: 'space_empty',
                    name: 'New Space',
                    archived: false,
                    folders: [
                        {
                            id: 'folder_empty',
                            name: 'New Folder',
                            archived: false,
                            lists: [
                                { id: 'list_empty_1', name: 'Empty List 1', task_count: 0, archived: false },
                                { id: 'list_empty_2', name: 'Empty List 2', task_count: 0, archived: false },
                            ],
                        },
                    ],
                    lists: [
                        { id: 'list_empty_3', name: 'Empty List 3', task_count: 0, archived: false },
                    ],
                },
            ],
        },
        selectedListIds: [],
    },
};

/**
 * Long names to test text wrapping and truncation.
 */
export const LongNames: Story = {
    args: {
        structure: {
            workspace: {
                id: 'workspace_long',
                name: 'This is a Very Long Workspace Name That Should Wrap or Truncate',
            },
            spaces: [
                {
                    id: 'space_long',
                    name: 'This is a Very Long Space Name That Contains Many Words',
                    archived: false,
                    folders: [
                        {
                            id: 'folder_long',
                            name: 'This is a Very Long Folder Name That Should Also Wrap or Truncate Properly',
                            archived: false,
                            lists: [
                                {
                                    id: 'list_long_1',
                                    name: 'This is a Very Long List Name That Describes a Complex Task Category in Great Detail',
                                    task_count: 42,
                                    archived: false,
                                },
                            ],
                        },
                    ],
                    lists: [],
                },
            ],
        },
        selectedListIds: [],
    },
};

/**
 * Single space with single list (minimal tree).
 */
export const Minimal: Story = {
    args: {
        structure: {
            workspace: {
                id: 'workspace_min',
                name: 'Simple Workspace',
            },
            spaces: [
                {
                    id: 'space_min',
                    name: 'Main Space',
                    archived: false,
                    folders: [],
                    lists: [
                        { id: 'list_min', name: 'Tasks', task_count: 10, archived: false },
                    ],
                },
            ],
        },
        selectedListIds: [],
    },
};
