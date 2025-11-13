# Markdown Formatting Fix for Chat Responses

## Problem

The chat interface was rendering assistant messages with markdown support, but the LLM responses weren't being properly formatted as markdown. The issue was that the LLM was responding with plain text that **looked** like markdown but wasn't using proper markdown syntax.

### Example of the Problem

**LLM Response (before fix):**
```
Here are the last 5 decisions from the provided context:

---

### 1. Pursue Partnership Model for LegalPlant Sales

* ID: fd01db9d-0ed0-410b-90d4-3de327ab8b48
* Decision Date: 2025-08-18
* Status: Approved
```

**Issues:**
1. `---` dividers (not markdown)
2. `### 1.` mixed heading + list number (confusing)
3. `* ` prefixes without proper list structure
4. No blank lines between sections
5. Not following markdown list syntax (`- ` with space after)

**Result:** The markdown renderer didn't recognize these patterns as proper markdown, so they displayed as plain text.

## Root Cause

The prompt construction in `chat-generation.service.ts` wasn't explicitly instructing the LLM to respond in **valid markdown format**. The system prompt said things like "format it clearly" but didn't specify markdown syntax rules.

## Solution

Updated the prompt builder to:

1. **Explicitly instruct markdown formatting** in the base system prompt
2. **Provide specific markdown syntax examples** for each intent type
3. **Include formatting guidelines** at the end of the prompt
4. **Update entity data formatting** to use proper markdown structure

### Changes Made

**File:** `apps/server/src/modules/chat/chat-generation.service.ts`

#### 1. Updated Base System Prompt

```typescript
// Before:
let systemPrompt = 'You are a helpful assistant specialized in knowledge graphs and data schemas.';

// After:
let systemPrompt = 'You are a helpful assistant specialized in knowledge graphs and data schemas. IMPORTANT: Always respond using proper markdown formatting.';
```

#### 2. Added Intent-Specific Markdown Instructions

Each intent type now includes specific markdown formatting instructions:

**entity-query:**
```typescript
systemPrompt += ' When presenting entity data, use markdown headings (###) for each entity, bullet lists (-) for properties, and **bold** for important values. Use proper markdown list syntax, not plain text with asterisks.';
```

**entity-list:**
```typescript
systemPrompt += ' When listing available entity types, use numbered lists (1., 2., 3.) and **bold** for type names.';
```

**schema-changes:**
```typescript
systemPrompt += ' When describing schema changes, organize them chronologically using markdown headings (###) and bullet points (-). Highlight important modifications with **bold text**.';
```

#### 3. Added Markdown Formatting Guidelines

At the end of every prompt, we now include explicit formatting rules:

```typescript
prompt += 'Provide a helpful, accurate answer based on the context above. Use proper markdown formatting:\n';
prompt += '- Use ### for headings\n';
prompt += '- Use - or * for unordered lists (with space after)\n';
prompt += '- Use 1. 2. 3. for ordered lists\n';
prompt += '- Use **text** for bold\n';
prompt += '- Use `code` for inline code\n';
prompt += '- Use proper blank lines between sections\n\n';
prompt += 'Your markdown formatted answer:';
```

#### 4. Updated Entity Data Context Formatting

Changed the `formatJsonContext` method for `entity-query` to use proper markdown:

```typescript
// Before:
let item = `${idx + 1}. **${entity.name}**\n`;
item += `   - ID: ${entity.id}\n`;
item += `   - Key: ${entity.key}\n`;

// After:
let item = `### ${idx + 1}. ${entity.name}\n\n`;
item += `- **ID**: ${entity.id}\n`;
item += `- **Key**: ${entity.key}\n`;
```

**Key improvements:**
- Use `###` for headings instead of numbered list
- Use `-` with space for proper list syntax
- Use `**bold**` for labels
- Add blank line after heading
- Iterate through properties cleanly

## Expected Result

After the fix, the LLM should respond with properly formatted markdown:

```markdown
Here are the last 5 decisions:

### 1. Pursue Partnership Model for LegalPlant Sales

- **ID**: fd01db9d-0ed0-410b-90d4-3de327ab8b48
- **Decision Date**: 2025-08-18
- **Status**: Approved
- **Type**: Strategic
- **Description**: The team decided to pursue a partnership model for LegalPlant sales, specifically with legal AI companies like 'Saga', instead of building a direct sales team.
- **Rationale**: Building a direct sales team is expensive, time-consuming, and risky. A partnership with a company that already has market access and a complementary product is seen as a more likely path to success.

### 2. Allocate 20% of Resources to LegalPlant

- **ID**: e019bd0c-e35b-4e3a-b0c1-d83334bb046e
- **Decision Date**: 2025-08-18
- **Status**: Approved
```

This will render beautifully with:
- Headings as proper headings (larger, bold)
- Lists with bullet points
- Bold labels for properties
- Proper spacing between sections

## Testing

Test with the same query:

```
"What are the last 5 decisions?"
```

**Expected rendering:**
- ✅ Headings render as headings (larger, bold)
- ✅ Lists render with proper bullet points
- ✅ Bold text is bold
- ✅ Proper spacing between sections
- ✅ No raw markdown syntax visible

## Why This Works

1. **Explicit Instructions**: LLMs follow instructions better when they're clear and specific
2. **Examples**: Providing syntax examples (`### for headings`, `- for lists`) guides the LLM
3. **Consistency**: All entity data is pre-formatted in proper markdown before giving to LLM
4. **Reinforcement**: Instructions appear multiple times (system prompt + intent-specific + guidelines)

## Impact on Other Query Types

This fix improves **all** chat responses, not just entity queries:

- **General questions**: Better formatted with headings and lists
- **Code examples**: Proper code blocks with backticks
- **Explanations**: Structured with headings and bullet points
- **Comparisons**: Tables and organized lists

## Performance Considerations

- **Minimal impact**: Adding instructions adds ~100 tokens to prompt
- **Better output**: LLM produces cleaner, more structured responses
- **Fewer retries**: Users less likely to need clarification

## Related Files

- `apps/server/src/modules/chat/chat-generation.service.ts` - Prompt builder with markdown instructions
- `apps/admin/src/pages/admin/chat/conversation/index.tsx` - Markdown renderer
- `docs/CHAT_MARKDOWN_RENDERING.md` - Markdown rendering documentation

## Future Enhancements

1. **Few-shot examples**: Include example markdown responses in prompt
2. **Template library**: Pre-defined markdown templates for common response types
3. **Validation**: Check LLM response for valid markdown before sending to client
4. **Feedback loop**: Learn from user corrections to improve formatting

## Conclusion

By explicitly instructing the LLM to use proper markdown syntax and providing clear examples, we ensure that the markdown renderer can properly parse and display formatted responses. This creates a professional, modern chat experience that matches user expectations from AI assistants.
