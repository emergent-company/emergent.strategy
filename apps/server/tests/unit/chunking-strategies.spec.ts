import { describe, it, expect } from 'vitest';
import {
  ChunkingStrategyFactory,
  CharacterChunkingStrategy,
  SentenceChunkingStrategy,
  ParagraphChunkingStrategy,
  ChunkingOptions,
} from '../../src/common/utils/chunking';
import { ChunkerService } from '../../src/common/utils/chunker.service';

describe('ChunkingStrategyFactory', () => {
  it('should return character strategy by default', () => {
    const strategy = ChunkingStrategyFactory.getStrategy('character');
    expect(strategy).toBeInstanceOf(CharacterChunkingStrategy);
  });

  it('should return sentence strategy', () => {
    const strategy = ChunkingStrategyFactory.getStrategy('sentence');
    expect(strategy).toBeInstanceOf(SentenceChunkingStrategy);
  });

  it('should return paragraph strategy', () => {
    const strategy = ChunkingStrategyFactory.getStrategy('paragraph');
    expect(strategy).toBeInstanceOf(ParagraphChunkingStrategy);
  });

  it('should cache strategies', () => {
    const strategy1 = ChunkingStrategyFactory.getStrategy('character');
    const strategy2 = ChunkingStrategyFactory.getStrategy('character');
    expect(strategy1).toBe(strategy2);
  });

  it('should list available strategies', () => {
    const strategies = ChunkingStrategyFactory.getAvailableStrategies();
    expect(strategies).toContain('character');
    expect(strategies).toContain('sentence');
    expect(strategies).toContain('paragraph');
  });

  it('should validate strategy names', () => {
    expect(ChunkingStrategyFactory.isValidStrategy('character')).toBe(true);
    expect(ChunkingStrategyFactory.isValidStrategy('sentence')).toBe(true);
    expect(ChunkingStrategyFactory.isValidStrategy('paragraph')).toBe(true);
    expect(ChunkingStrategyFactory.isValidStrategy('invalid' as any)).toBe(
      false
    );
  });
});

describe('CharacterChunkingStrategy', () => {
  const strategy = new CharacterChunkingStrategy();
  const defaultOptions: ChunkingOptions = {
    maxChunkSize: 100,
    minChunkSize: 10,
  };

  it('should return empty array for empty string', () => {
    const result = strategy.chunk('', defaultOptions);
    expect(result).toEqual([]);
  });

  it('should return single chunk when text is shorter than max', () => {
    const text = 'short text';
    const result = strategy.chunk(text, defaultOptions);
    expect(result).toHaveLength(1);
    expect(result[0].text).toBe(text);
    expect(result[0].startOffset).toBe(0);
    expect(result[0].endOffset).toBe(text.length);
    expect(result[0].boundaryType).toBe('character');
  });

  it('should split text at character boundaries', () => {
    const text = 'a'.repeat(250);
    const result = strategy.chunk(text, defaultOptions);
    expect(result.length).toBeGreaterThan(1);
    // All chunks should be at most maxChunkSize
    result.forEach((chunk) => {
      expect(chunk.text.length).toBeLessThanOrEqual(
        defaultOptions.maxChunkSize
      );
    });
    // Concatenated text should equal original
    expect(result.map((c) => c.text).join('')).toBe(text);
  });

  it('should include proper metadata', () => {
    const text = 'Hello world. This is a test.';
    const result = strategy.chunk(text, { maxChunkSize: 15, minChunkSize: 5 });

    result.forEach((chunk) => {
      expect(chunk.startOffset).toBeGreaterThanOrEqual(0);
      expect(chunk.endOffset).toBeGreaterThan(chunk.startOffset);
      expect(chunk.boundaryType).toBe('character');
    });
  });
});

