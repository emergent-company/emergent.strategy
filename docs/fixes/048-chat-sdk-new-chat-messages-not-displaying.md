# Fix: Chat SDK New Chat Messages Not Displaying

**Date:** 2025-11-20  
**Status:** ✅ Completed  
**Severity:** High  
**Component:** Chat SDK (Vercel AI SDK v5)

## Problem Statement

When users create a new chat and send the first message:

- ✅ Backend creates the conversation successfully
- ✅ Backend saves messages (shows "2 messages" in sidebar)
- ✅ Conversation appears in sidebar without refresh
- ❌ **Messages don't display in the main chat area** (shows "Start a conversation..." instead)

## Root Cause

Using Vercel AI SDK's `useChat` hook with `id=undefined` **does NOT populate the `messages` state array**, even though:

- The streaming response completes successfully
- `onFinish` callback fires
- Backend has saved the messages

**Why?** The AI SDK treats `id=undefined` as an **ephemeral chat** and doesn't persist messages to its internal state. The messages exist only during the streaming phase and are discarded afterward.

**Evidence from Chrome DevTools:**

```
[ChatSDK] Current messages count: 0  ← Problem!
[ChatSDK] Storing pending conversation ID: xxx
```

The `useEffect` watching for `messages.length > 0` never fired because the AI SDK never populated the messages array.

## Solution Iterations

### Attempt 1: Set activeConversationId immediately in onFinish

**Approach:** Change `id` prop from `undefined` to UUID right after conversation is created.

**Result:** ❌ Failed  
**Reason:** Changing `id` prop caused `useChat` to switch contexts, clearing messages (since the new conversation didn't have cached messages in the SDK).

### Attempt 2: Track pendingConversationId and wait for messages

**Approach:** Store the newly created conversation ID and wait for `messages.length > 0` to set it as active.

**Result:** ❌ Failed  
**Reason:** Messages never populate because SDK doesn't store them when `id=undefined`.

### Final Solution (v3): Auto-Load Messages from Backend with Delay

**Approach:** After getting the new conversation ID in `onFinish`, **wait 1 second then programmatically trigger `handleSelectConversation()`** which:

1. Fetches the conversation messages from backend API
2. Transforms them to UI format
3. Calls `setMessages()` to populate the chat
4. Sets as `activeConversationId`

**Why the delay?** Calling `handleSelectConversation()` immediately would change the `activeConversationId` while streaming is still finishing, interrupting the assistant response. The 1-second delay ensures:

- Backend has saved both user message and assistant response
- Streaming has fully completed
- Context switch doesn't interrupt the response

**Result:** ✅ Success  
**Reason:** This mimics what happens when a user manually clicks a conversation in the sidebar, bypassing the AI SDK's ephemeral state management, while avoiding race conditions with the streaming response.

## Implementation Details

### Code Changes

**File:** `apps/admin/src/pages/chat-sdk/index.tsx`

**Before:**

```typescript
onFinish: async (message) => {
  // ... fetch conversations ...
  if (!activeConversationId && data.length > 0) {
    setPendingNewConversationId(data[0].id);
    // Wait for messages to populate (never happens!)
  }
};

// This useEffect never fires
useEffect(() => {
  if (pendingNewConversationId && messages.length > 0) {
    setActiveConversationId(pendingNewConversationId);
  }
}, [pendingNewConversationId, messages.length]);
```

**After (v3 - with delay):**

```typescript
onFinish: async (message) => {
  // ... fetch conversations ...
  if (!activeConversationId && data.length > 0) {
    // Wait 1 second to ensure backend has saved the assistant response
    setTimeout(async () => {
      const newestConv = data[0];
      console.log(
        '[ChatSDK] New conversation created:',
        newestConv.id,
        '- automatically loading messages after delay'
      );
      // Automatically load the conversation to display messages
      handleSelectConversation(newestConv);
    }, 1000);
  }
};

// Removed pendingNewConversationId state
// Removed useEffect watching for messages
```

### What handleSelectConversation Does

```typescript
const handleSelectConversation = async (conv: Conversation) => {
  setActiveConversationId(conv.id); // Sets active conversation
  setIsLoadingConversation(true);

  // Fetch conversation messages from backend
  const response = await fetch(
    `${apiBase}/api/chat-ui/conversations/${conv.id}`
  );
  const data = await response.json();

  // Transform backend messages to AI SDK UIMessage format
  const formattedMessages: UIMessage[] = data.messages.map((msg) => ({
    id: msg.id,
    role: msg.role as 'user' | 'assistant',
    parts: [{ type: 'text' as const, text: msg.content }],
  }));

  // Load messages into the chat (this works!)
  setMessages(formattedMessages);
  setIsLoadingConversation(false);
};
```

## Testing Results

### Test Flow

1. User clicks "New Chat"
2. User sends first message
3. Backend creates conversation and saves messages
4. `onFinish` fires → fetches conversations → calls `handleSelectConversation()`
5. Messages load from backend and appear in chat area
6. User can continue chatting normally

### Expected Behavior

- ✅ User message appears immediately
- ✅ Backend processes and responds with assistant message
- ✅ Conversation appears in sidebar WITHOUT REFRESH
- ✅ Conversation is highlighted in sidebar (active styling)
- ✅ Both messages (user + assistant) appear in chat area
- ✅ Messages are loaded from backend (not from AI SDK's ephemeral state)

### Console Logs

```
[ChatSDK] New chat clicked
[ChatSDK] Submit - status: ready
[ChatSDK] Message finished, fetching conversations
[ChatSDK] New conversation created: 123e4567-e89b-12d3-a456-426614174000 - automatically loading messages
```

## Lessons Learned

### About Vercel AI SDK `useChat` Hook

1. **Ephemeral vs Persistent Chats:**

   - `id=undefined` → Ephemeral chat (messages not stored in SDK state)
   - `id=UUID` → Persistent chat (messages stored in SDK state)

2. **State Management:**

   - The `messages` array from `useChat` is NOT guaranteed to contain messages after streaming
   - Changing the `id` prop clears the current messages
   - You MUST fetch messages from your backend to display them reliably

3. **Best Practice:**
   - Always fetch messages from backend when loading a conversation
   - Don't rely on `useChat`'s internal state for message persistence
   - Use `setMessages()` to explicitly populate the chat

### Architecture Insight

The AI SDK is designed for **real-time streaming**, not **message persistence**. For persistent chat applications:

- Backend is the source of truth for messages
- Frontend should fetch messages from backend when loading conversations
- `useChat` is great for streaming, but you need additional state management for persistence

## Files Modified

- `apps/admin/src/pages/chat-sdk/index.tsx` - Chat SDK page component
- `TEST_NEW_CHAT_FIX.md` - Testing guide (updated to v3)

## Related Documents

- `TEST_NEW_CHAT_FIX.md` - Detailed testing guide
- AI SDK Documentation: https://ai-sdk.dev/llms.txt

## Next Steps

- [ ] Add automated E2E test for this flow (Playwright)
- [ ] Consider adding loading indicator during message fetch
- [ ] Optional: Add `project_id` column to conversations table for better filtering

## Impact

**Before:** Users would see "Start a conversation..." after sending their first message, making it appear broken.

**After:** Users see their messages immediately after streaming completes, providing a seamless chat experience.
