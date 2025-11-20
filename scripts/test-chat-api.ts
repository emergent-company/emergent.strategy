import fetch from 'node-fetch';

const BASE_URL = 'http://localhost:3002/chat-ui';

async function testApi() {
  console.log('🚀 Testing Chat API Endpoints...');

  // 1. Create a conversation
  console.log('\n1. Creating conversation...');
  const createRes = await fetch(BASE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messages: [{ id: '1', role: 'user', content: 'Hello API Test' }],
    }),
  });

  if (!createRes.ok) throw new Error(`Create failed: ${createRes.status}`);

  // Stream response parsing to get conversationId
  // For simplicity in this test script, we'll just grab it from the text
  // The server sends text/event-stream, so we need to read it
  const text = await createRes.text();
  const match = text.match(/"conversationId":"([a-f0-9-]+)"/);

  if (!match) {
    console.log('Response:', text);
    throw new Error('Could not find conversationId in response');
  }

  const conversationId = match[1];
  console.log(`✅ Created conversation: ${conversationId}`);

  // 2. List conversations
  console.log('\n2. Listing conversations...');
  const listRes = await fetch(`${BASE_URL}/conversations`);
  if (!listRes.ok) throw new Error(`List failed: ${listRes.status}`);
  const list = (await listRes.json()) as any[];
  console.log(`✅ Found ${list.length} conversations`);
  const found = list.find((c: any) => c.id === conversationId);
  if (!found) throw new Error('Created conversation not found in list');
  console.log(`✅ Verified conversation in list: ${found.title}`);

  // 3. Get conversation details
  console.log('\n3. Getting details...');
  const getRes = await fetch(`${BASE_URL}/conversations/${conversationId}`);
  if (!getRes.ok) throw new Error(`Get failed: ${getRes.status}`);
  const details = (await getRes.json()) as any;
  console.log(`✅ Got details with ${details.messages.length} messages`);

  // 4. Update title
  console.log('\n4. Updating title...');
  const newTitle = 'Updated via API Test';
  const patchRes = await fetch(`${BASE_URL}/conversations/${conversationId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: newTitle }),
  });
  if (!patchRes.ok) throw new Error(`Patch failed: ${patchRes.status}`);

  // Verify title update
  const verifyRes = await fetch(`${BASE_URL}/conversations/${conversationId}`);
  const verifyDetails = (await verifyRes.json()) as any;
  if (verifyDetails.title !== newTitle) throw new Error('Title update failed');
  console.log('✅ Title updated successfully');

  // 5. Delete conversation
  console.log('\n5. Deleting conversation...');
  const deleteRes = await fetch(`${BASE_URL}/conversations/${conversationId}`, {
    method: 'DELETE',
  });
  if (!deleteRes.ok) throw new Error(`Delete failed: ${deleteRes.status}`);
  console.log('✅ Conversation deleted');

  // Verify deletion
  const checkRes = await fetch(`${BASE_URL}/conversations/${conversationId}`);
  if (checkRes.status !== 404)
    throw new Error('Conversation still exists after delete');
  console.log('✅ Verified 404 for deleted conversation');

  console.log('\n✨ All tests passed!');
}

testApi().catch(console.error);
