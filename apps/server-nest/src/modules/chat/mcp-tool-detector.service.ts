import { Injectable, Logger } from '@nestjs/common';

/**
 * Tool Detection Result
 */
export interface ToolDetectionResult {
    shouldUseMcp: boolean;                                    // Whether to invoke MCP tools
    detectedIntent: 'schema-version' | 'schema-changes' | 'type-info' | 'none';  // Detected user intent
    confidence: number;                                       // Confidence score (0.0-1.0)
    suggestedTool?: string;                                   // MCP tool name to invoke
    suggestedArguments?: Record<string, any>;                 // Arguments for the tool
    matchedKeywords?: string[];                               // Keywords that triggered detection
}

/**
 * Keyword Pattern for Intent Detection
 */
interface KeywordPattern {
    intent: 'schema-version' | 'schema-changes' | 'type-info';
    tool: string;
    keywords: string[];                    // Exact match keywords
    partialKeywords?: string[];           // Partial match keywords
    confidence: number;                   // Base confidence for this pattern
}

/**
 * MCP Tool Detector Service
 * 
 * Implements keyword-based intent detection for determining when to use MCP tools
 * in chat conversations.
 * 
 * **Purpose:**
 * - Analyze user messages for schema-related queries
 * - Detect intent: schema version, schema changes, or type information
 * - Return tool suggestion with confidence score
 * - Enable chat controller to decide whether to invoke MCP tools
 * 
 * **Detection Strategy:**
 * - Exact keyword matching (high confidence: 0.9)
 * - Partial keyword matching (medium confidence: 0.8)
 * - Weak signal matching (low confidence: 0.7)
 * 
 * **Supported Intents:**
 * 1. `schema-version` - User wants current schema version
 * 2. `schema-changes` - User wants recent schema changes/changelog
 * 3. `type-info` - User wants information about object types
 * 
 * **Usage:**
 * ```typescript
 * const detector = new McpToolDetectorService();
 * const result = detector.detect("What's the current schema version?");
 * 
 * if (result.shouldUseMcp) {
 *   const toolResult = await mcpClient.callTool(
 *     result.suggestedTool,
 *     result.suggestedArguments
 *   );
 * }
 * ```
 * 
 * **Thread Safety:**
 * - Stateless service (no mutable state)
 * - Safe for concurrent use
 * - Injectable as singleton
 * 
 * @see https://modelcontextprotocol.io/docs/learn/architecture
 */
@Injectable()
export class McpToolDetectorService {
    private readonly logger = new Logger(McpToolDetectorService.name);

    /**
     * Keyword patterns for intent detection
     * 
     * Ordered by specificity (most specific first)
     */
    private readonly patterns: KeywordPattern[] = [
        // Schema Version Intent
        {
            intent: 'schema-version',
            tool: 'schema_version',
            keywords: [
                'schema version',
                'current schema',
                'schema info',
                'version of schema',
                'version of the schema',
                'schema\'s version',
                'get schema version',
                'show schema version',
                'tell me the schema version',
                'about the current schema'
            ],
            partialKeywords: [
                'version',
                'current version',
                'latest version'
            ],
            confidence: 0.9
        },

        // Schema Changes Intent
        {
            intent: 'schema-changes',
            tool: 'schema_changelog',
            keywords: [
                'schema changes',
                'schema changelog',
                'schema history',
                'recent changes',
                'what changed',
                'schema updates',
                'schema modifications',
                'schema diff',
                'schema differences',
                'changelog',
                'change log',
                'recent updates',
                'latest changes',
                'been updated',
                'what\'s been updated',
                'show changes',
                'show me changes'
            ],
            partialKeywords: [
                'changes',
                'updates',
                'modified',
                'history',
                'updated'
            ],
            confidence: 0.9
        },

        // Type Info Intent
        {
            intent: 'type-info',
            tool: 'type_info',
            keywords: [
                'object types',
                'available types',
                'list types',
                'show types',
                'type information',
                'type details',
                'schema types',
                'entity types',
                'data types',
                'all types',
                'type list',
                'entity list',
                'object list',
                'show me types',
                'list all types',
                'list entities',
                'list entity types',
                'entity types in',
                'types in the current schema',
                'types in the schema',
                'the location type',
                'the project type',
                'the person type',
                'location type',
                'project type',
                'person type'
            ],
            partialKeywords: [
                'entities'
            ],
            confidence: 0.9
        }
    ];

