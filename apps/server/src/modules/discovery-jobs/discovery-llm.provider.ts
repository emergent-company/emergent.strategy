import { Injectable, Logger } from '@nestjs/common';
import { ChatVertexAI } from '@langchain/google-vertexai';
import { AppConfigService } from '../../common/config/config.service';

/**
 * LLM Provider specifically for Discovery feature
 *
 * Uses ChatVertexAI for type discovery and relationship discovery.
 * Separate from extraction provider to avoid conflicts.
 */
@Injectable()
export class DiscoveryLLMProvider {
  private readonly logger = new Logger(DiscoveryLLMProvider.name);
  private model: ChatVertexAI | null = null;

  constructor(private readonly config: AppConfigService) {
    this.initialize();
  }

  private initialize() {
    const projectId = this.config.vertexAiProjectId;
    const location = this.config.vertexAiLocation;
    const modelName = this.config.vertexAiModel;

    if (!projectId) {
      this.logger.warn('Discovery LLM not configured: GCP_PROJECT_ID missing');
      return;
    }

    if (!location) {
      this.logger.warn(
        'Discovery LLM not configured: VERTEX_AI_LOCATION missing'
      );
      return;
    }

    if (!modelName) {
      this.logger.warn('Discovery LLM not configured: VERTEX_AI_MODEL missing');
      return;
    }

    this.logger.log(
      `Initializing Discovery Vertex AI: project=${projectId}, location=${location}, model=${modelName}`
    );

    try {
      // NOTE: We explicitly set apiKey to undefined to prevent LangChain from
      // using GOOGLE_API_KEY env var. Vertex AI requires OAuth (ADC), not API keys.
      this.model = new ChatVertexAI({
        model: modelName,
        apiKey: '', // Empty string bypasses GOOGLE_API_KEY env var, forces ADC auth
        authOptions: {
          projectId: projectId,
        },
        location: location,
        temperature: 0, // Deterministic for discovery
        maxOutputTokens: 65535, // Set to maximum (exclusive limit is 65536)
      });

      this.logger.log(`Discovery Vertex AI initialized: model=${modelName}`);
    } catch (error) {
      this.logger.error('Failed to initialize Discovery Vertex AI', error);
      this.model = null;
    }
  }

  getName(): string {
    return 'Discovery-VertexAI';
  }

  isConfigured(): boolean {
    return this.model !== null;
  }

