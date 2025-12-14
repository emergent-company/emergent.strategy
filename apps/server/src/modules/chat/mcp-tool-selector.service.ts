import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { DatabaseService } from '../../common/database/database.service';
import { ChatVertexAI } from '@langchain/google-vertexai';
import { AppConfigService } from '../../common/config/config.service';

/**
 * Tool Selection Result from LLM
 */
export interface ToolSelectionResult {
  shouldUseMcp: boolean;
  detectedIntent: string;
  confidence: number;
  suggestedTool?: string;
  suggestedArguments?: Record<string, any>;
  reasoning?: string;
}

/**
 * Available Entity Type Information
 */
interface EntityTypeInfo {
  name: string;
  description: string;
  count: number;
}

/**
 * MCP Tool Selector Service (LLM-Based)
 *
 * Uses LLM to intelligently detect user intent and select appropriate MCP tools.
 * This is more flexible than pattern matching and can understand natural language variations.
 *
 * **Advantages over Pattern Matching:**
 * - Handles diverse phrasing ("show me decisions" vs "what decisions do we have" vs "list the last 5 decisions")
 * - Understands context and entity types dynamically
 * - Can reason about which tool best fits user's needs
 * - Reduces maintenance of keyword lists
 *
 * **Flow:**
 * 1. Query available entity types from database
 * 2. Build prompt with user message + available types + tool descriptions
 * 3. Ask LLM to select tool and extract parameters
 * 4. Parse structured JSON response
 * 5. Return tool selection result
 *
 * Migrated to TypeORM - uses DataSource.query for GROUP BY aggregation
 *
 * @example
 * ```typescript
 * const result = await selector.selectTool("show me the last 5 decisions", orgId, projectId);
 * // → { shouldUseMcp: true, detectedIntent: 'entity-query', suggestedTool: 'query_entities',
 * //     suggestedArguments: { type_name: 'Decision', limit: 5 } }
 * ```
 */
@Injectable()
export class McpToolSelectorService {
  private readonly logger = new Logger(McpToolSelectorService.name);
  private readonly llm: ChatVertexAI;

  constructor(
    private readonly db: DatabaseService,
    private readonly config: AppConfigService,
    private readonly dataSource: DataSource
  ) {
    // Initialize lightweight LLM for fast tool selection
    // NOTE: We explicitly set apiKey to undefined to prevent LangChain from
    // using GOOGLE_API_KEY env var. Vertex AI requires OAuth (ADC), not API keys.
    this.llm = new ChatVertexAI({
      model: this.config.vertexAiModel || 'gemini-1.5-flash-002',
      apiKey: '', // Empty string bypasses GOOGLE_API_KEY env var, forces ADC auth
      temperature: 0.1, // Low temperature for consistent tool selection
      maxOutputTokens: 500, // Small response needed
    });
  }

  /**
   * Select MCP tool using LLM analysis
   *
   * @param userMessage - User's natural language message
   * @param orgId - Organization ID for context
   * @param projectId - Project ID for context
   * @returns Tool selection result with suggested tool and parameters
   */
  async selectTool(
    userMessage: string,
    orgId: string,
    projectId: string
  ): Promise<ToolSelectionResult> {
    try {
      this.logger.debug(
        `Selecting MCP tool for message: "${userMessage.substring(0, 50)}..."`
      );

      // Step 1: Get available entity types from database
      const entityTypes = await this.getAvailableEntityTypes(orgId, projectId);

      // Step 2: Build tool selection prompt
      const prompt = this.buildToolSelectionPrompt(userMessage, entityTypes);

      // Step 3: Call LLM for tool selection
      const response = await this.llm.invoke(prompt);
      const content = response.content.toString();

      // Step 4: Parse JSON response
      const selection = this.parseToolSelection(content);

      this.logger.debug(
        `LLM selected tool: ${selection.suggestedTool || 'none'} ` +
          `(intent: ${selection.detectedIntent}, confidence: ${selection.confidence})`
      );

      return selection;
    } catch (error) {
      const err = error as Error;
      this.logger.error(`LLM tool selection failed: ${err.message}`, err.stack);

      // Return no-tool selection on error (fallback to pattern matcher)
      return {
        shouldUseMcp: false,
        detectedIntent: 'none',
        confidence: 0.0,
      };
    }
  }

  /**
   * Get available entity types with counts from database
   * Migrated to TypeORM DataSource.query - uses GROUP BY aggregation
   *
   * @param orgId - Organization ID
   * @param projectId - Project ID
   * @returns Array of entity type information
   */
  private async getAvailableEntityTypes(
    orgId: string,
    projectId: string
  ): Promise<EntityTypeInfo[]> {
    try {
      const types = await this.db.runWithTenantContext(projectId, async () => {
        const result = await this.dataSource.query(`
                    SELECT 
                        tr.type_name as name,
                        tr.description,
                        COUNT(go.id) as instance_count
                    FROM kb.project_object_type_registry tr
                    LEFT JOIN kb.graph_objects go ON go.type = tr.type_name AND go.deleted_at IS NULL
                    WHERE tr.enabled = true
                    GROUP BY tr.type_name, tr.description
                    ORDER BY tr.type_name
                `);
        return result;
      });

      return types.map((t: any) => ({
        name: t.name,
        description: t.description || 'No description',
        count: parseInt(t.instance_count, 10),
      }));
    } catch (error) {
      const err = error as Error;
      this.logger.warn(`Failed to fetch entity types: ${err.message}`);
      return [];
    }
  }