    /**
     * Detect MCP tool intent from user message
     * 
     * Analyzes the message for schema-related keywords and returns
     * a detection result indicating whether MCP tools should be used.
     * 
     * **Algorithm:**
     * 1. Normalize message (lowercase, trim)
     * 2. Check for exact keyword matches (high confidence)
     * 3. Check for partial keyword matches (medium confidence)
     * 4. Check for weak signals (low confidence)
     * 5. Return highest confidence match or 'none'
     * 
     * @param userMessage - User's chat message
     * @returns Detection result with tool suggestion and confidence
     * 
     * @example
     * ```typescript
     * // Exact match - high confidence
     * detect("What's the schema version?")
     * // → { shouldUseMcp: true, detectedIntent: 'schema-version', confidence: 0.9, suggestedTool: 'schema_version' }
     * 
     * // Partial match - medium confidence
     * detect("Tell me about recent changes")
     * // → { shouldUseMcp: true, detectedIntent: 'schema-changes', confidence: 0.8, suggestedTool: 'schema_changelog' }
     * 
     * // No match - no tool invocation
     * detect("How do I create a project?")
     * // → { shouldUseMcp: false, detectedIntent: 'none', confidence: 0.0 }
     * ```
     */
    detect(userMessage: string): ToolDetectionResult {
        // Normalize message
        const normalized = userMessage.toLowerCase().trim();

        this.logger.debug(`Detecting MCP intent for message: "${userMessage.substring(0, 50)}..."`);

        // Check each pattern for matches
        let bestMatch: ToolDetectionResult | null = null;

        for (const pattern of this.patterns) {
            const match = this.checkPattern(normalized, pattern);
            if (match && (!bestMatch || match.confidence > bestMatch.confidence)) {
                bestMatch = match;
            }
        }

        // Return best match or no match
        if (bestMatch) {
            this.logger.debug(
                `Detected intent: ${bestMatch.detectedIntent} ` +
                `(confidence: ${bestMatch.confidence}, tool: ${bestMatch.suggestedTool})`
            );
            return bestMatch;
        }

        this.logger.debug('No MCP intent detected');
        return {
            shouldUseMcp: false,
            detectedIntent: 'none',
            confidence: 0.0
        };
    }

    /**
     * Check if message matches a specific pattern
     * 
     * @param normalized - Normalized (lowercase) message
     * @param pattern - Keyword pattern to check
     * @returns Detection result if matched, null otherwise
     */
    private checkPattern(normalized: string, pattern: KeywordPattern): ToolDetectionResult | null {
        const matchedKeywords: string[] = [];

        // Check exact keyword matches (high confidence)
        for (const keyword of pattern.keywords) {
            if (normalized.includes(keyword)) {
                matchedKeywords.push(keyword);

                // Exact match found - return with high confidence
                return {
                    shouldUseMcp: true,
                    detectedIntent: pattern.intent,
                    confidence: pattern.confidence,
                    suggestedTool: pattern.tool,
                    suggestedArguments: this.buildArguments(pattern.intent, normalized),
                    matchedKeywords
                };
            }
        }

        // Special case for type-info: check for "X type" or "X entity" patterns
        // where X is likely a type name (capitalized word before "type"/"entity")
        if (pattern.intent === 'type-info') {
            const typePatternMatch = normalized.match(/\b(location|project|person|document|task|user|organization|company|event)\s+(type|entity)/);
            if (typePatternMatch) {
                return {
                    shouldUseMcp: true,
                    detectedIntent: pattern.intent,
                    confidence: pattern.confidence,
                    suggestedTool: pattern.tool,
                    suggestedArguments: this.buildArguments(pattern.intent, normalized),
                    matchedKeywords: [typePatternMatch[0]]
                };
            }
        }

        // Check partial keyword matches (medium confidence)
        if (pattern.partialKeywords) {
            for (const keyword of pattern.partialKeywords) {
                if (normalized.includes(keyword)) {
                    matchedKeywords.push(keyword);
                }
            }

            // Partial match found - check for context requirement
            if (matchedKeywords.length > 0) {
                // For version/changes, require 'schema' context to reduce false positives
                // For types, require 'type' or 'schema' context
                let hasContext = false;

                if (pattern.intent === 'type-info') {
                    // Type-info needs 'schema', 'entity', or 'object' context
                    // Don't allow just 'type' alone (too generic - "types of files", etc.)
                    hasContext = normalized.includes('schema') ||
                        normalized.includes('entity') ||
                        normalized.includes('object');
                } else {
                    // Schema version/changes need 'schema' context
                    hasContext = normalized.includes('schema');
                }

                if (hasContext) {
                    return {
                        shouldUseMcp: true,
                        detectedIntent: pattern.intent,
                        confidence: pattern.confidence - 0.1,  // Reduce confidence by 0.1 for partial match
                        suggestedTool: pattern.tool,
                        suggestedArguments: this.buildArguments(pattern.intent, normalized),
                        matchedKeywords
                    };
                }
            }
        }

        // No match
        return null;
    }

