import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ChatGenerationService, PromptBuildOptions } from '../../../src/modules/chat/chat-generation.service';
import { AppConfigService } from '../../../src/common/config/config.service';
import { ProjectsService } from '../../../src/modules/chat/../projects/projects.service';

describe('ChatGenerationService - Enhanced Prompt Building', () => {
    let service: ChatGenerationService;
    let mockConfig: Partial<AppConfigService>;
    let mockProjectsService: Partial<ProjectsService>;

    beforeEach(() => {
        // Mock config service
        mockConfig = {
            chatModelEnabled: true,
            vertexAiModel: 'gemini-2.5-pro',
            vertexAiProjectId: 'test-project',
            vertexAiLocation: 'us-central1',
        };

        // Mock projects service
        mockProjectsService = {
            getById: vi.fn().mockResolvedValue(null), // Default: no custom template
        };

        service = new ChatGenerationService(
            mockConfig as AppConfigService,
            mockProjectsService as ProjectsService
        );
    });

    describe('buildPrompt()', () => {
        describe('General queries without MCP context', () => {
            it('should build basic prompt for general query', async () => {
                const options: PromptBuildOptions = {
                    message: 'Hello, how can you help me?',
                };

                const prompt = await service.buildPrompt(options);

                expect(prompt).toContain('You are a helpful assistant specialized in knowledge graphs and data schemas');
                expect(prompt).toContain('Answer questions clearly');
                expect(prompt).toContain('## User Question');
                expect(prompt).toContain('Hello, how can you help me?');
                expect(prompt).toContain('## Your Response');
                expect(prompt).not.toContain('## Context from Schema');
            });

            it('should handle general intent explicitly', async () => {
                const options: PromptBuildOptions = {
                    message: 'What can you do?',
                    detectedIntent: 'general',
                };

                const prompt = await service.buildPrompt(options);

                expect(prompt).toContain('Answer questions clearly');
                expect(prompt).not.toContain('version information');
                expect(prompt).not.toContain('schema changes');
                expect(prompt).not.toContain('entity types');
            });
        });

        describe('Schema version queries', () => {
            it('should build specialized prompt for schema version query', async () => {
                const options: PromptBuildOptions = {
                    message: 'What is the current schema version?',
                    detectedIntent: 'schema-version',
                };

                const prompt = await service.buildPrompt(options);

                expect(prompt).toContain('When answering questions about schema versions');
                expect(prompt).toContain('provide clear version information');
                expect(prompt).toContain('What is the current schema version?');
            });

            it('should include formatted schema version context', async () => {
                const options: PromptBuildOptions = {
                    message: 'What is the schema version?',
                    mcpToolContext: '{"version":"1.2.3","updated_at":"2025-10-20T12:00:00Z"}',
                    detectedIntent: 'schema-version',
                };

                const prompt = await service.buildPrompt(options);

                expect(prompt).toContain('## Context from Schema');
                expect(prompt).toContain('Current schema version: 1.2.3');
                expect(prompt).toContain('Last updated: 2025-10-20T12:00:00Z');
            });

            it('should handle plain text schema version context', async () => {
                const options: PromptBuildOptions = {
                    message: 'Version?',
                    mcpToolContext: 'The current schema version is 1.0.0',
                    detectedIntent: 'schema-version',
                };

                const prompt = await service.buildPrompt(options);

                expect(prompt).toContain('## Context from Schema');
                expect(prompt).toContain('The current schema version is 1.0.0');
            });
        });

        describe('Schema changes queries', () => {
            it('should build specialized prompt for schema changes query', async () => {
                const options: PromptBuildOptions = {
                    message: 'Show me recent schema changes',
                    detectedIntent: 'schema-changes',
                };

                const prompt = await service.buildPrompt(options);

                expect(prompt).toContain('When describing schema changes');
                expect(prompt).toContain('organize them chronologically');
                expect(prompt).toContain('Highlight important modifications with **bold text**');
            });

            it('should format schema changes list from JSON', async () => {
                const changes = {
                    changes: [
                        { description: 'Added Project.status field', timestamp: '2025-10-20T10:00:00Z' },
                        { description: 'Updated Document entity', timestamp: '2025-10-19T15:30:00Z' },
                        { type: 'relationship-added', timestamp: '2025-10-18T09:00:00Z' }
                    ]
                };

                const options: PromptBuildOptions = {
                    message: 'What changed recently?',
                    mcpToolContext: JSON.stringify(changes),
                    detectedIntent: 'schema-changes',
                };

                const prompt = await service.buildPrompt(options);

                expect(prompt).toContain('## Context from Schema');
                expect(prompt).toContain('1. Added Project.status field (2025-10-20T10:00:00Z)');
                expect(prompt).toContain('2. Updated Document entity (2025-10-19T15:30:00Z)');
                expect(prompt).toContain('3. relationship-added (2025-10-18T09:00:00Z)');
            });

            it('should handle empty changes array', async () => {
                const options: PromptBuildOptions = {
                    message: 'Any changes?',
                    mcpToolContext: '{"changes":[]}',
                    detectedIntent: 'schema-changes',
                };

                const prompt = await service.buildPrompt(options);

                expect(prompt).toContain('## Context from Schema');
                // Should fall back to JSON pretty-print for empty array
                expect(prompt).toContain('"changes"');
            });
        });

        describe('Type info queries', () => {
            it('should build specialized prompt for type info query', async () => {
                const options: PromptBuildOptions = {
                    message: 'Tell me about the Project entity',
                    detectedIntent: 'type-info',
                };

                const prompt = await service.buildPrompt(options);

                expect(prompt).toContain('When explaining entity types');
                expect(prompt).toContain('use markdown headings (###) for the type name');
                expect(prompt).toContain('bullet lists (-) for properties and relationships');
            });

            it('should format type info with properties and relationships', async () => {
                const typeInfo = {
                    type_name: 'Project',
                    properties: [
                        { name: 'id', type: 'uuid' },
                        { name: 'name', type: 'string' },
                        { name: 'status', type: 'enum' }
                    ],
                    relationships: [
                        { name: 'documents', target_type: 'Document' },
                        { name: 'owner', target_type: 'User' }
                    ]
                };

                const options: PromptBuildOptions = {
                    message: 'What is Project?',
                    mcpToolContext: JSON.stringify(typeInfo),
                    detectedIntent: 'type-info',
                };

                const prompt = await service.buildPrompt(options);

                expect(prompt).toContain('## Context from Schema');
                expect(prompt).toContain('Entity Type: Project');
                expect(prompt).toContain('Properties:');
                expect(prompt).toContain('- id: uuid');
                expect(prompt).toContain('- name: string');
                expect(prompt).toContain('- status: enum');
                expect(prompt).toContain('Relationships:');
                expect(prompt).toContain('- documents: Document');
                expect(prompt).toContain('- owner: User');
            });

            it('should handle type info with only properties', async () => {
                const typeInfo = {
                    type_name: 'Document',
                    properties: [
                        { name: 'id', type: 'uuid' },
                        { name: 'content', type: 'text' }
                    ]
                };

                const options: PromptBuildOptions = {
                    message: 'Describe Document',
                    mcpToolContext: JSON.stringify(typeInfo),
                    detectedIntent: 'type-info',
                };

                const prompt = await service.buildPrompt(options);

                expect(prompt).toContain('Entity Type: Document');
                expect(prompt).toContain('Properties:');
                expect(prompt).toContain('- id: uuid');
                expect(prompt).toContain('- content: text');
                expect(prompt).not.toContain('Relationships:');
            });

            it('should handle type info with only relationships', async () => {
                const typeInfo = {
                    type_name: 'Task',
                    relationships: [
                        { name: 'project', target_type: 'Project' }
                    ]
                };

                const options: PromptBuildOptions = {
                    message: 'Task entity?',
                    mcpToolContext: JSON.stringify(typeInfo),
                    detectedIntent: 'type-info',
                };

                const prompt = await service.buildPrompt(options);

                expect(prompt).toContain('Entity Type: Task');
                expect(prompt).toContain('Relationships:');
                expect(prompt).toContain('- project: Project');
                expect(prompt).not.toContain('Properties:');
            });
        });

        describe('Context formatting edge cases', () => {
            it('should handle empty string context', async () => {
                const options: PromptBuildOptions = {
                    message: 'Test query',
                    mcpToolContext: '',
                    detectedIntent: 'general',
                };

                const prompt = await service.buildPrompt(options);

                expect(prompt).not.toContain('## Context from Schema');
            });

            it('should handle whitespace-only context', async () => {
                const options: PromptBuildOptions = {
                    message: 'Test query',
                    mcpToolContext: '   \n\t  ',
                    detectedIntent: 'general',
                };

                const prompt = await service.buildPrompt(options);

                expect(prompt).not.toContain('## Context from Schema');
            });

            it('should handle invalid JSON gracefully', async () => {
                const options: PromptBuildOptions = {
                    message: 'Test query',
                    mcpToolContext: '{invalid json}',
                    detectedIntent: 'schema-version',
                };

                const prompt = await service.buildPrompt(options);

                expect(prompt).toContain('## Context from Schema');
                expect(prompt).toContain('{invalid json}');
            });

            it('should pretty-print JSON when format not recognized', async () => {
                const options: PromptBuildOptions = {
                    message: 'Test query',
                    mcpToolContext: '{"unknown_field":"value","nested":{"data":123}}',
                    detectedIntent: 'general',
                };

                const prompt = await service.buildPrompt(options);

                expect(prompt).toContain('## Context from Schema');
                expect(prompt).toContain('"unknown_field"');
                expect(prompt).toContain('"nested"');
                // Should be formatted (has newlines/indentation)
                const contextSection = prompt.split('## Context from Schema')[1].split('## User Question')[0];
                expect(contextSection).toContain('\n');
            });
        });

        describe('Prompt structure validation', () => {
            it('should include all sections in correct order', async () => {
                const options: PromptBuildOptions = {
                    message: 'What is the schema version?',
                    mcpToolContext: 'Version: 1.0.0',
                    detectedIntent: 'schema-version',
                };

                const prompt = await service.buildPrompt(options);

                // Check order of sections
                const systemPromptIdx = prompt.indexOf('You are a helpful assistant');
                const contextIdx = prompt.indexOf('## Context from Schema');
                const questionIdx = prompt.indexOf('## User Question');
                const responseIdx = prompt.indexOf('## Your Response');

                expect(systemPromptIdx).toBeGreaterThan(-1);
                expect(contextIdx).toBeGreaterThan(systemPromptIdx);
                expect(questionIdx).toBeGreaterThan(contextIdx);
                expect(responseIdx).toBeGreaterThan(questionIdx);
            });

            it('should skip context section when no context provided', async () => {
                const options: PromptBuildOptions = {
                    message: 'Test query',
                    detectedIntent: 'general',
                };

                const prompt = await service.buildPrompt(options);

                // Check order without context
                const systemPromptIdx = prompt.indexOf('You are a helpful assistant');
                const questionIdx = prompt.indexOf('## User Question');
                const responseIdx = prompt.indexOf('## Your Response');

                expect(systemPromptIdx).toBeGreaterThan(-1);
                expect(questionIdx).toBeGreaterThan(systemPromptIdx);
                expect(responseIdx).toBeGreaterThan(questionIdx);
                expect(prompt).not.toContain('## Context from Schema');
            });
        });
    });
});
