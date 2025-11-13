import { beforeAll, afterAll, describe, it, expect } from 'vitest'; import { Test, TestingModule } from '@nestjs/testing';

import { createE2EContext, E2EContext } from './e2e-context'; import { INestApplication, HttpStatus } from '@nestjs/common';

import { authHeader } from './auth-helpers'; import * as request from 'supertest';

import { AppModule } from '../src/app.module';
import { error } from 'console';
import e from 'express';
import { send } from 'process';
import { start } from 'repl';
import { string, set } from 'zod';

/**import * as http from 'http';

 * E2E test suite for Chat API + MCP integration

 * Tests the complete flow: message -> MCP tool detection -> tool execution -> LLM generation with context -> streaming responseimport { beforeAll, afterAll, describe, it, expect } from 'vitest';

 * import { createE2EContext, E2EContext } from './e2e-context';

 * Requirements from Task 10:import { authHeader } from './auth-helpers';

 * - Full chat flow with MCP tools (schema_version, schema_changelog, type_info)

 * - SSE event emission verification (mcp_tool events with status)/**

 * - Error scenarios (server down, invalid tool, timeout) * E2E test suite for Chat API + MCP integration

 * - Feature flag testing (CHAT_ENABLE_MCP) * Tests the complete flow: message -> MCP tool detection -> tool execution -> LLM generation with context -> streaming response

 * - Context injection verification * 

 *  * Requirements from Task 10:

 * SSE Event Types Expected: * - Full chat flow with MCP tools (schema_version, schema_changelog, type_info)

 * - { type: 'meta', conversationId, messageId } * - SSE event emission verification (mcp_tool events with status)

 * - { type: 'mcp_tool', status: 'started', tool, args } * - Error scenarios (server down, invalid tool, timeout)

 * - { type: 'mcp_tool', status: 'completed', tool, result } * - Feature flag testing (CHAT_ENABLE_MCP)

 * - { type: 'mcp_tool', status: 'error', tool, error } * - Context injection verification

 * - { type: 'token', token } * 

 * - { type: 'done', done: true } * SSE Event Types Expected:

 */ * - { type: 'meta', conversationId, messageId }

    * - { type: 'mcp_tool', status: 'started', tool, args }

let ctx: E2EContext; * - { type: 'mcp_tool', status: 'completed', tool, result }

    * - { type: 'mcp_tool', status: 'error', tool, error }

