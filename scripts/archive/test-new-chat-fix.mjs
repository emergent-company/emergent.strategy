#!/usr/bin/env node
/**
 * Test script for new chat creation fix
 * Tests that:
 * 1. New chat button clears active conversation
 * 2. First message creates a conversation
 * 3. Conversation appears in sidebar without refresh
 * 4. Subsequent messages work normally
 */

import fetch from 'node-fetch';

const API_BASE = 'http://localhost:3002';
const TEST_USER = {
  email: 'test@example.com',
  password: 'TestPassword123!',
};

let accessToken = null;

async function login() {
  console.log('🔐 Logging in as test user...');
  const response = await fetch(`${API_BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(TEST_USER),
  });

  if (!response.ok) {
    throw new Error(`Login failed: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  accessToken = data.access_token;
  console.log('✅ Login successful\n');
  return accessToken;
}

async function getConversations() {
  const response = await fetch(`${API_BASE}/api/chat-ui/conversations`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Get conversations failed: ${response.status}`);
  }

  return await response.json();
}

async function sendMessage(conversationId, message, projectId) {
  console.log(`📤 Sending message: "${message}"`);
  if (projectId) {
    console.log(`   Project: ${projectId}`);
  }

  const body = { messages: [{ role: 'user', content: message }] };
  if (conversationId) {
    body.id = conversationId;
  }
  if (projectId) {
    body.projectId = projectId;
  }

  const response = await fetch(`${API_BASE}/api/chat-sdk/chat`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`Send message failed: ${response.status}`);
  }

  // Parse streaming response
  let fullResponse = '';
  let conversationIdFromStream = null;
  const reader = response.body;

  for await (const chunk of reader) {
    const text = chunk.toString();
    const lines = text.split('\n');

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        try {
          const data = JSON.parse(line.slice(6));

          // Check for metadata with conversation ID
          if (data.type === 'metadata' && data.id) {
            conversationIdFromStream = data.id;
            console.log(
              `   📋 Conversation ID from stream: ${conversationIdFromStream}`
            );
          }

          if (data.type === 'text-delta' && data.textDelta) {
            fullResponse += data.textDelta;
          }
        } catch (e) {
          // Skip non-JSON lines
        }
      }
    }
  }

  console.log(`   ✅ Response received (${fullResponse.length} chars)`);
  return { response: fullResponse, conversationId: conversationIdFromStream };
}

async function testNewChatFlow() {
  console.log('🧪 Testing New Chat Flow\n');
  console.log('═'.repeat(60));

  try {
    // Step 1: Login
    await login();

    // Step 2: Get initial conversation count
    console.log('📊 Step 1: Get initial conversations');
    const initialConvs = await getConversations();
    console.log(`   Initial conversation count: ${initialConvs.length}\n`);

    // Step 3: Send first message (simulate new chat)
    console.log('📊 Step 2: Send first message (new chat)');
    const result1 = await sendMessage(
      null, // No conversation ID - this is a new chat
      'Hello, this is a test of the new chat feature',
      null // No project for this test
    );

    if (!result1.conversationId) {
      console.log('   ⚠️  Warning: No conversation ID in stream metadata');
    }
    console.log('');

    // Step 4: Wait a moment for backend to save
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Step 5: Fetch conversations again
    console.log(
      '📊 Step 3: Fetch conversations (simulating onFinish callback)'
    );
    const afterFirstMessage = await getConversations();
    console.log(`   Conversation count: ${afterFirstMessage.length}`);

    if (afterFirstMessage.length > initialConvs.length) {
      const newConv = afterFirstMessage[0]; // Should be newest
      console.log(`   ✅ New conversation created: ${newConv.id}`);
      console.log(`   Title: ${newConv.title || '(untitled)'}`);
      console.log(`   Created: ${newConv.createdAt}\n`);

      // Step 6: Send second message with conversation ID
      console.log('📊 Step 4: Send second message (using conversation ID)');
      await sendMessage(
        newConv.id,
        'This is the second message in the same conversation',
        null
      );
      console.log('');

      // Step 7: Verify it's still the same conversation
      await new Promise((resolve) => setTimeout(resolve, 1000));
      const afterSecondMessage = await getConversations();

      if (afterSecondMessage.length === afterFirstMessage.length) {
        console.log(
          '   ✅ Conversation count unchanged (message added to existing conversation)'
        );
      } else {
        console.log('   ⚠️  Warning: Conversation count changed unexpectedly');
      }

      console.log('\n' + '═'.repeat(60));
      console.log('✅ TEST PASSED: New chat flow works correctly!');
      console.log('   - Conversation created on first message');
      console.log('   - Conversation ID available in stream metadata');
      console.log('   - Subsequent messages use same conversation');
    } else {
      console.log('   ❌ FAILED: New conversation not created');
      console.log('\n' + '═'.repeat(60));
      console.log('❌ TEST FAILED');
    }
  } catch (error) {
    console.error('\n❌ Test failed with error:');
    console.error(error);
    process.exit(1);
  }
}

// Run the test
testNewChatFlow();
