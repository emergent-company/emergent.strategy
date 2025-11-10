import { Test, TestingModule } from '@nestjs/testing';
import { ClickUpIntegration } from '../../src/modules/clickup/clickup.integration';
import { ClickUpApiClient } from '../../src/modules/clickup/clickup-api.client';
import { ClickUpImportService } from '../../src/modules/clickup/clickup-import.service';
import { ClickUpWebhookHandler } from '../../src/modules/clickup/clickup-webhook.handler';
import { Logger } from '@nestjs/common';
import { vi } from 'vitest';

describe('ClickUpIntegration', () => {
  let integration: ClickUpIntegration;
  let apiClient: any;
  let importService: any;
  let webhookHandler: any;

  beforeEach(async () => {
    // Create mocks
    const mockApiClient = {
      configure: vi.fn(),
      getWorkspaces: vi.fn(),
    };

    const mockImportService = {
      runFullImport: vi.fn(),
    };

    const mockWebhookHandler = {
      handleWebhook: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ClickUpIntegration,
        {
          provide: ClickUpApiClient,
          useValue: mockApiClient,
        },
        {
          provide: ClickUpImportService,
          useValue: mockImportService,
        },
        {
          provide: ClickUpWebhookHandler,
          useValue: mockWebhookHandler,
        },
      ],
    }).compile();

    integration = module.get<ClickUpIntegration>(ClickUpIntegration);
    apiClient = module.get(ClickUpApiClient);
    importService = module.get(ClickUpImportService);
    webhookHandler = module.get(ClickUpWebhookHandler);

    // Suppress logs during tests
    vi.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
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
      apiClient.configure.mockReturnValue(undefined);

      await integration.configure(validSettings);

      expect(apiClient.configure).toHaveBeenCalledWith('pk_test_token');
    });

    it('should throw error if api_token is missing', async () => {
      const invalidSettings = {
        integration_name: 'clickup',
        workspace_id: 'ws_123',
      };

      await expect(
        integration.configure(invalidSettings as any)
      ).rejects.toThrow('Missing required setting: api_token');
    });

    it('should throw error if workspace_id is missing', async () => {
      const invalidSettings = {
        integration_name: 'clickup',
        api_token: 'pk_test_token',
      };

      await expect(
        integration.configure(invalidSettings as any)
      ).rejects.toThrow('Missing required setting: workspace_id');
    });
  });

  describe('Validation', () => {
    const validSettings = {
      integration_name: 'clickup',
      api_token: 'pk_test_token',
      workspace_id: 'ws_123',
    };

    beforeEach(async () => {
      apiClient.configure.mockReturnValue(undefined);
      await integration.configure(validSettings);
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

      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
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

      const result = await integration.validateConfiguration();

      expect(result.valid).toBe(false);
      expect(result.error).toContain('Workspace ws_123 not found');
    });

    it('should fail validation if API call fails', async () => {
      apiClient.getWorkspaces.mockRejectedValue(new Error('Unauthorized'));

      const result = await integration.validateConfiguration();

      expect(result.valid).toBe(false);
      expect(result.error).toContain('Unauthorized');
    });

    it('should fail validation if not configured', async () => {
      const freshIntegration = new ClickUpIntegration(
        apiClient as any,
        importService as any,
        webhookHandler as any
      );

      const result = await freshIntegration.validateConfiguration();

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Integration not configured');
    });
  });

  describe('Import', () => {
    const validSettings = {
      integration_name: 'clickup',
      api_token: 'pk_test_token',
      workspace_id: 'ws_123',
    };

    beforeEach(async () => {
      apiClient.configure.mockReturnValue(undefined);
      await integration.configure(validSettings);
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

      const result = await integration.runFullImport(
        'int-123',
        'proj-456',
        'org-789',
        {}
      );

      expect(result).toEqual(importResult);
      expect(importService.runFullImport).toHaveBeenCalledWith(
        'int-123',
        'proj-456',
        'org-789',
        'ws_123',
        expect.objectContaining({
          includeArchived: false,
        })
      );
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

      await integration.runFullImport('int-123', 'proj-456', 'org-789', {
        includeArchived: true,
        batchSize: 50,
      });

      expect(importService.runFullImport).toHaveBeenCalledWith(
        'int-123',
        'proj-456',
        'org-789',
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

      await expect(
        freshIntegration.runFullImport('int-123', 'proj-456', 'org-789', {})
      ).rejects.toThrow('Integration not configured');
    });
  });

  describe('Webhook Handling', () => {
    const validSettings = {
      integration_name: 'clickup',
      api_token: 'pk_test_token',
      workspace_id: 'ws_123',
    };

    beforeEach(async () => {
      apiClient.configure.mockReturnValue(undefined);
      await integration.configure(validSettings);
    });

    it('should handle webhook successfully', async () => {
      webhookHandler.handleWebhook.mockResolvedValue(true);

      const payload = {
        headers: {
          'x-signature': 'valid_signature',
        },
        body: {
          event: 'taskCreated',
          task_id: 'task_123',
          webhook_id: 'wh_123',
        },
        rawBody: '{"event":"taskCreated","task_id":"task_123"}',
      };

      const result = await integration.handleWebhook(
        'int-123',
        'proj-456',
        'org-789',
        payload,
        'webhook_secret'
      );

      expect(result).toBe(true);
      expect(webhookHandler.handleWebhook).toHaveBeenCalledWith(
        'int-123',
        'proj-456',
        'org-789',
        payload
      );
    });

    it('should reject webhook with invalid signature', async () => {
      const payload = {
        headers: {
          'x-signature': 'invalid_signature',
        },
        body: {
          event: 'taskCreated',
          task_id: 'task_123',
        },
        rawBody: '{"event":"taskCreated","task_id":"task_123"}',
      };

      await expect(
        integration.handleWebhook(
          'int-123',
          'proj-456',
          'org-789',
          payload,
          'webhook_secret'
        )
      ).rejects.toThrow('Invalid webhook signature');
    });

    it('should reject webhook without signature header', async () => {
      const payload = {
        headers: {},
        body: {
          event: 'taskCreated',
          task_id: 'task_123',
        },
        rawBody: '{"event":"taskCreated","task_id":"task_123"}',
      };

      await expect(
        integration.handleWebhook(
          'int-123',
          'proj-456',
          'org-789',
          payload,
          'webhook_secret'
        )
      ).rejects.toThrow('Missing webhook signature');
    });
  });

  describe('Cleanup', () => {
    it('should cleanup resources', async () => {
      const validSettings = {
        integration_name: 'clickup',
        api_token: 'pk_test_token',
        workspace_id: 'ws_123',
      };

      apiClient.configure.mockReturnValue(undefined);
      await integration.configure(validSettings);

      await integration.cleanup();

      // Verify cleanup was called (settings should be cleared)
      const result = await integration.validateConfiguration();
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Integration not configured');
    });
  });
});
