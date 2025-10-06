import type { Meta, StoryObj } from '@storybook/react';
import { ConfigureIntegrationModal } from './ConfigureIntegrationModal';
import type { AvailableIntegration, Integration } from '@/api/integrations';

// Mock client for stories
const mockClient = {
    listAvailable: async () => [],
    listIntegrations: async () => [],
    getIntegration: async () => ({} as Integration),
    createIntegration: async () => ({} as Integration),
    updateIntegration: async () => ({} as Integration),
    deleteIntegration: async () => { },
    testConnection: async () => ({ success: true, message: 'Connected' }),
    triggerSync: async () => ({ success: true, message: 'Sync started' }),
    getClickUpWorkspaceStructure: async () => ({ workspace: { id: '', name: '' }, spaces: [] }),
} as any;

const meta: Meta<typeof ConfigureIntegrationModal> = {
    title: 'Pages/Integrations/ConfigureIntegrationModal',
    component: ConfigureIntegrationModal,
    parameters: {
        layout: 'centered',
    },
    tags: ['autodocs'],
    argTypes: {
        integration: { control: 'object' },
        configuredInstance: { control: 'object' },
    },
    args: {
        onClose: () => { },
        onSuccess: () => { },
        client: mockClient,
    },
};

export default meta;
type Story = StoryObj<typeof meta>;

const clickUpIntegration: AvailableIntegration = {
    name: 'clickup',
    displayName: 'ClickUp',
    description: 'Import tasks, lists, and workspaces from ClickUp',
    capabilities: {
        supportsImport: true,
        supportsWebhooks: true,
        supportsBidirectionalSync: false,
        requiresOAuth: false,
        supportsIncrementalSync: true,
    },
    requiredSettings: ['workspace_id', 'api_token'],
    optionalSettings: {},
};

const configuredIntegration: Integration = {
    id: '11111111-1111-4111-8111-111111111111',
    org_id: '22222222-2222-4222-8222-222222222222',
    project_id: '33333333-3333-4333-8333-333333333333',
    name: 'clickup',
    display_name: 'ClickUp',
    enabled: true,
    settings: {
        workspace_id: 'workspace_123',
        api_token: 'existing_encrypted_token',
    },
    last_sync_at: new Date().toISOString(),
    last_sync_status: 'success' as const,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
};

/**
 * Modal for configuring a new integration (first-time setup).
 * Form fields are empty and ready for user input.
 */
export const NewIntegration: Story = {
    args: {
        integration: clickUpIntegration,
        configuredInstance: undefined,
    },
};

/**
 * Modal for editing an existing integration configuration.
 * Form fields are pre-filled with current values.
 */
export const EditExisting: Story = {
    args: {
        integration: clickUpIntegration,
        configuredInstance: configuredIntegration,
    },
};

/**
 * Modal in closed state (for testing visibility toggle).
 * Note: Modal doesn't have isOpen prop - visibility is controlled by parent.
 */
export const Closed: Story = {
    args: {
        integration: clickUpIntegration,
        configuredInstance: undefined,
    },
};

/**
 * Integration with complex configuration.
 * Multiple required and optional settings.
 */
export const ComplexSchema: Story = {
    args: {
        integration: {
            ...clickUpIntegration,
            displayName: 'Advanced Integration',
            requiredSettings: ['api_url', 'api_key', 'workspace_id'],
            optionalSettings: {
                batch_size: 100,
                import_completed: false,
                tags: [],
            },
        },
        configuredInstance: undefined,
    },
};

/**
 * Integration with minimal schema (single required field).
 */
export const MinimalSchema: Story = {
    args: {
        integration: {
            ...clickUpIntegration,
            displayName: 'Simple Integration',
            requiredSettings: ['api_token'],
            optionalSettings: {},
        },
        configuredInstance: undefined,
    },
};

/**
 * Modal with validation errors (simulated).
 * Shows error states for required fields.
 */
export const WithValidationErrors: Story = {
    args: {
        integration: clickUpIntegration,
        configuredInstance: undefined,
    },
    play: async ({ canvasElement }) => {
        // This story demonstrates how validation errors would appear
        // In actual usage, errors would be shown after form submission attempt
    },
};

/**
 * Settings descriptions to test UI layout.
 */
export const LongDescriptions: Story = {
    args: {
        integration: {
            ...clickUpIntegration,
            description: 'Your personal API token from ClickUp. You can generate this from your ClickUp account settings under Apps. Make sure the token has the required permissions: read:task, write:task, read:workspace, read:list. This token will be encrypted and stored securely. The unique identifier for your ClickUp workspace. You can find this in your workspace URL.',
        },
        configuredInstance: undefined,
    },
};