  /**
   * Build prompt for LLM tool selection
   *
   * @param userMessage - User's message
   * @param entityTypes - Available entity types
   * @returns Formatted prompt string
   */
  private buildToolSelectionPrompt(
    userMessage: string,
    entityTypes: EntityTypeInfo[]
  ): string {
    const entityTypesList =
      entityTypes.length > 0
        ? entityTypes
            .map(
              (t) =>
                `  - **${t.name}** (${t.count} instances): ${t.description}`
            )
            .join('\n')
        : '  (No entity types configured yet)';

    return `You are a tool selection assistant for a knowledge graph system. Your job is to analyze user messages and determine which tool (if any) should be used to answer their question.

**User Message:**
"${userMessage}"

**Available Entity Types in Knowledge Graph:**
${entityTypesList}

**Available MCP Tools:**

1. **list_entity_types** - List all available entity types with counts
   - Use when: User asks "what entities exist?", "what can I query?", "what data types are available?"
   - Parameters: None
   - Example: "What entities can I query?"

2. **query_entities** - Query instances of a specific entity type
   - Use when: User asks for specific entities (e.g., "show decisions", "list projects", "last 5 tasks")
   - Parameters:
     - type_name (required): Entity type name (e.g., "Decision", "Project")
     - limit (optional, default 10, max 50): Number of results
     - sort_by (optional, default "created_at"): Sort field (created_at, updated_at, name)
     - sort_order (optional, default "desc"): Sort direction (asc, desc)
   - Example: "Show me the last 5 decisions"

3. **schema_version** - Get current schema version and metadata
   - Use when: User asks about schema version, current state, or metadata
   - Parameters: None
   - Example: "What's the current schema version?"

4. **schema_changelog** - Get recent schema changes
   - Use when: User asks about schema changes, updates, or history
   - Parameters:
     - since (optional): Date to show changes from
     - limit (optional, default 10): Number of changes
   - Example: "What changed in the schema recently?"

5. **type_info** - Get detailed information about a specific entity type
   - Use when: User asks about a specific type's structure or properties
   - Parameters:
     - type_name (required): Entity type name
   - Example: "What is the Decision entity?"

**Your Task:**
Analyze the user message and respond with a JSON object containing:

\`\`\`json
{
  "shouldUseMcp": boolean,  // true if any tool should be used, false otherwise
  "detectedIntent": string,  // "entity-query" | "entity-list" | "schema-version" | "schema-changes" | "type-info" | "none"
  "confidence": number,  // 0.0 to 1.0 confidence score
  "suggestedTool": string,  // Tool name or null if shouldUseMcp is false
  "suggestedArguments": object,  // Tool parameters or empty object
  "reasoning": string  // Brief explanation of your decision (1 sentence)
}
\`\`\`

**Important Rules:**
1. If the user is asking about entities that exist in the available entity types list, use "query_entities"
2. Extract entity type name from message and match it to available types (be flexible with plural/singular)
3. Extract numbers for "limit" parameter (e.g., "last 5 decisions" → limit: 5)
4. Use "recent", "latest", "last" to set sort_order: "desc" and sort_by: "created_at"
5. If user asks about data types or what's available, use "list_entity_types"
6. If no tool is appropriate, set shouldUseMcp: false and detectedIntent: "none"
7. Be confident (0.8+) only if there's a clear match to available entity types or schema questions

**Respond with ONLY the JSON object, no other text.**`;
  }

  /**
   * Parse LLM response to extract tool selection
   *
   * @param content - LLM response content
   * @returns Parsed tool selection result
   */
  private parseToolSelection(content: string): ToolSelectionResult {
    try {
      // Extract JSON from response (might be wrapped in ```json blocks)
      const jsonMatch =
        content.match(/```json\s*\n?(.*?)\n?```/s) ||
        content.match(/\{[\s\S]*\}/);

      if (!jsonMatch) {
        throw new Error('No JSON found in LLM response');
      }

      const jsonStr = jsonMatch[1] || jsonMatch[0];
      const parsed = JSON.parse(jsonStr);

      // Validate required fields
      if (
        typeof parsed.shouldUseMcp !== 'boolean' ||
        typeof parsed.detectedIntent !== 'string' ||
        typeof parsed.confidence !== 'number'
      ) {
        throw new Error('Invalid JSON structure in LLM response');
      }

      return {
        shouldUseMcp: parsed.shouldUseMcp,
        detectedIntent: parsed.detectedIntent,
        confidence: parsed.confidence,
        suggestedTool: parsed.suggestedTool || undefined,
        suggestedArguments: parsed.suggestedArguments || {},
        reasoning: parsed.reasoning || undefined,
      };
    } catch (error) {
      const err = error as Error;
      this.logger.error(`Failed to parse LLM tool selection: ${err.message}`);
      this.logger.debug(`Raw LLM response: ${content}`);

      // Return no-tool selection on parse error
      return {
        shouldUseMcp: false,
        detectedIntent: 'none',
        confidence: 0.0,
      };
    }
  }
}
