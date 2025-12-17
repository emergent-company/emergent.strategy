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
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            id: 'testFileId',
            name: 'Test Document.pdf',
            mimeType: 'application/pdf',
            size: '1024',
            modifiedTime: '2024-01-15T10:00:00Z',
          }),
      });

      const result = await provider.checkAccess(mockRef);

      expect(result.accessible).toBe(true);
      expect(result.metadata?.name).toBe('Test Document.pdf');
      expect(result.metadata?.mimeType).toBe('application/pdf');
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

    it('should fetch and return metadata', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            id: 'testFileId',
            name: 'Report.pdf',
            mimeType: 'application/pdf',
            size: '2048',
            modifiedTime: '2024-01-15T12:00:00Z',
            md5Checksum: 'abc123hash',
          }),
      });

      const metadata = await provider.fetchMetadata(mockRef);

      expect(metadata.name).toBe('Report.pdf');
      expect(metadata.mimeType).toBe('application/pdf');
      expect(metadata.size).toBe(2048);
      expect(metadata.etag).toBe('abc123hash');
      expect(metadata.providerMetadata?.googleFileId).toBe('testFileId');
    });

    it('should throw error on API failure', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      });

      await expect(provider.fetchMetadata(mockRef)).rejects.toThrow(
        'Failed to fetch metadata'
      );
    });
  });

  describe('fetchContent', () => {
    const mockRef: ExternalSourceReference = {
      providerType: 'google_drive',
      externalId: 'testFileId',
      originalUrl: 'https://drive.google.com/file/d/testFileId/view',
      normalizedUrl: 'https://drive.google.com/file/d/testFileId/view',
    };

    it('should export Google Docs as text', async () => {
      // First call: metadata
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            id: 'testFileId',
            name: 'My Document',
            mimeType: 'application/vnd.google-apps.document',
            size: '0',
            modifiedTime: '2024-01-15T12:00:00Z',
          }),
      });

      // Second call: export
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve('Document content here'),
      });

      const content = await provider.fetchContent(mockRef);

      expect(content.mimeType).toBe('text/plain');
      expect(content.content).toBe('Document content here');
      expect(content.filename).toBe('My Document.txt');
    });

    it('should download regular files directly', async () => {
      // First call: metadata
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            id: 'testFileId',
            name: 'image.png',
            mimeType: 'image/png',
            size: '1024',
            modifiedTime: '2024-01-15T12:00:00Z',
          }),
      });

      // Second call: download
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ 'content-type': 'image/png' }),
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(100)),
      });

      const content = await provider.fetchContent(mockRef);

      expect(content.mimeType).toBe('image/png');
      expect(Buffer.isBuffer(content.content)).toBe(true);
    });

    it('should throw error on export failure', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            id: 'testFileId',
            name: 'My Document',
            mimeType: 'application/vnd.google-apps.document',
            size: '0',
            modifiedTime: '2024-01-15T12:00:00Z',
          }),
      });

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      });

      await expect(provider.fetchContent(mockRef)).rejects.toThrow(
        'Failed to export Google file'
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

    it('should detect updates when modified time is newer', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            name: 'file.pdf',
            mimeType: 'application/pdf',
            size: '1024',
            modifiedTime: '2024-01-20T12:00:00Z',
            md5Checksum: 'newhash',
          }),
      });

      const result = await provider.checkForUpdates(
        mockRef,
        new Date('2024-01-15T12:00:00Z'),
        'oldhash'
      );

      expect(result.hasUpdates).toBe(true);
      expect(result.newEtag).toBe('newhash');
    });

    it('should detect updates when etag changes', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            name: 'file.pdf',
            mimeType: 'application/pdf',
            size: '1024',
            modifiedTime: '2024-01-15T12:00:00Z', // Same as lastSync
            md5Checksum: 'newhash',
          }),
      });

      const result = await provider.checkForUpdates(
        mockRef,
        new Date('2024-01-15T12:00:00Z'),
        'oldhash'
      );

      expect(result.hasUpdates).toBe(true);
    });

    it('should return no updates when nothing changed', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            name: 'file.pdf',
            mimeType: 'application/pdf',
            size: '1024',
            modifiedTime: '2024-01-10T12:00:00Z', // Older than lastSync
            md5Checksum: 'samehash',
          }),
      });

      const result = await provider.checkForUpdates(
        mockRef,
        new Date('2024-01-15T12:00:00Z'),
        'samehash'
      );

      expect(result.hasUpdates).toBe(false);
    });

    it('should return no updates on error', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));

      const result = await provider.checkForUpdates(
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
