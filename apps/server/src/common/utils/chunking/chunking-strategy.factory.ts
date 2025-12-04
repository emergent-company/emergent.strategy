import { ChunkingStrategy, ChunkingStrategyName } from './chunking.types';
import { CharacterChunkingStrategy } from './character-chunking.strategy';
import { SentenceChunkingStrategy } from './sentence-chunking.strategy';
import { ParagraphChunkingStrategy } from './paragraph-chunking.strategy';

/**
 * Factory for creating chunking strategy instances.
 *
 * Provides a centralized way to instantiate chunking strategies by name.
 * Strategies are cached for reuse since they are stateless.
 */
export class ChunkingStrategyFactory {
  private static readonly strategies: Map<
    ChunkingStrategyName,
    ChunkingStrategy
  > = new Map();

  /**
   * Get a chunking strategy instance by name.
   *
   * @param name - The strategy name ('character', 'sentence', 'paragraph')
   * @returns The chunking strategy instance
   * @throws Error if the strategy name is not recognized
   */
  static getStrategy(name: ChunkingStrategyName): ChunkingStrategy {
    // Check cache first
    const cached = this.strategies.get(name);
    if (cached) {
      return cached;
    }

    // Create and cache the strategy
    const strategy = this.createStrategy(name);
    this.strategies.set(name, strategy);
    return strategy;
  }

  /**
   * Create a new chunking strategy instance.
   *
   * @param name - The strategy name
   * @returns The newly created strategy
   */
  private static createStrategy(name: ChunkingStrategyName): ChunkingStrategy {
    switch (name) {
      case 'character':
        return new CharacterChunkingStrategy();
      case 'sentence':
        return new SentenceChunkingStrategy();
      case 'paragraph':
        return new ParagraphChunkingStrategy();
      default:
        // This should never happen due to TypeScript, but handle it gracefully
        throw new Error(`Unknown chunking strategy: ${name}`);
    }
  }

  /**
   * Get the default chunking strategy (character-based for backward compatibility).
   */
  static getDefaultStrategy(): ChunkingStrategy {
    return this.getStrategy('character');
  }

  /**
   * Check if a strategy name is valid.
   */
  static isValidStrategy(name: string): name is ChunkingStrategyName {
    return ['character', 'sentence', 'paragraph'].includes(name);
  }

  /**
   * Get all available strategy names.
   */
  static getAvailableStrategies(): ChunkingStrategyName[] {
    return ['character', 'sentence', 'paragraph'];
  }
}
