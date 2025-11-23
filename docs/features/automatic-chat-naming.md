# Automatic Chat Naming System - Design Document

## Current State Analysis

### Existing Behavior

Based on code investigation in `apps/server/src/modules/chat-sdk/chat-sdk.service.ts`:

**When a conversation is created WITHOUT a conversationId:**

```typescript
// Line 94-99
const title =
  messageContent.substring(0, 100) + (messageContent.length > 100 ? '...' : '');
const conversation = await this.conversationService.createConversation(
  title,
  userId || undefined,
  projectId
);
```

**Current naming strategy:**

- Takes first 100 characters of the user's first message
- Adds "..." if truncated
- This becomes the conversation title

**When a conversation is created explicitly:**

- Frontend passes `title: 'New conversation'`
- This static title is used until the first message

### Problems with Current Approach

1. **Generic titles** - "New conversation" is not descriptive
2. **Truncation artifacts** - First 100 chars might cut off mid-word
3. **No summarization** - Just raw message text, not a meaningful title
4. **Not updated** - Title is set once and never regenerated based on conversation content
5. **No context** - Doesn't consider the conversation topic or theme

## Proposed Solution

### Option 1: LLM-Generated Titles (Recommended)

**When to generate:**

- After the **first AI response** (2 messages: user + assistant)
- This ensures we have conversation context

**How it works:**

1. User sends first message
2. AI responds
3. Background job generates a title based on both messages
4. Title is updated asynchronously

**Implementation:**

```typescript
// In chat-sdk.service.ts, after streaming completes
async generateConversationTitle(conversationId: string): Promise<void> {
  const messages = await this.conversationService.getConversationHistory(conversationId);

  // Only generate if we have exactly 2 messages (first exchange)
  if (messages.length !== 2) return;

  const titlePrompt = `Generate a concise, descriptive title (max 60 characters) for this conversation based on the user's question and assistant's response. Return only the title, no quotes or extra text.

User: ${messages[0].content}
Assistant: ${messages[1].content}

Title:`;

  const title = await this.llmService.generateTitle(titlePrompt);
  await this.conversationService.updateConversationTitle(conversationId, title);
}
```

**Pros:**

- Contextual, meaningful titles
- Captures conversation essence
- Professional appearance
- Matches ChatGPT/Claude behavior

**Cons:**

- Requires LLM call (cost + latency)
- Async update (title appears after conversation starts)

### Option 2: Rule-Based Title Extraction

**Strategy:**

- Extract key phrases from first message
- Use NLP techniques (keyword extraction, topic modeling)
- Format as readable title

**Example:**

- Input: "How do I implement authentication with JWT tokens in NestJS?"
- Output: "JWT Authentication in NestJS"

**Pros:**

- Fast, synchronous
- No LLM cost
- Predictable

**Cons:**

- Less sophisticated
- May miss context
- Requires NLP library

### Option 3: Hybrid Approach

**Immediate title (Rule-based):**

- Use smart truncation of first message
- Remove common prefixes ("How do I...", "Can you...", "What is...")
- Capitalize properly
- Limit to 60 chars

**Enhanced title (LLM-generated):**

- After first exchange, generate better title asynchronously
- Update conversation title in background

**Pros:**

- Best of both worlds
- Immediate feedback
- Enhanced over time

**Cons:**

- More complex implementation

## Recommended Implementation: Option 1 (LLM-Generated)

### Architecture

```
User sends message
    ↓
Conversation created with temporary title (first 60 chars, smart truncated)
    ↓
AI responds
    ↓
onComplete callback triggered
    ↓
Generate title in background (non-blocking)
    ↓
Update conversation title
    ↓
Frontend receives update via next conversation list fetch
```

### Technical Design

#### 1. Service Method

**File:** `apps/server/src/modules/chat-sdk/chat-sdk.service.ts`

```typescript
/**
 * Generate a descriptive title for a conversation based on its first exchange
 * Called asynchronously after the first AI response
 */
async generateConversationTitle(conversationId: string): Promise<void> {
  try {
    const messages = await this.conversationService.getConversationHistory(conversationId);

    // Only generate title for new conversations (after first exchange)
    if (messages.length < 2) {
      this.logger.debug(`Skipping title generation for conversation ${conversationId} - not enough messages`);
      return;
    }

    // Skip if title was already customized by user
    const conversation = await this.conversationService.getConversation(conversationId);
    if (!conversation.title.startsWith('New conversation') &&
        conversation.title.length > 20) {
      this.logger.debug(`Skipping title generation - conversation already has custom title`);
      return;
    }

    // Build context from first user message and AI response
    const userMessage = messages[0].content;
    const assistantMessage = messages[1].content;

    const titlePrompt = `Generate a concise, descriptive title (maximum 60 characters) for this conversation. The title should capture the main topic or question. Return only the title text, with no quotes, prefixes, or suffixes.

