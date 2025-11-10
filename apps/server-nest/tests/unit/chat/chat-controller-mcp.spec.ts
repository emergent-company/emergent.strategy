/**
 * Chat Controller MCP Integration Tests
 * 
 * Tests the MCP integration logic for detecting and invoking schema tools.
 * These tests verify the detector and client services work correctly.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { McpClientService } from '../../../src/modules/chat/mcp-client.service';
import { McpToolDetectorService } from '../../../src/modules/chat/mcp-tool-detector.service';

describe('ChatController MCP Integration Logic', () => {
    let mcpClient: McpClientService;
    let mcpDetector: McpToolDetectorService;

    beforeEach(() => {
        mcpClient = new McpClientService({} as any);
        mcpDetector = new McpToolDetectorService();
    });

    describe('MCP Tool Detector', () => {
        it('should detect schema version queries', () => {
            const message = 'What is the current schema version?';
            const result = mcpDetector.detect(message);

            expect(result.shouldUseMcp).toBe(true);
            expect(result.detectedIntent).toBe('schema-version');
            expect(result.suggestedTool).toBe('schema_version');
            expect(result.confidence).toBeGreaterThan(0.8);
        });

        it('should detect schema changes queries with date extraction', () => {
            const message = 'Show me schema changes since 2025-10-15';
            const result = mcpDetector.detect(message);

            expect(result.shouldUseMcp).toBe(true);
            expect(result.detectedIntent).toBe('schema-changes');
            expect(result.suggestedTool).toBe('schema_changelog');
            expect(result.suggestedArguments).toEqual({
                since: '2025-10-15',
                limit: 10
            });
        });

        it('should detect type info queries with type extraction', () => {
            const message = 'Tell me about the Project entity';
            const result = mcpDetector.detect(message);

            expect(result.shouldUseMcp).toBe(true);
            expect(result.detectedIntent).toBe('type-info');
            expect(result.suggestedTool).toBe('type_info');
            expect(result.suggestedArguments).toEqual({
                type_name: 'Project'
            });
        });

        it('should not detect MCP intent for non-schema queries', () => {
            const message = 'Hello, how are you?';
            const result = mcpDetector.detect(message);

            expect(result.shouldUseMcp).toBe(false);
            expect(result.detectedIntent).toBe('none');
            expect(result.confidence).toBe(0.0);
        });
    });

    describe('MCP Client Service', () => {
        it('should have initialize method', () => {
            expect(mcpClient.initialize).toBeDefined();
            expect(typeof mcpClient.initialize).toBe('function');
        });

        it('should have callTool method', () => {
            expect(mcpClient.callTool).toBeDefined();
            expect(typeof mcpClient.callTool).toBe('function');
        });

        it('should have listTools method', () => {
            expect(mcpClient.listTools).toBeDefined();
            expect(typeof mcpClient.listTools).toBe('function');
        });
    });

    describe('Integration Workflow', () => {
        it('should provide correct workflow for schema version query', () => {
            // Step 1: Detect intent
            const message = 'What is the schema version?';
            const detection = mcpDetector.detect(message);

            expect(detection.shouldUseMcp).toBe(true);
            expect(detection.suggestedTool).toBe('schema_version');

            // Step 2: Prepare tool call arguments
            const toolArgs = detection.suggestedArguments || {};
            expect(toolArgs).toEqual({});

            // Step 3: Build prompt context (simulated)
            const mockToolResult = {
                content: [
                    { type: 'text' as const, text: 'Current schema version: 1.2.3' }
                ]
            };

            const contextText = mockToolResult.content
                .filter(c => c.type === 'text' && c.text)
                .map(c => c.text)
                .join('\n');

            expect(contextText).toBe('Current schema version: 1.2.3');

            // Step 4: Verify context injection pattern
            const systemPrompt = 'You are a helpful assistant for querying knowledge graphs and schemas.';
            const enhancedPrompt = `${systemPrompt}\n\nContext from schema:\n${contextText}\n\nQuestion: ${message}\nAnswer:`;

            expect(enhancedPrompt).toContain('Current schema version: 1.2.3');
            expect(enhancedPrompt).toContain(message);
        });

        it('should handle missing MCP tool result gracefully', () => {
            const message = 'Schema version?';
            const detection = mcpDetector.detect(message);

            expect(detection.shouldUseMcp).toBe(true);

            // Simulate empty tool result
            const mockToolResult = {
                content: []
            };

            const contextText = mockToolResult.content
                .filter((c: any) => c.type === 'text' && c.text)
                .map((c: any) => c.text)
                .join('\n');

            // Should be empty string, not throw error
            expect(contextText).toBe('');

            // Prompt should fall back to no context
            const systemPrompt = 'You are a helpful assistant for querying knowledge graphs and schemas.';
            const prompt = contextText
                ? `${systemPrompt}\n\nContext from schema:\n${contextText}\n\nQuestion: ${message}\nAnswer:`
                : `${systemPrompt}\n\nQuestion: ${message}\nAnswer:`;

            expect(prompt).not.toContain('Context from schema:');
        });

        it('should extract arguments correctly for schema changes with "yesterday"', () => {
            const message = 'Show schema changes since yesterday';
            const detection = mcpDetector.detect(message);

            expect(detection.shouldUseMcp).toBe(true);
            expect(detection.suggestedArguments).toBeDefined();
            expect(detection.suggestedArguments?.since).toBeDefined();

            // Should be a valid date string
            const sinceDate = new Date(detection.suggestedArguments!.since);
            expect(sinceDate).toBeInstanceOf(Date);
            expect(isNaN(sinceDate.getTime())).toBe(false);
        });

        it('should extract limit argument from "last 5 changes"', () => {
            const message = 'Show me the last 5 schema changes';
            const detection = mcpDetector.detect(message);

            expect(detection.shouldUseMcp).toBe(true);
            expect(detection.suggestedArguments?.limit).toBe(5);
        });
    });
});
