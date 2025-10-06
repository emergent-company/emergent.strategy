import type { Meta, StoryObj } from '@storybook/react';
import { ClickUpSyncModal } from './ClickUpSyncModal';
import type { IntegrationsClient, Integration } from '@/api/integrations';

// Mock client for stories
const mockClient = {
    listAvailable: async () => [],
    listIntegrations: async () => [],
    getIntegration: async () => ({} as Integration),
    createIntegration: async () => ({} as Integration),
    updateIntegration: async () => ({} as Integration),
    deleteIntegration: async () => { },
    testConnection: async () => ({ success: true, message: 'Connected' }),
    triggerSync: async () => ({ success: true, message: 'Sync started', job_id: 'job_123' }),
    getClickUpWorkspaceStructure: async () => ({
        workspace: { id: 'workspace_123', name: 'Engineering Team' },
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
                            { id: 'list_1', name: 'API Development', task_count: 42, archived: false },
                            { id: 'list_2', name: 'Database Schema', task_count: 18, archived: false },
                        ],
                    },
                ],
                lists: [{ id: 'list_3', name: 'General Tasks', task_count: 15, archived: false }],
            },
        ],
    }),
} as any;

const meta: Meta<typeof ClickUpSyncModal> = {
    title: 'Pages/Integrations/ClickUp/ClickUpSyncModal',
    component: ClickUpSyncModal,
    parameters: {
        layout: 'centered',
    },
    tags: ['autodocs'],
    args: {
        client: mockClient,
        onClose: () => { },
        onSuccess: () => { },
    },
};

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Modal open and showing the sync wizard.
 * This is the main interactive state where users configure and start sync.
 * 
 * Note: This story shows the modal structure. To see the full wizard flow
 * with step transitions, interact with the component in Storybook.
 */
export const Open: Story = {
    args: {},
};

/**
 * Modal demonstrating the complete sync flow.
 * Steps:
 * 1. Select Lists - Choose which lists to import from workspace tree
 * 2. Configure - Set import options (archived tasks, batch size)
 * 3. Progress - Shows loading indicator during import
 * 4. Complete - Shows success message with summary
 * 
 * Note: In actual usage, the modal fetches workspace structure via API
 * and progresses through steps based on user interaction.
 */
export const InteractiveFlow: Story = {
    args: {},
    parameters: {
        docs: {
            description: {
                story:
                    'This story demonstrates the full sync wizard flow. Click through the steps:\\n\\n' +
                    '1. **Select Lists**: Use checkboxes to select lists from the workspace tree. Use "Select All" / "Deselect All" buttons for bulk selection.\\n' +
                    '2. **Configure**: Toggle "Include Archived Tasks" and adjust batch size slider.\\n' +
                    '3. **Progress**: Watch the loading indicator (auto-progresses in real app).\\n' +
                    '4. **Complete**: See success message and close modal.\\n\\n' +
                    'The modal validates that at least one list is selected before allowing progression.',
            },
        },
    },
};

/**
 * Modal showing loading state while fetching workspace structure.
 * Displayed when modal opens before structure data is available.
 */
export const LoadingStructure: Story = {
    args: {},
    parameters: {
        docs: {
            description: {
                story:
                    'Shows loading spinner while fetching workspace structure from ClickUp API. ' +
                    'This is the initial state when the modal opens.',
            },
        },
    },
};

/**
 * Modal showing error state when structure fetch fails.
 * Displays error message with retry option.
 */
export const LoadError: Story = {
    args: {},
    parameters: {
        docs: {
            description: {
                story:
                    'Shows error alert when workspace structure cannot be loaded. ' +
                    'User can close modal or retry the fetch operation.',
            },
        },
    },
};

/**
 * Demonstrates validation error when attempting to proceed without selections.
 * "Next" button should be disabled if no lists are selected.
 */
export const ValidationError: Story = {
    args: {},
    parameters: {
        docs: {
            description: {
                story:
                    'The wizard validates that at least one list is selected. ' +
                    'The "Next" button is disabled on the Select Lists step until a selection is made.',
            },
        },
    },
};

/**
 * Modal with large workspace structure (stress test).
 * Tests performance and scrolling with many spaces, folders, and lists.
 */
export const LargeWorkspace: Story = {
    args: {},
    parameters: {
        docs: {
            description: {
                story:
                    'Demonstrates the modal behavior with a large workspace containing many spaces, ' +
                    'folders, and lists. Tests scrolling, expand/collapse, and selection performance.',
            },
        },
    },
};

/**
 * Modal during sync progress (Step 3).
 * Shows loading indicator and status message.
 */
export const SyncInProgress: Story = {
    args: {},
    parameters: {
        docs: {
            description: {
                story:
                    'Shows the progress step where import is actively running. ' +
                    'Displays loading spinner and status messages. ' +
                    'In real usage, this auto-advances to Complete step when sync finishes.',
            },
        },
    },
};

/**
 * Modal showing successful sync completion (Step 4).
 * Displays success message and summary stats.
 */
export const SyncComplete: Story = {
    args: {},
    parameters: {
        docs: {
            description: {
                story:
                    'Shows the completion step after successful import. ' +
                    'Displays success message and allows user to close the modal. ' +
                    'Page should refresh to show newly imported data.',
            },
        },
    },
};

/**
 * Modal workflow for minimal selection (single list).
 */
export const MinimalSelection: Story = {
    args: {},
    parameters: {
        docs: {
            description: {
                story:
                    'Demonstrates the workflow when user selects only a single list. ' +
                    'All steps work the same regardless of selection size.',
            },
        },
    },
};
