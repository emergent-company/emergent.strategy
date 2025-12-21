import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { GoogleDriveProvider } from '../../../src/modules/external-sources/providers/google-drive.provider';
import { ExternalSourceReference } from '../../../src/modules/external-sources/interfaces';

/**
 * Tests GoogleDriveProvider.
 *
 * Mocked: global fetch (network calls)
 * Real: GoogleDriveProvider logic (URL parsing, canHandle)
 * Auth: Not applicable (unit test)
 */
describe('GoogleDriveProvider', () => {
  let provider: GoogleDriveProvider;
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    provider = new GoogleDriveProvider();
    mockFetch = vi.fn();
    global.fetch = mockFetch;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('providerType and displayName', () => {
    it('should have correct provider type', () => {
      expect(provider.providerType).toBe('google_drive');
    });

    it('should have correct display name', () => {
      expect(provider.displayName).toBe('Google Drive');
    });
  });

  describe('canHandle', () => {
    it('should handle Google Drive file URLs', () => {
      expect(
        provider.canHandle('https://drive.google.com/file/d/abc123/view')
      ).toBe(true);
      expect(
        provider.canHandle('https://drive.google.com/file/d/abc123xyz_-/view')
      ).toBe(true);
    });

    it('should handle Google Drive open URLs', () => {
      expect(
        provider.canHandle('https://drive.google.com/open?id=abc123')
      ).toBe(true);
    });

    it('should handle Google Docs URLs', () => {
      expect(
        provider.canHandle('https://docs.google.com/document/d/abc123/edit')
      ).toBe(true);
    });

    it('should handle Google Sheets URLs', () => {
      expect(
        provider.canHandle('https://docs.google.com/spreadsheets/d/abc123/edit')
      ).toBe(true);
    });

    it('should handle Google Slides URLs', () => {
      expect(
        provider.canHandle('https://docs.google.com/presentation/d/abc123/edit')
      ).toBe(true);
    });

    it('should handle Google Drawings URLs', () => {
      expect(
        provider.canHandle('https://docs.google.com/drawings/d/abc123/edit')
      ).toBe(true);
    });

    it('should not handle non-Google URLs', () => {
      expect(provider.canHandle('https://example.com/document.pdf')).toBe(
        false
      );
      expect(provider.canHandle('https://dropbox.com/s/abc123/file')).toBe(
        false
      );
    });
  });

  describe('parseUrl', () => {
    it('should parse Google Drive file URLs', () => {
      const ref = provider.parseUrl(
        'https://drive.google.com/file/d/abc123xyz/view?usp=sharing'
      );

      expect(ref).not.toBeNull();
      expect(ref?.providerType).toBe('google_drive');
      expect(ref?.externalId).toBe('abc123xyz');
      expect(ref?.originalUrl).toBe(
        'https://drive.google.com/file/d/abc123xyz/view?usp=sharing'
      );
      expect(ref?.normalizedUrl).toBe(
        'https://drive.google.com/file/d/abc123xyz/view'
      );
    });

    it('should parse Google Drive open URLs', () => {
      const ref = provider.parseUrl(
        'https://drive.google.com/open?id=fileId123'
      );

      expect(ref?.externalId).toBe('fileId123');
    });

    it('should parse Google Docs URLs', () => {
      const ref = provider.parseUrl(
        'https://docs.google.com/document/d/docId456/edit?usp=sharing'
      );

      expect(ref?.externalId).toBe('docId456');
      expect(ref?.normalizedUrl).toBe(
        'https://drive.google.com/file/d/docId456/view'
      );
    });

    it('should parse Google Sheets URLs', () => {
      const ref = provider.parseUrl(
        'https://docs.google.com/spreadsheets/d/sheetId789/edit#gid=0'
      );

      expect(ref?.externalId).toBe('sheetId789');
    });

    it('should return null for non-Google URLs', () => {
      const ref = provider.parseUrl('https://example.com/document.pdf');

      expect(ref).toBeNull();
    });
  });

  describe('checkAccess', () => {
    const mockRef: ExternalSourceReference = {
      providerType: 'google_drive',
      externalId: 'testFileId',
      originalUrl: 'https://drive.google.com/file/d/testFileId/view',
      normalizedUrl: 'https://drive.google.com/file/d/testFileId/view',
    };

    it('should return accessible when file exists and is public', async () => {
      // For public access without API, we just check if the export URL is accessible
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
      });

      const result = await provider.checkAccess(mockRef);

      expect(result.accessible).toBe(true);
      // Without API access, we can only provide default metadata
      expect(result.metadata?.name).toBe('Google Document');
      // For regular Drive files, MIME type is application/octet-stream
      expect(result.metadata?.mimeType).toBe('application/octet-stream');
    });

    it('should return accessible for Google Docs with correct MIME type', async () => {
      const docsRef: ExternalSourceReference = {
        providerType: 'google_drive',
        externalId: 'testDocId',
        originalUrl: 'https://docs.google.com/document/d/testDocId/edit',
        normalizedUrl: 'https://drive.google.com/file/d/testDocId/view',
      };

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
      });

      const result = await provider.checkAccess(docsRef);

      expect(result.accessible).toBe(true);
      expect(result.metadata?.name).toBe('Google Document');
      expect(result.metadata?.mimeType).toBe(
        'application/vnd.google-apps.document'
      );
    });

    it('should return not_found for 404 response', async () => {
      mockFetch.mockResolvedValue({ ok: false, status: 404 });

      const result = await provider.checkAccess(mockRef);

      expect(result.accessible).toBe(false);
      expect(result.reason).toBe('not_found');
    });

    it('should return permission_denied for 403 response', async () => {
      mockFetch.mockResolvedValue({ ok: false, status: 403 });

      const result = await provider.checkAccess(mockRef);

      expect(result.accessible).toBe(false);
      expect(result.reason).toBe('permission_denied');
    });

    it('should return rate_limited for 429 response', async () => {
      mockFetch.mockResolvedValue({ ok: false, status: 429 });

      const result = await provider.checkAccess(mockRef);

      expect(result.accessible).toBe(false);
      expect(result.reason).toBe('rate_limited');
    });

    it('should return network_error on fetch failure', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));

      const result = await provider.checkAccess(mockRef);

      expect(result.accessible).toBe(false);
      expect(result.reason).toBe('network_error');
    });
  });

  describe('fetchMetadata', () => {
    const mockRef: ExternalSourceReference = {
      providerType: 'google_drive',
      externalId: 'testFileId',
      originalUrl: 'https://drive.google.com/file/d/testFileId/view',
      normalizedUrl: 'https://drive.google.com/file/d/testFileId/view',
    };

    it('should return default metadata (no API access)', async () => {
      // fetchMetadata now returns defaults without making API calls
      const metadata = await provider.fetchMetadata(mockRef);

      expect(metadata.name).toBe('Google Document');
      expect(metadata.mimeType).toBe('application/octet-stream');
      expect(metadata.size).toBe(0);
      expect(metadata.etag).toBeUndefined(); // No etag without API
      expect(metadata.providerMetadata?.googleFileId).toBe('testFileId');
    });

    it('should return Google Docs metadata for document URLs', async () => {
      const docsRef: ExternalSourceReference = {
        providerType: 'google_drive',
        externalId: 'docId',
        originalUrl: 'https://docs.google.com/document/d/docId/edit',
        normalizedUrl: 'https://drive.google.com/file/d/docId/view',
      };

      const metadata = await provider.fetchMetadata(docsRef);

      expect(metadata.name).toBe('Google Document');
      expect(metadata.mimeType).toBe('application/vnd.google-apps.document');
      expect(metadata.providerMetadata?.exportFormat).toBe('text/plain');
    });

    it('should return Google Sheets metadata for spreadsheet URLs', async () => {
      const sheetsRef: ExternalSourceReference = {
        providerType: 'google_drive',
        externalId: 'sheetId',
        originalUrl: 'https://docs.google.com/spreadsheets/d/sheetId/edit',
        normalizedUrl: 'https://drive.google.com/file/d/sheetId/view',
      };

      const metadata = await provider.fetchMetadata(sheetsRef);

      expect(metadata.mimeType).toBe('application/vnd.google-apps.spreadsheet');
      expect(metadata.providerMetadata?.exportFormat).toBe('text/csv');
    });
  });

  describe('fetchContent', () => {
    it('should export Google Docs as text', async () => {
      const docsRef: ExternalSourceReference = {
        providerType: 'google_drive',
        externalId: 'testDocId',
        originalUrl: 'https://docs.google.com/document/d/testDocId/edit',
        normalizedUrl: 'https://drive.google.com/file/d/testDocId/view',
      };

      // Single fetch call to export URL
      mockFetch.mockResolvedValue({
        ok: true,
        text: () => Promise.resolve('Document content here'),
        headers: new Map([['content-type', 'text/plain']]),
      });

      const content = await provider.fetchContent(docsRef);

      expect(content.mimeType).toBe('text/plain');
      expect(content.content).toBe('Document content here');
      expect(content.filename).toBe('document.txt');
      expect(mockFetch).toHaveBeenCalledWith(
        'https://docs.google.com/document/d/testDocId/export?format=txt',
        expect.any(Object)
      );
    });

    it('should export Google Sheets as CSV', async () => {
      const sheetsRef: ExternalSourceReference = {
        providerType: 'google_drive',
        externalId: 'testSheetId',
        originalUrl: 'https://docs.google.com/spreadsheets/d/testSheetId/edit',
        normalizedUrl: 'https://drive.google.com/file/d/testSheetId/view',
      };

      mockFetch.mockResolvedValue({
        ok: true,
        text: () => Promise.resolve('col1,col2\nval1,val2'),
        headers: new Map([['content-type', 'text/csv']]),
      });

      const content = await provider.fetchContent(sheetsRef);

      expect(content.mimeType).toBe('text/csv');
      expect(content.content).toBe('col1,col2\nval1,val2');
      expect(content.filename).toBe('document.csv');
    });

    it('should download regular Drive files directly', async () => {
      const driveRef: ExternalSourceReference = {
        providerType: 'google_drive',
        externalId: 'testFileId',
        originalUrl: 'https://drive.google.com/file/d/testFileId/view',
        normalizedUrl: 'https://drive.google.com/file/d/testFileId/view',
      };

      mockFetch.mockResolvedValue({
        ok: true,
        headers: new Headers({ 'content-type': 'application/pdf' }),
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(100)),
      });

      const content = await provider.fetchContent(driveRef);

      expect(content.mimeType).toBe('application/pdf');
      expect(Buffer.isBuffer(content.content)).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://drive.google.com/uc?export=download&id=testFileId',
        expect.any(Object)
      );
    });

    it('should throw error on fetch failure', async () => {
      const driveRef: ExternalSourceReference = {
        providerType: 'google_drive',
        externalId: 'testFileId',
        originalUrl: 'https://drive.google.com/file/d/testFileId/view',
        normalizedUrl: 'https://drive.google.com/file/d/testFileId/view',
      };

      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      });

      await expect(provider.fetchContent(driveRef)).rejects.toThrow(
        'Failed to fetch Google file'
      );
    });
  });

  describe('checkForUpdates', () => {
    const mockRef: ExternalSourceReference = {
      providerType: 'google_drive',
      externalId: 'testFileId',
      originalUrl: 'https://drive.google.com/file/d/testFileId/view',
      normalizedUrl: 'https://drive.google.com/file/d/testFileId/view',
    };

    it('should always detect updates (no etag without API)', async () => {
      // Without API access, fetchMetadata returns modifiedAt as current time
      // which is always after lastSync, so it always reports updates
      const result = await provider.checkForUpdates(
        mockRef,
        new Date('2024-01-15T12:00:00Z'),
        'oldhash'
      );

      // modifiedAt is set to new Date() in fetchMetadata, so it's always after lastSync
      expect(result.hasUpdates).toBe(true);
      // Without API, we don't have an etag
      expect(result.newEtag).toBeUndefined();
    });

    it('should return new modified timestamp', async () => {
      const beforeCheck = new Date();
      const result = await provider.checkForUpdates(
        mockRef,
        new Date('2024-01-15T12:00:00Z')
      );

      // newModifiedAt should be close to now
      expect(result.newModifiedAt).toBeDefined();
      expect(result.newModifiedAt!.getTime()).toBeGreaterThanOrEqual(
        beforeCheck.getTime()
      );
    });

    it('should return no updates on error', async () => {
      // Create a provider that will throw in fetchMetadata
      const errorProvider = new GoogleDriveProvider();
      // Override fetchMetadata to throw
      vi.spyOn(errorProvider, 'fetchMetadata').mockRejectedValue(
        new Error('Network error')
      );

      const result = await errorProvider.checkForUpdates(
        mockRef,
        new Date('2024-01-15T12:00:00Z')
      );

      expect(result.hasUpdates).toBe(false);
    });
  });

  describe('getDefaultSyncPolicy', () => {
    it('should return manual sync policy', () => {
      expect(provider.getDefaultSyncPolicy()).toBe('manual');
    });
  });

  describe('getRateLimitConfig', () => {
    it('should return rate limit configuration', () => {
      const config = provider.getRateLimitConfig();

      expect(config.requestsPerMinute).toBe(60);
      expect(config.requestsPerDay).toBe(1000);
      expect(config.backoffOnRateLimit).toBe(true);
    });
  });
});
