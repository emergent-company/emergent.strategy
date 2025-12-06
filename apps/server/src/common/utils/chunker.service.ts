import { Injectable } from '@nestjs/common';
import {
  ChunkingStrategyFactory,
  ChunkingStrategyName,
  ChunkingOptions,
  ChunkResult,
  DEFAULT_CHUNKING_OPTIONS,
} from './chunking';

/**
 * Extended chunk result with metadata for storage.
 */
export interface ChunkWithMetadata {
  text: string;
  metadata: {
    strategy: ChunkingStrategyName;
    startOffset: number;
    endOffset: number;
    boundaryType: string;
  };
}

/**
 * Configuration for chunking operations.
 */
export interface ChunkerConfig {
  /** Chunking strategy to use (default: 'character') */
  strategy?: ChunkingStrategyName;
  /** Chunking options */
  options?: Partial<ChunkingOptions>;
}

@Injectable()
export class ChunkerService {
  /**
   * Chunk text using the specified strategy.
   *
   * For backward compatibility, this method returns string[] when no config is provided.
   * Use chunkWithMetadata() for the full ChunkResult with metadata.
   *
   * @param text - Text to chunk
   * @param maxLen - Maximum chunk length (default: 1200, for backward compatibility)
   * @returns Array of chunk text strings
   */
  chunk(text: string, maxLen = 1200): string[] {
    // Use character strategy for backward compatibility
    const strategy = ChunkingStrategyFactory.getStrategy('character');
    const results = strategy.chunk(text, {
      maxChunkSize: maxLen,
      minChunkSize: DEFAULT_CHUNKING_OPTIONS.minChunkSize,
    });
    return results.map((r) => r.text);
  }

  /**
   * Chunk text with full metadata using the specified strategy.
   *
   * @param text - Text to chunk
   * @param config - Chunking configuration (strategy and options)
   *                 Supports both nested format { strategy, options: { maxChunkSize, minChunkSize } }
   *                 and flat format { strategy, maxChunkSize, minChunkSize } from project settings
   * @returns Array of chunks with metadata
   */
  chunkWithMetadata(text: string, config?: ChunkerConfig): ChunkWithMetadata[] {
    const strategyName = config?.strategy ?? 'character';
    const strategy = ChunkingStrategyFactory.getStrategy(strategyName);

    // Support both nested (options.maxChunkSize) and flat (maxChunkSize) config formats
    // Project settings store as flat, but ChunkerConfig interface uses nested
    const flatConfig = config as any;
    const options: ChunkingOptions = {
      maxChunkSize:
        config?.options?.maxChunkSize ??
        flatConfig?.maxChunkSize ??
        DEFAULT_CHUNKING_OPTIONS.maxChunkSize,
      minChunkSize:
        config?.options?.minChunkSize ??
        flatConfig?.minChunkSize ??
        DEFAULT_CHUNKING_OPTIONS.minChunkSize,
    };

    const results = strategy.chunk(text, options);

    return results.map((r: ChunkResult) => ({
      text: r.text,
      metadata: {
        strategy: strategyName,
        startOffset: r.startOffset,
        endOffset: r.endOffset,
        boundaryType: r.boundaryType,
      },
    }));
  }

  /**
   * Validate chunking configuration.
   *
   * @param config - Configuration to validate
   * @returns True if valid, throws otherwise
   */
  validateConfig(config: ChunkerConfig): boolean {
    if (
      config.strategy &&
      !ChunkingStrategyFactory.isValidStrategy(config.strategy)
    ) {
      throw new Error(
        `Invalid chunking strategy: ${
          config.strategy
        }. Valid strategies: ${ChunkingStrategyFactory.getAvailableStrategies().join(
          ', '
        )}`
      );
    }

    if (config.options?.maxChunkSize !== undefined) {
      if (
        config.options.maxChunkSize < 100 ||
        config.options.maxChunkSize > 10000
      ) {
        throw new Error('maxChunkSize must be between 100 and 10000');
      }
    }

    if (config.options?.minChunkSize !== undefined) {
      if (
        config.options.minChunkSize < 10 ||
        config.options.minChunkSize > 1000
      ) {
        throw new Error('minChunkSize must be between 10 and 1000');
      }
    }

    if (
      config.options?.maxChunkSize !== undefined &&
      config.options?.minChunkSize !== undefined &&
      config.options.minChunkSize >= config.options.maxChunkSize
    ) {
      throw new Error('minChunkSize must be less than maxChunkSize');
    }

    return true;
  }

  /**
   * Get available chunking strategies.
   */
  getAvailableStrategies(): ChunkingStrategyName[] {
    return ChunkingStrategyFactory.getAvailableStrategies();
  }
}
