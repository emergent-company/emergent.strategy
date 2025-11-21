// Simpler test - just send a chat message without conversation
import fetch from 'node-fetch';

const API_URL = 'http://localhost:3002';

async function testChat() {
  console.log('🔍 Testing LangSmith tracing with a simple chat request...\n');
  
  // Send a chat message without conversation
  console.log('📤 Sending chat message: "What is 2+2?"...');
  const chatRes = await fetch(`${API_URL}/chat-sdk`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messages: [
        { role: 'user', content: 'What is 2+2?' }
      ]
    })
  });
  
  if (!chatRes.ok) {
    console.error(`❌ Chat request failed: ${chatRes.status} ${chatRes.statusText}`);
    console.error(await chatRes.text());
    return;
  }
  
  console.log('✅ Chat response received (streaming)');
  console.log('\n📝 Response:');
  
  // Read the SSE stream
  const body = chatRes.body;
  const reader = body.getReader();
  const decoder = new TextDecoder();
  
  let fullResponse = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      const chunk = decoder.decode(value);
      fullResponse += chunk;
      process.stdout.write(chunk);
    }
  } catch (error) {
    console.error('\n❌ Error reading stream:', error.message);
  }
  
  console.log('\n\n✅ Test complete!');
  console.log('\n🔍 Now check LangSmith for traces:');
  console.log('   URL: https://smith.langchain.com/');
  console.log('   Project: pr-aching-document-10');
  console.log('   Endpoint: https://eu.api.smith.langchain.com');
  console.log('\n   You should see a new trace for the question "What is 2+2?"');
}

testChat().catch(console.error);
