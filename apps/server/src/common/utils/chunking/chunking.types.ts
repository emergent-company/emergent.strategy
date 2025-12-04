/**
 * Chunking strategy types and interfaces.
 *
 * Defines the contract for chunking strategies used by ChunkerService.
 */

/**
 * Available chunking strategy names.
 */
export type ChunkingStrategyName = 'character' | 'sentence' | 'paragraph';

/**
 * Boundary types that can end a chunk.
 */
export type ChunkBoundaryType =
  | 'character'
  | 'sentence'
  | 'paragraph'
  | 'section';

/**
 * Configuration options for chunking.
 */
export interface ChunkingOptions {
  /** Maximum characters per chunk (default: 1200) */
  maxChunkSize: number;
  /** Minimum characters per chunk to prevent tiny chunks (default: 100) */
  minChunkSize?: number;
}

/**
 * Default chunking options.
 */
export const DEFAULT_CHUNKING_OPTIONS: Required<ChunkingOptions> = {
  maxChunkSize: 1200,
  minChunkSize: 100,
};

/**
 * Result of chunking a piece of text.
 */
export interface ChunkResult {
  /** The chunk text content */
  text: string;
  /** Character offset in original document where this chunk starts */
  startOffset: number;
  /** Character offset in original document where this chunk ends */
  endOffset: number;
  /** The type of boundary that ended this chunk */
  boundaryType: ChunkBoundaryType;
}

/**
 * Interface for chunking strategy implementations.
 *
 * Each strategy provides a different approach to splitting text:
 * - character: Fixed character boundaries (default, backward compatible)
 * - sentence: Respects sentence boundaries (.!?)
 * - paragraph: Respects paragraph/section boundaries (\n\n, headers)
 */
export interface ChunkingStrategy {
  /** Strategy name identifier */
  readonly name: ChunkingStrategyName;

  /**
   * Split text into chunks according to this strategy.
   *
   * @param text - The text to chunk
   * @param options - Chunking configuration options
   * @returns Array of chunk results with text and metadata
   */
  chunk(text: string, options: ChunkingOptions): ChunkResult[];
}