    /**
     * Build tool arguments based on detected intent and message content
     * 
     * Extracts relevant parameters from the user message to pass to MCP tools.
     * 
     * @param intent - Detected intent
     * @param normalized - Normalized message
     * @returns Tool arguments
     */
    private buildArguments(
        intent: 'schema-version' | 'schema-changes' | 'type-info',
        normalized: string
    ): Record<string, any> {
        switch (intent) {
            case 'schema-version':
                // No arguments needed for schema_version tool
                return {};

            case 'schema-changes':
                // Try to extract 'since' date or 'limit' from message
                const args: Record<string, any> = {};

                // Check for 'since' date patterns
                // Examples: "since yesterday", "since last week", "since 2025-10-15"
                const sinceMatch = normalized.match(/since\s+(yesterday|last\s+week|\d{4}-\d{2}-\d{2})/);
                if (sinceMatch) {
                    const sinceValue = sinceMatch[1];

                    // Try to parse relative dates
                    if (sinceValue === 'yesterday') {
                        const yesterday = new Date();
                        yesterday.setDate(yesterday.getDate() - 1);
                        args.since = yesterday.toISOString().split('T')[0];
                    } else if (sinceValue === 'last week' || sinceValue.includes('last')) {
                        const lastWeek = new Date();
                        lastWeek.setDate(lastWeek.getDate() - 7);
                        args.since = lastWeek.toISOString().split('T')[0];
                    } else if (/^\d{4}-\d{2}-\d{2}$/.test(sinceValue)) {
                        args.since = sinceValue;
                    }
                }

                // Check for 'limit' number
                // Examples: "last 5 changes", "top 10 updates"
                const limitMatch = normalized.match(/(?:last|top|recent)\s+(\d+)/);
                if (limitMatch) {
                    args.limit = parseInt(limitMatch[1], 10);
                } else {
                    // Default limit for changelog
                    args.limit = 10;
                }

                return args;

            case 'type-info':
                // Try to extract specific type name from message
                const args2: Record<string, any> = {};

                // Check for type name patterns
                // Examples: "What is the Project entity?", "Show me the location type", "Person entity"
                // Pattern 1: "the X entity" or "the X type"
                let typeMatch = normalized.match(/the\s+(\w+)\s+(?:entity|type)/);
                if (!typeMatch) {
                    // Pattern 2: "type X" or "X type"
                    typeMatch = normalized.match(/(?:^|\s)type\s+(\w+)|(\w+)\s+type/);
                }
                if (!typeMatch) {
                    // Pattern 3: "X entity"
                    typeMatch = normalized.match(/(\w+)\s+entity/);
                }

                if (typeMatch) {
                    const typeName = typeMatch[1] || typeMatch[2];
                    // Filter out common words that aren't type names
                    const excludedWords = ['what', 'show', 'list', 'all', 'the', 'a', 'an', 'is'];
                    if (typeName && !excludedWords.includes(typeName)) {
                        args2.type_name = typeName.charAt(0).toUpperCase() + typeName.slice(1);
                    }
                }

                return args2;

            default:
                return {};
        }
    }

    /**
     * Get all supported intents
     * 
     * @returns Array of supported intent names
     */
    getSupportedIntents(): string[] {
        return Array.from(new Set(this.patterns.map(p => p.intent)));
    }

    /**
     * Get tool name for a specific intent
     * 
     * @param intent - Intent name
     * @returns Tool name or undefined if intent not supported
     */
    getToolForIntent(intent: string): string | undefined {
        const pattern = this.patterns.find(p => p.intent === intent);
        return pattern?.tool;
    }
}
