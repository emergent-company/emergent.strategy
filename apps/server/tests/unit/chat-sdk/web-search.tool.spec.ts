import { describe, it, expect, beforeEach } from 'vitest';
import {
  createWebSearchTool,
  clearWebSearchCache,
  getWebSearchCacheStats,
} from '../../../src/modules/chat-sdk/tools/web-search.tool';

describe('Web Search Tool', () => {
  beforeEach(() => {
    // Clear cache before each test
    clearWebSearchCache();
  });

  describe('createWebSearchTool', () => {
    it('should create a tool with correct name and schema', () => {
      const tool = createWebSearchTool();

      expect(tool.name).toBe('search_web');
      expect(tool.description).toContain('Search the internet');
      expect(tool.schema).toBeDefined();
    });

    it('should have required schema fields', () => {
      const tool = createWebSearchTool();
      const schema = tool.schema as any;

      // Check that the schema has the expected shape
      expect(schema.shape).toBeDefined();
      expect(schema.shape.query).toBeDefined();
      expect(schema.shape.maxResults).toBeDefined();
    });
  });

  describe('tool execution', () => {
    it('should execute a simple search query', async () => {
      const tool = createWebSearchTool();

      // Execute a simple, common search that should return results
      const result = await tool.invoke({
        query: 'TypeScript programming language',
        maxResults: 3,
      });

      // Parse the result
      const parsed = JSON.parse(result);

      console.log('Search result:', JSON.stringify(parsed, null, 2));

      // Check structure - either we get results or an error
      if (parsed.error) {
        // If there's an error, it should have the expected structure
        console.warn('Search returned error:', parsed.message);
        expect(parsed._instructions).toBeDefined();
        expect(parsed._instructions.fallback).toBeDefined();
      } else {
        // If successful, check the result structure
        expect(parsed.query).toBe('TypeScript programming language');
        expect(parsed.total_results).toBeGreaterThanOrEqual(0);
        expect(Array.isArray(parsed.results)).toBe(true);
        expect(parsed._instructions).toBeDefined();

        if (parsed.results.length > 0) {
          const firstResult = parsed.results[0];
          expect(firstResult.position).toBe(1);
          expect(firstResult.title).toBeDefined();
          expect(firstResult.url).toBeDefined();
        }
      }
    }, 30000); // 30 second timeout for network request

    it('should cache results and return cached on second call', async () => {
      const tool = createWebSearchTool();
      const query = 'JavaScript frameworks 2024';

      // First call
      const result1 = await tool.invoke({ query, maxResults: 2 });
      const parsed1 = JSON.parse(result1);

      // Check cache stats
      const statsAfterFirst = getWebSearchCacheStats();
      console.log('Cache stats after first call:', statsAfterFirst);

      // Skip cache test if first call failed
      if (parsed1.error) {
        console.warn(
          'Skipping cache test - first call failed:',
          parsed1.message
        );
        return;
      }

      expect(statsAfterFirst.size).toBe(1);

      // Second call - should be cached
      const result2 = await tool.invoke({ query, maxResults: 2 });
      const parsed2 = JSON.parse(result2);

      // Cached result should have _cached flag
      expect(parsed2._cached).toBe(true);
      expect(parsed2.query).toBe(query);
    }, 30000);

    it('should handle empty/no results gracefully', async () => {
      const tool = createWebSearchTool();

      // Use a very specific nonsense query unlikely to have results
      const result = await tool.invoke({
        query: 'xyzzy123foobarbaz456quxquux789',
        maxResults: 3,
      });

      const parsed = JSON.parse(result);
      console.log('No-results test:', JSON.stringify(parsed, null, 2));

      // Should either have empty results or an error - both are valid
      if (!parsed.error) {
        expect(parsed.total_results).toBeDefined();
        expect(Array.isArray(parsed.results)).toBe(true);
      }
    }, 30000);
  });

  describe('cache management', () => {
    it('should clear cache when clearWebSearchCache is called', () => {
      clearWebSearchCache();
      const statsAfter = getWebSearchCacheStats();

      expect(statsAfter.size).toBe(0);
      expect(statsAfter.oldestEntryAge).toBeNull();
    });

    it('should report correct cache stats', () => {
      const stats = getWebSearchCacheStats();

      expect(typeof stats.size).toBe('number');
      expect(stats.size).toBeGreaterThanOrEqual(0);
      // oldestEntryAge is null when cache is empty, number otherwise
      if (stats.size === 0) {
        expect(stats.oldestEntryAge).toBeNull();
      } else {
        expect(typeof stats.oldestEntryAge).toBe('number');
      }
    });
  });

  describe('URL detection', () => {
    it('should detect URLs and recommend browse_url tool', async () => {
      const tool = createWebSearchTool();

      // Test with a bare domain
      const result = await tool.invoke({ query: 'google.pl' });
      const parsed = JSON.parse(result);

      expect(parsed.error).toBe('URL_DETECTED');
      expect(parsed.detectedUrl).toBe('https://google.pl');
      expect(parsed.userMessage).toContain('browse_url');
      expect(parsed._instructions.action).toBe('USE_BROWSE_URL');
    });

    it('should detect URLs with https:// prefix', async () => {
      const tool = createWebSearchTool();

      const result = await tool.invoke({
        query: 'https://example.com/page',
      });
      const parsed = JSON.parse(result);

      expect(parsed.error).toBe('URL_DETECTED');
      expect(parsed.detectedUrl).toBe('https://example.com/page');
    });

    it('should detect URLs with www prefix', async () => {
      const tool = createWebSearchTool();

      const result = await tool.invoke({ query: 'www.example.com' });
      const parsed = JSON.parse(result);

      expect(parsed.error).toBe('URL_DETECTED');
      expect(parsed.detectedUrl).toBe('https://www.example.com');
    });

    it('should not detect regular search queries as URLs', async () => {
      const tool = createWebSearchTool();

      // These should NOT be detected as URLs
      const result = await tool.invoke({
        query: 'how to use google search',
      });
      const parsed = JSON.parse(result);

      // Should either return search results or a rate limit error, but NOT URL_DETECTED
      expect(parsed.error).not.toBe('URL_DETECTED');
    }, 30000);
  });
});
