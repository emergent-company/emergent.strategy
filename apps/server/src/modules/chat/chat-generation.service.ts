import { Injectable, Logger } from '@nestjs/common';
import { AppConfigService } from '../../common/config/config.service';
import { ChatVertexAI } from '@langchain/google-vertexai';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { ProjectsService } from '../projects/projects.service';

// NOTE: We reuse embeddings client initialization trick for simplicity; for a full model we'd use a proper text generation client.
// For now emulate streaming by splitting the single model response into tokens.

/**
 * Default prompt template used when no custom template is set for the project.
 * Supports placeholders: {{SYSTEM_PROMPT}}, {{MCP_CONTEXT}}, {{GRAPH_CONTEXT}}, {{MESSAGE}}, {{MARKDOWN_RULES}}
 */
const DEFAULT_PROMPT_TEMPLATE = `{{SYSTEM_PROMPT}}

{{MCP_CONTEXT}}

{{GRAPH_CONTEXT}}

## User Question

{{MESSAGE}}

{{MARKDOWN_RULES}}`;

/**
 * Options for building prompts with optional MCP tool context
 */
export interface PromptBuildOptions {
  /** The user's question or message */
  message: string;
  /** Optional context from MCP tool execution (e.g., schema data) */
  mcpToolContext?: string;
  /** Optional context from graph search (relevant objects and neighbors) */
  graphContext?: string;
  /** Optional detected intent for specialized prompt templates */
  detectedIntent?:
    | 'schema-version'
    | 'schema-changes'
    | 'type-info'
    | 'entity-query'
    | 'entity-list'
    | 'general';
  /** Optional list of available entity types with counts */
  availableEntityTypes?: Array<{
    name: string;
    description: string;
    count: number;
  }>;
  /** Optional project ID to fetch custom prompt template */
  projectId?: string;
}

@Injectable()
export class ChatGenerationService {
  private readonly logger = new Logger(ChatGenerationService.name);
  constructor(
    private readonly config: AppConfigService,
    private readonly projectsService: ProjectsService
  ) {}

  get enabled(): boolean {
    return this.config.chatModelEnabled;
  }

  /**
   * Check if we have authentication configured for the chat model.
   * Uses Vertex AI project credentials.
   */
  get hasKey(): boolean {
    return !!this.config.vertexAiProjectId;
  }

  /**
   * Build a well-structured prompt for the LLM based on the query type and available context.
   * This method creates specialized prompts for different schema query types.
   *
   * If a projectId is provided, attempts to fetch custom prompt template from project settings.
   * Falls back to default template if no custom template is configured.
   *
   * @param options - Options containing message, MCP context, detected intent, and optional projectId
   * @returns Formatted prompt string ready for LLM generation
   */
  async buildPrompt(options: PromptBuildOptions): Promise<string> {
    const { message, mcpToolContext, graphContext, detectedIntent, projectId } =
      options;

    // Fetch custom template if projectId provided
    let template = DEFAULT_PROMPT_TEMPLATE;
    if (projectId) {
      const project = await this.projectsService.getById(projectId);
      if (project?.chat_prompt_template) {
        template = project.chat_prompt_template;
        this.logger.debug(
          `Using custom prompt template for project ${projectId}`
        );
      }
    }

    // Build system prompt with intent-specific instructions
    let systemPrompt =
      this.config.chatSystemPrompt ||
      'You are a helpful assistant specialized in knowledge graphs and data schemas. IMPORTANT: Always respond using proper markdown formatting.';

    // Replace template variables in custom prompt
    if (this.config.chatSystemPrompt && detectedIntent) {
      systemPrompt = systemPrompt.replace('{detectedIntent}', detectedIntent);
    }

    // Add intent-specific instructions
    switch (detectedIntent) {
      case 'schema-version':
        systemPrompt +=
          ' When answering questions about schema versions, provide clear version information and explain what it means. Use markdown headings, bold text, and lists.';
        break;
      case 'schema-changes':
        systemPrompt +=
          ' When describing schema changes, organize them chronologically using markdown headings (###) and bullet points (-). Highlight important modifications with **bold text**.';
        break;
      case 'type-info':
        systemPrompt +=
          ' When explaining entity types, use markdown headings (###) for the type name, bullet lists (-) for properties and relationships.';
        break;
      case 'entity-list':
        systemPrompt +=
          ' When listing available entity types, use numbered lists (1., 2., 3.) and **bold** for type names.';
        break;
      case 'entity-query':
        systemPrompt +=
          ' When presenting entity query results, respond with a brief introduction and then format each entity as a structured object reference using this EXACT format:\n\n';
        systemPrompt += '```object-ref\n';
        systemPrompt += '{\n';
        systemPrompt += '  "id": "entity-uuid-here",\n';
        systemPrompt += '  "type": "EntityType",\n';
        systemPrompt += '  "name": "Display Name",\n';
        systemPrompt +=
          '  "summary": "Brief one-line description or key detail"\n';
        systemPrompt += '}\n';
        systemPrompt += '```\n\n';
        systemPrompt +=
          'Use one ```object-ref block per entity. The summary should be the most important detail from the entity properties (e.g., status, date, key attribute). Do NOT include full property lists - the user will click to see details.';
        break;
      default:
        systemPrompt +=
          ' Answer questions clearly using markdown formatting: headings (# ## ###), lists (- or 1.), **bold**, `code`, etc.';
    }

    // Build MCP context section
    let mcpContextSection = '';
    if (mcpToolContext && mcpToolContext.trim()) {
      mcpContextSection =
        '## Context from Schema\n\n' +
        this.formatToolContext(mcpToolContext, detectedIntent);
    }

    // Build graph context section
    let graphContextSection = '';
    if (graphContext && graphContext.trim()) {
      graphContextSection =
        '## Context from Knowledge Graph\n\n' + graphContext;
    }

    // Build markdown rules section
    const markdownRules = `## Your Response

Provide a helpful, accurate answer based on the context above. Use proper markdown formatting:
- Use ### for headings
- Use - or * for unordered lists (with space after)
- Use 1. 2. 3. for ordered lists
- Use **text** for bold
- Use \`code\` for inline code
- Use proper blank lines between sections

Your markdown formatted answer:`;

    // Replace placeholders in template
    let prompt = template
      .replace(/\{\{SYSTEM_PROMPT\}\}/g, systemPrompt)
      .replace(/\{\{MCP_CONTEXT\}\}/g, mcpContextSection)
      .replace(/\{\{GRAPH_CONTEXT\}\}/g, graphContextSection)
      .replace(/\{\{MESSAGE\}\}/g, message)
      .replace(/\{\{MARKDOWN_RULES\}\}/g, markdownRules);

    // Clean up any double newlines that might have been introduced
    prompt = prompt.replace(/\n{3,}/g, '\n\n');

    return prompt;
  }

