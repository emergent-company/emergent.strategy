import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ExternalLinkDetector } from '../../../src/modules/external-sources/external-link-detector.service';
import { ExternalSourceProviderRegistry } from '../../../src/modules/external-sources/external-source-provider-registry.service';
import {
  ExternalSourceProvider,
  ExternalSourceReference,
} from '../../../src/modules/external-sources/interfaces';
import { ExternalSourceType } from '../../../src/entities';

/**
 * Tests ExternalLinkDetector service.
 *
 * Mocked: ExternalSourceProviderRegistry, providers
 * Real: ExternalLinkDetector logic (URL detection, provider matching)
 * Auth: Not applicable (unit test)
 */
describe('ExternalLinkDetector', () => {
  let detector: ExternalLinkDetector;
  let mockRegistry: ExternalSourceProviderRegistry;
  let mockGoogleDriveProvider: Partial<ExternalSourceProvider>;
  let mockUrlProvider: Partial<ExternalSourceProvider>;

  beforeEach(() => {
    // Create mock providers
    mockGoogleDriveProvider = {
      providerType: 'google_drive',
      displayName: 'Google Drive',
      canHandle: vi.fn(
        (url: string) =>
          url.includes('drive.google.com') || url.includes('docs.google.com')
      ),
      parseUrl: vi.fn((url: string) => {
        const match = url.match(/\/d\/([a-zA-Z0-9_-]+)/);
        if (match) {
          return {
            providerType: 'google_drive',
            externalId: match[1],
            originalUrl: url,
            normalizedUrl: `https://drive.google.com/file/d/${match[1]}`,
          } as ExternalSourceReference;
        }
        return null;
      }),
    };

    mockUrlProvider = {
      providerType: 'url',
      displayName: 'Web URL',
      canHandle: vi.fn((url: string) => url.startsWith('http')),
      parseUrl: vi.fn(
        (url: string): ExternalSourceReference => ({
          providerType: 'url' as ExternalSourceType,
          externalId: Buffer.from(url).toString('base64'),
          originalUrl: url,
          normalizedUrl: url,
        })
      ),
    };

    // Create mock registry
    mockRegistry = {
      detectProvider: vi.fn((url: string) => {
        // Prioritize Google Drive over generic URL
        if (
          url.includes('drive.google.com') ||
          url.includes('docs.google.com')
        ) {
          return mockGoogleDriveProvider as ExternalSourceProvider;
        }
        if (url.startsWith('http')) {
          return mockUrlProvider as ExternalSourceProvider;
        }
        return null;
      }),
      getProvider: vi.fn(),
      getAllProviders: vi.fn(),
      registerProvider: vi.fn(),
    } as unknown as ExternalSourceProviderRegistry;

    detector = new ExternalLinkDetector(mockRegistry);
  });

  describe('detectLinks', () => {
    it('should detect Google Drive links in message', () => {
      const message =
        'Check out this doc: https://drive.google.com/file/d/abc123xyz/view';

      const links = detector.detectLinks(message);

      expect(links).toHaveLength(1);
      expect(links[0]).toMatchObject({
        url: 'https://drive.google.com/file/d/abc123xyz/view',
        provider: 'google_drive',
        providerDisplayName: 'Google Drive',
      });
      expect(links[0].reference).toMatchObject({
        providerType: 'google_drive',
        externalId: 'abc123xyz',
      });
    });

    it('should detect multiple links in message', () => {
      const message = `Here are two files:
        - https://drive.google.com/file/d/file1/view
        - https://example.com/document.pdf`;

      const links = detector.detectLinks(message);

      expect(links).toHaveLength(2);
      expect(links[0].provider).toBe('google_drive');
      expect(links[1].provider).toBe('url');
    });

    it('should not return duplicate URLs', () => {
      const message = `Same link twice:
        https://drive.google.com/file/d/abc123/view
        and again https://drive.google.com/file/d/abc123/view`;

      const links = detector.detectLinks(message);

      expect(links).toHaveLength(1);
    });

    it('should return empty array when no links found', () => {
      const message = 'This message has no links';

      const links = detector.detectLinks(message);

      expect(links).toHaveLength(0);
    });

    it('should handle URLs with special characters', () => {
      const message =
        'Check this: https://example.com/path?query=value&foo=bar';

      const links = detector.detectLinks(message);

      expect(links).toHaveLength(1);
      expect(links[0].url).toContain('query=value');
    });

    it('should include position information', () => {
      const message = 'Link: https://example.com/test';

      const links = detector.detectLinks(message);

      expect(links).toHaveLength(1);
      expect(links[0].position.start).toBeGreaterThan(0);
      expect(links[0].position.end).toBeGreaterThan(links[0].position.start);
    });

    it('should handle URLs followed by punctuation', () => {
      const message =
        'Visit https://example.com/page, then https://other.com/page.';

      const links = detector.detectLinks(message);

      expect(links).toHaveLength(2);
      // URLs should not include trailing punctuation
      expect(links[0].url).not.toMatch(/[,.]$/);
      expect(links[1].url).not.toMatch(/[,.]$/);
    });

    it('should skip URLs that no provider can handle', () => {
      // Override mockRegistry to return null for specific URL
      (
        mockRegistry.detectProvider as ReturnType<typeof vi.fn>
      ).mockImplementation((url: string) => {
        if (url.includes('unsupported-protocol.xyz')) {
          return null;
        }
        return mockUrlProvider as ExternalSourceProvider;
      });

      const message = 'Try https://unsupported-protocol.xyz/file';

      const links = detector.detectLinks(message);

      expect(links).toHaveLength(0);
    });
  });

  describe('detectFirstLink', () => {
    it('should return first importable link', () => {
      const message = `Two links:
        https://drive.google.com/file/d/first/view
        https://example.com/second`;

      const link = detector.detectFirstLink(message);

      expect(link).not.toBeNull();
      expect(link?.reference.externalId).toBe('first');
    });

    it('should return null when no links found', () => {
      const message = 'No links here';

      const link = detector.detectFirstLink(message);

      expect(link).toBeNull();
    });
  });

  describe('hasImportableLinks', () => {
    it('should return true when importable links exist', () => {
      const message =
        'Here is a file: https://drive.google.com/file/d/xyz/view';

      expect(detector.hasImportableLinks(message)).toBe(true);
    });

    it('should return false when no importable links exist', () => {
      const message = 'Just plain text without any links';

      expect(detector.hasImportableLinks(message)).toBe(false);
    });
  });

  describe('extractAllUrls', () => {
    it('should extract all URLs regardless of provider support', () => {
      const message = `Multiple URLs:
        https://google.com
        http://example.com/page
        https://random.site/path`;

      const urls = detector.extractAllUrls(message);

      expect(urls).toHaveLength(3);
    });

    it('should handle URLs in markdown format', () => {
      const message = 'Check [this link](https://example.com/page) out';

      const urls = detector.extractAllUrls(message);

      expect(urls).toHaveLength(1);
      expect(urls[0]).toBe('https://example.com/page');
    });
  });

  describe('summarizeLinks', () => {
    it('should summarize no links', () => {
      const summary = detector.summarizeLinks([]);

      expect(summary).toBe('No importable links detected.');
    });

    it('should summarize single link', () => {
      const links = [
        {
          url: 'https://drive.google.com/file/d/abc/view',
          provider: 'google_drive',
          providerDisplayName: 'Google Drive',
          reference: {
            providerType: 'google_drive' as const,
            externalId: 'abc',
            originalUrl: 'https://drive.google.com/file/d/abc/view',
            normalizedUrl: 'https://drive.google.com/file/d/abc',
          },
          position: { start: 0, end: 10 },
        },
      ];

      const summary = detector.summarizeLinks(links);

      expect(summary).toBe('Found 1 Google Drive link that can be imported.');
    });

    it('should summarize multiple links with grouping', () => {
      const links = [
        {
          url: 'https://drive.google.com/file/d/abc/view',
          provider: 'google_drive',
          providerDisplayName: 'Google Drive',
          reference: {
            providerType: 'google_drive' as const,
            externalId: 'abc',
            originalUrl: '',
            normalizedUrl: '',
          },
          position: { start: 0, end: 10 },
        },
        {
          url: 'https://drive.google.com/file/d/xyz/view',
          provider: 'google_drive',
          providerDisplayName: 'Google Drive',
          reference: {
            providerType: 'google_drive' as const,
            externalId: 'xyz',
            originalUrl: '',
            normalizedUrl: '',
          },
          position: { start: 20, end: 30 },
        },
        {
          url: 'https://example.com/doc.pdf',
          provider: 'url',
          providerDisplayName: 'Web URL',
          reference: {
            providerType: 'url' as const,
            externalId: 'encoded',
            originalUrl: '',
            normalizedUrl: '',
          },
          position: { start: 40, end: 50 },
        },
      ];

      const summary = detector.summarizeLinks(links);

      expect(summary).toContain('Found 3 importable links');
      expect(summary).toContain('2 Google Drive');
      expect(summary).toContain('1 Web URL');
    });
  });
});
