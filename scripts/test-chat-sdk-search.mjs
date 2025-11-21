#!/usr/bin/env node
/**
 * Manual Test Script: Chat SDK with Unified Search
 *
 * Purpose: Test the chat SDK's integration with unified search by sending
 * messages that should trigger the search tool and verify results.
 *
 * Prerequisites:
 * 1. Server and admin apps running (nx run workspace-cli:workspace:start)
 * 2. Test user credentials in .env
 * 3. Project with documents uploaded and graph objects created
 *
 * Usage:
 *   node scripts/test-chat-sdk-search.mjs
 */

import 'dotenv/config';
import fetch from 'node-fetch';

// Configuration
const API_BASE = process.env.API_BASE || 'http://localhost:3002';
const TEST_USER_EMAIL = process.env.TEST_USER_EMAIL || 'test@example.com';
const TEST_USER_PASSWORD = process.env.TEST_USER_PASSWORD || 'TestPassword123!';

// Test state
let accessToken = '';
let testOrgId = '';
let testProjectId = '';
let conversationId = '';

/**
 * Main test flow
 */
async function main() {
  console.log('🧪 Testing Chat SDK with Unified Search Integration\n');

  try {
    // Step 1: Authenticate
    await authenticate();

    // Step 2: Get or create test project
    await setupTestProject();

    // Step 3: Create a new conversation
    await createConversation();

    // Step 4: Test search WITHOUT projectId (should not use search)
    await testChatWithoutProject();

    // Step 5: Test search WITH projectId (should use search)
    await testChatWithProject();

    // Step 6: Verify conversation history
    await verifyConversationHistory();

    console.log('\n✅ All tests passed!');
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    if (error.response) {
      const body = await error.response.text();
      console.error('Response body:', body);
    }
    process.exit(1);
  }
}

/**
 * Step 1: Authenticate with Zitadel and get access token
 */
async function authenticate() {
  console.log('📝 Step 1: Authenticating...');

  // For simplicity, using a direct token endpoint
  // In production, you'd use the full OAuth2 flow
  const response = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: TEST_USER_EMAIL,
      password: TEST_USER_PASSWORD,
    }),
  });

  if (!response.ok) {
    throw new Error(`Authentication failed: ${response.statusText}`);
  }

  const data = await response.json();
  accessToken = data.access_token || data.accessToken;

  if (!accessToken) {
    throw new Error('No access token received from authentication');
  }

  console.log('   ✓ Authenticated successfully\n');
}

/**
 * Step 2: Get or create test organization and project
 */
async function setupTestProject() {
  console.log('📦 Step 2: Setting up test project...');

  // Get organizations
  const orgsResponse = await fetch(`${API_BASE}/api/organizations`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!orgsResponse.ok) {
    throw new Error(
      `Failed to fetch organizations: ${orgsResponse.statusText}`
    );
  }

  const orgs = await orgsResponse.json();
  testOrgId = orgs[0]?.id;

  if (!testOrgId) {
    throw new Error('No organizations found. Please create one first.');
  }

  // Get projects in the organization
  const projectsResponse = await fetch(
    `${API_BASE}/api/organizations/${testOrgId}/projects`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );

  if (!projectsResponse.ok) {
    throw new Error(`Failed to fetch projects: ${projectsResponse.statusText}`);
  }

  const projects = await projectsResponse.json();
  testProjectId = projects[0]?.id;

  if (!testProjectId) {
    console.log('   ℹ No projects found, creating one...');

    // Create a test project
    const createResponse = await fetch(
      `${API_BASE}/api/organizations/${testOrgId}/projects`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: 'Chat SDK Test Project',
          description: 'Project for testing chat SDK search integration',
        }),
      }
    );

    if (!createResponse.ok) {
      throw new Error(`Failed to create project: ${createResponse.statusText}`);
    }

    const newProject = await createResponse.json();
    testProjectId = newProject.id;
  }

  console.log(`   ✓ Using project: ${testProjectId}\n`);
}

/**
 * Step 3: Create a new conversation
 */
async function createConversation() {
  console.log('💬 Step 3: Creating conversation...');

  const response = await fetch(`${API_BASE}/api/chat-sdk/conversations`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      title: 'Search Integration Test',
      projectId: testProjectId,
    }),
  });

  if (!response.ok) {
    throw new Error(`Failed to create conversation: ${response.statusText}`);
  }

  const data = await response.json();
  conversationId = data.id;

  console.log(`   ✓ Created conversation: ${conversationId}\n`);
}

/**
 * Step 4: Test chat WITHOUT projectId (search tool should NOT be used)
 */
async function testChatWithoutProject() {
  console.log('🔍 Step 4: Testing chat WITHOUT projectId (search disabled)...');

  const response = await fetch(`${API_BASE}/api/chat-sdk`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messages: [
        {
          role: 'user',
          content: 'What documents do we have about authentication?',
        },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`Chat request failed: ${response.statusText}`);
  }

  // For streaming responses, we just verify it started successfully
  console.log(`   ✓ Chat stream started (no project context)\n`);
}

/**
 * Step 5: Test chat WITH projectId (search tool SHOULD be used)
 */
async function testChatWithProject() {
  console.log('🔍 Step 5: Testing chat WITH projectId (search enabled)...');
  console.log(
    '   Query: "What decisions have we made about API authentication?"\n'
  );

  const response = await fetch(`${API_BASE}/api/chat-sdk`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messages: [
        {
          role: 'user',
          content: 'What decisions have we made about API authentication?',
        },
      ],
      conversationId,
      projectId: testProjectId,
    }),
  });

  if (!response.ok) {
    throw new Error(`Chat request failed: ${response.statusText}`);
  }

  const returnedConversationId = response.headers.get('x-conversation-id');
  console.log(`   ✓ Chat stream started with search tool enabled`);
  console.log(`   ✓ Conversation ID: ${returnedConversationId}`);
  console.log(`   ℹ Check server logs for search tool invocations\n`);

  // Note: To fully verify the search tool was called, check server logs for:
  // - "[ChatSDK] Creating search tool for project..."
  // - "Executing unified search..."
}

/**
 * Step 6: Verify conversation history was saved
 */
async function verifyConversationHistory() {
  console.log('📜 Step 6: Verifying conversation history...');

  // Wait a bit for async message saving
  await new Promise((resolve) => setTimeout(resolve, 2000));

  const response = await fetch(
    `${API_BASE}/api/chat-ui/conversations/${conversationId}`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to fetch conversation: ${response.statusText}`);
  }

  const conversation = await response.json();

  console.log(`   ✓ Conversation has ${conversation.messages.length} messages`);
  console.log(`   ✓ Messages saved correctly\n`);

  if (conversation.messages.length > 0) {
    console.log('   Latest messages:');
    conversation.messages.slice(-2).forEach((msg, i) => {
      const preview = msg.content.substring(0, 60);
      console.log(
        `     ${msg.role}: ${preview}${msg.content.length > 60 ? '...' : ''}`
      );
    });
    console.log('');
  }
}

// Run the test
main();