  /**
   * Format MCP tool context for better readability and structure.
   * Different formatting based on the query type.
   *
   * @param context - Raw context from MCP tool
   * @param intent - Detected query intent
   * @returns Formatted context string
   */
  private formatToolContext(context: string, intent?: string): string {
    // If context looks like JSON, try to parse and format it
    if (context.trim().startsWith('{') || context.trim().startsWith('[')) {
      try {
        const parsed = JSON.parse(context);
        return this.formatJsonContext(parsed, intent);
      } catch {
        // Not valid JSON, return as-is
        return context;
      }
    }

    // For plain text context, just return it
    return context;
  }

  /**
   * Format parsed JSON context based on query intent
   */
  private formatJsonContext(data: any, intent?: string): string {
    switch (intent) {
      case 'schema-version':
        if (data.version) {
          return `Current schema version: ${data.version}${
            data.updated_at ? `\nLast updated: ${data.updated_at}` : ''
          }`;
        }
        break;
      case 'schema-changes':
        if (Array.isArray(data.changes) && data.changes.length > 0) {
          return data.changes
            .map(
              (change: any, idx: number) =>
                `${idx + 1}. ${
                  change.description || change.type || 'Schema change'
                }${change.timestamp ? ` (${change.timestamp})` : ''}`
            )
            .join('\n');
        }
        break;
      case 'type-info':
        if (data.type_name) {
          let formatted = `Entity Type: ${data.type_name}`;
          if (data.properties && Array.isArray(data.properties)) {
            formatted += `\n\nProperties:\n${data.properties
              .map((p: any) => `- ${p.name}: ${p.type}`)
              .join('\n')}`;
          }
          if (data.relationships && Array.isArray(data.relationships)) {
            formatted += `\n\nRelationships:\n${data.relationships
              .map((r: any) => `- ${r.name}: ${r.target_type}`)
              .join('\n')}`;
          }
          return formatted;
        }
        break;
      case 'entity-list':
        if (data.types && Array.isArray(data.types)) {
          const total = data.total || data.types.length;
          let formatted = `Available Entity Types (${total} total):\n\n`;
          formatted += data.types
            .map((type: any) => {
              const desc =
                type.description && type.description !== 'No description'
                  ? ` - ${type.description}`
                  : '';
              return `• **${type.name}**: ${type.count} instance${
                type.count !== 1 ? 's' : ''
              }${desc}`;
            })
            .join('\n');
          return formatted;
        }
        break;
      case 'entity-query':
        if (data.entities && Array.isArray(data.entities)) {
          const pagination = data.pagination || {};
          const total = pagination.total || data.entities.length;
          const entityType =
            data.entities.length > 0 ? data.entities[0].type : 'entities';

          let formatted = `Found ${total} ${entityType}${
            total !== 1 ? 's' : ''
          } (showing ${data.entities.length}):\n\n`;

          formatted += data.entities
            .map((entity: any, idx: number) => {
              let item = `### ${idx + 1}. ${entity.name}\n\n`;
              item += `- **ID**: ${entity.id}\n`;
              item += `- **Type**: ${entity.type}\n`;
              item += `- **Key**: ${entity.key}\n`;

              if (entity.created_at) {
                const date = new Date(entity.created_at);
                item += `- **Created**: ${date.toLocaleDateString()}\n`;
              }

              if (
                entity.properties &&
                Object.keys(entity.properties).length > 0
              ) {
                // Filter out internal extraction metadata fields
                const props = entity.properties;
                const cleanProps: Record<string, any> = {};

                for (const [key, value] of Object.entries(props)) {
                  // Skip extraction metadata fields
                  if (key.startsWith('_extraction_')) continue;

                  // Skip null/undefined/empty values
                  if (value === null || value === undefined || value === '')
                    continue;

                  cleanProps[key] = value;
                }

                // Format clean properties as markdown list
                for (const [key, value] of Object.entries(cleanProps)) {
                  // Format value based on type
                  let displayValue = value;
                  if (typeof value === 'object') {
                    displayValue = JSON.stringify(value);
                  }
                  item += `- **${key}**: ${displayValue}\n`;
                }
              }

              return item;
            })
            .join('\n');

          if (pagination.has_more) {
            formatted += `\n\n*${
              total - data.entities.length
            } more ${entityType}${
              total - data.entities.length !== 1 ? 's' : ''
            } available*`;
          }

          return formatted;
        }
        break;
    }

    // Fallback: pretty-print JSON
    return JSON.stringify(data, null, 2);
  }

