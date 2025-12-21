import {
  Injectable,
  Logger,
  OnModuleInit,
  Inject,
  Optional,
} from '@nestjs/common';
import { ExternalSourceType } from '../../entities';
import { ExternalSourceProvider, ExternalSourceReference } from './interfaces';
import { GoogleDriveProvider } from './providers/google-drive.provider';
import { UrlProvider } from './providers/url.provider';

/**
 * Registry for external source providers
 *
 * Manages provider registration and lookup by type or URL.
 * Providers are registered at module initialization and can be
 * looked up by type or auto-detected from URLs.
 */
@Injectable()
export class ExternalSourceProviderRegistry implements OnModuleInit {
  private readonly logger = new Logger(ExternalSourceProviderRegistry.name);
  private readonly providers = new Map<
    ExternalSourceType,
    ExternalSourceProvider
  >();

  constructor(
    @Optional() private readonly googleDriveProvider?: GoogleDriveProvider,
    @Optional() private readonly urlProvider?: UrlProvider
  ) {}

  /**
   * Auto-register providers on module initialization
   */
  onModuleInit() {
    // Register injected providers
    if (this.googleDriveProvider) {
      this.register(this.googleDriveProvider);
    }
    if (this.urlProvider) {
      this.register(this.urlProvider);
    }

    this.logger.log(
      `Provider registry initialized with ${
        this.providers.size
      } provider(s): ${Array.from(this.providers.keys()).join(', ')}`
    );
  }

  /**
   * Register a provider with the registry
   */
  register(provider: ExternalSourceProvider): void {
    if (this.providers.has(provider.providerType)) {
      this.logger.warn(
        `Provider ${provider.providerType} already registered, replacing...`
      );
    }
    this.providers.set(provider.providerType, provider);
    this.logger.log(
      `Registered external source provider: ${provider.displayName} (${provider.providerType})`
    );
  }

  /**
   * Get a provider by type
   */
  getProvider(type: ExternalSourceType): ExternalSourceProvider | undefined {
    return this.providers.get(type);
  }

  /**
   * Get all registered providers
   */
  getAllProviders(): ExternalSourceProvider[] {
    return Array.from(this.providers.values());
  }

  /**
   * Detect which provider can handle a URL
   *
   * Iterates through registered providers and returns the first one
   * that can handle the URL. Falls back to 'url' provider if none match.
   */
  detectProvider(url: string): ExternalSourceProvider | undefined {
    // First, try to find a specific provider that can handle the URL
    for (const provider of this.providers.values()) {
      // Skip the generic URL provider for now - we want specific providers first
      if (provider.providerType === 'url') continue;

      if (provider.canHandle(url)) {
        return provider;
      }
    }

    // Fall back to generic URL provider
    const urlProvider = this.providers.get('url');
    if (urlProvider && urlProvider.canHandle(url)) {
      return urlProvider;
    }

    return undefined;
  }

  /**
   * Parse a URL into an external source reference
   *
   * Detects the appropriate provider and parses the URL.
   * Returns null if no provider can handle the URL.
   */
  parseUrl(url: string): ExternalSourceReference | null {
    const provider = this.detectProvider(url);
    if (!provider) {
      this.logger.debug(`No provider found for URL: ${url}`);
      return null;
    }

    return provider.parseUrl(url);
  }

  /**
   * Check if any provider can handle a URL
   */
  canHandle(url: string): boolean {
    return this.detectProvider(url) !== undefined;
  }

  /**
   * Get provider types that are registered
   */
  getRegisteredTypes(): ExternalSourceType[] {
    return Array.from(this.providers.keys());
  }

  /**
   * Clear all registered providers (mainly for testing)
   */
  clear(): void {
    this.providers.clear();
  }
}
