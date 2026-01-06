import { describe, it, expect, beforeEach, vi } from 'vitest';
import { StorageService } from '../../../src/modules/storage/storage.service';
import { MinioProvider } from '../../../src/modules/storage/providers/minio.provider';

// Mock MinioProvider
function createMockMinioProvider(
  overrides: Partial<MinioProvider> = {}
): MinioProvider {
  return {
    upload: vi.fn().mockResolvedValue({
      key: 'test-key',
      bucket: 'documents',
      etag: 'abc123',
      size: 100,
      contentType: 'application/pdf',
    }),
    download: vi.fn().mockResolvedValue(Buffer.from('test content')),
    delete: vi.fn().mockResolvedValue(undefined),
    getSignedUrl: vi.fn().mockResolvedValue('https://signed-download-url'),
    getUploadSignedUrl: vi.fn().mockResolvedValue('https://signed-upload-url'),
    exists: vi.fn().mockResolvedValue(true),
    getMetadata: vi.fn().mockResolvedValue({
      size: 100,
      contentType: 'application/pdf',
      lastModified: new Date(),
    }),
    onModuleInit: vi.fn(),
    ...overrides,
  } as unknown as MinioProvider;
}

describe('StorageService', () => {
  let service: StorageService;
  let mockProvider: MinioProvider;

  beforeEach(() => {
    mockProvider = createMockMinioProvider();
    service = new StorageService(mockProvider);
  });

  describe('uploadDocument', () => {
    it('generates correct storage key with org and project namespacing', async () => {
      const buffer = Buffer.from('test content');
      const result = await service.uploadDocument(buffer, {
        orgId: 'org-123',
        projectId: 'proj-456',
        filename: 'test.pdf',
        contentType: 'application/pdf',
      });

      // Verify upload was called
      expect(mockProvider.upload).toHaveBeenCalledTimes(1);

      // Check the key format: {projectId}/{orgId}/{uuid}-{sanitized-filename}
      const callArgs = (mockProvider.upload as ReturnType<typeof vi.fn>).mock
        .calls[0];
      const key = callArgs[1] as string;

      expect(key).toMatch(/^proj-456\/org-123\/[a-f0-9-]+-test\.pdf$/);
      expect(result.storageUrl).toBeDefined();
    });

    it('sanitizes filename with special characters', async () => {
      const buffer = Buffer.from('test content');
      await service.uploadDocument(buffer, {
        orgId: 'org-123',
        projectId: 'proj-456',
        filename: 'My File (1) [draft].pdf',
        contentType: 'application/pdf',
      });

      const callArgs = (mockProvider.upload as ReturnType<typeof vi.fn>).mock
        .calls[0];
      const key = callArgs[1] as string;

      // Should sanitize special characters to underscores and lowercase
      // Note: trailing underscore before extension because [draft] -> _draft_
      expect(key).toMatch(/my_file_1_draft_\.pdf$/);
    });

    it('uses default filename when not provided', async () => {
      const buffer = Buffer.from('test content');
      await service.uploadDocument(buffer, {
        orgId: 'org-123',
        projectId: 'proj-456',
      });

      const callArgs = (mockProvider.upload as ReturnType<typeof vi.fn>).mock
        .calls[0];
      const key = callArgs[1] as string;

      expect(key).toMatch(/document$/);
    });

    it('sets content disposition when filename provided', async () => {
      const buffer = Buffer.from('test content');
      await service.uploadDocument(buffer, {
        orgId: 'org-123',
        projectId: 'proj-456',
        filename: 'report.pdf',
      });

      const callArgs = (mockProvider.upload as ReturnType<typeof vi.fn>).mock
        .calls[0];
      const options = callArgs[2];

      expect(options.contentDisposition).toBe(
        'attachment; filename="report.pdf"'
      );
    });

    it('returns storageUrl in correct format', async () => {
      const buffer = Buffer.from('test content');
      const result = await service.uploadDocument(buffer, {
        orgId: 'org-123',
        projectId: 'proj-456',
        filename: 'test.pdf',
      });

      // storageUrl should be bucket/key
      expect(result.storageUrl).toBe('documents/test-key');
    });
  });

  describe('uploadToTemp', () => {
    it('uses temp bucket and generates temp key', async () => {
      const buffer = Buffer.from('test content');
      await service.uploadToTemp(buffer, 'temp-file.pdf');

      expect(mockProvider.upload).toHaveBeenCalledTimes(1);

      const callArgs = (mockProvider.upload as ReturnType<typeof vi.fn>).mock
        .calls[0];
      const key = callArgs[1] as string;
      const options = callArgs[2];

      // Key should start with temp/
      expect(key).toMatch(/^temp\/[a-f0-9-]+-temp-file\.pdf$/);
      // Should use temp bucket
      expect(options.bucket).toBe('document-temp');
    });

    it('sets content disposition for temp files', async () => {
      const buffer = Buffer.from('test content');
      await service.uploadToTemp(buffer, 'document.docx');

      const callArgs = (mockProvider.upload as ReturnType<typeof vi.fn>).mock
        .calls[0];
      const options = callArgs[2];

      expect(options.contentDisposition).toBe(
        'attachment; filename="document.docx"'
      );
    });
  });

  describe('download', () => {
    it('delegates to provider', async () => {
      const result = await service.download('test-key');

      expect(mockProvider.download).toHaveBeenCalledWith('test-key', undefined);
      expect(result.toString()).toBe('test content');
    });

    it('passes bucket to provider when specified', async () => {
      await service.download('test-key', 'custom-bucket');

      expect(mockProvider.download).toHaveBeenCalledWith(
        'test-key',
        'custom-bucket'
      );
    });
  });

  describe('delete', () => {
    it('delegates to provider', async () => {
      await service.delete('test-key');

      expect(mockProvider.delete).toHaveBeenCalledWith('test-key', undefined);
    });

    it('passes bucket to provider when specified', async () => {
      await service.delete('test-key', 'custom-bucket');

      expect(mockProvider.delete).toHaveBeenCalledWith(
        'test-key',
        'custom-bucket'
      );
    });
  });

  describe('getSignedDownloadUrl', () => {
    it('delegates to provider with options', async () => {
      const options = { expiresIn: 7200 };
      const result = await service.getSignedDownloadUrl('test-key', options);

      expect(mockProvider.getSignedUrl).toHaveBeenCalledWith(
        'test-key',
        options,
        undefined
      );
      expect(result).toBe('https://signed-download-url');
    });

    it('passes bucket to provider when specified', async () => {
      await service.getSignedDownloadUrl('test-key', {}, 'custom-bucket');

      expect(mockProvider.getSignedUrl).toHaveBeenCalledWith(
        'test-key',
        {},
        'custom-bucket'
      );
    });

    it('uses default empty options when not provided', async () => {
      await service.getSignedDownloadUrl('test-key');

      expect(mockProvider.getSignedUrl).toHaveBeenCalledWith(
        'test-key',
        {},
        undefined
      );
    });
  });

  describe('getSignedUploadUrl', () => {
    it('delegates to provider with options', async () => {
      const options = { contentType: 'application/pdf' };
      const result = await service.getSignedUploadUrl('test-key', options);

      expect(mockProvider.getUploadSignedUrl).toHaveBeenCalledWith(
        'test-key',
        options,
        undefined
      );
      expect(result).toBe('https://signed-upload-url');
    });
  });

  describe('exists', () => {
    it('returns true when file exists', async () => {
      const result = await service.exists('test-key');

      expect(mockProvider.exists).toHaveBeenCalledWith('test-key', undefined);
      expect(result).toBe(true);
    });

    it('returns false when file does not exist', async () => {
      mockProvider = createMockMinioProvider({
        exists: vi.fn().mockResolvedValue(false),
      });
      service = new StorageService(mockProvider);

      const result = await service.exists('nonexistent-key');

      expect(result).toBe(false);
    });
  });

  describe('getMetadata', () => {
    it('returns metadata for existing file', async () => {
      const result = await service.getMetadata('test-key');

      expect(mockProvider.getMetadata).toHaveBeenCalledWith(
        'test-key',
        undefined
      );
      expect(result).toEqual({
        size: 100,
        contentType: 'application/pdf',
        lastModified: expect.any(Date),
      });
    });

    it('returns null for non-existent file', async () => {
      mockProvider = createMockMinioProvider({
        getMetadata: vi.fn().mockResolvedValue(null),
      });
      service = new StorageService(mockProvider);

      const result = await service.getMetadata('nonexistent-key');

      expect(result).toBeNull();
    });
  });

  describe('generateDocumentKey', () => {
    it('generates key in correct format', () => {
      const key = service.generateDocumentKey(
        'proj-123',
        'org-456',
        'test.pdf'
      );

      // Format: {projectId}/{orgId}/{uuid}-{sanitized-filename}
      expect(key).toMatch(/^proj-123\/org-456\/[a-f0-9-]+-test\.pdf$/);
    });

    it('sanitizes filename in generated key', () => {
      const key = service.generateDocumentKey(
        'proj-123',
        'org-456',
        'My Document (Final).pdf'
      );

      // Note: trailing underscore before extension because (Final) -> _final_
      expect(key).toMatch(/my_document_final_\.pdf$/);
    });

    it('truncates long filenames', () => {
      const longFilename = 'a'.repeat(300) + '.pdf';
      const key = service.generateDocumentKey('proj', 'org', longFilename);

      // Filename part should be truncated to 200 chars max
      const filenamePart = key.split('/').pop()!.split('-').pop()!;
      expect(filenamePart.length).toBeLessThanOrEqual(200);
    });
  });

  describe('parseStorageUrl', () => {
    it('extracts bucket and key from storage URL', () => {
      const result = service.parseStorageUrl(
        'documents/proj/org/uuid-file.pdf'
      );

      expect(result).toEqual({
        bucket: 'documents',
        key: 'proj/org/uuid-file.pdf',
      });
    });

    it('handles nested keys correctly', () => {
      const result = service.parseStorageUrl('temp/folder/subfolder/file.txt');

      expect(result).toEqual({
        bucket: 'temp',
        key: 'folder/subfolder/file.txt',
      });
    });

    it('throws error for invalid URL format', () => {
      expect(() => service.parseStorageUrl('invalid-no-slash')).toThrow(
        'Invalid storage URL format'
      );
    });
  });
});
