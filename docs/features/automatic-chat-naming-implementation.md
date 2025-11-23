# Automatic Chat Naming - Implementation Summary

## Status: ✅ Implemented

Date: November 21, 2025

## Overview

Implemented automatic conversation title generation using LLM-generated titles for the chat SDK. The system creates smart temporary titles immediately and generates better contextual titles asynchronously after the first exchange.

## What Was Implemented

### 1. LangGraph Service Enhancement

**File:** `apps/server/src/modules/chat-ui/services/langgraph.service.ts`

Added `generateSimpleResponse()` method for simple, one-off LLM calls:

```typescript
async generateSimpleResponse(prompt: string): Promise<string>
```

- Uses the same Vertex AI model as chat
- No conversation context or tools
- Fast, direct LLM invocation
- Used specifically for title generation

### 2. Chat SDK Service Updates

**File:** `apps/server/src/modules/chat-sdk/chat-sdk.service.ts`

#### A. Smart Temporary Title Creation

Added `createTemporaryTitle()` helper method:

- Removes common question prefixes ("How do I...", "Can you...", etc.)
- Capitalizes first letter
- Smart truncation at word boundaries (max 60 chars)
- Better UX than raw truncation

**Example:**

```
Input: "How do I implement JWT authentication in NestJS?"
Output: "Implement JWT authentication in NestJS"
```

#### B. LLM-Based Title Generation

Added `generateConversationTitle()` method:

- Triggers after first AI response (2+ messages)
- Skips if title already customized
- Uses both user question + AI response for context
- Cleans up LLM response (removes quotes, prefixes)
- Non-blocking, async execution
- Respects configuration settings

#### C. Integration with Streaming

Updated `streamChat()` onComplete callback:

- Triggers title generation after AI response is saved
- Fire-and-forget pattern (doesn't block)
- Logs errors but doesn't throw

### 3. Configuration System

#### Environment Variables

**File:** `apps/server/.env.example`

Added three new configuration options:

```bash
# Enable automatic title generation for new conversations (OPTIONAL)
CHAT_TITLE_GENERATION_ENABLED=true

# Maximum length for generated conversation titles (OPTIONAL)
CHAT_TITLE_MAX_LENGTH=60

# Minimum messages before generating title (OPTIONAL)
CHAT_TITLE_MIN_MESSAGES=2
```

#### Schema Updates

**File:** `apps/server/src/common/config/config.schema.ts`

Added EnvVariables properties:

- `CHAT_TITLE_GENERATION_ENABLED?: boolean`
- `CHAT_TITLE_MAX_LENGTH?: number`
- `CHAT_TITLE_MIN_MESSAGES?: number`

With proper defaults and type conversions.

#### Config Service

**File:** `apps/server/src/common/config/config.service.ts`

Added getters:

- `chatTitleGenerationEnabled: boolean` (default: true)
- `chatTitleMaxLength: number` (default: 60)
- `chatTitleMinMessages: number` (default: 2)

### 4. Dependency Injection

Updated ChatSdkService constructor to inject AppConfigService for configuration access.

## User Experience Flow

```
User: "How do I implement JWT authentication in NestJS?"
    ↓
[Conversation created with temporary title]
Title: "Implement JWT authentication in NestJS"
    ↓
[AI responds with implementation guide]
    ↓
[Background: LLM generates better title]
    ↓
Title updated to: "JWT Authentication in NestJS"
    ↓
[User sees updated title on next conversation list refresh]
```

## Technical Details

### Performance

- **Temporary title:** Synchronous, ~0ms overhead
- **LLM title generation:** Async, non-blocking
  - ~120 tokens per title
  - ~1-2 seconds latency
  - Cost: ~$0.0001 per title (Gemini Flash)

### Error Handling

- All errors are logged but don't interrupt chat flow
- Falls back to temporary title if LLM fails
- Gracefully skips if configuration disabled

### Edge Cases Handled

1. **Very short conversations** - Only generates after min messages (default: 2)
2. **User-edited titles** - Skips if title doesn't look temporary
3. **LLM failures** - Logs error, keeps temporary title
4. **Disabled feature** - Respects `CHAT_TITLE_GENERATION_ENABLED=false`
5. **Long conversations** - Only generates once (after first exchange)

## Configuration Examples

### Disable Title Generation

```bash
CHAT_TITLE_GENERATION_ENABLED=false
```

### Shorter Titles

```bash
CHAT_TITLE_MAX_LENGTH=40
```

### Wait for More Context

```bash
CHAT_TITLE_MIN_MESSAGES=4  # Wait for 2 full exchanges
```

## Testing

### Manual Testing Steps

1. Start a new conversation
2. Send first message
3. Verify temporary title appears immediately
4. Wait for AI response
5. Check logs for title generation
6. Refresh conversation list
7. Verify improved title appears

### Test Cases to Cover

- [x] New conversation gets smart temporary title
- [x] Title updated after first exchange
- [x] Title generation respects configuration
- [x] Errors don't break chat functionality
- [ ] Manual testing with various question types
- [ ] Verify title quality with different prompts
- [ ] Test with feature disabled
- [ ] Test with custom max length

## Cost Analysis

**Per conversation:**

- Prompt: ~100 tokens
- Response: ~20 tokens
- Total: ~120 tokens
- Cost: ~$0.0001 per title (Gemini Flash)

**At scale:**

- 1,000 conversations/day = $0.10/day
- 30,000 conversations/month = $3/month

## Future Enhancements

### Optional Features

1. **Manual title editing UI**

   - Add "Rename" button to conversation list
   - Inline editing with auto-save
   - Override automatic titles

2. **Title regeneration**

   - "Regenerate title" button
   - Uses updated conversation context

3. **User preferences**

   - Per-user toggle for automatic naming
   - Custom title length preferences

4. **Cost monitoring**

   - Track title generation costs
   - Rate limiting
   - Budget alerts

5. **A/B testing**
   - Compare LLM-generated vs temporary titles
   - User satisfaction metrics

## Files Changed

```
apps/server/src/common/config/
├── config.schema.ts             ✅ Added chat title env vars
└── config.service.ts            ✅ Added chat title getters

apps/server/src/modules/chat-sdk/
└── chat-sdk.service.ts          ✅ Added title generation logic

apps/server/src/modules/chat-ui/services/
└── langgraph.service.ts         ✅ Added generateSimpleResponse

apps/server/.env.example         ✅ Added configuration docs
```

## Documentation

- Design document: `docs/features/automatic-chat-naming.md`
- Implementation summary: `docs/features/automatic-chat-naming-implementation.md` (this file)

## Success Metrics

To be measured:

- % of conversations with meaningful titles (vs "New conversation")
- Average title length
- User engagement with titled conversations
- LLM call success rate
- Average latency for title generation
- Cost per conversation

## Conclusion

The automatic chat naming feature is now fully implemented and ready for testing. The implementation follows best practices:

- ✅ Non-blocking, async execution
- ✅ Configurable via environment variables
- ✅ Graceful error handling
- ✅ Smart temporary titles
- ✅ LLM-generated contextual titles
- ✅ Cost-effective design
- ✅ Build passes successfully

Next steps: Manual testing with various conversation types to verify title quality.
