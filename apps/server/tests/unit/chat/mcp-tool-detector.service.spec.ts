import { Test, TestingModule } from '@nestjs/testing';
import { McpToolDetectorService } from '../../../src/modules/chat/mcp-tool-detector.service';
import { describe, beforeEach, it, expect } from 'vitest';

describe('McpToolDetectorService', () => {
    let service: McpToolDetectorService;

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [McpToolDetectorService],
        }).compile();

        service = module.get<McpToolDetectorService>(McpToolDetectorService);
    });

    describe('Schema Version Detection', () => {
        it('should detect "schema version" with high confidence', () => {
            const result = service.detect("What's the schema version?");

            expect(result.shouldUseMcp).toBe(true);
            expect(result.detectedIntent).toBe('schema-version');
            expect(result.confidence).toBe(0.9);
            expect(result.suggestedTool).toBe('schema_version');
            expect(result.suggestedArguments).toEqual({});
            expect(result.matchedKeywords).toContain('schema version');
        });

        it('should detect "current schema" with high confidence', () => {
            const result = service.detect("Tell me about the current schema");

            expect(result.shouldUseMcp).toBe(true);
            expect(result.detectedIntent).toBe('schema-version');
            expect(result.confidence).toBe(0.9);
            expect(result.suggestedTool).toBe('schema_version');
        });

        it('should detect "what version" with partial match confidence', () => {
            const result = service.detect("What version is the knowledge base schema?");

            expect(result.shouldUseMcp).toBe(true);
            expect(result.detectedIntent).toBe('schema-version');
            expect(result.confidence).toBe(0.8);  // Partial match (requires "schema" context)
            expect(result.suggestedTool).toBe('schema_version');
        });

        it('should detect "version of the schema" with high confidence', () => {
            const result = service.detect("Can you tell me the version of the schema?");

            expect(result.shouldUseMcp).toBe(true);
            expect(result.detectedIntent).toBe('schema-version');
            expect(result.confidence).toBe(0.9);
        });

        it('should detect partial keyword "version" with context', () => {
            const result = service.detect("What's the version for our schema?");

            expect(result.shouldUseMcp).toBe(true);
            expect(result.detectedIntent).toBe('schema-version');
            expect(result.confidence).toBe(0.8);  // Reduced confidence for partial match
            expect(result.suggestedTool).toBe('schema_version');
        });
    });

    describe('Schema Changes Detection', () => {
        it('should detect "schema changes" with high confidence', () => {
            const result = service.detect("Show me the schema changes");

            expect(result.shouldUseMcp).toBe(true);
            expect(result.detectedIntent).toBe('schema-changes');
            expect(result.confidence).toBe(0.9);
            expect(result.suggestedTool).toBe('schema_changelog');
            expect(result.suggestedArguments).toHaveProperty('limit', 10);
        });

        it('should detect "changelog" with high confidence', () => {
            const result = service.detect("What's in the changelog?");

            expect(result.shouldUseMcp).toBe(true);
            expect(result.detectedIntent).toBe('schema-changes');
            expect(result.confidence).toBe(0.9);
            expect(result.suggestedTool).toBe('schema_changelog');
        });

        it('should detect "recent changes" with high confidence', () => {
            const result = service.detect("What are the recent changes?");

            expect(result.shouldUseMcp).toBe(true);
            expect(result.detectedIntent).toBe('schema-changes');
            expect(result.confidence).toBe(0.9);
        });

        it('should detect "what changed" with high confidence', () => {
            const result = service.detect("What changed in the schema?");

            expect(result.shouldUseMcp).toBe(true);
            expect(result.detectedIntent).toBe('schema-changes');
            expect(result.confidence).toBe(0.9);
        });

        it('should extract limit from message', () => {
            const result = service.detect("Show me the last 5 schema changes");

            expect(result.shouldUseMcp).toBe(true);
            expect(result.suggestedArguments).toHaveProperty('limit', 5);
        });

        it('should extract "since" date from message', () => {
            const result = service.detect("Show changes since 2025-10-15");

            expect(result.shouldUseMcp).toBe(true);
            expect(result.suggestedArguments).toHaveProperty('since', '2025-10-15');
        });

        it('should convert "since yesterday" to ISO date', () => {
            const result = service.detect("What changed since yesterday?");

            expect(result.shouldUseMcp).toBe(true);
            expect(result.suggestedArguments).toHaveProperty('since');
            expect(result.suggestedArguments!.since).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        });

        it('should convert "since last week" to ISO date', () => {
            const result = service.detect("Show me changes since last week");

            expect(result.shouldUseMcp).toBe(true);
            expect(result.suggestedArguments).toHaveProperty('since');
            expect(result.suggestedArguments!.since).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        });

        it('should default limit to 10 if not specified', () => {
            const result = service.detect("What are the schema changes?");

            expect(result.shouldUseMcp).toBe(true);
            expect(result.suggestedArguments).toHaveProperty('limit', 10);
        });
    });

    describe('Type Info Detection', () => {
        it('should detect "object types" with high confidence', () => {
            const result = service.detect("What are the object types?");

            expect(result.shouldUseMcp).toBe(true);
            expect(result.detectedIntent).toBe('type-info');
            expect(result.confidence).toBe(0.9);
            expect(result.suggestedTool).toBe('type_info');
        });

        it('should detect "available types" with high confidence', () => {
            const result = service.detect("Show me the available types");

            expect(result.shouldUseMcp).toBe(true);
            expect(result.detectedIntent).toBe('type-info');
            expect(result.confidence).toBe(0.9);
        });

        it('should detect "list types" with high confidence', () => {
            const result = service.detect("Can you list all types?");

            expect(result.shouldUseMcp).toBe(true);
            expect(result.detectedIntent).toBe('type-info');
            expect(result.confidence).toBe(0.9);
        });

        it('should extract specific type name from message', () => {
            const result = service.detect("Tell me about the Person type");

            expect(result.shouldUseMcp).toBe(true);
            expect(result.suggestedArguments).toHaveProperty('type_name', 'Person');
        });

        it('should extract type name from "type X" pattern', () => {
            const result = service.detect("What is the Project entity?");

            expect(result.shouldUseMcp).toBe(true);
            expect(result.suggestedArguments).toHaveProperty('type_name', 'Project');
        });

        it('should capitalize extracted type name', () => {
            const result = service.detect("Show me the location type");

            expect(result.shouldUseMcp).toBe(true);
            expect(result.suggestedArguments).toHaveProperty('type_name', 'Location');
        });
    });

    describe('No Detection Cases', () => {
        it('should not detect for general chat', () => {
            const result = service.detect("How do I create a project?");

            expect(result.shouldUseMcp).toBe(false);
            expect(result.detectedIntent).toBe('none');
            expect(result.confidence).toBe(0.0);
            expect(result.suggestedTool).toBeUndefined();
        });

        it('should not detect for unrelated questions', () => {
            const result = service.detect("What is the weather today?");

            expect(result.shouldUseMcp).toBe(false);
            expect(result.detectedIntent).toBe('none');
        });

        it('should not detect partial keywords without context', () => {
            const result = service.detect("I need to change the password");

            expect(result.shouldUseMcp).toBe(false);
            expect(result.detectedIntent).toBe('none');
        });

        it('should not detect "version" without schema context', () => {
            const result = service.detect("What version of Node.js do you support?");

            // May detect as entity-query (broad pattern) but should not detect as schema-version
            if (result.shouldUseMcp) {
                expect(result.detectedIntent).not.toBe('schema-version');
            } else {
                expect(result.detectedIntent).toBe('none');
            }
        });

        it('should not detect "types" without schema context', () => {
            const result = service.detect("What types of files can I upload?");

            // May detect as entity-query (broad pattern) but should not detect as type-info
            if (result.shouldUseMcp) {
                expect(result.detectedIntent).not.toBe('type-info');
            } else {
                expect(result.detectedIntent).toBe('none');
            }
        });
    });

    describe('Edge Cases', () => {
        it('should handle empty message', () => {
            const result = service.detect("");

            expect(result.shouldUseMcp).toBe(false);
            expect(result.detectedIntent).toBe('none');
        });

        it('should handle whitespace-only message', () => {
            const result = service.detect("   ");

            expect(result.shouldUseMcp).toBe(false);
            expect(result.detectedIntent).toBe('none');
        });

        it('should be case-insensitive', () => {
            const result1 = service.detect("SCHEMA VERSION");
            const result2 = service.detect("schema version");
            const result3 = service.detect("Schema Version");

            expect(result1.shouldUseMcp).toBe(true);
            expect(result2.shouldUseMcp).toBe(true);
            expect(result3.shouldUseMcp).toBe(true);
        });

        it('should handle very long messages', () => {
            const longMessage = "I need to know something about the system. " +
                "Specifically, I'm wondering what the current schema version is. " +
                "Can you help me with that?";

            const result = service.detect(longMessage);

            expect(result.shouldUseMcp).toBe(true);
            expect(result.detectedIntent).toBe('schema-version');
        });

        it('should prioritize exact matches over partial matches', () => {
            // Message with both "schema version" (exact) and "changes" (partial)
            const result = service.detect("What's the schema version and recent changes?");

            // Should match "schema version" first (highest priority)
            expect(result.detectedIntent).toBe('schema-version');
            expect(result.confidence).toBe(0.9);
        });
    });

    describe('Helper Methods', () => {
        it('should return supported intents', () => {
            const intents = service.getSupportedIntents();

            expect(intents).toContain('schema-version');
            expect(intents).toContain('schema-changes');
            expect(intents).toContain('type-info');
            expect(intents).toContain('entity-query');
            expect(intents).toContain('entity-list');
            expect(intents.length).toBe(5);
        });

        it('should return tool for valid intent', () => {
            expect(service.getToolForIntent('schema-version')).toBe('schema_version');
            expect(service.getToolForIntent('schema-changes')).toBe('schema_changelog');
            expect(service.getToolForIntent('type-info')).toBe('type_info');
        });

        it('should return undefined for invalid intent', () => {
            expect(service.getToolForIntent('invalid-intent')).toBeUndefined();
        });
    });

    describe('Real-World Examples', () => {
        it('should detect conversational schema version query', () => {
            const result = service.detect("Hey, can you tell me what version the schema is at?");

            expect(result.shouldUseMcp).toBe(true);
            expect(result.detectedIntent).toBe('schema-version');
        });

        it('should detect conversational changelog query', () => {
            const result = service.detect("I'm curious, what's been updated in the schema recently?");

            expect(result.shouldUseMcp).toBe(true);
            expect(result.detectedIntent).toBe('schema-changes');
        });

        it('should detect technical type info query', () => {
            const result = service.detect("List all entity types available in the schema");

            expect(result.shouldUseMcp).toBe(true);
            expect(result.detectedIntent).toBe('type-info');
        });

        it('should extract complex limit patterns', () => {
            const result = service.detect("Give me the top 20 most recent schema updates");

            expect(result.shouldUseMcp).toBe(true);
            expect(result.suggestedArguments).toHaveProperty('limit', 20);
        });

        it('should handle multiple intents in message', () => {
            // Should match first pattern found (schema-version)
            const result = service.detect(
                "What's the current schema version and what types are available?"
            );

            expect(result.shouldUseMcp).toBe(true);
            // First match wins (schema-version appears first in patterns)
            expect(result.detectedIntent).toBe('schema-version');
        });
    });
});
