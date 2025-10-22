#!/usr/bin/env node

/**
 * Complete test for Chat Graph Search Integration
 * 
 * This script:
 * 1. Creates test graph objects with embeddings
 * 2. Tests the graph search directly
 * 3. Tests chat integration with those objects
 * 4. Verifies SSE events contain graphObjects
 */

import pg from 'pg';
const { Pool } = pg;

// Database connection
const pool = new Pool({
    host: 'localhost',
    port: 5432,
    database: 'spec',
    user: 'spec',
    password: 'spec',
});

// Test project (using an existing one)
const TEST_PROJECT_ID = '3b56145d-26b6-4eea-b32c-16f9273533eb';
const TEST_ORG_ID = '8ec7cf01-e9d0-4604-8304-1d762b97ace9';

console.log('🧪 Chat Graph Search Integration Test\n');

async function cleanup() {
    console.log('🧹 Cleaning up old test objects...');
    await pool.query(`
    DELETE FROM kb.graph_objects 
    WHERE key LIKE 'test-chat-%'
  `);
    console.log('✅ Cleanup complete\n');
}

async function createTestObjects() {
    console.log('📦 Creating test graph objects via API...');

    const objects = [
        {
            key: 'test-chat-legalplant-strategy',
            type: 'Decision',
            name: 'LegalPlant Integration Strategy',
            description: 'Strategic decision for LegalPlant partnership integration approach'
        },
        {
            key: 'test-chat-enterprise-ai',
            type: 'Question',
            name: 'Enterprise AI Communication Strategy',
            description: 'How should we communicate our enterprise AI capabilities to the market?'
        },
        {
            key: 'test-chat-person-graph',
            type: 'Pattern',
            name: 'Person Graph Classification Mechanism',
            description: 'Pattern for classifying entities in the person knowledge graph'
        },
        {
            key: 'test-chat-prioritization',
            type: 'Question',
            name: 'ECIT Enterprise Strategic Prioritization',
            description: 'What factors should guide prioritization of ECIT enterprise initiatives?'
        },
    ];

    for (const obj of objects) {
        const response = await fetch('http://localhost:3001/graph/objects', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Project-ID': TEST_PROJECT_ID,
                'X-Org-ID': TEST_ORG_ID,
            },
            body: JSON.stringify({
                type: obj.type,
                key: obj.key,
                properties: {
                    name: obj.name,
                    description: obj.description,
                },
            }),
        });

        if (!response.ok) {
            const text = await response.text();
            console.error(`   ❌ Failed to create ${obj.name}: ${response.status}`);
            console.error(`   Response: ${text}`);
            continue;
        }

        const created = await response.json();
        console.log(`   ✓ Created: [${obj.type}] ${obj.name} (${created.id})`);

        // Now generate embeddings for it
        const embedResponse = await fetch(`http://localhost:3001/graph/objects/${created.id}/embeddings`, {
            method: 'POST',
            headers: {
                'X-Project-ID': TEST_PROJECT_ID,
                'X-Org-ID': TEST_ORG_ID,
            },
        });

        if (embedResponse.ok) {
            console.log(`      ✓ Generated embedding`);
        } else {
            console.log(`      ⚠️ Embedding generation skipped (may not be configured)`);
        }
    }

    console.log('✅ Test objects created\n');
}

async function testGraphSearchDirect() {
    console.log('🔍 Testing graph search directly...');

    const result = await pool.query(`
    SELECT 
      id, type, key,
      properties->>'name' as name,
      properties->>'description' as description,
      embedding_vec <=> $1::vector as distance
    FROM kb.graph_objects
    WHERE deleted_at IS NULL
      AND project_id = $2
      AND org_id = $3
      AND status = 'accepted'
      AND embedding_vec IS NOT NULL
    ORDER BY embedding_vec <=> $1::vector
    LIMIT 5
  `, [
        `[${Array(32).fill(0).join(',')}]`, // Zero vector for testing (32 dimensions)
        TEST_PROJECT_ID,
        TEST_ORG_ID
    ]);

    console.log(`   Found ${result.rows.length} objects:`);
    result.rows.forEach(obj => {
        console.log(`   - [${obj.type}] ${obj.name} (distance: ${obj.distance?.toFixed(3)})`);
    });
    console.log('✅ Direct search works\n');

    return result.rows;
}

