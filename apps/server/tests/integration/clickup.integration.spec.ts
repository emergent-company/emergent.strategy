import { ClickUpIntegration } from '../../src/modules/clickup/clickup.integration';
import { Logger } from '@nestjs/common';
import { vi } from 'vitest';
import { IntegrationDto } from '../../src/modules/integrations/dto/integration.dto';

// Helper to create a mock IntegrationDto from settings
function createMockIntegration(settings: any): IntegrationDto {
  return {
    id: 'int-test-123',
    name: 'clickup',
    display_name: 'ClickUp',
    enabled: true,
    organization_id: 'org-test',
    project_id: 'proj-test',
    settings,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

describe('ClickUpIntegration', () => {
  let integration: ClickUpIntegration;
  let apiClient: any;
  let importService: any;
  let webhookHandler: any;

  beforeEach(async () => {
    // Create mocks with proper function signatures
    apiClient = {
      configure: vi.fn().mockReturnValue(undefined),
      getWorkspaces: vi.fn().mockResolvedValue({ teams: [] }),
    };

    importService = {
      runFullImport: vi.fn().mockResolvedValue({
        success: true,
        totalImported: 0,
        totalFailed: 0,
        durationMs: 0,
        completedAt: new Date(),
      }),
    };

    webhookHandler = {
      handleWebhook: vi.fn().mockResolvedValue(true),
    };

    // Suppress logs during tests
    vi.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});

    // Create integration instance directly instead of using NestJS DI
    // This is the correct approach for unit testing integrations
    integration = new ClickUpIntegration(
      apiClient as any,
      importService as any,
      webhookHandler as any
    );
  });

  describe('Integration Metadata', () => {
    it('should return correct name', () => {
      expect(integration.getName()).toBe('clickup');
    });

    it('should return correct display name', () => {
      expect(integration.getDisplayName()).toBe('ClickUp');
    });

    it('should return correct capabilities', () => {
      const capabilities = integration.getCapabilities();

      expect(capabilities.supportsImport).toBe(true);
      expect(capabilities.supportsWebhooks).toBe(true);
      expect(capabilities.supportsBidirectionalSync).toBe(false);
      expect(capabilities.requiresOAuth).toBe(false);
      expect(capabilities.supportsIncrementalSync).toBe(true);
    });

    it('should return required settings', () => {
      const required = integration.getRequiredSettings();

      expect(required).toContain('api_token');
      expect(required).toContain('workspace_id');
      expect(required).toHaveLength(2);
    });

    it('should return optional settings with defaults', () => {
      const optional = integration.getOptionalSettings();

      expect(optional.import_completed_tasks).toBe(false);
      expect(optional.import_comments).toBe(true);
      expect(optional.import_custom_fields).toBe(true);
      expect(optional.batch_size).toBe(100);
    });
  });

  describe('Configuration', () => {
    const validSettings = {
      integration_name: 'clickup',
      api_token: 'pk_test_token',
      workspace_id: 'ws_123',
    };

    it('should configure with valid settings', async () => {
      await integration.configure(createMockIntegration(validSettings));

      expect(apiClient.configure).toHaveBeenCalledWith('pk_test_token');
    });

    it('should throw error if api_token is missing', async () => {
      const invalidSettings = {
        integration_name: 'clickup',
        workspace_id: 'ws_123',
      };

      await expect(
        integration.configure(createMockIntegration(invalidSettings as any))
      ).rejects.toThrow('ClickUp API token is required');
    });

    it('should throw error if workspace_id is missing', async () => {
      const invalidSettings = {
        integration_name: 'clickup',
        api_token: 'pk_test_token',
      };

      await expect(
        integration.configure(createMockIntegration(invalidSettings as any))
      ).rejects.toThrow('ClickUp workspace ID is required');
    });
  });

  describe('Validation', () => {
    const validSettings = {
      integration_name: 'clickup',
      api_token: 'pk_test_token',
      workspace_id: 'ws_123',
    };

    beforeEach(async () => {
      await integration.configure(createMockIntegration(validSettings));
    });

    it('should validate configuration successfully', async () => {
      apiClient.getWorkspaces.mockResolvedValue({
        teams: [
          {
            id: 'ws_123',
            name: 'Test Workspace',
            color: '#000000',
            avatar: null,
            members: [],
          },
        ],
      });

      const result = await integration.validateConfiguration();

      expect(result).toBe(true);
      expect(apiClient.getWorkspaces).toHaveBeenCalled();
    });

    it('should fail validation if workspace not found', async () => {
      apiClient.getWorkspaces.mockResolvedValue({
        teams: [
          {
            id: 'ws_456',
            name: 'Other Workspace',
            color: '#000000',
            avatar: null,
            members: [],
          },
        ],
      });

      await expect(integration.validateConfiguration()).rejects.toThrow(
        'Workspace ws_123 not found'
      );
    });

    it('should fail validation if API call fails', async () => {
      apiClient.getWorkspaces.mockRejectedValue(new Error('Unauthorized'));

      await expect(integration.validateConfiguration()).rejects.toThrow(
        'Unauthorized'
      );
    });

    it('should fail validation if not configured', async () => {
      const freshIntegration = new ClickUpIntegration(
        apiClient as any,
        importService as any,
        webhookHandler as any
      );

      await expect(freshIntegration.validateConfiguration()).rejects.toThrow(
        'Integration not configured'
      );
    });
  });

  describe('Import', () => {
    const validSettings = {
      integration_name: 'clickup',
      api_token: 'pk_test_token',
      workspace_id: 'ws_123',
    };

    beforeEach(async () => {
      await integration.configure(createMockIntegration(validSettings));
    });

    it('should run full import successfully', async () => {
      const importResult = {
        success: true,
        totalImported: 150,
        totalFailed: 5,
        durationMs: 5000,
        breakdown: {
          spaces: { imported: 3, failed: 0, skipped: 0 },
          folders: { imported: 10, failed: 0, skipped: 0 },
          lists: { imported: 25, failed: 1, skipped: 0 },
          tasks: { imported: 112, failed: 4, skipped: 0 },
        },
        completedAt: new Date(),
      };

      importService.runFullImport.mockResolvedValue(importResult);

      const result = await integration.runFullImport({});

      expect(result.success).toBe(true);
      expect(result.totalImported).toBe(150);
      expect(importService.runFullImport).toHaveBeenCalled();
    });

    it('should merge custom import config', async () => {
      const importResult = {
        success: true,
        totalImported: 50,
        totalFailed: 0,
        durationMs: 2000,
        breakdown: {},
        completedAt: new Date(),
      };

      importService.runFullImport.mockResolvedValue(importResult);

      await integration.runFullImport({
        includeArchived: true,
        batchSize: 50,
      });

      expect(importService.runFullImport).toHaveBeenCalledWith(
        expect.any(String), // integration id
        expect.any(String), // project id
        expect.any(String), // org id
        'ws_123',
        expect.objectContaining({
          includeArchived: true,
          batchSize: 50,
        })
      );
    });

    it('should throw error if not configured', async () => {
      const freshIntegration = new ClickUpIntegration(
        apiClient as any,
        importService as any,
        webhookHandler as any
      );

      await expect(freshIntegration.runFullImport({})).rejects.toThrow(
        'Integration not configured'
      );
    });
  });

  describe('Webhook Handling', () => {
    const validSettings = {
      integration_name: 'clickup',
      api_token: 'pk_test_token',
      workspace_id: 'ws_123',
    };

    beforeEach(async () => {
      const mockIntegration = createMockIntegration(validSettings);
      mockIntegration.webhook_secret = 'webhook_secret';
      await integration.configure(mockIntegration);
    });

    it('should handle webhook successfully', async () => {
      webhookHandler.handleWebhook.mockResolvedValue(true);

      const bodyObject = {
        event: 'taskCreated',
        task_id: 'task_123',
        webhook_id: 'wh_123',
      };
      const rawBody = JSON.stringify(bodyObject);

      // Generate correct signature
      const crypto = require('crypto');
      const expectedSignature = crypto
        .createHmac('sha256', 'webhook_secret')
        .update(rawBody)
        .digest('hex');

      const payload = {
        event: 'taskCreated',
        headers: {
          'x-signature': expectedSignature,
        },
        body: bodyObject,
      };

      const result = await integration.handleWebhook(payload);

      expect(result).toBe(true);
      expect(webhookHandler.handleWebhook).toHaveBeenCalled();
    });

    it('should reject webhook with invalid signature', async () => {
      const payload = {
        event: 'taskCreated',
        headers: {
          'x-signature': 'invalid_signature',
        },
        body: {
          event: 'taskCreated',
          task_id: 'task_123',
        },
      };

      await expect(integration.handleWebhook(payload)).rejects.toThrow(
        'Invalid webhook signature'
      );
    });

    it('should reject webhook without signature header', async () => {
      const payload = {
        event: 'taskCreated',
        headers: {},
        body: {
          event: 'taskCreated',
          task_id: 'task_123',
        },
      };

      await expect(integration.handleWebhook(payload)).rejects.toThrow(
        'No X-Signature header found'
      );
    });
  });

  describe('Cleanup', () => {
    it('should cleanup resources', async () => {
      const validSettings = {
        integration_name: 'clickup',
        api_token: 'pk_test_token',
        workspace_id: 'ws_123',
      };

      await integration.configure(createMockIntegration(validSettings));

      await integration.cleanup();

      // Verify cleanup was called (integration should be cleared)
      await expect(integration.validateConfiguration()).rejects.toThrow(
        'Integration not configured'
      );
    });
  });
});