User's question: ${userMessage.substring(0, 500)}
Assistant's response: ${assistantMessage.substring(0, 500)}

Title:`;

    // Use a fast, simple LLM call for title generation
    const response = await this.langGraphService.generateSimpleResponse(titlePrompt);

    // Clean up the response
    let title = response.trim()
      .replace(/^["']|["']$/g, '') // Remove quotes
      .replace(/^Title:\s*/i, '')   // Remove "Title:" prefix
      .substring(0, 60);              // Ensure max length

    // Update conversation title
    await this.conversationService.updateConversationTitle(conversationId, title);

    this.logger.log(`Generated title for conversation ${conversationId}: "${title}"`);
  } catch (error) {
    this.logger.error(`Failed to generate title for conversation ${conversationId}:`, error);
    // Non-blocking - don't throw, just log
  }
}
```

#### 2. Integration Point

**In `streamChat` method, after message is saved:**

```typescript
// In onComplete callback
onComplete: async (fullResponse: string) => {
  await this.conversationService.addMessage(
    dbConversationId!,
    'assistant',
    fullResponse
    // citations...
  );

  // Generate title asynchronously (non-blocking)
  this.generateConversationTitle(dbConversationId!).catch((error) => {
    this.logger.error('Title generation failed:', error);
  });
};
```

#### 3. Smart Temporary Title

**Improve initial title before LLM generation:**

```typescript
// Helper function
private createTemporaryTitle(messageContent: string): string {
  // Remove common question prefixes
  let title = messageContent
    .replace(/^(how do i|can you|what is|how to|please|could you|i need|help me|show me)\s+/i, '')
    .trim();

  // Capitalize first letter
  title = title.charAt(0).toUpperCase() + title.slice(1);

  // Smart truncation at word boundary
  if (title.length > 60) {
    title = title.substring(0, 57).trim();
    const lastSpace = title.lastIndexOf(' ');
    if (lastSpace > 40) {
      title = title.substring(0, lastSpace);
    }
    title += '...';
  }

  return title;
}
```

### User Experience Flow

```
User: "How do I implement JWT authentication in NestJS?"
    ↓
[Conversation created]
Title: "Implement JWT authentication in NestJS..."  (temporary)
    ↓
[AI responds with implementation guide]
    ↓
[Background: LLM generates better title]
    ↓
Title updated to: "JWT Authentication in NestJS"
    ↓
[User sees updated title on next page load or conversation list refresh]
```

### Edge Cases

1. **Very short conversations** - Keep original title if < 2 messages
2. **User-edited titles** - Don't overwrite if user customized the title
3. **LLM failures** - Keep temporary title, log error
4. **Rate limits** - Implement queue/retry logic
5. **Long conversations** - Only generate title once (after first exchange)

### Configuration

**Environment variables:**

```
CHAT_TITLE_GENERATION_ENABLED=true
CHAT_TITLE_MAX_LENGTH=60
CHAT_TITLE_MIN_MESSAGES=2
```

### Performance Considerations

- Title generation happens **after** streaming completes (non-blocking)
- Uses simple LLM call (not full conversation agent)
- Cached/memoized to avoid repeated calls
- Async - doesn't impact user experience

### Cost Analysis

**Per conversation:**

- ~100 tokens for prompt
- ~20 tokens for response
- Total: ~120 tokens per title
- Cost: ~$0.0001 per title (Gemini Nano/Flash)

**At scale:**

- 1000 conversations/day = $0.10/day
- 30,000 conversations/month = $3/month

**Mitigation:**

- Use cheapest/fastest model for title generation
- Cache titles
- Only generate once per conversation

## Alternative: Manual Title Editing

As a fallback or complement:

- Add "Rename" button to conversation list items
- Allow users to edit titles inline
- Auto-save on blur/enter

This gives users control while still providing automatic suggestions.

## Implementation Checklist

- [ ] Add `generateConversationTitle` method to ChatSdkService
- [ ] Add `generateSimpleResponse` method to LangGraphService (simple LLM call)
- [ ] Update `streamChat` onComplete callback to trigger title generation
- [ ] Implement smart temporary title creation
- [ ] Add configuration for title generation
- [ ] Add logging and error handling
- [ ] Test with various conversation types
- [ ] Add manual title editing UI (optional)
- [ ] Monitor LLM costs and performance

## Success Metrics

- % of conversations with meaningful titles (vs "New conversation")
- Average title length
- User engagement with titled conversations
- LLM call success rate
- Average latency for title generation

## References

- ChatGPT: Generates titles after ~2-3 messages, updates in real-time
- Claude: Similar approach, contextual titles
- Google Gemini: Real-time title generation
- Slack: Uses first message text but doesn't auto-generate

## Recommendation

**Implement Option 1 (LLM-Generated)** with:

- Smart temporary titles (improved truncation)
- Async title generation after first exchange
- Manual editing capability
- Cost monitoring and controls

This provides the best user experience with minimal cost and complexity.
