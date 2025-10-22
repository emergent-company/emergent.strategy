#!/usr/bin/env node

/**
 * Test Chat Stream with Graph Objects
 * 
 * Makes a direct POST to /chat/stream and shows SSE events including graphObjects
 */

const TEST_PROJECT_ID = '3b56145d-26b6-4eea-b32c-16f9273533eb';
const TEST_ORG_ID = '8ec7cf01-e9d0-4604-8304-1d762b97ace9';

console.log('🧪 Testing Chat Stream with Graph Search\n');

async function testChatStreamDirect() {
    console.log('📡 Sending POST /chat/stream with message: "Tell me about LegalPlant integration strategy"\n');

    const response = await fetch('http://localhost:3001/chat/stream', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-Project-ID': TEST_PROJECT_ID,
            'X-Org-ID': TEST_ORG_ID,
            'Accept': 'text/event-stream',
        },
        body: JSON.stringify({
            message: 'Tell me about LegalPlant integration strategy',
        }),
    });

    if (!response.ok) {
        console.error(`❌ Chat stream failed: ${response.status}`);
        const text = await response.text();
        console.error(`Response: ${text}`);
        return;
    }

    console.log('✅ Stream started, receiving SSE events...\n');

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let foundGraphObjects = false;
    let foundGraphNeighbors = false;
    let graphObjectsCount = 0;
    let messageCount = 0;

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
            if (line.startsWith('data: ')) {
                const dataStr = line.slice(6);
                try {
                    const data = JSON.parse(dataStr);

                    if (data.meta) {
                        console.log('📋 [meta]', JSON.stringify(data.meta, null, 2));
                    }

                    if (data.graphObjects) {
                        foundGraphObjects = true;
                        graphObjectsCount = data.graphObjects.length;
                        console.log(`\n🎯 [graphObjects] Found ${graphObjectsCount} objects!`);
                        data.graphObjects.forEach((obj, i) => {
                            console.log(`   ${i + 1}. [${obj.type}] ${obj.properties?.name || obj.key}`);
                            if (obj.properties?.description) {
                                console.log(`      ${obj.properties.description}`);
                            }
                            if (obj.distance !== undefined) {
                                console.log(`      Distance: ${obj.distance.toFixed(3)}`);
                            }
                        });
                        console.log('');
                    }

                    if (data.graphNeighbors) {
                        foundGraphNeighbors = true;
                        const neighborCount = Object.keys(data.graphNeighbors).length;
                        console.log(`🔗 [graphNeighbors] ${neighborCount} objects with neighbors\n`);
                    }

                    if (data.message && data.streaming) {
                        messageCount++;
                        if (messageCount <= 10) {
                            process.stdout.write(data.message);
                        } else if (messageCount === 11) {
                            process.stdout.write('...');
                        }
                    }

                    if (data.summary) {
                        console.log('\n\n📊 [summary]');
                        console.log(`   Token count: ${data.summary.token_count || 0}`);
                        console.log(`   Citations count: ${data.summary.citations_count || 0}`);
                        console.log(`   Graph objects count: ${data.summary.graph_objects_count || 0}`);
                    }

                    if (data.done) {
                        console.log('\n✅ [done] Stream complete\n');
                        break;
                    }
                } catch (e) {
                    // Ignore parse errors for incomplete JSON
                }
            }
        }
    }

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🎉 Test Results:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`   graphObjects event: ${foundGraphObjects ? '✅ FOUND' : '❌ NOT FOUND'}`);
    console.log(`   graphNeighbors event: ${foundGraphNeighbors ? '✅ FOUND' : '❌ NOT FOUND'}`);
    console.log(`   Graph objects count: ${graphObjectsCount}`);
    console.log(`   Message tokens received: ${messageCount}`);

    if (foundGraphObjects) {
        console.log('\n✅ SUCCESS! Chat graph search integration is working!');
        console.log('\nWhat happened:');
        console.log('   1. ChatController received your message');
        console.log('   2. Called graphService.searchObjectsWithNeighbors()');
        console.log('   3. Found matching objects via FTS');
        console.log('   4. Emitted graphObjects in SSE stream');
        console.log('   5. Formatted objects as context for LLM');
        console.log('   6. LLM generated response using graph context');
    } else {
        console.log('\n⚠️ WARNING: graphObjects not found in stream');
        console.log('   Possible reasons:');
        console.log('   - CHAT_ENABLE_GRAPH_SEARCH=0 (feature disabled)');
        console.log('   - No objects match the query');
        console.log('   - Graph search error (check logs)');
    }
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
}

testChatStreamDirect().catch(console.error);
