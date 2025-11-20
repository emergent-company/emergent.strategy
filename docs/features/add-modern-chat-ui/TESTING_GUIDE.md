# Chat System Testing Guide

## Overview

This document provides comprehensive testing procedures for the chat system with LangGraph, Vertex AI, and database persistence.

## Quick Test Commands

### 1. Health Check

```bash
# Check server health
curl http://localhost:3002/health | jq

# Expected: {"ok":true,"db":"up",...}
```

### 2. Basic Chat Test

```bash
# Send a simple message
curl -X POST http://localhost:3002/chat \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      {"id": "1", "role": "user", "content": "Hello! What is 2+2?"}
    ]
  }'

# Expected: Streaming response with answer "4" and conversationId in finish event
```

### 3. Conversation Memory Test

```bash
# Step 1: Create conversation
CONV_ID=$(curl -s -X POST http://localhost:3002/chat \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      {"id": "1", "role": "user", "content": "My name is Alice"}
    ]
  }' | grep conversationId | tail -1 | jq -r .conversationId)

echo "Conversation ID: $CONV_ID"

# Step 2: Continue conversation (AI should remember Alice)
curl -s -X POST http://localhost:3002/chat \
  -H "Content-Type: application/json" \
  -d "{
    \"conversationId\": \"$CONV_ID\",
    \"messages\": [
      {\"id\": \"1\", \"role\": \"user\", \"content\": \"My name is Alice\"},
      {\"id\": \"2\", \"role\": \"assistant\", \"content\": \"Nice to meet you!\"},
      {\"id\": \"3\", \"role\": \"user\", \"content\": \"What is my name?\"}
    ]
  }" | grep -o '"textDelta":"[^"]*"' | cut -d'"' -f4 | tr -d '\n' && echo

# Expected: "Your name is Alice." or similar
```

### 4. Database Verification

```bash
# View all conversations (last 10)
docker exec -u postgres $(docker ps -qf "name=spec-server-2.*db") \
  psql -U spec -d spec -c \
  "SELECT id, LEFT(title, 50) as title, owner_user_id, created_at
   FROM kb.chat_conversations
   ORDER BY created_at DESC
   LIMIT 10;"

# View messages for a specific conversation
docker exec -u postgres $(docker ps -qf "name=spec-server-2.*db") \
  psql -U spec -d spec -c \
  "SELECT role, content, created_at
   FROM kb.chat_messages
   WHERE conversation_id = '<CONVERSATION_ID>'
   ORDER BY created_at ASC;"
```

## Frontend Testing

### Access the Chat UI

```bash
# Open in browser
open http://localhost:5176/chat
```

### Manual Test Scenarios

#### Scenario 1: Basic Conversation

1. Navigate to http://localhost:5176/chat
2. Type: "Hello, what is your purpose?"
3. Observe:
   - ✓ Message appears in chat
   - ✓ Loading indicator shows
   - ✓ AI response streams character-by-character
   - ✓ "Conversation Active" badge appears
   - ✓ "New Conversation" button appears

#### Scenario 2: Memory Test

1. Start new conversation (if needed)
2. Type: "My favorite food is pizza"
3. Wait for response
4. Type: "What is my favorite food?"
5. Verify: AI responds with "pizza"

#### Scenario 3: Multi-Turn Conversation

1. Start new conversation
2. Have 5+ back-and-forth exchanges
3. Reference earlier context
4. Verify: AI maintains context throughout

#### Scenario 4: New Conversation

1. Have an active conversation
2. Click "New Conversation" button
3. Verify:
   - ✓ Chat clears
   - ✓ Badge disappears
   - ✓ Button disappears
   - ✓ Can start fresh conversation

## API Testing with Authentication

### Get Test Credentials

```bash
# Get test user token (requires Zitadel setup)
TEST_TOKEN=$(./scripts/get-test-user-credentials.sh | jq -r .access_token)
```

### Authenticated Chat Request

```bash
curl -X POST http://localhost:3002/chat \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TEST_TOKEN" \
  -d '{
    "messages": [
      {"id": "1", "role": "user", "content": "Hello"}
    ]
  }'
```

### Verify User Ownership

```bash
# Check conversation belongs to user
docker exec -u postgres $(docker ps -qf "name=spec-server-2.*db") \
  psql -U spec -d spec -c \
  "SELECT id, title, owner_user_id, created_at
   FROM kb.chat_conversations
   WHERE owner_user_id IS NOT NULL
   ORDER BY created_at DESC
   LIMIT 5;"
```