  /**
   * Discover entity types from documents
   */
  async discoverTypes(params: {
    documents: Array<{ content: string; filename: string }>;
    kbPurpose: string;
    maxTypes?: number;
  }): Promise<
    Array<{
      type_name: string;
      description: string;
      inferred_schema: any;
      example_instances: any[];
      confidence: number;
      occurrences: number;
    }>
  > {
    if (!this.model) {
      throw new Error('Discovery LLM not configured');
    }

    this.logger.log(
      `[DISCOVER_TYPES] Analyzing ${params.documents.length} documents...`
    );

    const combinedContent = params.documents
      .map((doc) => `=== ${doc.filename} ===\n${doc.content}`)
      .join('\n\n');

    this.logger.debug(
      `[DISCOVER_TYPES] Combined content length: ${combinedContent.length} chars`
    );
    this.logger.debug(`[DISCOVER_TYPES] KB Purpose: ${params.kbPurpose}`);

    const maxTypes = params.maxTypes || 20;

    const prompt = `You are analyzing a knowledge base with the following purpose:

${params.kbPurpose}

Based on the documents provided, discover up to ${maxTypes} important entity types that should be tracked in this knowledge base.

For each type, provide:
- type_name: A clear, singular name (e.g., "Customer", "Product", "Issue")
- description: What this type represents
- inferred_schema: A JSON schema describing the properties of this type
- example_instances: 2-3 example instances from the documents
- confidence: How confident you are about this type (0-1)
- occurrences: Estimate how many times this type appears

Documents:
${combinedContent}

Return ONLY a JSON object with this structure (no markdown, no code blocks):
{
  "discovered_types": [
    {
      "type_name": "...",
      "description": "...",
      "inferred_schema": {...},
      "example_instances": [...],
      "confidence": 0.9,
      "occurrences": 5
    }
  ]
}`;

    try {
      if (!this.model) {
        throw new Error('Discovery LLM not initialized');
      }

      const result = await this.model.invoke(prompt);
      const content =
        typeof result.content === 'string'
          ? result.content
          : JSON.stringify(result.content);

      // CRITICAL: Write FULL response to file (bypasses logger truncation)
      try {
        const fs = await import('fs');
        const path = await import('path');
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

        // Use workspace root logs directory (go up 3 levels from apps/server/dist)
        const workspaceRoot = path.join(__dirname, '..', '..', '..');
        const logsDir = path.join(workspaceRoot, 'logs');

        // Ensure logs directory exists
        if (!fs.existsSync(logsDir)) {
          fs.mkdirSync(logsDir, { recursive: true });
        }

        const debugFile = path.join(logsDir, `llm-response-${timestamp}.txt`);

        // Write both the raw response AND metadata
        const debugContent = `=== LLM RESPONSE DEBUG FILE ===
Timestamp: ${new Date().toISOString()}
Content Type: ${typeof result.content}
Content Length: ${content.length} chars
Result Type: ${result.constructor?.name || 'unknown'}

=== RAW CONTENT START ===
${content}
=== RAW CONTENT END ===

=== FULL RESULT OBJECT ===
${JSON.stringify(result, null, 2)}
`;

        fs.writeFileSync(debugFile, debugContent, 'utf8');
        this.logger.log(`[DISCOVER_TYPES] 📄 DEBUG FILE WRITTEN: ${debugFile}`);
      } catch (err: any) {
        this.logger.error(
          `[DISCOVER_TYPES] ❌ FAILED TO WRITE FILE: ${
            err?.message || String(err)
          }`
        );
        this.logger.error(`[DISCOVER_TYPES] Stack: ${err?.stack}`);
      }

      // Log the FULL response to understand the exact format
      this.logger.debug(`[DISCOVER_TYPES] === FULL RAW LLM RESPONSE START ===`);
      this.logger.debug(`[DISCOVER_TYPES] ${content}`);
      this.logger.debug(`[DISCOVER_TYPES] === FULL RAW LLM RESPONSE END ===`);
      this.logger.debug(
        `[DISCOVER_TYPES] Response length: ${content.length} chars`
      );

      // Remove markdown code blocks if present
      // Try multiple patterns to handle different LLM response formats
      let jsonStr = content.trim();

      this.logger.debug(
        `[DISCOVER_TYPES] Content starts with: ${jsonStr.substring(0, 50)}`
      );
      this.logger.debug(
        `[DISCOVER_TYPES] Content ends with: ${jsonStr.substring(
          jsonStr.length - 50
        )}`
      );

      // Pattern 1: ```json ... ``` (with closing backticks)
      const jsonMatch1 = jsonStr.match(/```json\s*([\s\S]*?)\s*```/);
      if (jsonMatch1) {
        this.logger.debug(
          `[DISCOVER_TYPES] Matched: complete markdown block with closing backticks`
        );
        jsonStr = jsonMatch1[1];
      } else if (jsonStr.startsWith('```json')) {
        // Pattern 2: ```json ... (WITHOUT closing backticks - LLM forgot them)
        this.logger.debug(
          `[DISCOVER_TYPES] Matched: markdown start without closing backticks`
        );
        jsonStr = jsonStr.substring(7).trim(); // Remove "```json" and trim
      } else if (jsonStr.startsWith('```')) {
        // Pattern 3: ``` ... (generic code block)
        const jsonMatch3 = jsonStr.match(/```\s*([\s\S]*?)\s*```/);
        if (jsonMatch3) {
          this.logger.debug(
            `[DISCOVER_TYPES] Matched: complete generic code block`
          );
          jsonStr = jsonMatch3[1];
        } else {
          // Has opening ``` but no closing
          this.logger.debug(
            `[DISCOVER_TYPES] Matched: generic code block start without closing`
          );
          jsonStr = jsonStr.substring(3).trim();
        }
      } else {
        this.logger.debug(
          '[DISCOVER_TYPES] No markdown markers found, using content as-is'
        );
      }

      this.logger.debug(
        `[DISCOVER_TYPES] Extracted JSON (first 200 chars): ${jsonStr.substring(
          0,
          200
        )}`
      );

      const parsed = JSON.parse(jsonStr.trim());
      this.logger.debug(
        `[DISCOVER_TYPES] Raw LLM result: ${jsonStr.substring(0, 500)}...`
      );

      if (!parsed || !parsed.discovered_types) {
        this.logger.warn(
          `[DISCOVER_TYPES] No discovered_types in LLM response`
        );
        return [];
      }

      this.logger.log(
        `[DISCOVER_TYPES] LLM returned ${parsed.discovered_types.length} types`
      );
      this.logger.debug(
        `[DISCOVER_TYPES] Discovered types: ${parsed.discovered_types
          .map((t: any) => t.type_name)
          .join(', ')}`
      );

      return parsed.discovered_types;
    } catch (error: any) {
      this.logger.error('[DISCOVER_TYPES] Type discovery failed:', error);
      throw new Error(
        `Failed to discover types: ${error?.message || 'Unknown error'}`
      );
    }
  }
  /**
   * Discover relationships between types
   */
  async discoverRelationships(params: {
    types: Array<{ name: string; description: string }>;
    documents: Array<{ content: string; filename: string }>;
    kbPurpose: string;
  }): Promise<
    Array<{
      from_type: string;
      to_type: string;
      relationship_name: string;
      description: string;
      cardinality: string;
      confidence: number;
    }>
  > {
    if (!this.model) {
      throw new Error('Discovery LLM not configured');
    }

    this.logger.log(
      `[DISCOVER_RELATIONSHIPS] Analyzing relationships between ${params.types.length} types...`
    );

    const typesList = params.types
      .map((t) => `- ${t.name}: ${t.description}`)
      .join('\n');
    const combinedContent = params.documents
      .map((doc) => `=== ${doc.filename} ===\n${doc.content}`)
      .join('\n\n');

    const prompt = `You are analyzing a knowledge base with the following purpose:

${params.kbPurpose}

We have discovered the following entity types:
${typesList}

Based on the documents provided, discover important relationships between these types.

For each relationship, provide:
- from_type: The source type (must be one of the types above)
- to_type: The target type (must be one of the types above)
- relationship_name: A clear name for the relationship
- description: What this relationship represents
- cardinality: one-to-one, one-to-many, or many-to-many
- confidence: How confident you are about this relationship (0-1)

Documents:
${combinedContent}

Return ONLY a JSON object with this structure (no markdown, no code blocks):
{
  "discovered_relationships": [
    {
      "from_type": "...",
      "to_type": "...",
      "relationship_name": "...",
      "description": "...",
      "cardinality": "one-to-many",
      "confidence": 0.9
    }
  ]
}

Focus on the most important relationships that appear in the documents.`;

    try {
      if (!this.model) {
        throw new Error('Discovery LLM not initialized');
      }

      const result = await this.model.invoke(prompt);
      const content =
        typeof result.content === 'string'
          ? result.content
          : JSON.stringify(result.content);

      // Remove markdown code blocks if present
      const jsonMatch =
        content.match(/```json\n?([\s\S]*?)\n?```/) ||
        content.match(/```\n?([\s\S]*?)\n?```/);
      const jsonStr = jsonMatch ? jsonMatch[1] : content;

      const parsed = JSON.parse(jsonStr.trim());

      if (!parsed || !parsed.discovered_relationships) {
        this.logger.warn(
          `[DISCOVER_RELATIONSHIPS] No discovered_relationships in LLM response`
        );
        return [];
      }

      this.logger.log(
        `[DISCOVER_RELATIONSHIPS] LLM returned ${parsed.discovered_relationships.length} relationships`
      );

      return parsed.discovered_relationships;
    } catch (error: any) {
      this.logger.error(
        '[DISCOVER_RELATIONSHIPS] Relationship discovery failed:',
        error
      );
      throw new Error(
        `Failed to discover relationships: ${error?.message || 'Unknown error'}`
      );
    }
  }
}
