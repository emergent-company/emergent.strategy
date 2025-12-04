import {
  ChunkingStrategy,
  ChunkingOptions,
  ChunkResult,
  DEFAULT_CHUNKING_OPTIONS,
} from './chunking.types';

/**
 * Sentence-based chunking strategy.
 *
 * Splits text at sentence boundaries (.!?) while respecting maxChunkSize.
 * Sentences that exceed maxChunkSize are split at character boundaries.
 *
 * Use cases:
 * - Prose, articles, descriptions
 * - Content where sentence context matters
 * - Natural language documents
 */
export class SentenceChunkingStrategy implements ChunkingStrategy {
  readonly name = 'sentence' as const;

  /**
   * Regex pattern for sentence boundaries.
   *
   * Matches:
   * - Period, exclamation, or question mark
   * - Followed by one or more spaces/newlines
   * - Or end of string
   *
   * Does NOT match abbreviations like "Dr.", "Mr.", "e.g.", "i.e." when followed by lowercase.
   */
  private readonly sentenceEndPattern =
    /(?<=[.!?])(?=\s+[A-Z])|(?<=[.!?])(?=\s*$)|(?<=[.!?])(?=\s+["'\u201C\u201D])/g;

  /**
   * Common abbreviations that should not be treated as sentence endings.
   */
  private readonly abbreviations = new Set([
    'Dr',
    'Mr',
    'Mrs',
    'Ms',
    'Prof',
    'Sr',
    'Jr',
    'vs',
    'etc',
    'e.g',
    'i.e',
    'Inc',
    'Ltd',
    'Co',
    'Corp',
    'St',
    'Ave',
    'Blvd',
    'Fig',
    'No',
    'Vol',
    'pp',
    'ca',
  ]);

  chunk(text: string, options: ChunkingOptions): ChunkResult[] {
    const maxChunkSize =
      options.maxChunkSize ?? DEFAULT_CHUNKING_OPTIONS.maxChunkSize;
    const minChunkSize =
      options.minChunkSize ?? DEFAULT_CHUNKING_OPTIONS.minChunkSize;
    const results: ChunkResult[] = [];

    if (!text || text.length === 0) {
      return results;
    }

    // Split text into sentences
    const sentences = this.splitIntoSentences(text);

    let currentChunk = '';
    let chunkStartOffset = 0;
    let currentOffset = 0;

    for (const sentence of sentences) {
      const trimmedSentence = sentence;

      // If adding this sentence would exceed maxChunkSize
      if (currentChunk.length + trimmedSentence.length > maxChunkSize) {
        // If current chunk has content, save it
        if (currentChunk.length >= minChunkSize) {
          results.push({
            text: currentChunk,
            startOffset: chunkStartOffset,
            endOffset: currentOffset,
            boundaryType: 'sentence',
          });
          currentChunk = '';
          chunkStartOffset = currentOffset;
        }

        // If single sentence exceeds maxChunkSize, split it at character boundaries
        if (trimmedSentence.length > maxChunkSize) {
          const charChunks = this.splitLongSentence(
            trimmedSentence,
            maxChunkSize,
            currentOffset
          );
          // Add all but the last character chunk to results
          for (let i = 0; i < charChunks.length - 1; i++) {
            results.push(charChunks[i]);
          }
          // Keep the last part as the current chunk if it's small enough to combine
          if (charChunks.length > 0) {
            const lastChunk = charChunks[charChunks.length - 1];
            currentChunk = lastChunk.text;
            chunkStartOffset = lastChunk.startOffset;
            currentOffset = lastChunk.endOffset;
          }
        } else {
          // Start new chunk with this sentence
          currentChunk = trimmedSentence;
          chunkStartOffset = currentOffset;
          currentOffset += trimmedSentence.length;
        }
      } else {
        // Add sentence to current chunk
        currentChunk += trimmedSentence;
        currentOffset += trimmedSentence.length;
      }
    }

    // Add remaining chunk
    if (currentChunk.length > 0) {
      results.push({
        text: currentChunk,
        startOffset: chunkStartOffset,
        endOffset: currentOffset,
        boundaryType: 'sentence',
      });
    }

    return results;
  }

  /**
   * Split text into sentences, preserving the original text (including trailing spaces).
   */
  private splitIntoSentences(text: string): string[] {
    const sentences: string[] = [];
    let lastIndex = 0;

    // Find sentence boundaries
    const matches = [...text.matchAll(this.sentenceEndPattern)];

    for (const match of matches) {
      if (match.index === undefined) continue;

      // Check if this might be an abbreviation
      const beforePeriod = text.slice(
        Math.max(0, match.index - 10),
        match.index
      );
      const abbrevMatch = beforePeriod.match(/\b([A-Za-z]+)\s*$/);

      if (abbrevMatch && this.abbreviations.has(abbrevMatch[1])) {
        continue; // Skip this match - it's an abbreviation
      }

      // Include the punctuation and any following whitespace
      let endIndex = match.index + 1;

      // Find the end of whitespace after punctuation
      while (endIndex < text.length && /\s/.test(text[endIndex])) {
        endIndex++;
      }

      sentences.push(text.slice(lastIndex, endIndex));
      lastIndex = endIndex;
    }

    // Add remaining text as last sentence
    if (lastIndex < text.length) {
      sentences.push(text.slice(lastIndex));
    }

    return sentences.filter((s) => s.length > 0);
  }

  /**
   * Split a long sentence at character boundaries when it exceeds maxChunkSize.
   */
  private splitLongSentence(
    sentence: string,
    maxChunkSize: number,
    startOffset: number
  ): ChunkResult[] {
    const results: ChunkResult[] = [];
    let offset = startOffset;
    let pos = 0;

    while (pos < sentence.length) {
      const end = Math.min(pos + maxChunkSize, sentence.length);
      results.push({
        text: sentence.slice(pos, end),
        startOffset: offset,
        endOffset: offset + (end - pos),
        boundaryType: 'character', // Falls back to character boundary
      });
      offset += end - pos;
      pos = end;
    }

    return results;
  }
}
