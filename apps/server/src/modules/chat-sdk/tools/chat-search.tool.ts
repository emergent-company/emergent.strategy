import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { UnifiedSearchService } from '../../unified-search/unified-search.service';
import {
  UnifiedSearchResultType,
  UnifiedSearchFusionStrategy,
} from '../../unified-search/dto/unified-search-request.dto';

/**
 * Context for executing the search tool
 */
export interface SearchToolContext {
  orgId: string;
  projectId: string;
  scopes: string[];
}

/**
 * Create a LangChain tool for searching the knowledge base
 *
 * This tool enables the AI to search both:
 * - Knowledge graph objects (concepts, decisions, entities, etc.)
 * - Document chunks (text content from uploaded documents)
 *
 * The tool uses the unified search service which combines graph and text search
 * with hybrid ranking (vector + lexical) and result fusion.
 *
 * @param searchService - The unified search service instance
 * @param context - Tenant context (org, project, scopes)
 * @returns LangChain DynamicStructuredTool configured for knowledge base search
 */
export function createChatSearchTool(
  searchService: UnifiedSearchService,
  context: SearchToolContext
) {
  return new DynamicStructuredTool({
    name: 'search_knowledge_base',
    description: `Search the knowledge base for relevant information. 

This tool searches both:
- Knowledge graph objects (concepts, entities, decisions, requirements, etc.)
- Document chunks (text content from uploaded documents)

Use this when the user asks about:
- Specific concepts, entities, or decisions in the knowledge base
- Technical documentation or architecture details
- Historical context or previous discussions
- Any information that might be stored in the system
- Relationships between different concepts or entities

Examples of when to use this tool:
- "What decisions have we made about authentication?"
- "Tell me about the API architecture"  
- "What are the requirements for the user profile feature?"
- "How does the graph search work?"`,

    schema: z.object({
      query: z.string(),
      limit: z.number().optional(),
      includeGraph: z.boolean().optional(),
      includeText: z.boolean().optional(),
    }) as any,

    func: async (input: any): Promise<string> => {
      const {
        query,
        limit = 5,
        includeGraph = true,
        includeText = true,
      } = input;
      // Validate and cap limit
      const cappedLimit = Math.max(1, Math.min(limit, 10));

      // Determine result types based on flags
      let resultTypes: UnifiedSearchResultType = UnifiedSearchResultType.BOTH;
      if (includeGraph && !includeText) {
        resultTypes = UnifiedSearchResultType.GRAPH;
      } else if (!includeGraph && includeText) {
        resultTypes = UnifiedSearchResultType.TEXT;
      }

      try {
        // Execute unified search
        const response = await searchService.search(
          {
            query,
            limit: cappedLimit,
            resultTypes,
            fusionStrategy: UnifiedSearchFusionStrategy.RRF, // RRF (Reciprocal Rank Fusion) works well for diverse results
            weights: { graphWeight: 0.6, textWeight: 0.4 }, // Slight preference for graph objects
            relationshipOptions: {
              enabled: true,
              maxDepth: 1, // Only immediate relationships
              direction: 'both',
              maxNeighbors: 3, // Limit to 3 most relevant relationships per node
            },
            includeDebug: false,
          },
          context
        );

        // Format results for LLM consumption
        const formattedResults = response.results.map((result) => {
          if (result.type === 'graph') {
            // Access fields from the graph result
            const name =
              (result.fields.name as string) ||
              (result.fields.title as string) ||
              result.key;
            const description = result.fields.description as string;

            return {
              type: 'graph_object',
              id: result.object_id, // Include system UUID
              object_type: result.object_type,
              key: result.key,
              name,
              snippet: description || 'No description available',
              score: Math.round(result.score * 100) / 100,
              relationships: result.relationships?.map((rel) => ({
                relationship_type: rel.type,
                target_key: rel.related_object_key,
                target_name: rel.related_object_key, // Use key as fallback for name
                target_type: rel.related_object_type,
              })),
            };
          } else {
            return {
              type: 'document_chunk',
              text: result.snippet,
              source: result.source,
              score: Math.round(result.score * 100) / 100,
            };
          }
        });

        // Return formatted JSON for LLM
        const toolResult = {
          query,
          total_results: response.metadata.totalResults,
          graph_count: response.metadata.graphResultCount,
          text_count: response.metadata.textResultCount,
          results: formattedResults,
          execution_time_ms: response.metadata.executionTime.totalMs,

          // Instructions for the LLM
          _instructions: {
            citation:
              'When referencing graph objects in your text, ALWAYS use the "key" or "name" with this format: @[key] or [[key|name]]. NEVER use the UUID in the text.',
            relationships:
              'Relationships show how concepts connect - mention these when relevant',
            identifiers:
              'The "id" field (UUID) is ONLY for passing to tools like query_graph_objects(related_to_id=UUID). Do NOT display UUIDs to the user.',
            scores:
              'Higher scores (closer to 1.0) indicate more relevant results',
          },
        };

        return JSON.stringify(toolResult, null, 2);
      } catch (error) {
        // Return error information to LLM
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        return JSON.stringify(
          {
            error: 'Search failed',
            message: errorMessage,
            query,
            _instructions: {
              fallback:
                'Inform the user that the search failed and ask them to try rephrasing their question',
            },
          },
          null,
          2
        );
      }
    },
  });
}