  async generateStreaming(
    prompt: string,
    onToken: (t: string) => void
  ): Promise<string> {
    // Validate model is enabled first, before any other checks
    if (!this.enabled) throw new Error('chat model disabled');

    // Deterministic synthetic mode for tests: bypass external model and emit fixed token sequence
    // Match production tokenization behavior: include spaces as separate tokens
    if (process.env.CHAT_TEST_DETERMINISTIC === '1') {
      const tokens: string[] = [];
      for (let i = 0; i < 5; i++) {
        tokens.push(`token-${i}`);
        if (i < 4) tokens.push(' '); // Space between tokens (not after last one)
      }
      tokens.forEach((t) => onToken(t));
      return tokens.join(''); // Join without separator (spaces already included)
    }

    try {
      if (process.env.E2E_DEBUG_CHAT === '1') {
        this.logger.log(
          `[gen] start enabled=${
            this.enabled
          } model=gemini-2.5-pro promptPreview="${prompt
            .slice(0, 80)
            .replace(/\n/g, ' ')}"`
        );
      }
      // Use Vertex AI with gemini-2.5-pro model
      // NOTE: We explicitly set apiKey to undefined to prevent LangChain from
      // using GOOGLE_API_KEY env var. Vertex AI requires OAuth (ADC), not API keys.
      const model = new ChatVertexAI({
        model: this.config.vertexAiModel,
        apiKey: '', // Empty string bypasses GOOGLE_API_KEY env var, forces ADC auth
        authOptions: {
          projectId: this.config.vertexAiProjectId,
        },
        location: this.config.vertexAiLocation,
        temperature: 0,
        maxOutputTokens: 8192,
      });
      const msg = await model.invoke(prompt);
      const full =
        typeof msg === 'string'
          ? msg
          : (msg as any)?.content || JSON.stringify(msg);
      // Tokenization that preserves spaces and newlines for proper markdown formatting
      // Strategy: Split on word boundaries but include the whitespace in tokens
      // This ensures "Hello\n\nWorld" becomes ["Hello", "\n\n", "World"] not ["Hello", "World"]
      const pieces: string[] = [];
      const regex = /(\s+)|(\S+)/g;
      let match;
      while ((match = regex.exec(full)) !== null) {
        if (match[0]) pieces.push(match[0]);
      }

      // Since whitespace is now included as tokens, we need a much higher limit
      // ~2048 tokens ≈ ~1024 words (each word + space = 2 tokens)
      // This allows for comprehensive responses with multiple entities
      const maxTokens = Math.min(pieces.length, 2048);
      for (let i = 0; i < maxTokens; i++) {
        onToken(pieces[i]);
      }
      if (process.env.E2E_DEBUG_CHAT === '1') {
        this.logger.log(`[gen] success tokens=${maxTokens}`);
      }
      // Join without separator since tokens already include spaces/newlines
      return pieces.slice(0, maxTokens).join('');
    } catch (e) {
      const err = e as Error;
      this.logger.warn(`Generation failed: ${err.message}`);
      if (process.env.E2E_DEBUG_CHAT === '1') {
        this.logger.warn('[gen] stack: ' + (err.stack || 'no-stack'));
      }
      // Propagate so controller can emit a generation_error meta frame and synthetic fallback tokens there.
      throw err;
    }
  }
}
