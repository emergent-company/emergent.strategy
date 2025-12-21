import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { UrlProvider } from '../../../src/modules/external-sources/providers/url.provider';
import { ExternalSourceReference } from '../../../src/modules/external-sources/interfaces';

/**
 * Tests UrlProvider.
 *
 * Mocked: global fetch (network calls)
 * Real: UrlProvider logic (URL parsing, normalization, canHandle)
 * Auth: Not applicable (unit test)
 */
describe('UrlProvider', () => {
  let provider: UrlProvider;
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    provider = new UrlProvider();
    mockFetch = vi.fn();
    global.fetch = mockFetch;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('providerType and displayName', () => {
    it('should have correct provider type', () => {
      expect(provider.providerType).toBe('url');
    });

    it('should have correct display name', () => {
      expect(provider.displayName).toBe('Web URL');
    });
  });

  describe('canHandle', () => {
    it('should handle HTTPS URLs', () => {
      expect(provider.canHandle('https://example.com/document.pdf')).toBe(true);
      expect(provider.canHandle('https://sub.example.com/path/to/file')).toBe(
        true
      );
    });

    it('should handle HTTP URLs', () => {
      expect(provider.canHandle('http://example.com/document.pdf')).toBe(true);
    });

    it('should not handle non-HTTP URLs', () => {
      expect(provider.canHandle('ftp://example.com/file')).toBe(false);
      expect(provider.canHandle('file:///local/path')).toBe(false);
      expect(provider.canHandle('not-a-url')).toBe(false);
    });

    it('should not handle invalid URLs', () => {
      expect(provider.canHandle('://invalid')).toBe(false);
      expect(provider.canHandle('')).toBe(false);
    });
  });

  describe('parseUrl', () => {
    it('should parse simple URLs', () => {
      const ref = provider.parseUrl('https://example.com/document.pdf');

      expect(ref).not.toBeNull();
      expect(ref?.providerType).toBe('url');
      expect(ref?.originalUrl).toBe('https://example.com/document.pdf');
      expect(ref?.normalizedUrl).toBe('https://example.com/document.pdf');
      expect(ref?.externalId).toMatch(/^url_[a-z0-9]+$/);
    });

    it('should strip tracking parameters', () => {
      const ref = provider.parseUrl(
        'https://example.com/page?utm_source=google&utm_medium=cpc&id=123'
      );

      expect(ref?.normalizedUrl).toBe('https://example.com/page?id=123');
    });

    it('should strip common tracking params', () => {
      const ref = provider.parseUrl(
        'https://example.com/page?fbclid=abc&gclid=xyz&param=value'
      );

      expect(ref?.normalizedUrl).toBe('https://example.com/page?param=value');
    });

    it('should sort query parameters for consistency', () => {
      const ref1 = provider.parseUrl('https://example.com/page?b=2&a=1');
      const ref2 = provider.parseUrl('https://example.com/page?a=1&b=2');

      expect(ref1?.normalizedUrl).toBe(ref2?.normalizedUrl);
    });

    it('should generate consistent external IDs for same URL', () => {
      const ref1 = provider.parseUrl('https://example.com/document.pdf');
      const ref2 = provider.parseUrl('https://example.com/document.pdf');

      expect(ref1?.externalId).toBe(ref2?.externalId);
    });

    it('should return null for invalid URLs', () => {
      expect(provider.parseUrl('not-a-url')).toBeNull();
      expect(provider.parseUrl('ftp://example.com')).toBeNull();
    });
  });

  describe('checkAccess', () => {
    const mockRef: ExternalSourceReference = {
      providerType: 'url',
      externalId: 'url_abc123',
      originalUrl: 'https://example.com/document.pdf',
      normalizedUrl: 'https://example.com/document.pdf',
    };

    it('should return accessible for 200 response', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        headers: new Headers({
          'content-type': 'application/pdf',
          'content-length': '1024',
          'last-modified': 'Mon, 15 Jan 2024 12:00:00 GMT',
          etag: '"abc123"',
        }),
      });

      const result = await provider.checkAccess(mockRef);

      expect(result.accessible).toBe(true);
      expect(result.metadata?.mimeType).toBe('application/pdf');
      expect(result.metadata?.size).toBe(1024);
    });

    it('should return not_found for 404', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 404,
      });

      const result = await provider.checkAccess(mockRef);

      expect(result.accessible).toBe(false);
      expect(result.reason).toBe('not_found');
    });

    it('should return permission_denied for 401/403', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 403,
      });

      const result = await provider.checkAccess(mockRef);

      expect(result.accessible).toBe(false);
      expect(result.reason).toBe('permission_denied');
    });

    it('should return rate_limited for 429', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 429,
      });

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

    it('should extract name from URL path', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        headers: new Headers({
          'content-type': 'application/pdf',
        }),
      });

      const result = await provider.checkAccess(mockRef);

      expect(result.metadata?.name).toBe('document.pdf');
    });
  });

  describe('fetchMetadata', () => {
    const mockRef: ExternalSourceReference = {
      providerType: 'url',
      externalId: 'url_abc123',
      originalUrl: 'https://example.com/report.pdf',
      normalizedUrl: 'https://example.com/report.pdf',
    };

    it('should fetch and return metadata', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        url: 'https://example.com/report.pdf',
        headers: new Headers({
          'content-type': 'application/pdf; charset=utf-8',
          'content-length': '2048',
          'last-modified': 'Mon, 15 Jan 2024 12:00:00 GMT',
          etag: '"xyz789"',
          server: 'nginx',
        }),
      });

      const metadata = await provider.fetchMetadata(mockRef);

      expect(metadata.name).toBe('report.pdf');
      expect(metadata.mimeType).toBe('application/pdf');
      expect(metadata.size).toBe(2048);
      expect(metadata.etag).toBe('"xyz789"');
      expect(metadata.providerMetadata?.server).toBe('nginx');
    });

    it('should throw error for files exceeding size limit', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        headers: new Headers({
          'content-type': 'video/mp4',
          'content-length': String(100 * 1024 * 1024), // 100MB
        }),
      });

      await expect(provider.fetchMetadata(mockRef)).rejects.toThrow(
        'exceeds maximum'
      );
    });

    it('should throw error on access failure', async () => {
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
      providerType: 'url',
      externalId: 'url_abc123',
      originalUrl: 'https://example.com/article',
      normalizedUrl: 'https://example.com/article',
    };

    it('should fetch text content', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        headers: new Headers({
          'content-type': 'text/plain',
        }),
        text: () => Promise.resolve('Plain text content'),
      });

      const content = await provider.fetchContent(mockRef);

      expect(content.mimeType).toBe('text/plain');
      expect(content.content).toBe('Plain text content');
      expect(content.encoding).toBe('utf-8');
    });

    it('should fetch JSON content', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        headers: new Headers({
          'content-type': 'application/json',
        }),
        text: () => Promise.resolve('{"key": "value"}'),
      });

      const content = await provider.fetchContent(mockRef);

      expect(content.mimeType).toBe('application/json');
      expect(content.content).toBe('{"key": "value"}');
    });

    it('should convert HTML to plain text', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        headers: new Headers({
          'content-type': 'text/html',
        }),
        text: () =>
          Promise.resolve(
            '<html><body><h1>Title</h1><p>Paragraph content</p></body></html>'
          ),
      });

      const content = await provider.fetchContent(mockRef);

      // HTML should be converted to text/plain
      expect(content.mimeType).toBe('text/plain');
      // Content should have text extracted (with script/style stripped)
      // Note: html-to-text converts h1 headings to uppercase
      const textContent = (content.content as string).toLowerCase();
      expect(textContent).toContain('title');
      expect(textContent).toContain('paragraph');
    });

    it('should fetch binary content as Buffer', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        headers: new Headers({
          'content-type': 'application/pdf',
        }),
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(100)),
      });

      const content = await provider.fetchContent(mockRef);

      expect(content.mimeType).toBe('application/pdf');
      expect(Buffer.isBuffer(content.content)).toBe(true);
      expect(content.encoding).toBeUndefined();
    });

    it('should throw error on fetch failure', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      });

      await expect(provider.fetchContent(mockRef)).rejects.toThrow(
        'Failed to fetch content'
      );
    });

    it('should generate appropriate filename', async () => {
      const jsonRef: ExternalSourceReference = {
        ...mockRef,
        normalizedUrl: 'https://api.example.com/data',
      };

      mockFetch.mockResolvedValue({
        ok: true,
        headers: new Headers({
          'content-type': 'application/json',
        }),
        text: () => Promise.resolve('{}'),
      });

      const content = await provider.fetchContent(jsonRef);

      expect(content.filename).toBe('data.json');
    });
  });

  describe('checkForUpdates', () => {
    const mockRef: ExternalSourceReference = {
      providerType: 'url',
      externalId: 'url_abc123',
      originalUrl: 'https://example.com/document.pdf',
      normalizedUrl: 'https://example.com/document.pdf',
    };

    it('should detect no updates with 304 response', async () => {
      mockFetch.mockResolvedValue({
        status: 304,
      });

      const result = await provider.checkForUpdates(
        mockRef,
        new Date('2024-01-15T12:00:00Z'),
        '"oldetag"'
      );

      expect(result.hasUpdates).toBe(false);
    });

    it('should detect updates when etag changes', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({
          etag: '"newetag"',
          'last-modified': 'Mon, 15 Jan 2024 12:00:00 GMT',
        }),
      });

      const result = await provider.checkForUpdates(
        mockRef,
        new Date('2024-01-15T12:00:00Z'),
        '"oldetag"'
      );

      expect(result.hasUpdates).toBe(true);
      expect(result.newEtag).toBe('"newetag"');
    });

    it('should detect updates when modified time is newer', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({
          'last-modified': 'Wed, 20 Jan 2024 12:00:00 GMT',
        }),
      });

      const result = await provider.checkForUpdates(
        mockRef,
        new Date('2024-01-15T12:00:00Z')
      );

      expect(result.hasUpdates).toBe(true);
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
    it('should return conservative rate limits', () => {
      const config = provider.getRateLimitConfig();

      expect(config.requestsPerMinute).toBe(30);
      expect(config.requestsPerDay).toBe(500);
      expect(config.backoffOnRateLimit).toBe(true);
    });
  });
});
