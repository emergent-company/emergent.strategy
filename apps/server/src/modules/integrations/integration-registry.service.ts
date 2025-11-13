import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { BaseIntegration } from './base-integration';

/**
 * Integration Registry Service
 *
 * Central registry for all available integrations.
 * Manages integration lifecycle and provides access to integration instances.
 *
 * Responsibilities:
 * - Register available integrations
 * - Provide integration instances by name
 * - List available integrations and their capabilities
 * - Manage integration lifecycle (init, cleanup)
 *
 * Usage:
 * ```typescript
 * // Register integrations on module init
 * registry.register(new ClickUpIntegration(...));
 *
 * // Get integration instance
 * const clickup = registry.getIntegration('clickup');
 *
 * // List all available integrations
 * const available = registry.listAvailableIntegrations();
 * ```
 */
@Injectable()
export class IntegrationRegistryService implements OnModuleInit {
  private readonly logger = new Logger(IntegrationRegistryService.name);
  private readonly integrations = new Map<string, BaseIntegration>();

  async onModuleInit() {
    this.logger.log('Integration Registry initialized');
    // Future: Auto-discover integrations via DI
  }

  /**
   * Register an integration
   *
   * @param integration - Integration instance to register
   */
  register(integration: BaseIntegration): void {
    const name = integration.getName();

    if (this.integrations.has(name)) {
      this.logger.warn(
        `Integration '${name}' is already registered. Overwriting.`
      );
    }

    this.integrations.set(name, integration);
    this.logger.log(
      `Registered integration: ${integration.getDisplayName()} (${name})`
    );
  }

  /**
   * Get an integration by name
   *
   * @param name - Integration name (e.g., 'clickup')
   * @returns Integration instance or null if not found
   */
  getIntegration(name: string): BaseIntegration | null {
    return this.integrations.get(name) || null;
  }

  /**
   * Check if integration is registered
   *
   * @param name - Integration name
   */
  hasIntegration(name: string): boolean {
    return this.integrations.has(name);
  }

  /**
   * List all available integrations
   *
   * @returns Array of integration info
   */
  listAvailableIntegrations(): Array<{
    name: string;
    displayName: string;
    capabilities: any;
    requiredSettings: string[];
    optionalSettings: Record<string, any>;
  }> {
    return Array.from(this.integrations.values()).map((integration) => ({
      name: integration.getName(),
      displayName: integration.getDisplayName(),
      capabilities: integration.getCapabilities(),
      requiredSettings: integration.getRequiredSettings(),
      optionalSettings: integration.getOptionalSettings(),
    }));
  }

  /**
   * Get all registered integration names
   */
  getRegisteredNames(): string[] {
    return Array.from(this.integrations.keys());
  }

  /**
   * Unregister an integration
   *
   * @param name - Integration name
   */
  async unregister(name: string): Promise<void> {
    const integration = this.integrations.get(name);
    if (integration) {
      await integration.cleanup();
      this.integrations.delete(name);
      this.logger.log(`Unregistered integration: ${name}`);
    }
  }

  /**
   * Cleanup all integrations
   *
   * Called on module shutdown
   */
  async cleanup(): Promise<void> {
    this.logger.log('Cleaning up all integrations');

    for (const [name, integration] of this.integrations.entries()) {
      try {
        await integration.cleanup();
      } catch (error) {
        const err = error as Error;
        this.logger.error(
          `Failed to cleanup integration ${name}: ${err.message}`
        );
      }
    }

    this.integrations.clear();
  }
}