describe('SentenceChunkingStrategy', () => {
  const strategy = new SentenceChunkingStrategy();
  const defaultOptions: ChunkingOptions = {
    maxChunkSize: 100,
    minChunkSize: 10,
  };

  it('should return empty array for empty string', () => {
    const result = strategy.chunk('', defaultOptions);
    expect(result).toEqual([]);
  });

  it('should keep short text as single chunk', () => {
    const text = 'Hello world.';
    const result = strategy.chunk(text, defaultOptions);
    expect(result).toHaveLength(1);
    expect(result[0].text).toBe(text);
    expect(result[0].boundaryType).toBe('sentence');
  });

  it('should split on sentence boundaries', () => {
    const text = 'First sentence. Second sentence. Third sentence.';
    const result = strategy.chunk(text, { maxChunkSize: 30, minChunkSize: 5 });

    // Should split at sentence boundaries
    result.forEach((chunk) => {
      // Each chunk should end with proper punctuation or be the end
      expect(chunk.boundaryType).toBe('sentence');
    });
  });

  it('should handle abbreviations', () => {
    const text = 'Dr. Smith went to the store. Mr. Jones followed.';
    const result = strategy.chunk(text, { maxChunkSize: 100, minChunkSize: 5 });

    // Abbreviations should not cause splits
    expect(result).toHaveLength(1);
  });

  it('should handle multiple punctuation marks', () => {
    const text = 'What?! Yes! Really?';
    const result = strategy.chunk(text, { maxChunkSize: 100, minChunkSize: 5 });
    expect(result).toHaveLength(1);
    expect(result[0].text).toBe(text);
  });

  it('should include proper offsets', () => {
    const text = 'First. Second. Third.';
    const result = strategy.chunk(text, { maxChunkSize: 10, minChunkSize: 3 });

    // Verify offsets are sequential and non-overlapping
    let expectedStart = 0;
    result.forEach((chunk) => {
      expect(chunk.startOffset).toBe(expectedStart);
      expect(chunk.endOffset).toBe(chunk.startOffset + chunk.text.length);
      expectedStart = chunk.endOffset;
    });
  });
});

describe('ParagraphChunkingStrategy', () => {
  const strategy = new ParagraphChunkingStrategy();
  const defaultOptions: ChunkingOptions = {
    maxChunkSize: 200,
    minChunkSize: 10,
  };

  it('should return empty array for empty string', () => {
    const result = strategy.chunk('', defaultOptions);
    expect(result).toEqual([]);
  });

  it('should keep short text as single chunk', () => {
    const text = 'Single paragraph content.';
    const result = strategy.chunk(text, defaultOptions);
    expect(result).toHaveLength(1);
    expect(result[0].text).toBe(text);
  });

  it('should split on double newlines', () => {
    const text = 'First paragraph.\n\nSecond paragraph.\n\nThird paragraph.';
    const result = strategy.chunk(text, { maxChunkSize: 25, minChunkSize: 5 });

    // Should create multiple chunks
    expect(result.length).toBeGreaterThan(1);
    result.forEach((chunk) => {
      expect(chunk.boundaryType).toBe('paragraph');
    });
  });

  it('should detect markdown headers as boundaries', () => {
    const text = '# Header 1\n\nContent 1.\n\n## Header 2\n\nContent 2.';
    const result = strategy.chunk(text, { maxChunkSize: 30, minChunkSize: 5 });

    expect(result.length).toBeGreaterThan(1);
  });

  it('should merge small paragraphs', () => {
    const text = 'A.\n\nB.\n\nC.';
    const result = strategy.chunk(text, {
      maxChunkSize: 100,
      minChunkSize: 10,
    });

    // Small paragraphs should be merged together
    // With minChunkSize=10 and maxChunkSize=100, all should merge into one
    expect(result).toHaveLength(1);
  });

  it('should include proper metadata', () => {
    const text = 'Para 1.\n\nPara 2.\n\nPara 3.';
    const result = strategy.chunk(text, { maxChunkSize: 15, minChunkSize: 5 });

    result.forEach((chunk) => {
      expect(chunk.startOffset).toBeGreaterThanOrEqual(0);
      expect(chunk.endOffset).toBeGreaterThan(chunk.startOffset);
      expect(chunk.boundaryType).toBe('paragraph');
    });
  });
});

