import { Injectable, Logger } from '@nestjs/common';
import { AgentStrategy } from './agent-strategy.interface';

/**
 * Registry for agent strategies
 *
 * Strategies register themselves here and the scheduler service
 * looks up the appropriate strategy by role when running an agent.
 */
@Injectable()
export class AgentStrategyRegistry {
  private readonly logger = new Logger(AgentStrategyRegistry.name);
  private readonly strategies = new Map<string, AgentStrategy>();

  /**
   * Register a strategy for a given role
   */
  register(strategy: AgentStrategy): void {
    if (this.strategies.has(strategy.role)) {
      this.logger.warn(
        `Overwriting existing strategy for role: ${strategy.role}`
      );
    }
    this.strategies.set(strategy.role, strategy);
    this.logger.log(`Registered agent strategy: ${strategy.role}`);
  }

  /**
   * Get a strategy by role
   */
  get(role: string): AgentStrategy | undefined {
    return this.strategies.get(role);
  }

  /**
   * Check if a strategy exists for a role
   */
  has(role: string): boolean {
    return this.strategies.has(role);
  }

  /**
   * Get all registered role names
   */
  getRoles(): string[] {
    return Array.from(this.strategies.keys());
  }
}
