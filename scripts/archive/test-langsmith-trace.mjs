// Test script to trigger a chat request and verify LangSmith tracing
import fetch from 'node-fetch';
import { randomUUID } from 'crypto';

const API_URL = 'http://localhost:3002';

async function testChat() {
  console.log('🔍 Testing LangSmith tracing with a simple chat request...\n');
  
  const projectId = randomUUID();
  
  // Step 1: Create a conversation
  console.log(`1️⃣ Creating conversation (projectId: ${projectId})...`);
  const conversationRes = await fetch(`${API_URL}/chat-sdk/conversations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: 'LangSmith Test',
      projectId
    })
  });
  
  if (!conversationRes.ok) {
    console.error('❌ Failed to create conversation:', await conversationRes.text());
    return;
  }
  
  const conversation = await conversationRes.json();
  console.log(`✅ Conversation created: ${conversation.id}\n`);
  
  // Step 2: Send a chat message
  console.log('2️⃣ Sending chat message: "Hello, what is 2+2?"...');
  const chatRes = await fetch(`${API_URL}/chat-sdk`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      conversationId: conversation.id,
      projectId,
      messages: [
        { role: 'user', content: 'Hello, what is 2+2?' }
      ]
    })
  });
  
  if (!chatRes.ok) {
    console.error('❌ Chat request failed:', chatRes.status, chatRes.statusText);
    console.error(await chatRes.text());
    return;
  }
  
  console.log('✅ Chat response received (streaming)');
  console.log('\n📝 Response:');
  
  // Read the SSE stream
  const body = chatRes.body;
  const reader = body.getReader();
  const decoder = new TextDecoder();
  
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      const chunk = decoder.decode(value);
      process.stdout.write(chunk);
    }
  } catch (error) {
    console.error('\n❌ Error reading stream:', error.message);
  }
  
  console.log('\n\n✅ Test complete!');
  console.log('\n🔍 Check LangSmith: https://smith.langchain.com/');
  console.log(`   Project: pr-aching-document-10`);
  console.log(`   Endpoint: https://eu.api.smith.langchain.com`);
  console.log(`   Look for a trace with conversation ID: ${conversation.id}`);
}

testChat().catch(console.error);
