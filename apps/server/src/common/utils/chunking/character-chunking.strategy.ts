import {
  ChunkingStrategy,
  ChunkingOptions,
  ChunkResult,
  DEFAULT_CHUNKING_OPTIONS,
} from './chunking.types';

/**
 * Character-based chunking strategy.
 *
 * Splits text at fixed character boundaries regardless of semantic content.
 * This is the default strategy for backward compatibility.
 *
 * Use cases:
 * - Binary/encoded data
 * - Backward compatibility with existing chunks
 * - When semantic boundaries don't matter
 */
export class CharacterChunkingStrategy implements ChunkingStrategy {
  readonly name = 'character' as const;

  chunk(text: string, options: ChunkingOptions): ChunkResult[] {
    const maxChunkSize =
      options.maxChunkSize ?? DEFAULT_CHUNKING_OPTIONS.maxChunkSize;
    const results: ChunkResult[] = [];

    if (!text || text.length === 0) {
      return results;
    }

    let start = 0;
    while (start < text.length) {
      const end = Math.min(start + maxChunkSize, text.length);
      results.push({
        text: text.slice(start, end),
        startOffset: start,
        endOffset: end,
        boundaryType: 'character',
      });
      start = end;
    }

    return results;
  }
}