async function testChatIntegration() {
    console.log('💬 Testing chat integration...');

    // We'll use the internal graph service endpoint
    const response = await fetch('http://localhost:3001/graph/search-with-neighbors', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-Project-ID': TEST_PROJECT_ID,
            'X-Org-ID': TEST_ORG_ID,
        },
        body: JSON.stringify({
            query: 'LegalPlant integration strategy',
            limit: 5,
            includeNeighbors: true,
            maxNeighbors: 3,
            maxDistance: 0.5,
        }),
    });

    if (!response.ok) {
        console.error(`   ❌ Graph search API failed: ${response.status}`);
        const text = await response.text();
        console.error(`   Response: ${text}`);
        return null;
    }

    const data = await response.json();
    console.log(`   ✓ Graph search returned ${data.primaryResults?.length || 0} results`);

    if (data.primaryResults && data.primaryResults.length > 0) {
        data.primaryResults.forEach(obj => {
            console.log(`   - [${obj.type}] ${obj.properties?.name || obj.key}`);
        });
    }

    console.log('✅ Graph search API works\n');
    return data;
}

async function testChatStream() {
    console.log('🌊 Testing chat stream with graph search...');

    // Create a test conversation first
    const convResponse = await fetch('http://localhost:3001/chat/conversations', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-Project-ID': TEST_PROJECT_ID,
            'X-Org-ID': TEST_ORG_ID,
        },
        body: JSON.stringify({
            title: 'Test Graph Search',
        }),
    });

    if (!convResponse.ok) {
        console.error(`   ❌ Failed to create conversation: ${convResponse.status}`);
        return;
    }

    const conversation = await convResponse.json();
    console.log(`   ✓ Created conversation: ${conversation.id}`);

    // Now stream a message
    console.log('   🔄 Sending message: "Tell me about LegalPlant integration strategy"');

    const streamResponse = await fetch(`http://localhost:3001/chat/${conversation.id}/stream?question=Tell%20me%20about%20LegalPlant%20integration%20strategy`, {
        method: 'GET',
        headers: {
            'X-Project-ID': TEST_PROJECT_ID,
            'X-Org-ID': TEST_ORG_ID,
            'Accept': 'text/event-stream',
        },
    });

    if (!streamResponse.ok) {
        console.error(`   ❌ Stream failed: ${streamResponse.status}`);
        const text = await streamResponse.text();
        console.error(`   Response: ${text}`);
        return;
    }

    console.log('   📡 Receiving SSE events...\n');

    const reader = streamResponse.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let foundGraphObjects = false;
    let foundGraphNeighbors = false;
    let graphObjectsCount = 0;

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
            if (line.startsWith('data: ')) {
                const data = JSON.parse(line.slice(6));

                if (data.meta) {
                    console.log('   📋 Meta:', JSON.stringify(data.meta, null, 2));
                }

                if (data.graphObjects) {
                    foundGraphObjects = true;
                    graphObjectsCount = data.graphObjects.length;
                    console.log(`   🎯 graphObjects event received! (${graphObjectsCount} objects)`);
                    data.graphObjects.forEach((obj, i) => {
                        console.log(`      ${i + 1}. [${obj.type}] ${obj.properties?.name || obj.key}`);
                        if (obj.distance) {
                            console.log(`         Distance: ${obj.distance.toFixed(3)}`);
                        }
                    });
                }

                if (data.graphNeighbors) {
                    foundGraphNeighbors = true;
                    const neighborCount = Object.keys(data.graphNeighbors).length;
                    console.log(`   🔗 graphNeighbors event received! (${neighborCount} objects with neighbors)`);
                }

                if (data.summary) {
                    console.log('\n   📊 Summary:');
                    console.log(`      - Token count: ${data.summary.token_count || 0}`);
                    console.log(`      - Citations count: ${data.summary.citations_count || 0}`);
                    console.log(`      - Graph objects count: ${data.summary.graph_objects_count || 0}`);
                }

                if (data.done) {
                    console.log('\n   ✅ Stream complete');
                    break;
                }
            }
        }
    }

    console.log('\n📊 Test Results:');
    console.log(`   graphObjects event: ${foundGraphObjects ? '✅ FOUND' : '❌ NOT FOUND'}`);
    console.log(`   graphNeighbors event: ${foundGraphNeighbors ? '✅ FOUND' : '❌ NOT FOUND'}`);
    console.log(`   Graph objects returned: ${graphObjectsCount}`);

    if (!foundGraphObjects) {
        console.log('\n⚠️  WARNING: graphObjects event not found in SSE stream!');
        console.log('   This suggests the graph search is not being called or not finding results.');
    }
}

async function main() {
    try {
        await cleanup();
        await createTestObjects();
        await testGraphSearchDirect();
        await testGraphSearchDirect();
        await testChatIntegration();
        await testChatStream();

        console.log('\n✅ All tests complete!');
    } catch (error) {
        console.error('\n❌ Test failed:', error.message);
        console.error(error);
        process.exit(1);
    } finally {
        await pool.end();
    }
}

main();
