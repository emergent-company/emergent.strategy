/**
 * Chunking module exports.
 *
 * Provides semantic chunking strategies for the ingestion pipeline.
 */

// Types and interfaces
export {
  ChunkingStrategy,
  ChunkingOptions,
  ChunkResult,
  ChunkingStrategyName,
  ChunkBoundaryType,
  DEFAULT_CHUNKING_OPTIONS,
} from './chunking.types';

// Strategy implementations
export { CharacterChunkingStrategy } from './character-chunking.strategy';
export { SentenceChunkingStrategy } from './sentence-chunking.strategy';
export { ParagraphChunkingStrategy } from './paragraph-chunking.strategy';

// Factory
export { ChunkingStrategyFactory } from './chunking-strategy.factory';
