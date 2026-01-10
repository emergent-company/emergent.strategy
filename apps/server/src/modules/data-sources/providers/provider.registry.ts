import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { DataSourceProvider, ProviderMetadata } from './provider.interface';

/**
 * Data Source Provider Registry
 *
 * Central registry for all data source providers.
 * Providers register themselves at module initialization.
 */
@Injectable()
export class DataSourceProviderRegistry implements OnModuleInit {
  private readonly logger = new Logger(DataSourceProviderRegistry.name);
  private readonly providers = new Map<string, DataSourceProvider>();

  constructor(private readonly moduleRef: ModuleRef) {}

  onModuleInit() {
    this.logger.log('DataSourceProviderRegistry initialized');
  }

  /**
   * Register a provider instance
   * @param provider - Provider instance to register
   */
  register(provider: DataSourceProvider): void {
    const metadata = provider.getMetadata();
    const providerType = metadata.providerType;

    if (this.providers.has(providerType)) {
      this.logger.warn(
        `Provider ${providerType} already registered, overwriting`
      );
    }

    this.providers.set(providerType, provider);
    this.logger.log(
      `Registered data source provider: ${metadata.displayName} (${providerType})`
    );
  }

  /**
   * Get a provider by type
   * @param providerType - Provider type identifier (e.g., 'imap')
   */
  getProvider(providerType: string): DataSourceProvider | undefined {
    return this.providers.get(providerType);
  }

  /**
   * Check if a provider is registered
   * @param providerType - Provider type identifier
   */
  hasProvider(providerType: string): boolean {
    return this.providers.has(providerType);
  }

  /**
   * List all registered providers
   */
  listProviders(): ProviderMetadata[] {
    return Array.from(this.providers.values()).map((p) => p.getMetadata());
  }

  /**
   * Get providers that produce a specific source type
   * @param sourceType - Source type (e.g., 'email')
   */
  getProvidersBySourceType(sourceType: string): ProviderMetadata[] {
    return this.listProviders().filter((p) => p.sourceType === sourceType);
  }

  /**
   * Get count of registered providers
   */
  getProviderCount(): number {
    return this.providers.size;
  }
}
