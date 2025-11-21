# Testing Guide: New Chat Fix (v3 - Auto-Load Messages)

## What Was Fixed

**Original Problem:**
When starting a new chat and sending the first message, the conversation would be created on the backend but:

1. ✅ Conversation appears in sidebar (fixed in v1)
2. ❌ **Messages don't display in the main chat area** (shows "Start a conversation..." instead)

**Root Cause:**
Using Vercel AI SDK's `useChat` hook with `id=undefined` does NOT populate the `messages` state array, even though:

- The streaming response completes successfully
- `onFinish` callback fires
- Backend has saved the messages

The AI SDK treats `id=undefined` as an ephemeral chat and doesn't persist messages to its internal state.

**Solution (v3 - Final):**

1. Backend sends conversation ID as metadata (from v1)
2. In `onFinish` callback, fetch the newly created conversation
3. **Automatically call `handleSelectConversation()` to load messages from backend**
4. This mimics what happens when user clicks a conversation in sidebar:
   - Fetches conversation messages from backend API
   - Transforms them to UI format
   - Calls `setMessages()` to populate the chat
   - Sets as `activeConversationId`

## Testing Steps

### 1. Open the Application

Navigate to: http://localhost:5176/chat-sdk

Login with:

- Email: `test@example.com`
- Password: `TestPassword123!`

### 2. Open Browser Console

Press F12 to open DevTools and go to the Console tab. You should see debug logs prefixed with `[ChatSDK]`.

### 3. Test New Chat Flow

**Step 1: Select a Project**

- In the sidebar, use the project dropdown to select a project (required for RAG search)
- You should see a green success message when selected

**Step 2: Start a New Chat**

- Click the "New Chat" button in the sidebar
- Console should log: `[ChatSDK] New chat clicked`
- The chat area should clear (no messages)
- Active conversation ID should be `undefined`

**Step 3: Send First Message**

- Type a message (e.g., "Hello, this is a test")
- Click Send or press Enter
- Console should log: `[ChatSDK] Submit - status: ready`

**Expected Behavior:**

- ✅ **User message appears immediately**
- Backend processes and responds with assistant message
- Console logs: `[ChatSDK] Message finished, fetching conversations`
- Console logs: `[ChatSDK] New conversation created: <uuid> - automatically loading messages`
- **✅ Conversation appears in sidebar WITHOUT REFRESH**
- **✅ Conversation is highlighted in sidebar (active styling)**
- **✅ Both messages (user + assistant) appear in chat area**
- Messages are loaded from backend (not from AI SDK's ephemeral state)

**Step 4: Send Second Message**

- Type another message
- Send it

**Expected Behavior:**

- Message appears in the same conversation
- **✅ Previous messages still visible**
- No new conversation is created
- Sidebar shows the same conversation (now with 4 messages total)

**Step 5: Verify Persistence**

- Refresh the page (F5)
- Click on the conversation in the sidebar

**Expected Behavior:**

- Messages are loaded from backend
- All messages appear correctly (in correct order)
- Everything continues to work normally

### 4. Verify with Multiple New Chats

Repeat steps 2-3 multiple times to verify:

- Each "New Chat" click clears the conversation
- Each first message creates a new conversation
- All new conversations appear in sidebar without refresh
- Conversations are properly ordered (newest first)

## Expected Console Logs

**First message (new chat):**

```
[ChatSDK] New chat clicked
[ChatSDK] Submit - status: ready
[ChatSDK] Message finished, fetching conversations
[ChatSDK] New conversation created: 123e4567-e89b-12d3-a456-426614174000 - automatically loading messages
```

**Second message (existing conversation):**

```
[ChatSDK] Submit - status: ready
[ChatSDK] Message finished, fetching conversations
```

## What to Look For

### ✅ Success Indicators

- New conversation appears in sidebar immediately after first message
- **Conversation is highlighted in sidebar** (active conversation)
- **All messages (user + assistant) appear immediately after streaming completes**
- Messages are loaded from backend (via `handleSelectConversation`)
- Subsequent messages work normally in the same conversation
- No errors in console

### ❌ Failure Indicators

- Conversation doesn't appear in sidebar (need to refresh)
- **Messages don't appear after first message completes** (shows "Start a conversation...")
- Console errors about fetch failing
- `status` is not 'ready' when sending
- Multiple conversations created for same chat
- Console doesn't show "automatically loading messages" log

## Debugging

If the fix doesn't work:

1. **Check Network Tab**

   - Look for POST to `/api/chat-sdk/chat`
   - Check response format (should see metadata with ID first)
   - Verify streaming response is working

2. **Check Console Logs**

   - Are debug logs appearing?
   - What status is shown when submitting?
   - Is `onFinish` callback firing?

3. **Check Sidebar State**

   - Does `/api/chat-ui/conversations` return conversations?
   - Is the newest conversation at index 0?

4. **Check Backend Logs**
   ```bash
   npx pm2 logs spec-server-2-server --lines 50
   ```

## Files Modified

**Backend:**

- `apps/server/src/modules/chat-sdk/chat-sdk.controller.ts`
  - Added metadata streaming with conversation ID

**Frontend:**

- `apps/admin/src/pages/chat-sdk/index.tsx`
  - Modified `onFinish` callback to automatically call `handleSelectConversation()`
  - Removed `pendingNewConversationId` state (no longer needed)
  - Removed `useEffect` that was waiting for messages to populate
  - Simplified state management

## Next Steps After Testing

If test passes:

- ✅ Mark as complete
- Consider adding automated E2E test for this flow
- Optional: Add `project_id` column to conversations table

If test fails:

- Check console/network for specific errors
- Verify backend is sending metadata correctly
- Check if `onFinish` callback is firing
- Verify conversation list endpoint is working