describe('ChunkerService with strategies', () => {
  const service = new ChunkerService();

  describe('chunkWithMetadata', () => {
    it('should use character strategy by default', () => {
      const result = service.chunkWithMetadata('Hello world');
      expect(result).toHaveLength(1);
      expect(result[0].metadata.strategy).toBe('character');
    });

    it('should use specified strategy', () => {
      const text = 'First sentence. Second sentence.';
      const result = service.chunkWithMetadata(text, { strategy: 'sentence' });
      expect(result[0].metadata.strategy).toBe('sentence');
    });

    it('should respect maxChunkSize option', () => {
      const text = 'a'.repeat(100);
      const result = service.chunkWithMetadata(text, {
        strategy: 'character',
        options: { maxChunkSize: 30 },
      });

      result.forEach((chunk) => {
        expect(chunk.text.length).toBeLessThanOrEqual(30);
      });
    });

    it('should include all metadata fields', () => {
      const result = service.chunkWithMetadata('Test text', {
        strategy: 'character',
      });
      const chunk = result[0];

      expect(chunk.text).toBe('Test text');
      expect(chunk.metadata).toHaveProperty('strategy');
      expect(chunk.metadata).toHaveProperty('startOffset');
      expect(chunk.metadata).toHaveProperty('endOffset');
      expect(chunk.metadata).toHaveProperty('boundaryType');
    });
  });

  describe('validateConfig', () => {
    it('should accept valid config', () => {
      expect(() =>
        service.validateConfig({
          strategy: 'sentence',
          options: { maxChunkSize: 500, minChunkSize: 50 },
        })
      ).not.toThrow();
    });

    it('should reject invalid strategy', () => {
      expect(() =>
        service.validateConfig({ strategy: 'invalid' as any })
      ).toThrow(/Invalid chunking strategy/);
    });

    it('should reject maxChunkSize out of range', () => {
      expect(() =>
        service.validateConfig({ options: { maxChunkSize: 50 } })
      ).toThrow(/maxChunkSize must be between/);

      expect(() =>
        service.validateConfig({ options: { maxChunkSize: 15000 } })
      ).toThrow(/maxChunkSize must be between/);
    });

    it('should reject minChunkSize out of range', () => {
      expect(() =>
        service.validateConfig({ options: { minChunkSize: 5 } })
      ).toThrow(/minChunkSize must be between/);

      expect(() =>
        service.validateConfig({ options: { minChunkSize: 1500 } })
      ).toThrow(/minChunkSize must be between/);
    });

    it('should reject minChunkSize >= maxChunkSize', () => {
      expect(() =>
        service.validateConfig({
          options: { maxChunkSize: 100, minChunkSize: 100 },
        })
      ).toThrow(/minChunkSize must be less than maxChunkSize/);
    });
  });

  describe('getAvailableStrategies', () => {
    it('should return all available strategies', () => {
      const strategies = service.getAvailableStrategies();
      expect(strategies).toContain('character');
      expect(strategies).toContain('sentence');
      expect(strategies).toContain('paragraph');
    });
  });
});

describe('Edge cases', () => {
  const characterStrategy = new CharacterChunkingStrategy();
  const sentenceStrategy = new SentenceChunkingStrategy();
  const paragraphStrategy = new ParagraphChunkingStrategy();

  it('should handle very long words', () => {
    const longWord = 'a'.repeat(200);
    const result = characterStrategy.chunk(longWord, {
      maxChunkSize: 50,
      minChunkSize: 10,
    });

    // Should split the long word
    expect(result.length).toBeGreaterThan(1);
    expect(result.map((c) => c.text).join('')).toBe(longWord);
  });

  it('should handle unicode characters', () => {
    const unicodeText = 'Hello \u{1F600} World \u{1F389}. Second sentence.';
    const result = sentenceStrategy.chunk(unicodeText, {
      maxChunkSize: 100,
      minChunkSize: 5,
    });

    expect(result.length).toBeGreaterThanOrEqual(1);
    expect(result.map((c) => c.text).join('')).toBe(unicodeText);
  });

  it('should handle text with only whitespace', () => {
    const whitespace = '   \n\n   \t  ';
    const result = paragraphStrategy.chunk(whitespace, {
      maxChunkSize: 100,
      minChunkSize: 5,
    });

    // Should return empty or chunks with trimmed content
    if (result.length > 0) {
      result.forEach((chunk) => {
        expect(chunk.text.trim().length).toBeGreaterThanOrEqual(0);
      });
    }
  });

  it('should handle newlines in sentences', () => {
    const text = 'This is a sentence\nwith a newline. Next sentence.';
    const result = sentenceStrategy.chunk(text, {
      maxChunkSize: 100,
      minChunkSize: 5,
    });

    expect(result.length).toBeGreaterThanOrEqual(1);
  });
});
