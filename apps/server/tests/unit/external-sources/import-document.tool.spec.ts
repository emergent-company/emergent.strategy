import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ImportDocumentTool } from '../../../src/modules/external-sources/import-document.tool';
import { ExternalSourcesService } from '../../../src/modules/external-sources/external-sources.service';
import { ExternalSourceProviderRegistry } from '../../../src/modules/external-sources/external-source-provider-registry.service';
import {
  ExternalSourceProvider,
  ExternalSourceReference,
} from '../../../src/modules/external-sources/interfaces';
import { ExternalSourceType, SyncPolicy } from '../../../src/entities';

/**
 * Tests ImportDocumentTool MCP tool.
 *
 * Mocked: ExternalSourcesService, ExternalSourceProviderRegistry, providers
 * Real: ImportDocumentTool logic (orchestration, error handling)
 * Auth: Not applicable (unit test - auth handled by MCP layer)
 */
describe('ImportDocumentTool', () => {
  let tool: ImportDocumentTool;
  let mockExternalSourcesService: Partial<ExternalSourcesService>;
  let mockProviderRegistry: Partial<ExternalSourceProviderRegistry>;
  let mockGoogleDriveProvider: Partial<ExternalSourceProvider>;

  const mockProjectId = 'project-123';
  const mockRef: ExternalSourceReference = {
    providerType: 'google_drive' as ExternalSourceType,
    externalId: 'file-abc',
    originalUrl: 'https://drive.google.com/file/d/file-abc/view',
    normalizedUrl: 'https://drive.google.com/file/d/file-abc/view',
  };

  beforeEach(() => {
    mockGoogleDriveProvider = {
      providerType: 'google_drive' as ExternalSourceType,
      displayName: 'Google Drive',
      canHandle: vi.fn(() => true),
      parseUrl: vi.fn(() => mockRef),
      checkAccess: vi.fn(() =>
        Promise.resolve({
          accessible: true,
          metadata: { name: 'Test Doc.pdf' },
        })
      ),
      getDefaultSyncPolicy: vi.fn(() => 'manual' as SyncPolicy),
    };

    mockProviderRegistry = {
      detectProvider: vi.fn(
        () => mockGoogleDriveProvider as ExternalSourceProvider
      ),
      getProvider: vi.fn(
        () => mockGoogleDriveProvider as ExternalSourceProvider
      ),
    };

    mockExternalSourcesService = {
      importFromUrl: vi.fn(() =>
        Promise.resolve({
          success: true,
          externalSourceId: 'ext-source-123',
          documentId: 'doc-456',
          status: 'created' as const,
        })
      ),
    };

    tool = new ImportDocumentTool(
      mockExternalSourcesService as ExternalSourcesService,
      mockProviderRegistry as ExternalSourceProviderRegistry
    );
  });

  describe('import_document', () => {
    it('should require project context', async () => {
      const result = await tool.import_document(
        { url: 'https://drive.google.com/file/d/abc/view' },
        {} // No projectId
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Project context is required');
    });

    it('should return error when no provider can handle URL', async () => {
      (
        mockProviderRegistry.detectProvider as ReturnType<typeof vi.fn>
      ).mockReturnValue(null);

      const result = await tool.import_document(
        { url: 'ftp://invalid.example.com/file' },
        { projectId: mockProjectId }
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe('Unsupported URL type');
      expect(result.data?.status).toBe('error');
    });

    it('should return error when URL parsing fails', async () => {
      (
        mockGoogleDriveProvider.parseUrl as ReturnType<typeof vi.fn>
      ).mockReturnValue(null);

      const result = await tool.import_document(
        { url: 'https://drive.google.com/invalid-url' },
        { projectId: mockProjectId }
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid URL format');
      expect(result.data?.providerType).toBe('google_drive');
    });

    it('should return error when access check fails - not found', async () => {
      (
        mockGoogleDriveProvider.checkAccess as ReturnType<typeof vi.fn>
      ).mockResolvedValue({
        accessible: false,
        reason: 'not_found',
      });

      const result = await tool.import_document(
        { url: 'https://drive.google.com/file/d/abc/view' },
        { projectId: mockProjectId }
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('not_found');
      expect(result.data?.message).toContain('deleted');
    });

    it('should return error when access check fails - permission denied', async () => {
      (
        mockGoogleDriveProvider.checkAccess as ReturnType<typeof vi.fn>
      ).mockResolvedValue({
        accessible: false,
        reason: 'permission_denied',
      });

      const result = await tool.import_document(
        { url: 'https://drive.google.com/file/d/abc/view' },
        { projectId: mockProjectId }
      );

      expect(result.success).toBe(false);
      expect(result.data?.message).toContain('publicly');
    });

    it('should return error when access check fails - rate limited', async () => {
      (
        mockGoogleDriveProvider.checkAccess as ReturnType<typeof vi.fn>
      ).mockResolvedValue({
        accessible: false,
        reason: 'rate_limited',
      });

      const result = await tool.import_document(
        { url: 'https://drive.google.com/file/d/abc/view' },
        { projectId: mockProjectId }
      );

      expect(result.success).toBe(false);
      expect(result.data?.message).toContain('Rate limited');
    });

    it('should successfully import a document', async () => {
      const result = await tool.import_document(
        { url: 'https://drive.google.com/file/d/abc/view' },
        { projectId: mockProjectId }
      );

      expect(result.success).toBe(true);
      expect(result.data?.status).toBe('created');
      expect(result.data?.documentId).toBe('doc-456');
      expect(result.data?.externalSourceId).toBe('ext-source-123');
      expect(result.data?.providerType).toBe('google_drive');
      expect(result.data?.displayName).toBe('Test Doc.pdf');
      expect(result.data?.message).toContain('Successfully imported');
    });

    it('should handle duplicate document detection', async () => {
      (
        mockExternalSourcesService.importFromUrl as ReturnType<typeof vi.fn>
      ).mockResolvedValue({
        success: true,
        externalSourceId: 'ext-source-123',
        documentId: 'doc-existing',
        status: 'duplicate',
      });

      const result = await tool.import_document(
        { url: 'https://drive.google.com/file/d/abc/view' },
        { projectId: mockProjectId }
      );

      expect(result.success).toBe(true);
      expect(result.data?.status).toBe('duplicate');
      expect(result.data?.message).toContain('already imported');
    });

    it('should handle updated document', async () => {
      (
        mockExternalSourcesService.importFromUrl as ReturnType<typeof vi.fn>
      ).mockResolvedValue({
        success: true,
        externalSourceId: 'ext-source-123',
        documentId: 'doc-456',
        status: 'updated',
      });

      const result = await tool.import_document(
        { url: 'https://drive.google.com/file/d/abc/view' },
        { projectId: mockProjectId }
      );

      expect(result.success).toBe(true);
      expect(result.data?.status).toBe('updated');
      expect(result.data?.message).toContain('updated');
    });

    it('should handle import service failure', async () => {
      (
        mockExternalSourcesService.importFromUrl as ReturnType<typeof vi.fn>
      ).mockResolvedValue({
        success: false,
        externalSourceId: 'ext-source-123',
        status: 'error',
        error: 'Content fetch failed',
      });

      const result = await tool.import_document(
        { url: 'https://drive.google.com/file/d/abc/view' },
        { projectId: mockProjectId }
      );

      expect(result.success).toBe(false);
      expect(result.data?.status).toBe('error');
      expect(result.error).toBe('Content fetch failed');
    });

    it('should pass syncPolicy to import service', async () => {
      await tool.import_document(
        {
          url: 'https://drive.google.com/file/d/abc/view',
          syncPolicy: 'periodic',
        },
        { projectId: mockProjectId }
      );

      expect(mockExternalSourcesService.importFromUrl).toHaveBeenCalledWith(
        expect.objectContaining({
          url: 'https://drive.google.com/file/d/abc/view',
          syncPolicy: 'periodic',
          immediate: true,
        }),
        mockProjectId
      );
    });

    it('should handle unexpected errors gracefully', async () => {
      (
        mockProviderRegistry.detectProvider as ReturnType<typeof vi.fn>
      ).mockImplementation(() => {
        throw new Error('Unexpected provider error');
      });

      const result = await tool.import_document(
        { url: 'https://drive.google.com/file/d/abc/view' },
        { projectId: mockProjectId }
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe('Unexpected provider error');
    });

    it('should use fallback name when metadata name is not available', async () => {
      (
        mockGoogleDriveProvider.checkAccess as ReturnType<typeof vi.fn>
      ).mockResolvedValue({
        accessible: true,
        // No metadata.name
      });

      const result = await tool.import_document(
        { url: 'https://drive.google.com/file/d/abc123/view' },
        { projectId: mockProjectId }
      );

      expect(result.success).toBe(true);
      // Should fall back to 'Imported Document' since URL contains only an ID
      expect(result.data?.displayName).toBeDefined();
    });
  });

  describe('extractNameFromUrl', () => {
    it('should extract filename from URL path', async () => {
      // Access private method through tool behavior
      (
        mockGoogleDriveProvider.checkAccess as ReturnType<typeof vi.fn>
      ).mockResolvedValue({
        accessible: true,
        // No metadata
      });

      // Create a URL provider mock that parses URLs with filenames
      const mockUrlProvider: Partial<ExternalSourceProvider> = {
        providerType: 'url' as ExternalSourceType,
        displayName: 'Web URL',
        parseUrl: vi.fn(() => ({
          providerType: 'url' as ExternalSourceType,
          externalId: 'url-hash',
          originalUrl: 'https://example.com/documents/report-2024.pdf',
          normalizedUrl: 'https://example.com/documents/report-2024.pdf',
        })),
        checkAccess: vi.fn(() => Promise.resolve({ accessible: true })),
      };

      (
        mockProviderRegistry.detectProvider as ReturnType<typeof vi.fn>
      ).mockReturnValue(mockUrlProvider as ExternalSourceProvider);

      const result = await tool.import_document(
        { url: 'https://example.com/documents/report-2024.pdf' },
        { projectId: mockProjectId }
      );

      expect(result.success).toBe(true);
      expect(result.data?.displayName).toBe('report-2024.pdf');
    });
  });
});