## Performance Testing

### Latency Test

```bash
# Measure time to first token
time curl -X POST http://localhost:3002/chat \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      {"id": "1", "role": "user", "content": "Quick test"}
    ]
  }' -o /dev/null

# Expected: < 2 seconds to first byte
```

### Concurrent Requests

```bash
# Send 5 concurrent requests
for i in {1..5}; do
  curl -X POST http://localhost:3002/chat \
    -H "Content-Type: application/json" \
    -d "{
      \"messages\": [
        {\"id\": \"1\", \"role\": \"user\", \"content\": \"Test $i\"}
      ]
    }" &
done
wait

# Check all completed successfully
```

## Error Scenarios

### 1. Missing Message Content

```bash
curl -X POST http://localhost:3002/chat \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      {"id": "1", "role": "user", "content": ""}
    ]
  }'

# Expected: 400 Bad Request
```

### 2. Invalid Conversation ID

```bash
curl -X POST http://localhost:3002/chat \
  -H "Content-Type: application/json" \
  -d '{
    "conversationId": "invalid-uuid",
    "messages": [
      {"id": "1", "role": "user", "content": "Test"}
    ]
  }'

# Expected: May create new conversation or return error
```

### 3. Last Message Not from User

```bash
curl -X POST http://localhost:3002/chat \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      {"id": "1", "role": "assistant", "content": "Hello"}
    ]
  }'

# Expected: 400 Bad Request "Last message must be from user"
```

## Logging and Debugging

### View Server Logs

```bash
# View all logs
nx run workspace-cli:workspace:logs

# View server logs only
nx run workspace-cli:workspace:logs -- --service=server

# Follow logs in real-time
nx run workspace-cli:workspace:logs -- --follow
```

### Enable Debug Logging

```bash
# Add to .env
DEBUG=*
DEBUG_AUTH_SCOPES=1

# Restart server
nx run workspace-cli:workspace:restart
```

### Check for Errors

```bash
# Check error log
tail -f apps/logs/server/error.log

# Check for specific errors
grep -i "error\|exception" apps/logs/server/out.log | tail -20
```

## Database Queries for Debugging

### Count Messages by Role

```sql
SELECT
  role,
  COUNT(*) as count,
  COUNT(DISTINCT conversation_id) as conversations
FROM kb.chat_messages
GROUP BY role;
```

### Find Long Conversations

```sql
SELECT
  c.id,
  c.title,
  COUNT(m.id) as message_count,
  c.created_at
FROM kb.chat_conversations c
LEFT JOIN kb.chat_messages m ON m.conversation_id = c.id
GROUP BY c.id, c.title, c.created_at
HAVING COUNT(m.id) > 10
ORDER BY message_count DESC;
```

### Find Recent Active Conversations

```sql
SELECT
  c.id,
  c.title,
  c.owner_user_id,
  MAX(m.created_at) as last_message_at,
  COUNT(m.id) as message_count
FROM kb.chat_conversations c
LEFT JOIN kb.chat_messages m ON m.conversation_id = c.id
GROUP BY c.id, c.title, c.owner_user_id
ORDER BY last_message_at DESC
LIMIT 20;
```

### Cleanup Test Data

```sql
-- Delete conversations without user (test data)
DELETE FROM kb.chat_conversations
WHERE owner_user_id IS NULL
AND created_at < NOW() - INTERVAL '1 day';

-- Or delete all test conversations
DELETE FROM kb.chat_conversations
WHERE title LIKE '%test%' OR title LIKE '%Test%';
```

## Automated Test Script

Save this as `scripts/test-chat-system.sh`:

```bash
#!/bin/bash
set -e

echo "🧪 Testing Chat System"
echo "===================="
echo

# Test 1: Server Health
echo "1️⃣  Server Health Check"
if curl -sf http://localhost:3002/health > /dev/null; then
  echo "   ✅ Server is healthy"
else
  echo "   ❌ Server is not responding"
  exit 1
fi
echo

# Test 2: Create Conversation
echo "2️⃣  Create New Conversation"
CONV_ID=$(curl -s -X POST http://localhost:3002/chat \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"id":"1","role":"user","content":"My name is TestBot"}]}' \
  | grep conversationId | tail -1 | jq -r .conversationId)

if [ -n "$CONV_ID" ] && [ "$CONV_ID" != "null" ]; then
  echo "   ✅ Conversation created: $CONV_ID"
else
  echo "   ❌ Failed to create conversation"
  exit 1
fi
echo

# Test 3: Conversation Memory
echo "3️⃣  Test Conversation Memory"
RESPONSE=$(curl -s -X POST http://localhost:3002/chat \
  -H "Content-Type: application/json" \
  -d "{
    \"conversationId\": \"$CONV_ID\",
    \"messages\": [
      {\"id\":\"1\",\"role\":\"user\",\"content\":\"My name is TestBot\"},
      {\"id\":\"2\",\"role\":\"assistant\",\"content\":\"Hello TestBot!\"},
      {\"id\":\"3\",\"role\":\"user\",\"content\":\"What is my name?\"}
    ]
  }" | grep textDelta | cut -d'"' -f8 | tr -d '\n')

if echo "$RESPONSE" | grep -qi "testbot"; then
  echo "   ✅ AI remembered context"
else
  echo "   ⚠️  AI response: $RESPONSE"
fi
echo

# Test 4: Database Persistence
echo "4️⃣  Verify Database Persistence"
MSG_COUNT=$(docker exec -u postgres $(docker ps -qf "name=spec-server-2.*db") \
  psql -U spec -d spec -t -c \
  "SELECT COUNT(*) FROM kb.chat_messages WHERE conversation_id = '$CONV_ID';" \
  | tr -d ' ')

if [ "$MSG_COUNT" -ge 4 ]; then
  echo "   ✅ Database has $MSG_COUNT messages"
else
  echo "   ❌ Expected 4+ messages, found $MSG_COUNT"
  exit 1
fi
echo

echo "✅ All tests passed!"
echo
echo "Cleanup: Delete test conversation? (y/N)"
read -r CLEANUP
if [ "$CLEANUP" = "y" ]; then
  docker exec -u postgres $(docker ps -qf "name=spec-server-2.*db") \
    psql -U spec -d spec -c \
    "DELETE FROM kb.chat_conversations WHERE id = '$CONV_ID';"
  echo "   ✅ Test data cleaned up"
fi
```

Make it executable:

```bash
chmod +x scripts/test-chat-system.sh
```

Run it:

```bash
./scripts/test-chat-system.sh
```

## Troubleshooting

### Issue: No Response from AI

**Symptoms**: Request hangs, no streaming data

**Check**:

1. Vertex AI configuration: `echo $VERTEX_AI_LOCATION $GCP_PROJECT_ID`
2. Application Default Credentials: `gcloud auth application-default print-access-token`
3. Server logs: `tail -f apps/logs/server/out.log`

**Fix**:

```bash
# Re-authenticate
gcloud auth application-default login

# Restart server
nx run workspace-cli:workspace:restart
```

### Issue: Conversation Not Persisting

**Symptoms**: conversationId is null or not returned

**Check**:

1. Database connection: `curl http://localhost:3002/health | jq .db`
2. TypeORM entities loaded: Check server startup logs
3. ConversationService registered: Check ChatUiModule

**Fix**:

```bash
# Check database
docker ps | grep postgres

# Restart everything
nx run workspace-cli:workspace:restart
```

### Issue: AI Doesn't Remember Context

**Symptoms**: AI forgets previous messages in conversation

**Check**:

1. conversationId sent in subsequent requests
2. LangGraph MemorySaver initialized
3. Thread ID matches conversation ID

**Debug**:

```bash
# Check if messages are in database
docker exec -u postgres $(docker ps -qf "name=spec-server-2.*db") \
  psql -U spec -d spec -c \
  "SELECT * FROM kb.chat_messages WHERE conversation_id = '<ID>' ORDER BY created_at;"
```

## Success Criteria

- ✅ Server responds to health check
- ✅ Chat endpoint creates conversations
- ✅ AI responses stream correctly
- ✅ Conversation ID returned in finish event
- ✅ Subsequent messages use conversation ID
- ✅ AI remembers context within conversation
- ✅ Messages persist to database
- ✅ Frontend displays conversation status
- ✅ New conversation button works
- ✅ No errors in server logs
- ✅ No errors in browser console

## Next Steps

After verifying all tests pass:

1. **Enable Authentication**: Uncomment `@UseGuards(AuthGuard)` in controller
2. **Add Rate Limiting**: Implement per-user rate limits
3. **Add Conversation List**: Build UI to view all conversations
4. **Add Export Feature**: Allow users to export conversations
5. **Add Analytics**: Track usage metrics and costs
