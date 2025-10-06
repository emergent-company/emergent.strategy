import type { Meta, StoryObj } from '@storybook/react';
import { IntegrationCard } from './IntegrationCard';
import type { AvailableIntegration, Integration } from '@/api/integrations';

const meta: Meta<typeof IntegrationCard> = {
    title: 'Pages/Integrations/IntegrationCard',
    component: IntegrationCard,
    parameters: {
        layout: 'centered',
    },
    tags: ['autodocs'],
    argTypes: {
        integration: { control: 'object' },
        configuredInstance: { control: 'object' },
    },
    args: {
        onConfigure: () => { },
        onToggle: () => { },
        onDelete: () => { },
        onSync: () => { },
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
        api_token: 'encrypted_token',
        import_completed_tasks: true,
        batch_size: 100,
    },
    last_sync_at: new Date().toISOString(),
    last_sync_status: 'success' as const,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
};

/**
 * Default state when integration is not yet configured.
 * Shows "Connect" button to begin configuration.
 */
export const NotConfigured: Story = {
    args: {
        integration: clickUpIntegration,
        configuredInstance: undefined,
    },
};

/**
 * Integration is configured but currently disabled.
 * Shows Enable, Configure, and Delete buttons.
 */
export const ConfiguredButDisabled: Story = {
    args: {
        integration: clickUpIntegration,
        configuredInstance: {
            ...configuredIntegration,
            enabled: false,
            last_sync_at: undefined,
            last_sync_status: undefined,
        },
    },
};

/**
 * Integration is configured and enabled, ready to sync.
 * Shows Disable, Configure, Sync Now, and Delete buttons.
 */
export const ConfiguredAndEnabled: Story = {
    args: {
        integration: clickUpIntegration,
        configuredInstance: {
            ...configuredIntegration,
            enabled: true,
            last_sync_at: undefined,
            last_sync_status: undefined,
        },
    },
};

/**
 * Integration has successfully synced before.
 * Shows last sync timestamp and success status.
 */
export const WithSuccessfulSync: Story = {
    args: {
        integration: clickUpIntegration,
        configuredInstance: {
            ...configuredIntegration,
            enabled: true,
            last_sync_at: new Date(Date.now() - 3600000).toISOString(), // 1 hour ago
            last_sync_status: 'success',
        },
    },
};

/**
 * Integration is currently syncing.
 * Sync Now button is disabled during active sync.
 */
export const SyncInProgress: Story = {
    args: {
        integration: clickUpIntegration,
        configuredInstance: {
            ...configuredIntegration,
            enabled: true,
            last_sync_at: new Date().toISOString(),
            last_sync_status: 'running',
        },
    },
};

/**
 * Last sync failed with an error.
 * Shows error message in alert below card.
 */
export const SyncFailed: Story = {
    args: {
        integration: clickUpIntegration,
        configuredInstance: {
            ...configuredIntegration,
            enabled: true,
            last_sync_at: new Date(Date.now() - 1800000).toISOString(), // 30 min ago
            last_sync_status: 'failed',
            error_message: 'Failed to authenticate with ClickUp API. Please check your API token.',
        },
    },
};

/**
 * Integration that only supports webhooks (no import).
 * Sync Now button is not shown.
 */
export const WebhookOnly: Story = {
    args: {
        integration: {
            ...clickUpIntegration,
            displayName: 'Webhook Service',
            description: 'Receive real-time updates via webhooks',
            capabilities: {
                supportsImport: false,
                supportsWebhooks: true,
                supportsBidirectionalSync: false,
                requiresOAuth: false,
                supportsIncrementalSync: false,
            },
        },
        configuredInstance: {
            ...configuredIntegration,
            enabled: true,
        },
    },
};

/**
 * Integration with minimal capabilities (import only).
 * Shows only Import badge.
 */
export const ImportOnly: Story = {
    args: {
        integration: {
            ...clickUpIntegration,
            displayName: 'Simple Importer',
            capabilities: {
                supportsImport: true,
                supportsWebhooks: false,
                supportsBidirectionalSync: false,
                requiresOAuth: false,
                supportsIncrementalSync: false,
            },
        },
        configuredInstance: undefined,
    },
};

/**
 * Integration with all capabilities enabled.
 * Shows all four capability badges.
 */
export const AllCapabilities: Story = {
    args: {
        integration: {
            ...clickUpIntegration,
            displayName: 'Full-Featured Integration',
            capabilities: {
                supportsImport: true,
                supportsWebhooks: true,
                supportsBidirectionalSync: true,
                requiresOAuth: false,
                supportsIncrementalSync: true,
            },
        },
        configuredInstance: {
            ...configuredIntegration,
            enabled: true,
        },
    },
};

/**
 * Long description text to test text wrapping.
 */
export const LongDescription: Story = {
    args: {
        integration: {
            ...clickUpIntegration,
            description:
                'This is a very long description that explains all the features of this integration in great detail. It includes information about task synchronization, workspace hierarchy, custom fields, tags, priorities, statuses, assignees, comments, attachments, and much more. This text should wrap properly within the card.',
        },
        configuredInstance: undefined,
    },
};
