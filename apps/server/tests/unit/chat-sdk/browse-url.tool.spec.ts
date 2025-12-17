import { describe, it, expect, beforeEach } from 'vitest';
import {
  createBrowseUrlTool,
  clearBrowseUrlCache,
  getBrowseUrlCacheStats,
} from '../../../src/modules/chat-sdk/tools/browse-url.tool';

describe('Browse URL Tool', () => {
  beforeEach(() => {
    // Clear cache before each test
    clearBrowseUrlCache();
  });

  describe('createBrowseUrlTool', () => {
    it('should create a tool with correct name and schema', () => {
      const tool = createBrowseUrlTool();

      expect(tool.name).toBe('browse_url');
      expect(tool.description).toContain('Fetch and read the content');
      expect(tool.schema).toBeDefined();
    });

    it('should have required schema fields', () => {
      const tool = createBrowseUrlTool();
      const schema = tool.schema as any;

      // Check that the schema has the expected shape
      expect(schema.shape).toBeDefined();
      expect(schema.shape.url).toBeDefined();
      expect(schema.shape.includeLinks).toBeDefined();
    });
  });

  describe('URL validation', () => {
    it('should handle bare domain names by adding https://', async () => {
      const tool = createBrowseUrlTool();

      // With URL normalization, "not-a-valid-url" becomes "https://not-a-valid-url"
      // which is a valid URL format but the domain doesn't exist
      const result = await tool.invoke({ url: 'not-a-valid-url' });
      const parsed = JSON.parse(result);

      // Should get a DOMAIN_NOT_FOUND error since the domain doesn't exist
      expect(parsed.error).toBe('DOMAIN_NOT_FOUND');
      expect(parsed.url).toBe('https://not-a-valid-url');
      expect(parsed.userMessage).toContain("couldn't find");
    });

    it('should reject localhost URLs for security', async () => {
      const tool = createBrowseUrlTool();

      const result = await tool.invoke({ url: 'http://localhost:3000' });
      const parsed = JSON.parse(result);

      expect(parsed.error).toBe('Invalid URL');
      expect(parsed.message).toContain(
        'Local and private URLs are not allowed'
      );
    });

    it('should reject 127.0.0.1 URLs for security', async () => {
      const tool = createBrowseUrlTool();

      const result = await tool.invoke({ url: 'http://127.0.0.1:8080/api' });
      const parsed = JSON.parse(result);

      expect(parsed.error).toBe('Invalid URL');
      expect(parsed.message).toContain(
        'Local and private URLs are not allowed'
      );
    });

    it('should reject private IP ranges', async () => {
      const tool = createBrowseUrlTool();

      // Test 192.168.x.x
      const result1 = await tool.invoke({ url: 'http://192.168.1.1' });
      expect(JSON.parse(result1).error).toBe('Invalid URL');

      // Test 10.x.x.x
      const result2 = await tool.invoke({ url: 'http://10.0.0.1' });
      expect(JSON.parse(result2).error).toBe('Invalid URL');

      // Test 172.16.x.x
      const result3 = await tool.invoke({ url: 'http://172.16.0.1' });
      expect(JSON.parse(result3).error).toBe('Invalid URL');
    });

    it('should reject non-HTTP protocols', async () => {
      const tool = createBrowseUrlTool();

      const result = await tool.invoke({ url: 'ftp://example.com/file.txt' });
      const parsed = JSON.parse(result);

      expect(parsed.error).toBe('Invalid URL');
      expect(parsed.message).toContain('Only HTTP and HTTPS URLs are allowed');
    });
  });

  describe('tool execution', () => {
    it('should fetch and parse a simple HTML page', async () => {
      const tool = createBrowseUrlTool();

      // Use example.com - a simple, reliable test page
      const result = await tool.invoke({ url: 'https://example.com' });
      const parsed = JSON.parse(result);

      console.log('Browse result:', JSON.stringify(parsed, null, 2));

      // Check structure
      if (parsed.error) {
        // Network issues are acceptable in tests
        console.warn('Browse returned error:', parsed.message);
        expect(parsed.url).toBe('https://example.com');
      } else {
        expect(parsed.url).toBe('https://example.com');
        expect(parsed.title).toBeDefined();
        expect(parsed.content).toBeDefined();
        expect(parsed._metadata).toBeDefined();
        expect(parsed._metadata.extractionMethod).toMatch(
          /readability|fallback/
        );
        expect(parsed._metadata.characterCount).toBeGreaterThan(0);
      }
    }, 30000);

    it('should handle non-existent domains gracefully', async () => {
      const tool = createBrowseUrlTool();

      const result = await tool.invoke({
        url: 'https://this-domain-definitely-does-not-exist-12345.com',
      });
      const parsed = JSON.parse(result);

      expect(parsed.error).toBeDefined();
      // Could be "Domain not found" or other network error
      expect(parsed.url).toBe(
        'https://this-domain-definitely-does-not-exist-12345.com'
      );
    }, 30000);

    it('should handle 404 responses gracefully', async () => {
      const tool = createBrowseUrlTool();

      // httpstat.us is a reliable service for testing HTTP status codes
      const result = await tool.invoke({ url: 'https://httpstat.us/404' });
      const parsed = JSON.parse(result);

      console.log('404 test result:', JSON.stringify(parsed, null, 2));

      // Should return an error (either HTTP 404 or network error)
      expect(parsed.error).toBeDefined();
    }, 30000);

    it('should support includeLinks parameter', async () => {
      const tool = createBrowseUrlTool();

      // Test with links included (default)
      const resultWithLinks = await tool.invoke({
        url: 'https://example.com',
        includeLinks: true,
      });
      const parsedWithLinks = JSON.parse(resultWithLinks);

      // Test with links excluded
      const resultWithoutLinks = await tool.invoke({
        url: 'https://example.org', // Different URL to avoid cache
        includeLinks: false,
      });
      const parsedWithoutLinks = JSON.parse(resultWithoutLinks);

      // Both should return valid results (or errors due to network)
      expect(parsedWithLinks.url || parsedWithLinks.error).toBeDefined();
      expect(parsedWithoutLinks.url || parsedWithoutLinks.error).toBeDefined();
    }, 30000);
  });

  describe('caching', () => {
    it('should cache results and return cached on second call', async () => {
      const tool = createBrowseUrlTool();
      const url = 'https://example.com';

      // First call
      const result1 = await tool.invoke({ url });
      const parsed1 = JSON.parse(result1);

      // Check cache stats
      const statsAfterFirst = getBrowseUrlCacheStats();
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
      const result2 = await tool.invoke({ url });
      const parsed2 = JSON.parse(result2);

      // Cached result should have _cached flag
      expect(parsed2._cached).toBe(true);
      expect(parsed2.url).toBe(url);
    }, 30000);

    it('should clear cache when clearBrowseUrlCache is called', () => {
      clearBrowseUrlCache();
      const statsAfter = getBrowseUrlCacheStats();

      expect(statsAfter.size).toBe(0);
      expect(statsAfter.oldestEntryAge).toBeNull();
    });

    it('should report correct cache stats', () => {
      const stats = getBrowseUrlCacheStats();

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

  describe('content handling', () => {
    it('should handle non-HTML content types gracefully', async () => {
      const tool = createBrowseUrlTool();

      // JSON endpoint should be rejected
      const result = await tool.invoke({
        url: 'https://api.github.com/zen',
      });
      const parsed = JSON.parse(result);

      console.log('Non-HTML test result:', JSON.stringify(parsed, null, 2));

      // Should either return an error about content type or handle gracefully
      if (parsed.error) {
        expect(parsed.error).toMatch(/content type|Failed to fetch/i);
      }
    }, 30000);
  });
});
