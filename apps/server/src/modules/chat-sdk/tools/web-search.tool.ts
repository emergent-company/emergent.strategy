import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import type { SearchResults, SearchResult } from 'duck-duck-scrape';

/**
 * Create a LangChain tool for searching the web using DuckDuckGo
 *
 * This tool enables the AI to search the internet for current information
 * that may not be available in the knowledge base.
 *
 * No API key required - uses DuckDuckGo's free search.
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
- Historical information already in the knowledge base`,

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

      try {
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
          return JSON.stringify(
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

        return JSON.stringify(toolResult, null, 2);
      } catch (error) {
        // Return error information to LLM
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        return JSON.stringify(
          {
            error: 'Web search failed',
            message: errorMessage,
            query,
            _instructions: {
              fallback:
                'Inform the user that the web search failed. You may try rephrasing the query or suggest alternative approaches.',
            },
          },
          null,
          2
        );
      }
    },
  });
}