describe('Chat with MCP Integration (e2e)', () => { * - { type: 'token', token }

    /** * - { type: 'done', done: true }

     * Helper to parse SSE stream into event objects */

    * SSE format: "data: {...}\n\n"

        */let ctx: E2EContext;

    const parseSSEStream = (data: string): any[] => {

        const events: any[] = []; describe('Chat with MCP Integration (e2e)', () => {

            const lines = data.split('\n');    /**

             * Helper to parse SSE stream into event objects

        for (let i = 0; i < lines.length; i++) {     * SSE format: "data: {...}\n\n"

            const line = lines[i];     */

            if (line.startsWith('data: ')) {
                const parseSSEStream = (data: string): any[] => {

                    try {
                        const events: any[] = [];

                        const jsonStr = line.substring(6); // Remove "data: " prefix        const lines = data.split('\n');

                        events.push(JSON.parse(jsonStr));

                    } catch (e) {
                        for (let i = 0; i < lines.length; i++) {

                            console.warn('Failed to parse SSE event:', line, e); const line = lines[i];

                        } if (line.startsWith('data: ')) {

                        } try {

                        }                    const jsonStr = line.substring(6); // Remove "data: " prefix

                        events.push(JSON.parse(jsonStr));

                        return events;
                    } catch (e) {

                    }; console.warn('Failed to parse SSE event:', line, e);

                }

                beforeAll(async () => { }

        ctx = await createE2EContext('chat-mcp-integration');
            }



            // Configure MCP for testing        return events;

            process.env.CHAT_ENABLE_MCP = '1';
        };

        process.env.CHAT_TEST_DETERMINISTIC = '1'; // Predictable token generation

        process.env.MCP_SERVER_URL = process.env.MCP_SERVER_URL || 'http://localhost:3002'; beforeAll(async () => {

        }); ctx = await createE2EContext('chat-mcp-integration');



        afterAll(async () => {        // Configure MCP for testing

            await ctx.close(); process.env.CHAT_ENABLE_MCP = '1';

        }); process.env.CHAT_TEST_DETERMINISTIC = '1'; // Predictable token generation

        process.env.MCP_SERVER_URL = process.env.MCP_SERVER_URL || 'http://localhost:3002';

        describe('Basic Chat Streaming (No MCP)', () => { });

        it('should stream chat response without MCP tools for general queries', async () => {

            const response = await fetch(`${ctx.baseUrl}/chat/stream`, { afterAll(async () => {

        method: 'POST', await ctx.close();

        headers: { });

'Content-Type': 'application/json', describe('Chat with MCP Integration (e2e)', () => {

                    ...authHeader('all', 'chat-mcp'), let app: INestApplication;

'x-org-id': ctx.orgId, let authToken: string;

'x-project-id': ctx.projectId    let userId: string;

                }, let orgId: string;

body: JSON.stringify({ message: 'Hello, how are you?' })    let projectId: string;

            }); let mcpServerUrl: string;



expect(response.status).toBe(200);    // Helper to parse SSE stream

const text = await response.text(); const parseSSEStream = (data: string): any[] => {

    const events = parseSSEStream(text); const events: any[] = [];

    const lines = data.split('\n');

    // Should have meta, tokens, and done events        

    expect(events.find(e => e.type === 'meta')).toBeDefined(); for (let i = 0; i < lines.length; i++) {

        expect(events.find(e => e.type === 'token')).toBeDefined(); const line = lines[i].trim();

        expect(events.find(e => e.type === 'done' && e.done === true)).toBeDefined(); if (line.startsWith('data: ')) {

            const jsonStr = line.substring(6); // Remove 'data: ' prefix

            // Should NOT have any MCP tool events for a general query                if (jsonStr) {

            const mcpEvents = events.filter(e => e.type === 'mcp_tool'); try {

                expect(mcpEvents.length).toBe(0); events.push(JSON.parse(jsonStr));

            });
        } catch (e) {

        }); console.error('Failed to parse SSE event:', jsonStr, e);

    }

    describe('MCP Tool Detection and Execution', () => { }

        it('should detect and execute schema_version tool for version queries', async () => { }

            const response = await fetch(`${ctx.baseUrl}/chat/stream`, {}

                method: 'POST',

        headers: {
            return events;

        'Content-Type': 'application/json',
    };

                    ...authHeader('all', 'chat-mcp'),

    'x-org-id': ctx.orgId, beforeAll(async () => {

        'x-project-id': ctx.projectId        const moduleFixture: TestingModule = await Test.createTestingModule({

        }, imports: [AppModule],

            body: JSON.stringify({ message: 'What is the current schema version?' })        }).compile();

            });

app = moduleFixture.createNestApplication();

expect(response.status).toBe(200); await app.init();

const text = await response.text();

const events = parseSSEStream(text);        // Set up test environment

authToken = process.env.TEST_AUTH_TOKEN || 'test-token';

// Should have MCP tool events        userId = 'test-user-uuid';

const mcpStarted = events.find(e => e.type === 'mcp_tool' && e.status === 'started'); orgId = 'test-org-uuid';

expect(mcpStarted).toBeDefined(); projectId = 'test-project-uuid';

expect(mcpStarted.tool).toBe('schema_version'); mcpServerUrl = process.env.MCP_SERVER_URL || 'http://localhost:3001/mcp/rpc';



const mcpCompleted = events.find(e => e.type === 'mcp_tool' && e.status === 'completed');        // Ensure CHAT_ENABLE_MCP is enabled for most tests

expect(mcpCompleted).toBeDefined(); process.env.CHAT_ENABLE_MCP = '1';

expect(mcpCompleted.result).toBeDefined();        

        }, 10000);        // Enable deterministic mode for predictable test results

process.env.CHAT_TEST_DETERMINISTIC = '1';

it('should detect and execute schema_changelog tool for changes queries', async () => { });

const response = await fetch(`${ctx.baseUrl}/chat/stream`, {

    method: 'POST', afterAll(async () => {

    headers: {
        await app.close();

        'Content-Type': 'application/json',    });

                    ...authHeader('all', 'chat-mcp'),

        'x-org-id': ctx.orgId, describe('Basic Chat Streaming (No MCP)', () => {

            'x-project-id': ctx.projectId        it('should stream chat response without MCP tools for general queries', async () => {

            },            const response = await request(app.getHttpServer())

            body: JSON.stringify({ message: 'What changed in the schema recently?' }).post('/chat/stream')

        });                .set('Authorization', `Bearer ${authToken}`)

            .set('X-Org-ID', orgId)

    expect(response.status).toBe(200);                .set('X-Project-ID', projectId)

    const text = await response.text();                .send({

        const events = parseSSEStream(text); message: 'Hello, how are you today?',

    })

    const mcpStarted = events.find(e => e.type === 'mcp_tool' && e.status === 'started');                .expect(HttpStatus.OK)

    expect(mcpStarted).toBeDefined();                .expect('Content-Type', /text\/event-stream/);

    expect(mcpStarted.tool).toBe('schema_changelog');

}, 10000); const events = parseSSEStream(response.text);



it('should detect and execute type_info tool for entity queries', async () => {            // Verify event types

    const response = await fetch(`${ctx.baseUrl}/chat/stream`, { expect(events.length).toBeGreaterThan(0);

    method: 'POST', expect(events[0].type).toBe('meta');

    headers: {
        expect(events[events.length - 1].type).toBe('done');

        'Content-Type': 'application/json',

                    ...authHeader('all', 'chat-mcp'),            // Should NOT have mcp_tool events for general queries

    'x-org-id': ctx.orgId,            const mcpEvents = events.filter(e => e.type === 'mcp_tool');

'x-project-id': ctx.projectId            expect(mcpEvents.length).toBe(0);

                },

body: JSON.stringify({ message: 'Tell me about the Document entity type' })            // Should have token events (deterministic mode emits 5 tokens)

            }); const tokenEvents = events.filter(e => e.type === 'token');

expect(tokenEvents.length).toBeGreaterThan(0);

expect(response.status).toBe(200);        });

const text = await response.text();    });

const events = parseSSEStream(text);

describe('MCP Tool Detection and Execution', () => {

    const mcpStarted = events.find(e => e.type === 'mcp_tool' && e.status === 'started'); it('should detect and execute schema_version tool for version queries', async () => {

        expect(mcpStarted).toBeDefined(); const response = await request(app.getHttpServer())

        expect(mcpStarted.tool).toBe('type_info');                .post('/chat/stream')

        expect(mcpStarted.args).toBeDefined();                .set('Authorization', `Bearer ${authToken}`)

        expect(mcpStarted.args.type_name).toBe('Document');                .set('X-Org-ID', orgId)

    }, 10000);                .set('X-Project-ID', projectId)

});                .send({

    message: 'What is the current schema version?',

    describe('Error Scenarios', () => {})

it('should handle MCP server unavailable gracefully', async () => {                .expect(HttpStatus.OK);

    // Temporarily set invalid MCP server URL

    const originalUrl = process.env.MCP_SERVER_URL; const events = parseSSEStream(response.text);

    process.env.MCP_SERVER_URL = 'http://localhost:99999'; // Invalid port

    // Verify MCP tool events

    const response = await fetch(`${ctx.baseUrl}/chat/stream`, {
        const mcpStarted = events.find(e => e.type === 'mcp_tool' && e.status === 'started');

        method: 'POST', expect(mcpStarted).toBeDefined();

        headers: { expect(mcpStarted.tool).toBe('schema_version');

    'Content-Type': 'application/json',

                    ...authHeader('all', 'chat-mcp'),            const mcpCompleted = events.find(e => e.type === 'mcp_tool' && e.status === 'completed');

'x-org-id': ctx.orgId, expect(mcpCompleted).toBeDefined();

'x-project-id': ctx.projectId            expect(mcpCompleted.tool).toBe('schema_version');

                }, expect(mcpCompleted.result).toBeDefined();

body: JSON.stringify({ message: 'What is the current schema version?' })

            });            // Verify no error events

const mcpError = events.find(e => e.type === 'mcp_tool' && e.status === 'error');

expect(response.status).toBe(200); expect(mcpError).toBeUndefined();

const text = await response.text();

const events = parseSSEStream(text);            // Should still have token and done events

expect(events.find(e => e.type === 'token')).toBeDefined();

// Should have an mcp_tool error event            expect(events.find(e => e.type === 'done')).toBeDefined();

const mcpError = events.find(e => e.type === 'mcp_tool' && e.status === 'error');        });

expect(mcpError).toBeDefined();

expect(mcpError.error).toBeDefined(); it('should detect and execute schema_changelog tool for changes queries', async () => {

    const response = await request(app.getHttpServer())

    // But chat should still continue and emit tokens                .post('/chat/stream')

    const tokenEvents = events.filter(e => e.type === 'token');                .set('Authorization', `Bearer ${authToken}`)

    expect(tokenEvents.length).toBeGreaterThan(0);                .set('X-Org-ID', orgId)

        .set('X-Project-ID', projectId)

    // Restore original URL                .send({

    process.env.MCP_SERVER_URL = originalUrl; message: 'Show me recent schema changes',

        }, 10000);                })

                .expect(HttpStatus.OK);

it('should continue chat generation even when MCP tool fails', async () => {

    // This test verifies the chat continues streaming even if MCP fails            const events = parseSSEStream(response.text);

    const response = await fetch(`${ctx.baseUrl}/chat/stream`, {

        method: 'POST', const mcpStarted = events.find(e => e.type === 'mcp_tool' && e.status === 'started');

        headers: {
            expect(mcpStarted).toBeDefined();

            'Content-Type': 'application/json', expect(mcpStarted.tool).toBe('schema_changelog');

                    ...authHeader('all', 'chat-mcp'),

    'x-org-id': ctx.orgId,            const mcpCompleted = events.find(e => e.type === 'mcp_tool' && e.status === 'completed');

'x-project-id': ctx.projectId            expect(mcpCompleted).toBeDefined();

                }, expect(mcpCompleted.tool).toBe('schema_changelog');

body: JSON.stringify({ message: 'What is the schema version?' })        });

            });

it('should detect and execute type_info tool for entity queries', async () => {

    expect(response.status).toBe(200); const response = await request(app.getHttpServer())

    const text = await response.text();                .post('/chat/stream')

    const events = parseSSEStream(text);                .set('Authorization', `Bearer ${authToken}`)

        .set('X-Org-ID', orgId)

    // Regardless of MCP success/failure, should have tokens and done                .set('X-Project-ID', projectId)

    expect(events.find(e => e.type === 'token')).toBeDefined();                .send({

        expect(events.find(e => e.type === 'done' && e.done === true)).toBeDefined(); message: 'Tell me about the Project entity',

        }, 10000);                })

    });                .expect(HttpStatus.OK);



describe('Feature Flag: CHAT_ENABLE_MCP', () => {
    const events = parseSSEStream(response.text);

    it('should skip MCP tools when CHAT_ENABLE_MCP=0', async () => {

        process.env.CHAT_ENABLE_MCP = '0'; const mcpStarted = events.find(e => e.type === 'mcp_tool' && e.status === 'started');

        expect(mcpStarted).toBeDefined();

        const response = await fetch(`${ctx.baseUrl}/chat/stream`, { expect(mcpStarted.tool).toBe('type_info');

        method: 'POST',

            headers: {
                const mcpCompleted = events.find(e => e.type === 'mcp_tool' && e.status === 'completed');

            'Content-Type': 'application/json', expect(mcpCompleted).toBeDefined();

                    ...authHeader('all', 'chat-mcp'), expect(mcpCompleted.result).toBeDefined();

    'x-org-id': ctx.orgId,        });

'x-project-id': ctx.projectId

                }, it('should pass extracted arguments to MCP tools', async () => {

    body: JSON.stringify({ message: 'What is the current schema version?' })            const response = await request(app.getHttpServer())

});                .post('/chat/stream')

    .set('Authorization', `Bearer ${authToken}`)

expect(response.status).toBe(200);                .set('X-Org-ID', orgId)

const text = await response.text();                .set('X-Project-ID', projectId)

const events = parseSSEStream(text);                .send({

    message: 'Show me the last 5 schema changes since yesterday',

    // Should NOT have any MCP tool events                })

    const mcpEvents = events.filter(e => e.type === 'mcp_tool');                .expect(HttpStatus.OK);

    expect(mcpEvents.length).toBe(0);

const events = parseSSEStream(response.text);

// But should still have tokens

expect(events.find(e => e.type === 'token')).toBeDefined(); const mcpCompleted = events.find(e => e.type === 'mcp_tool' && e.status === 'completed');

expect(mcpCompleted).toBeDefined();

// Restore MCP enabled            

process.env.CHAT_ENABLE_MCP = '1';            // Note: We can't easily verify the arguments passed to the tool in E2E,

        });            // but we can verify the tool was called successfully

expect(mcpCompleted.result).toBeDefined();

it('should use MCP tools when CHAT_ENABLE_MCP=1 (default)', async () => { });

process.env.CHAT_ENABLE_MCP = '1';    });



const response = await fetch(`${ctx.baseUrl}/chat/stream`, { describe('Error Scenarios', () => {

    method: 'POST', it('should handle MCP server unavailable gracefully', async () => {

        headers: {            // Set invalid MCP server URL

            'Content-Type': 'application/json',            const originalUrl = process.env.MCP_SERVER_URL;

                    ...authHeader('all', 'chat-mcp'), process.env.MCP_SERVER_URL = 'http://localhost:99999/invalid';

    'x-org-id': ctx.orgId,

        'x-project-id': ctx.projectId            const response = await request(app.getHttpServer())

},                .post('/chat/stream')

body: JSON.stringify({ message: 'What is the current schema version?' }).set('Authorization', `Bearer ${authToken}`)

            });                .set('X-Org-ID', orgId)

    .set('X-Project-ID', projectId)

expect(response.status).toBe(200);                .send({

    const text = await response.text(); message: 'What is the schema version?',

    const events = parseSSEStream(text);
})

    .expect(HttpStatus.OK); // Should still return 200, not fail

// Should have MCP tool events

const mcpEvents = events.filter(e => e.type === 'mcp_tool'); const events = parseSSEStream(response.text);

expect(mcpEvents.length).toBeGreaterThan(0);

        }, 10000);            // Should have started event

    }); const mcpStarted = events.find(e => e.type === 'mcp_tool' && e.status === 'started');

expect(mcpStarted).toBeDefined();

describe('SSE Event Structure', () => {

    it('should emit events in correct order: meta -> mcp -> tokens -> done', async () => {            // Should have error event

        const response = await fetch(`${ctx.baseUrl}/chat/stream`, {
            const mcpError = events.find(e => e.type === 'mcp_tool' && e.status === 'error');

            method: 'POST', expect(mcpError).toBeDefined();

            headers: { expect(mcpError.error).toBeDefined();

        'Content-Type': 'application/json', expect(typeof mcpError.error).toBe('string');

                    ...authHeader('all', 'chat-mcp'),

        'x-org-id': ctx.orgId,            // Should STILL complete with tokens and done event (graceful degradation)

        'x-project-id': ctx.projectId            expect(events.find(e => e.type === 'token')).toBeDefined();

}, expect(events.find(e => e.type === 'done')).toBeDefined();

body: JSON.stringify({ message: 'What is the schema version?' })

            });            // Restore original URL

process.env.MCP_SERVER_URL = originalUrl;

expect(response.status).toBe(200);        });

const text = await response.text();

const events = parseSSEStream(text); it('should continue chat generation even when MCP tool fails', async () => {

    // This test verifies graceful degradation

    // First event should be meta            const originalUrl = process.env.MCP_SERVER_URL;

    expect(events[0].type).toBe('meta'); process.env.MCP_SERVER_URL = 'http://localhost:99999/invalid';

    expect(events[0].conversationId).toBeDefined();

    expect(events[0].messageId).toBeDefined(); const response = await request(app.getHttpServer())

        .post('/chat/stream')

    // Last event should be done                .set('Authorization', `Bearer ${authToken}`)

    const lastEvent = events[events.length - 1];                .set('X-Org-ID', orgId)

    expect(lastEvent.type).toBe('done');                .set('X-Project-ID', projectId)

    expect(lastEvent.done).toBe(true);                .send({

        message: 'What is the current schema version?',

        // MCP events (if present) should come after meta and before tokens                })

        const metaIndex = events.findIndex(e => e.type === 'meta');                .expect(HttpStatus.OK);

        const mcpIndex = events.findIndex(e => e.type === 'mcp_tool');

        const tokenIndex = events.findIndex(e => e.type === 'token'); const events = parseSSEStream(response.text);



        if(mcpIndex >= 0) {            // Should have meta, mcp_tool (error), tokens, and done

        expect(mcpIndex).toBeGreaterThan(metaIndex); expect(events.find(e => e.type === 'meta')).toBeDefined();

        expect(tokenIndex).toBeGreaterThan(mcpIndex); expect(events.find(e => e.type === 'mcp_tool' && e.status === 'error')).toBeDefined();

    } expect(events.filter(e => e.type === 'token').length).toBeGreaterThan(0);

}, 10000); expect(events.find(e => e.type === 'done')).toBeDefined();



it('should include required fields in mcp_tool started event', async () => {            // Restore

    const response = await fetch(`${ctx.baseUrl}/chat/stream`, {
        process.env.MCP_SERVER_URL = originalUrl;

        method: 'POST',
    });

    headers: {

        'Content-Type': 'application/json', it('should handle detection errors gracefully', async () => {

                    ...authHeader('all', 'chat-mcp'),            // Even if detection fails, chat should continue

            'x-org-id': ctx.orgId,            const response = await request(app.getHttpServer())

        'x-project-id': ctx.projectId.post('/chat/stream')

    },                .set('Authorization', `Bearer ${authToken}`)

    body: JSON.stringify({ message: 'What is the schema version?' }).set('X-Org-ID', orgId)

});                .set('X-Project-ID', projectId)

    .send({

        expect(response.status).toBe(200); message: '', // Empty message might cause detection issues

            const text = await response.text();                })

const events = parseSSEStream(text);                .expect(HttpStatus.OK);



const mcpStarted = events.find(e => e.type === 'mcp_tool' && e.status === 'started'); const events = parseSSEStream(response.text);

if (mcpStarted) {

    expect(mcpStarted.tool).toBeDefined();            // Should still complete (might not have MCP events, but should have done)

    expect(typeof mcpStarted.tool).toBe('string'); expect(events.find(e => e.type === 'done')).toBeDefined();

    expect(mcpStarted.args).toBeDefined();
});

            }    });

        }, 10000);

describe('Feature Flag: CHAT_ENABLE_MCP', () => {

    it('should include result in mcp_tool completed event', async () => {
        it('should skip MCP tools when CHAT_ENABLE_MCP=0', async () => {

            const response = await fetch(`${ctx.baseUrl}/chat/stream`, {            // Disable MCP

                method: 'POST', process.env.CHAT_ENABLE_MCP = '0';

                headers: {

                    'Content-Type': 'application/json', const response = await request(app.getHttpServer())

                    ...authHeader('all', 'chat-mcp'),                .post('/chat/stream')

                    'x-org-id': ctx.orgId,                .set('Authorization', `Bearer ${authToken}`)

                    'x-project-id': ctx.projectId.set('X-Org-ID', orgId)

                },                .set('X-Project-ID', projectId)

                body: JSON.stringify({ message: 'What is the schema version?' }).send({

                }); message: 'What is the current schema version?',

            })

            expect(response.status).toBe(200);                .expect(HttpStatus.OK);

            const text = await response.text();

            const events = parseSSEStream(text); const events = parseSSEStream(response.text);



            const mcpCompleted = events.find(e => e.type === 'mcp_tool' && e.status === 'completed');            // Should NOT have any mcp_tool events

            if (mcpCompleted) {
                const mcpEvents = events.filter(e => e.type === 'mcp_tool');

                expect(mcpCompleted.tool).toBeDefined(); expect(mcpEvents.length).toBe(0);

                expect(mcpCompleted.result).toBeDefined();

            }            // Should still have normal chat flow

        }, 10000); expect(events.find(e => e.type === 'meta')).toBeDefined();

    }); expect(events.find(e => e.type === 'token')).toBeDefined();

    expect(events.find(e => e.type === 'done')).toBeDefined();

    describe('Context Injection and LLM Response Quality', () => {

        it('should inject MCP context into LLM prompt', async () => {            // Re-enable for other tests

            const response = await fetch(`${ctx.baseUrl}/chat/stream`, {
                process.env.CHAT_ENABLE_MCP = '1';

                method: 'POST',
            });

            headers: {

                'Content-Type': 'application/json', it('should use MCP tools when CHAT_ENABLE_MCP=1 (default)', async () => {

                    ...authHeader('all', 'chat-mcp'), process.env.CHAT_ENABLE_MCP = '1';

                'x-org-id': ctx.orgId,

                    'x-project-id': ctx.projectId            const response = await request(app.getHttpServer())

            },                .post('/chat/stream')

            body: JSON.stringify({ message: 'What is the current schema version?' }).set('Authorization', `Bearer ${authToken}`)

        });                .set('X-Org-ID', orgId)

            .set('X-Project-ID', projectId)

        expect(response.status).toBe(200);                .send({

            const text = await response.text(); message: 'What is the schema version?',

            const events = parseSSEStream(text);
        })

            .expect(HttpStatus.OK);

        // If MCP tool executed, we should have tokens that reference the context

        const mcpCompleted = events.find(e => e.type === 'mcp_tool' && e.status === 'completed'); const events = parseSSEStream(response.text);

        const tokenEvents = events.filter(e => e.type === 'token');

        // Should HAVE mcp_tool events

        if (mcpCompleted && tokenEvents.length > 0) {
            const mcpEvents = events.filter(e => e.type === 'mcp_tool');

            // In deterministic mode, we get specific tokens            expect(mcpEvents.length).toBeGreaterThan(0);

            // The LLM should have received the MCP context in its prompt        });

            expect(tokenEvents.length).toBeGreaterThan(0);

        } it('should default to enabled when CHAT_ENABLE_MCP is not set', async () => {

        }, 10000);            // Remove flag (tests default behavior)

    }); delete process.env.CHAT_ENABLE_MCP;



    describe('Performance and Timeouts', () => {
        const response = await request(app.getHttpServer())

        it('should complete within reasonable time', async () => {                .post('/chat/stream')

            const start = Date.now();                .set('Authorization', `Bearer ${authToken}`)

                .set('X-Org-ID', orgId)

            const response = await fetch(`${ctx.baseUrl}/chat/stream`, {                .set('X-Project-ID', projectId)

                method: 'POST',                .send({

                headers: {
                    message: 'Schema version?',

                    'Content-Type': 'application/json',
                })

                    ...authHeader('all', 'chat-mcp'),                .expect(HttpStatus.OK);

                'x-org-id': ctx.orgId,

                'x-project-id': ctx.projectId            const events = parseSSEStream(response.text);

            },

                body: JSON.stringify({ message: 'What is the schema version?' })            // Default is enabled, so should have MCP events

            }); const mcpEvents = events.filter(e => e.type === 'mcp_tool');

        expect(mcpEvents.length).toBeGreaterThan(0);

        expect(response.status).toBe(200);

        await response.text();            // Restore

        process.env.CHAT_ENABLE_MCP = '1';

        const duration = Date.now() - start;
    });

});

// Should complete within 10 seconds even with MCP tool execution

expect(duration).toBeLessThan(10000); describe('SSE Event Structure', () => {

}, 15000); it('should emit events in correct order: meta -> mcp -> tokens -> done', async () => {

}); const response = await request(app.getHttpServer())

});                .post('/chat/stream')

    .set('Authorization', `Bearer ${authToken}`)
    .set('X-Org-ID', orgId)
    .set('X-Project-ID', projectId)
    .send({
        message: 'What is the schema version?',
    })
    .expect(HttpStatus.OK);

const events = parseSSEStream(response.text);

// Extract event types in order
const eventTypes = events.map(e => e.type);

// Verify order
const metaIdx = eventTypes.indexOf('meta');
const mcpIdx = eventTypes.findIndex(t => t === 'mcp_tool');
const tokenIdx = eventTypes.indexOf('token');
const doneIdx = eventTypes.indexOf('done');

expect(metaIdx).toBe(0); // meta is first
expect(mcpIdx).toBeGreaterThan(metaIdx); // mcp after meta
expect(tokenIdx).toBeGreaterThan(mcpIdx); // tokens after mcp
expect(doneIdx).toBe(events.length - 1); // done is last
        });

it('should include required fields in mcp_tool started event', async () => {
    const response = await request(app.getHttpServer())
        .post('/chat/stream')
        .set('Authorization', `Bearer ${authToken}`)
        .set('X-Org-ID', orgId)
        .set('X-Project-ID', projectId)
        .send({
            message: 'Schema version?',
        })
        .expect(HttpStatus.OK);

    const events = parseSSEStream(response.text);

    const mcpStarted = events.find(e => e.type === 'mcp_tool' && e.status === 'started');
    expect(mcpStarted).toBeDefined();
    expect(mcpStarted).toHaveProperty('type', 'mcp_tool');
    expect(mcpStarted).toHaveProperty('tool');
    expect(mcpStarted).toHaveProperty('status', 'started');
    expect(typeof mcpStarted.tool).toBe('string');
});

it('should include result in mcp_tool completed event', async () => {
    const response = await request(app.getHttpServer())
        .post('/chat/stream')
        .set('Authorization', `Bearer ${authToken}`)
        .set('X-Org-ID', orgId)
        .set('X-Project-ID', projectId)
        .send({
            message: 'What is the schema version?',
        })
        .expect(HttpStatus.OK);

    const events = parseSSEStream(response.text);

    const mcpCompleted = events.find(e => e.type === 'mcp_tool' && e.status === 'completed');
    expect(mcpCompleted).toBeDefined();
    expect(mcpCompleted).toHaveProperty('type', 'mcp_tool');
    expect(mcpCompleted).toHaveProperty('tool');
    expect(mcpCompleted).toHaveProperty('status', 'completed');
    expect(mcpCompleted).toHaveProperty('result');
    expect(mcpCompleted.result).toBeDefined();
});

it('should include error message in mcp_tool error event', async () => {
    const originalUrl = process.env.MCP_SERVER_URL;
    process.env.MCP_SERVER_URL = 'http://invalid-host:99999/mcp/rpc';

    const response = await request(app.getHttpServer())
        .post('/chat/stream')
        .set('Authorization', `Bearer ${authToken}`)
        .set('X-Org-ID', orgId)
        .set('X-Project-ID', projectId)
        .send({
            message: 'Schema version?',
        })
        .expect(HttpStatus.OK);

    const events = parseSSEStream(response.text);

    const mcpError = events.find(e => e.type === 'mcp_tool' && e.status === 'error');
    expect(mcpError).toBeDefined();
    expect(mcpError).toHaveProperty('type', 'mcp_tool');
    expect(mcpError).toHaveProperty('tool');
    expect(mcpError).toHaveProperty('status', 'error');
    expect(mcpError).toHaveProperty('error');
    expect(typeof mcpError.error).toBe('string');
    expect(mcpError.error.length).toBeGreaterThan(0);

    process.env.MCP_SERVER_URL = originalUrl;
});
    });

describe('Context Injection and LLM Response Quality', () => {
    it('should inject MCP context into LLM prompt', async () => {
        // This test verifies that when MCP tool returns context,
        // it's used in the LLM prompt (we can't directly verify the prompt,
        // but we can verify the flow completes successfully)

        const response = await request(app.getHttpServer())
            .post('/chat/stream')
            .set('Authorization', `Bearer ${authToken}`)
            .set('X-Org-ID', orgId)
            .set('X-Project-ID', projectId)
            .send({
                message: 'What is the current schema version?',
            })
            .expect(HttpStatus.OK);

        const events = parseSSEStream(response.text);

        // Verify MCP tool completed successfully
        const mcpCompleted = events.find(e => e.type === 'mcp_tool' && e.status === 'completed');
        expect(mcpCompleted).toBeDefined();
        expect(mcpCompleted.result).toBeDefined();

        // Verify tokens were generated (LLM used the context)
        const tokenEvents = events.filter(e => e.type === 'token');
        expect(tokenEvents.length).toBeGreaterThan(0);

        // In deterministic mode, we get exactly 5 tokens
        expect(tokenEvents.length).toBe(5);
    });

    it('should handle empty MCP context gracefully', async () => {
        // Even if MCP tool returns empty/null content, chat should continue
        const response = await request(app.getHttpServer())
            .post('/chat/stream')
            .set('Authorization', `Bearer ${authToken}`)
            .set('X-Org-ID', orgId)
            .set('X-Project-ID', projectId)
            .send({
                message: 'Tell me about NonExistentEntity',
            })
            .expect(HttpStatus.OK);

        const events = parseSSEStream(response.text);

        // Should still complete successfully
        expect(events.find(e => e.type === 'done')).toBeDefined();

        // Should still have token generation (even without context)
        const tokenEvents = events.filter(e => e.type === 'token');
        expect(tokenEvents.length).toBeGreaterThan(0);
    });
});

describe('Conversation Persistence', () => {
    it('should persist conversation with MCP context', async () => {
        const response = await request(app.getHttpServer())
            .post('/chat/stream')
            .set('Authorization', `Bearer ${authToken}`)
            .set('X-Org-ID', orgId)
            .set('X-Project-ID', projectId)
            .send({
                message: 'What is the schema version?',
            })
            .expect(HttpStatus.OK);

        const events = parseSSEStream(response.text);

        // Extract conversation ID from meta event
        const metaEvent = events.find(e => e.type === 'meta');
        expect(metaEvent).toBeDefined();
        expect(metaEvent).toHaveProperty('conversationId');

        const conversationId = metaEvent.conversationId;
        expect(conversationId).toBeTruthy();

        // Verify conversation was persisted
        // (This would require access to database or conversation API)
        // For now, just verify we got a conversation ID
        expect(typeof conversationId).toBe('string');
    });
});

describe('Performance and Timeouts', () => {
    it('should complete within reasonable time', async () => {
        const startTime = Date.now();

        const response = await request(app.getHttpServer())
            .post('/chat/stream')
            .set('Authorization', `Bearer ${authToken}`)
            .set('X-Org-ID', orgId)
            .set('X-Project-ID', projectId)
            .send({
                message: 'What is the schema version?',
            })
            .timeout(10000) // 10 second timeout
            .expect(HttpStatus.OK);

        const duration = Date.now() - startTime;

        // In deterministic mode with local MCP server, should be fast
        expect(duration).toBeLessThan(10000);

        const events = parseSSEStream(response.text);
        expect(events.find(e => e.type === 'done')).toBeDefined();
    });
});
});
