import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ExternalSourceProviderRegistry } from '../../../src/modules/external-sources/external-source-provider-registry.service';
import { ExternalSourceProvider } from '../../../src/modules/external-sources/interfaces';
import { ExternalSourceType, SyncPolicy } from '../../../src/entities';

/**
 * Tests ExternalSourceProviderRegistry service.
 *
 * Mocked: None (testing core registry logic)
 * Real: ExternalSourceProviderRegistry (unit under test)
 * Auth: Not applicable (unit test)
 */
describe('ExternalSourceProviderRegistry', () => {
  let registry: ExternalSourceProviderRegistry;
  let mockGoogleDriveProvider: ExternalSourceProvider;
  let mockUrlProvider: ExternalSourceProvider;
  let mockDropboxProvider: ExternalSourceProvider;

  beforeEach(() => {
    registry = new ExternalSourceProviderRegistry();

    // Create mock providers
    mockGoogleDriveProvider = {
      providerType: 'google_drive' as ExternalSourceType,
      displayName: 'Google Drive',
      canHandle: vi.fn((url: string) => url.includes('drive.google.com')),
      parseUrl: vi.fn((url: string) => ({
        providerType: 'google_drive' as ExternalSourceType,
        externalId: 'gdrive-123',
        originalUrl: url,
        normalizedUrl: url,
      })),
      checkAccess: vi.fn(),
      fetchMetadata: vi.fn(),
      fetchContent: vi.fn(),
      checkForUpdates: vi.fn(),
      getDefaultSyncPolicy: vi.fn(() => 'manual' as SyncPolicy),
      getRateLimitConfig: vi.fn(() => ({
        requestsPerMinute: 60,
        backoffOnRateLimit: true,
      })),
    };

    mockUrlProvider = {
      providerType: 'url' as ExternalSourceType,
      displayName: 'Web URL',
      canHandle: vi.fn((url: string) => url.startsWith('http')),
      parseUrl: vi.fn((url: string) => ({
        providerType: 'url' as ExternalSourceType,
        externalId: 'url-hash',
        originalUrl: url,
        normalizedUrl: url,
      })),
      checkAccess: vi.fn(),
      fetchMetadata: vi.fn(),
      fetchContent: vi.fn(),
      checkForUpdates: vi.fn(),
      getDefaultSyncPolicy: vi.fn(() => 'manual' as SyncPolicy),
      getRateLimitConfig: vi.fn(() => ({
        requestsPerMinute: 30,
        backoffOnRateLimit: true,
      })),
    };

    mockDropboxProvider = {
      providerType: 'dropbox' as ExternalSourceType,
      displayName: 'Dropbox',
      canHandle: vi.fn((url: string) => url.includes('dropbox.com')),
      parseUrl: vi.fn((url: string) => ({
        providerType: 'dropbox' as ExternalSourceType,
        externalId: 'dropbox-456',
        originalUrl: url,
        normalizedUrl: url,
      })),
      checkAccess: vi.fn(),
      fetchMetadata: vi.fn(),
      fetchContent: vi.fn(),
      checkForUpdates: vi.fn(),
      getDefaultSyncPolicy: vi.fn(() => 'manual' as SyncPolicy),
      getRateLimitConfig: vi.fn(() => ({
        requestsPerMinute: 50,
        backoffOnRateLimit: true,
      })),
    };
  });

  describe('register', () => {
    it('should register a new provider', () => {
      registry.register(mockGoogleDriveProvider);

      expect(registry.getProvider('google_drive')).toBe(
        mockGoogleDriveProvider
      );
    });

    it('should replace existing provider with warning', () => {
      const newGoogleDriveProvider = {
        ...mockGoogleDriveProvider,
        displayName: 'Google Drive V2',
      };

      registry.register(mockGoogleDriveProvider);
      registry.register(newGoogleDriveProvider);

      const registered = registry.getProvider('google_drive');
      expect(registered?.displayName).toBe('Google Drive V2');
    });

    it('should register multiple providers', () => {
      registry.register(mockGoogleDriveProvider);
      registry.register(mockUrlProvider);
      registry.register(mockDropboxProvider);

      expect(registry.getAllProviders()).toHaveLength(3);
    });
  });

  describe('getProvider', () => {
    it('should return registered provider by type', () => {
      registry.register(mockGoogleDriveProvider);

      expect(registry.getProvider('google_drive')).toBe(
        mockGoogleDriveProvider
      );
    });

    it('should return undefined for unregistered type', () => {
      expect(registry.getProvider('google_drive')).toBeUndefined();
    });
  });

  describe('getAllProviders', () => {
    it('should return empty array when no providers registered', () => {
      expect(registry.getAllProviders()).toEqual([]);
    });

    it('should return all registered providers', () => {
      registry.register(mockGoogleDriveProvider);
      registry.register(mockUrlProvider);

      const providers = registry.getAllProviders();
      expect(providers).toHaveLength(2);
      expect(providers).toContain(mockGoogleDriveProvider);
      expect(providers).toContain(mockUrlProvider);
    });
  });

  describe('detectProvider', () => {
    beforeEach(() => {
      registry.register(mockGoogleDriveProvider);
      registry.register(mockUrlProvider);
      registry.register(mockDropboxProvider);
    });

    it('should detect Google Drive provider for drive.google.com URLs', () => {
      const provider = registry.detectProvider(
        'https://drive.google.com/file/d/abc123/view'
      );

      expect(provider).toBe(mockGoogleDriveProvider);
      expect(mockGoogleDriveProvider.canHandle).toHaveBeenCalledWith(
        'https://drive.google.com/file/d/abc123/view'
      );
    });

    it('should detect Dropbox provider for dropbox.com URLs', () => {
      const provider = registry.detectProvider(
        'https://www.dropbox.com/s/abc123/file.pdf'
      );

      expect(provider).toBe(mockDropboxProvider);
    });

    it('should fall back to URL provider for generic URLs', () => {
      const provider = registry.detectProvider(
        'https://example.com/document.pdf'
      );

      expect(provider).toBe(mockUrlProvider);
    });

    it('should prioritize specific providers over URL provider', () => {
      // Both Google Drive provider and URL provider can handle HTTP URLs
      // Google Drive should be chosen for drive.google.com
      const provider = registry.detectProvider(
        'https://drive.google.com/file/d/abc123/view'
      );

      expect(provider?.providerType).toBe('google_drive');
    });

    it('should return undefined when no provider can handle URL', () => {
      // Mock URL provider to not handle this specific URL
      (mockUrlProvider.canHandle as ReturnType<typeof vi.fn>).mockReturnValue(
        false
      );

      const provider = registry.detectProvider(
        'ftp://files.example.com/doc.pdf'
      );

      expect(provider).toBeUndefined();
    });
  });

  describe('parseUrl', () => {
    beforeEach(() => {
      registry.register(mockGoogleDriveProvider);
      registry.register(mockUrlProvider);
    });

    it('should parse URL using detected provider', () => {
      const ref = registry.parseUrl(
        'https://drive.google.com/file/d/abc123/view'
      );

      expect(ref).not.toBeNull();
      expect(ref?.providerType).toBe('google_drive');
      expect(mockGoogleDriveProvider.parseUrl).toHaveBeenCalled();
    });

    it('should return null when no provider can handle URL', () => {
      (mockUrlProvider.canHandle as ReturnType<typeof vi.fn>).mockReturnValue(
        false
      );

      const ref = registry.parseUrl('ftp://invalid.example.com/file');

      expect(ref).toBeNull();
    });
  });

  describe('canHandle', () => {
    beforeEach(() => {
      registry.register(mockGoogleDriveProvider);
      registry.register(mockUrlProvider);
    });

    it('should return true when a provider can handle the URL', () => {
      expect(
        registry.canHandle('https://drive.google.com/file/d/abc/view')
      ).toBe(true);
      expect(registry.canHandle('https://example.com/doc.pdf')).toBe(true);
    });

    it('should return false when no provider can handle the URL', () => {
      (mockUrlProvider.canHandle as ReturnType<typeof vi.fn>).mockReturnValue(
        false
      );

      expect(registry.canHandle('ftp://invalid.example.com/file')).toBe(false);
    });
  });

  describe('getRegisteredTypes', () => {
    it('should return empty array when no providers registered', () => {
      expect(registry.getRegisteredTypes()).toEqual([]);
    });

    it('should return all registered provider types', () => {
      registry.register(mockGoogleDriveProvider);
      registry.register(mockUrlProvider);

      const types = registry.getRegisteredTypes();
      expect(types).toContain('google_drive');
      expect(types).toContain('url');
    });
  });

  describe('clear', () => {
    it('should remove all registered providers', () => {
      registry.register(mockGoogleDriveProvider);
      registry.register(mockUrlProvider);

      registry.clear();

      expect(registry.getAllProviders()).toHaveLength(0);
      expect(registry.getProvider('google_drive')).toBeUndefined();
    });
  });
});
