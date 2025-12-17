import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import type { SearchResults, SearchResult } from 'duck-duck-scrape';

/**
 * Simple in-memory cache for search results
 * Helps avoid redundant requests and reduces rate limiting issues
 */
interface CacheEntry {
  result: string;
  timestamp: number;
}

const searchCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Simple rate limiter for DuckDuckGo requests
 * DuckDuckGo can rate limit aggressive scraping
 */
let lastRequestTime = 0;
const MIN_REQUEST_INTERVAL_MS = 2000; // 2 seconds between requests

/**
 * Get cached result if valid
 */
function getCachedResult(query: string): string | null {
  const cacheKey = query.toLowerCase().trim();
  const entry = searchCache.get(cacheKey);

  if (entry && Date.now() - entry.timestamp < CACHE_TTL_MS) {
    return entry.result;
  }

  // Clean up expired entry
  if (entry) {
    searchCache.delete(cacheKey);
  }

  return null;
}

/**
 * Cache a search result
 */
function cacheResult(query: string, result: string): void {
  const cacheKey = query.toLowerCase().trim();
  searchCache.set(cacheKey, {
    result,
    timestamp: Date.now(),
  });

  // Limit cache size to prevent memory bloat
  if (searchCache.size > 100) {
    // Remove oldest entries
    const entries = Array.from(searchCache.entries());
    entries.sort((a, b) => a[1].timestamp - b[1].timestamp);
    const toRemove = entries.slice(0, 20);
    toRemove.forEach(([key]) => searchCache.delete(key));
  }
}

/**
 * Wait for rate limit if needed
 */
async function waitForRateLimit(): Promise<void> {
  const now = Date.now();
  const timeSinceLastRequest = now - lastRequestTime;

  if (timeSinceLastRequest < MIN_REQUEST_INTERVAL_MS) {
    const waitTime = MIN_REQUEST_INTERVAL_MS - timeSinceLastRequest;
    await new Promise((resolve) => setTimeout(resolve, waitTime));
  }

  lastRequestTime = Date.now();
}

/**
 * Check if a query looks like a URL rather than a search query
 * This helps detect when users want to browse a specific page but forgot to use browse_url
 */
function looksLikeUrl(query: string): { isUrl: boolean; url?: string } {
  const trimmed = query.trim();

  // Obviously a URL if it has a protocol
  if (/^https?:\/\//i.test(trimmed)) {
    return { isUrl: true, url: trimmed };
  }

  // Check for common URL patterns without protocol
  // Matches: example.com, example.com/path, sub.example.co.uk, etc.
  const urlPattern =
    /^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}(?:\/\S*)?$/;
  if (urlPattern.test(trimmed)) {
    return { isUrl: true, url: `https://${trimmed}` };
  }

  // Check for "www." prefix
  if (trimmed.toLowerCase().startsWith('www.')) {
    return { isUrl: true, url: `https://${trimmed}` };
  }

  return { isUrl: false };
}

/**
 * Create a LangChain tool for searching the web using DuckDuckGo
 *
 * This tool enables the AI to search the internet for current information
 * that may not be available in the knowledge base.
 *
 * Features:
 * - No API key required - uses DuckDuckGo's free search
 * - Built-in rate limiting (2 seconds between requests)
 * - Result caching (5 minute TTL) to avoid redundant requests
 * - Automatic retry with exponential backoff
 *
 * @returns LangChain DynamicStructuredTool configured for web search
 */
