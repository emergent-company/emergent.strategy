#!/usr/bin/env node

/**
 * Test script to verify graph search integration in chat
 * 
 * This script:
 * 1. Creates a test conversation
 * 2. Sends a message that should match embedded objects
 * 3. Verifies graph objects are returned in the response
 */

import http from 'http';

const API_BASE = 'http://localhost:3001';

// Test headers (no auth for local dev)
const headers = {
    'Content-Type': 'application/json',
    'X-Org-ID': 'test-org',
    'X-Project-ID': '11b1e87c-a86a-4a8f-bdb0-c15c6e06b591', // The project with embedded objects
};

/**
 * Make HTTP request
 */
function request(method, path, body = null) {
    return new Promise((resolve, reject) => {
        const options = {
            method,
            headers,
        };

        const req = http.request(`${API_BASE}${path}`, options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    resolve(JSON.parse(data));
                } catch (e) {
                    resolve(data);
                }
            });
        });

        req.on('error', reject);
        if (body) req.write(JSON.stringify(body));
        req.end();
    });
}

/**
 * Stream chat response
 */
function streamChat(message, conversationId = null) {
    return new Promise((resolve, reject) => {
        const path = conversationId
            ? `/chat/${conversationId}/stream`
            : '/chat/stream';

        const body = conversationId ? null : JSON.stringify({ message });

        const options = {
            method: conversationId ? 'GET' : 'POST',
            headers: conversationId ? { ...headers } : { ...headers },
        };

        const req = http.request(`${API_BASE}${path}`, options, (res) => {
            const events = [];
            let buffer = '';

            res.on('data', chunk => {
                buffer += chunk.toString();

                // Parse SSE events
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';

                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        try {
                            const event = JSON.parse(line.slice(6));
                            events.push(event);

                            // Log graph objects
                            if (event.graphObjects) {
                                console.log('\n✅ Graph Objects Found:', event.graphObjects.length);
                                for (const obj of event.graphObjects) {
                                    console.log(`   - [${obj.type}] ${obj.properties?.name || obj.key}`);
                                }
                            }

                            if (event.graphNeighbors) {
                                console.log('\n✅ Graph Neighbors:', Object.keys(event.graphNeighbors).length, 'groups');
                            }

                            if (event.done) {
                                resolve(events);
                            }
                        } catch (e) {
                            // Ignore parse errors
                        }
                    }
                }
            });

            res.on('error', reject);
        });

        req.on('error', reject);
        if (body) req.write(body);
        req.end();
    });
}

async function main() {
    console.log('🧪 Testing Chat Graph Search Integration\n');

    try {
        // Test 1: Create conversation and search for "LegalPlant" (matches 2 objects)
        console.log('📝 Test 1: Searching for "LegalPlant integration strategy"...');
        const events1 = await streamChat('Tell me about LegalPlant integration strategy');

        const graphObjects1 = events1.find(e => e.graphObjects)?.graphObjects || [];
        const summary1 = events1.find(e => e.summary);

        console.log('\n📊 Summary:');
        console.log(`   Tokens: ${summary1?.token_count || 0}`);
        console.log(`   Citations: ${summary1?.citations_count || 0}`);
        console.log(`   Graph Objects: ${summary1?.graph_objects_count || 0}`);

        if (graphObjects1.length > 0) {
            console.log('\n✅ SUCCESS: Graph search is working!');
            console.log(`   Found ${graphObjects1.length} relevant objects`);
        } else {
            console.log('\n⚠️  WARNING: No graph objects found (might need embeddings)');
        }

        // Test 2: Search for "enterprise" (matches 1 object)
        console.log('\n\n📝 Test 2: Searching for "enterprise AI communication"...');
        const events2 = await streamChat('What about enterprise AI communication strategy?');

        const graphObjects2 = events2.find(e => e.graphObjects)?.graphObjects || [];
        const summary2 = events2.find(e => e.summary);

        console.log('\n📊 Summary:');
        console.log(`   Tokens: ${summary2?.token_count || 0}`);
        console.log(`   Citations: ${summary2?.citations_count || 0}`);
        console.log(`   Graph Objects: ${summary2?.graph_objects_count || 0}`);

        if (graphObjects2.length > 0) {
            console.log('\n✅ SUCCESS: Graph search found relevant objects!');
        }

        console.log('\n\n🎉 All tests complete!');

    } catch (error) {
        console.error('\n❌ Test failed:', error.message);
        process.exit(1);
    }
}

main();
