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
        selectedSpaceIds: { control: 'object' },
    },
    args: {
        onSpaceSelectionChange: () => { },
        mode: 'spaces',
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
            documents: [],
        },
        {
            id: 'space_2',
            name: 'Marketing',
            archived: false,
            documents: [],
        },
        {
            id: 'space_3',
            name: 'Sales',
            archived: true,
            documents: [],
        },
    ],
};

/**
 * Default workspace tree with no selections.
 * Shows flat list of spaces with checkboxes.
 */
export const Default: Story = {
    args: {
        structure: mockWorkspaceStructure,
        selectedSpaceIds: [],
    },
};

/**
 * Tree with some spaces selected.
 */
export const PartialSelection: Story = {
    args: {
        structure: mockWorkspaceStructure,
        selectedSpaceIds: ['space_1', 'space_2'],
    },
};

/**
 * All spaces selected (Select All state).
 */
export const AllSelected: Story = {
    args: {
        structure: mockWorkspaceStructure,
        selectedSpaceIds: ['space_1', 'space_2', 'space_3'],
    },
};

/**
 * Workspace with no spaces (empty state).
 */
export const EmptyWorkspace: Story = {
    args: {
        structure: {
            workspace: {
                id: 'workspace_empty',
                name: 'Empty Workspace',
            },
            spaces: [],
        },
        selectedSpaceIds: [],
    },
};

/**
 * Workspace with many spaces.
 * Tests scrolling behavior.
 */
export const ManySpaces: Story = {
    args: {
        structure: {
            workspace: {
                id: 'workspace_large',
                name: 'Large Organization',
            },
            spaces: [
                { id: 's1', name: 'Engineering', archived: false, documents: [] },
                { id: 's2', name: 'Product', archived: false, documents: [] },
                { id: 's3', name: 'Design', archived: false, documents: [] },
                { id: 's4', name: 'Marketing', archived: false, documents: [] },
                { id: 's5', name: 'Sales', archived: false, documents: [] },
                { id: 's6', name: 'Support', archived: false, documents: [] },
                { id: 's7', name: 'Finance', archived: false, documents: [] },
                { id: 's8', name: 'HR', archived: false, documents: [] },
                { id: 's9', name: 'Legal', archived: false, documents: [] },
                { id: 's10', name: 'Operations', archived: false, documents: [] },
                { id: 's11', name: 'Archive 2023', archived: true, documents: [] },
                { id: 's12', name: 'Archive 2022', archived: true, documents: [] },
            ],
        },
        selectedSpaceIds: ['s1', 's2', 's5'],
    },
};

/**
 * Long space names to test text wrapping and truncation.
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
                    id: 'space_long_1',
                    name: 'This is a Very Long Space Name That Contains Many Words and Should Display Correctly',
                    archived: false,
                    documents: [],
                },
                {
                    id: 'space_long_2',
                    name: 'Another Long Space Name That Tests Wrapping Behavior',
                    archived: false,
                    documents: [],
                },
            ],
        },
        selectedSpaceIds: [],
    },
};

/**
 * Single space (minimal tree).
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
                    documents: [],
                },
            ],
        },
        selectedSpaceIds: [],
    },
};
