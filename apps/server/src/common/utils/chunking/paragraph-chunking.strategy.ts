import {
  ChunkingStrategy,
  ChunkingOptions,
  ChunkResult,
  ChunkBoundaryType,
  DEFAULT_CHUNKING_OPTIONS,
} from './chunking.types';
import { SentenceChunkingStrategy } from './sentence-chunking.strategy';

/**
 * Paragraph-based chunking strategy.
 *
 * Splits text at paragraph boundaries (\n\n or blank lines) and optionally
 * at markdown section headers (^#+\s). Falls back to sentence chunking for
 * paragraphs that exceed maxChunkSize.
 *
 * Use cases:
 * - Structured documents with chapters/sections
 * - Markdown documents
 * - Content where paragraph/section context matters
 */
export class ParagraphChunkingStrategy implements ChunkingStrategy {
  readonly name = 'paragraph' as const;

  /**
   * Pattern for paragraph breaks: two or more newlines (with optional whitespace).
   */
  private readonly paragraphBreakPattern = /\n\s*\n/;

  /**
   * Sentence chunking strategy for fallback when paragraphs are too long.
   */
  private readonly sentenceChunker = new SentenceChunkingStrategy();

  chunk(text: string, options: ChunkingOptions): ChunkResult[] {
    const maxChunkSize =
      options.maxChunkSize ?? DEFAULT_CHUNKING_OPTIONS.maxChunkSize;
    const minChunkSize =
      options.minChunkSize ?? DEFAULT_CHUNKING_OPTIONS.minChunkSize;
    const results: ChunkResult[] = [];

    if (!text || text.length === 0) {
      return results;
    }

    // Split text into sections (by headers) and paragraphs
    const segments = this.splitIntoSegments(text);

    let currentChunk = '';
    let chunkStartOffset = 0;
    let currentOffset = 0;
    let currentBoundaryType: ChunkBoundaryType = 'paragraph';

    for (const segment of segments) {
      const {
        text: segmentText,
        boundaryType,
        offset: segmentOffset,
      } = segment;

      // Update current offset to match segment position
      currentOffset = segmentOffset;

      // If adding this segment would exceed maxChunkSize
      if (currentChunk.length + segmentText.length > maxChunkSize) {
        // If current chunk has content, save it
        if (currentChunk.length >= minChunkSize) {
          results.push({
            text: currentChunk,
            startOffset: chunkStartOffset,
            endOffset: currentOffset,
            boundaryType: currentBoundaryType,
          });
          currentChunk = '';
          chunkStartOffset = currentOffset;
        }

        // If single segment exceeds maxChunkSize, split it using sentence strategy
        if (segmentText.length > maxChunkSize) {
          const sentenceChunks = this.sentenceChunker.chunk(segmentText, {
            maxChunkSize,
            minChunkSize,
          });

          // Adjust offsets and add all but last chunk to results
          for (let i = 0; i < sentenceChunks.length - 1; i++) {
            const sc = sentenceChunks[i];
            results.push({
              text: sc.text,
              startOffset: currentOffset + sc.startOffset,
              endOffset: currentOffset + sc.endOffset,
              boundaryType: sc.boundaryType,
            });
          }

          // Keep the last part as current chunk if it exists
          if (sentenceChunks.length > 0) {
            const lastChunk = sentenceChunks[sentenceChunks.length - 1];
            currentChunk = lastChunk.text;
            chunkStartOffset = currentOffset + lastChunk.startOffset;
            currentOffset = segmentOffset + segmentText.length;
            currentBoundaryType = lastChunk.boundaryType;
          }
        } else {
          // Start new chunk with this segment
          currentChunk = segmentText;
          chunkStartOffset = currentOffset;
          currentOffset = segmentOffset + segmentText.length;
          currentBoundaryType = boundaryType;
        }
      } else {
        // Add segment to current chunk
        currentChunk += segmentText;
        currentOffset = segmentOffset + segmentText.length;
        currentBoundaryType = boundaryType;
      }
    }

    // Add remaining chunk
    if (currentChunk.length > 0) {
      results.push({
        text: currentChunk,
        startOffset: chunkStartOffset,
        endOffset: currentOffset,
        boundaryType: currentBoundaryType,
      });
    }

    return results;
  }

  /**
   * Split text into segments (paragraphs and sections).
   * Returns segments with their original text, boundary type, and offset.
   */
  private splitIntoSegments(
    text: string
  ): Array<{ text: string; boundaryType: ChunkBoundaryType; offset: number }> {
    const segments: Array<{
      text: string;
      boundaryType: ChunkBoundaryType;
      offset: number;
    }> = [];

    // First, find all markdown headers and their positions
    const headerPositions: Array<{ start: number; end: number }> = [];
    let match: RegExpExecArray | null;
    const headerPattern = /^(#{1,6})\s+.+$/gm;

    while ((match = headerPattern.exec(text)) !== null) {
      headerPositions.push({
        start: match.index,
        end: match.index + match[0].length,
      });
    }

    // Split by paragraph breaks
    const parts = text.split(this.paragraphBreakPattern);
    let offset = 0;

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];

      if (part.length === 0) {
        // Account for the paragraph break
        offset += 2; // Approximate \n\n length
        continue;
      }

      // Determine if this part starts with a header
      const isSection = headerPositions.some(
        (hp) => hp.start === offset || part.match(/^#{1,6}\s+/)
      );

      segments.push({
        text: part,
        boundaryType: isSection ? 'section' : 'paragraph',
        offset,
      });

      // Move offset past this part and the paragraph break
      offset += part.length;
      if (i < parts.length - 1) {
        // Find the actual paragraph break length
        const remainingText = text.slice(offset);
        const breakMatch = remainingText.match(/^(\n\s*\n)/);
        if (breakMatch) {
          offset += breakMatch[1].length;
        }
      }
    }

    return segments;
  }
}