export function createWebSearchTool() {
  return new DynamicStructuredTool({
    name: 'search_web',
    description: `Search the internet for current, up-to-date information.

This tool searches the web using DuckDuckGo to find relevant information
that may not be available in the knowledge base.

Use this when:
- The user asks about current events, news, or recent developments
- The user asks about information that changes frequently (stock prices, weather, etc.)
- The knowledge base search doesn't have relevant results
- The user explicitly asks to search the web or internet
- The user asks about external resources, documentation, or third-party tools

Examples of when to use this tool:
- "What are the latest updates to LangChain?"
- "What's the current best practice for React state management?"
- "Search the web for TypeScript 5.0 new features"
- "What does the official documentation say about..."
- "Find recent articles about AI agents"

DO NOT use this for:
- Questions about the user's own project or knowledge base (use search_knowledge_base instead)
- Historical information already in the knowledge base
- Reading a specific URL or webpage - use browse_url instead

IMPORTANT: If the user provides what looks like a URL (e.g., "google.pl", "example.com/page", "https://site.com"),
use the browse_url tool instead to read that specific page. This tool is for SEARCHING, not browsing specific pages.`,

    schema: z.object({
      query: z
        .string()
        .describe(
          'The search query to find information on the web. Be specific and include relevant keywords.'
        ),
      maxResults: z
        .number()
        .min(1)
        .max(10)
        .optional()
        .describe(
          'Maximum number of search results to return. Default is 5, max is 10.'
        ),
    }) as any,

    func: async (input: any): Promise<string> => {
      const { query, maxResults = 5 } = input;

      // Check if the query looks like a URL - if so, redirect to browse_url
      const urlCheck = looksLikeUrl(query);
      if (urlCheck.isUrl) {
        return JSON.stringify(
          {
            error: 'URL_DETECTED',
            message:
              'The query appears to be a URL, not a search query. Use the browse_url tool instead.',
            userMessage: `It looks like you want to read a specific webpage (${urlCheck.url}). Let me use the browse_url tool to fetch that page for you.`,
            detectedUrl: urlCheck.url,
            _instructions: {
              action: 'USE_BROWSE_URL',
              recommendation: `Call the browse_url tool with url="${urlCheck.url}" to read this page.`,
            },
          },
          null,
          2
        );
      }

      // Check cache first
      const cachedResult = getCachedResult(query);
      if (cachedResult) {
        // Add a note that this was cached
        const parsed = JSON.parse(cachedResult);
        parsed._cached = true;
        return JSON.stringify(parsed, null, 2);
      }

      // Retry logic with exponential backoff
      const maxRetries = 3;
      let lastError: Error | null = null;

      for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
          // Wait for rate limit
          await waitForRateLimit();

          // Dynamic import to handle the duck-duck-scrape package
          const duckDuckScrape = await import('duck-duck-scrape');

          const searchResults: SearchResults = await duckDuckScrape.search(
            query,
            {
              safeSearch: duckDuckScrape.SafeSearchType.OFF, // Let the AI handle content filtering
            }
          );

          // Check for no results
          if (searchResults.noResults) {
            const noResultsResponse = JSON.stringify(
              {
                query,
                total_results: 0,
                results: [],
                _instructions: {
                  fallback:
                    'No results were found for this query. Try rephrasing or using different keywords.',
                },
              },
              null,
              2
            );
            cacheResult(query, noResultsResponse);
            return noResultsResponse;
          }

          // Take only the requested number of results
          const results = searchResults.results.slice(
            0,
            Math.min(maxResults, 10)
          );

          // Format results for LLM consumption
          const formattedResults = results.map(
            (result: SearchResult, index: number) => ({
              position: index + 1,
              title: result.title || 'Untitled',
              url: result.url || '',
              snippet: result.description || '',
              hostname: result.hostname || '',
            })
          );

          // Return formatted JSON for LLM
          const toolResult = {
            query,
            total_results: formattedResults.length,
            results: formattedResults,

            // Instructions for the LLM
            _instructions: {
              citation:
                'When referencing web search results, cite the source URL or title',
              reliability:
                'Web results may not always be accurate - present information with appropriate caveats',
              freshness:
                'These results are from a live web search and reflect current information',
              urls: 'Include relevant URLs when they would be helpful to the user',
            },
          };

          const resultJson = JSON.stringify(toolResult, null, 2);
          cacheResult(query, resultJson);
          return resultJson;
        } catch (error) {
          lastError = error instanceof Error ? error : new Error(String(error));

          // Check if this is a rate limiting error (common with DuckDuckGo)
          const errorMessage = lastError.message.toLowerCase();
          const isRateLimited =
            errorMessage.includes('rate') ||
            errorMessage.includes('429') ||
            errorMessage.includes('too many') ||
            errorMessage.includes('blocked');

          if (isRateLimited && attempt < maxRetries - 1) {
            // Exponential backoff: 2s, 4s, 8s
            const backoffMs = Math.pow(2, attempt + 1) * 1000;
            await new Promise((resolve) => setTimeout(resolve, backoffMs));
            continue;
          }

          // If not rate limited or last attempt, break and return error
          break;
        }
      }

      // Return error information to LLM
      const errorMessage = lastError?.message || 'Unknown error';
      return JSON.stringify(
        {
          error: 'Web search failed',
          message: errorMessage,
          query,
          _instructions: {
            fallback:
              'The web search is temporarily unavailable. Inform the user and suggest they try again later, or provide information from your training data with appropriate caveats.',
            suggestion:
              'If this error persists, the search service may be rate limited. Wait a few minutes before trying again.',
          },
        },
        null,
        2
      );
    },
  });
}

/**
 * Clear the search cache (useful for testing)
 */
export function clearWebSearchCache(): void {
  searchCache.clear();
}

/**
 * Get cache statistics (useful for debugging)
 */
export function getWebSearchCacheStats(): {
  size: number;
  oldestEntryAge: number | null;
} {
  if (searchCache.size === 0) {
    return { size: 0, oldestEntryAge: null };
  }

  const now = Date.now();
  let oldestTimestamp = now;

  searchCache.forEach((entry) => {
    if (entry.timestamp < oldestTimestamp) {
      oldestTimestamp = entry.timestamp;
    }
  });

  return {
    size: searchCache.size,
    oldestEntryAge: now - oldestTimestamp,
  };
}
