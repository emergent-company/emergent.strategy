# MCP-Enhanced Chat - User Guide

## Overview

The chat system now includes **intelligent schema assistance** powered by MCP (Model Context Protocol). When you ask questions about your data schema, the system automatically queries the database and provides accurate, real-time information.

---

## What Can You Ask?

### Schema Version

**Example Questions**:
- "What is the current schema version?"
- "What version of the schema are we using?"
- "Show me the schema version"

**What You'll Get**:
- Current schema version number (e.g., "1.2.3")
- Effective date of the version
- Total number of types defined
- Deployment timestamp

**Example Response**:
> "The current schema version is **1.2.3**, which became effective on October 15, 2025. The schema defines 42 types and was last updated at 10:00 AM UTC."

---

### Schema Changes

**Example Questions**:
- "What changed in the schema recently?"
- "Show me recent schema updates"
- "What was modified in the schema since October 1st?"
- "Tell me about schema changes in the last week"

**What You'll Get**:
- List of recent schema modifications
- Version numbers and dates
- Description of each change
- Types affected by changes

**Example Response**:
> "Here are the recent schema changes:
> 
> **Version 1.2.3** (October 15, 2025)
> - Added `metadata` field to Document type
> - Added `tags` field to Document type
> 
> **Version 1.2.2** (October 10, 2025)
> - Added `embedding_model` field to Chunk type
> - Modified `content` field in Chunk to be optional"

---

### Type Information

**Example Questions**:
- "Tell me about the Document type"
- "What properties does Chunk have?"
- "Show me the User type definition"
- "What relationships does Project have?"

**What You'll Get**:
- Type description
- List of properties with types
- Required vs optional fields
- Relationships to other types
- Cardinality (one-to-one, one-to-many)

**Example Response**:
> "The **Document** type represents a document in the knowledge base:
> 
> **Properties**:
> - `id` (string, required) - Unique identifier
> - `title` (string, required) - Document title
> - `content` (string, optional) - Full text content
> - `metadata` (object, optional) - Custom metadata
> - `created_at` (datetime, required) - Creation timestamp
> 
> **Relationships**:
> - `chunks` → Chunk (one-to-many) - Text chunks extracted from document
> - `project` → Project (many-to-one) - Project containing document"

---

## Visual Feedback

When the system is querying schema information, you'll see a status indicator:

```
┌──────────────────────────────────────────┐
│ [●] Querying schema version...           │
└──────────────────────────────────────────┘
```

This indicates:
- ✅ The system detected your schema-related question
- ✅ It's fetching real-time data from the database
- ✅ The response will include accurate, current information

The indicator disappears once the query completes (usually < 200ms).

---

## Tips for Best Results

### Be Specific

✅ **Good**: "What changed in the schema since October 1st?"  
❌ **Less Good**: "Any updates?"

✅ **Good**: "Tell me about the Document type"  
❌ **Less Good**: "What's that type?"

### Use Keywords

The system recognizes these keywords:
- **Version**: "version", "current", "what version"
- **Changes**: "changed", "modified", "updated", "recent", "changelog"
- **Types**: "type", "properties", "fields", "structure", "definition"

### Date Ranges

For changelog queries, you can specify dates:
- "since October 1st"
- "in the last week"
- "yesterday"
- "after September 15th"

---

## Non-Schema Questions

The chat system still works great for general questions!

**Example Questions** (no schema query needed):
- "How do I create a new document?"
- "What's the best way to organize my projects?"
- "Can you explain the difference between chunks and documents?"
- "What are some tips for writing effective prompts?"

For these questions, the AI responds based on its training data without querying the database.

---

## Conversation Flow

You can mix schema and non-schema questions naturally:

```
You: What is the current schema version?
AI: [Queries database] The current schema version is 1.2.3...

You: When was that released?
AI: [No query needed] Version 1.2.3 was released on October 15, 2025...

You: What changed compared to the previous version?
AI: [Queries database] Here are the changes between 1.2.2 and 1.2.3...

You: Thanks! Now how do I create a new document?
AI: [No query needed] To create a new document, you can use...
```

---

## Advanced Usage

### Comparing Versions

```
You: What changed between version 1.2.0 and 1.2.3?
AI: [Queries changelog] Here are all changes in that range...
```

### Exploring Relationships

```
You: What types are related to Document?
AI: [Queries type_info] The Document type has relationships with...
```

### Schema History

```
You: Show me all schema changes in October
AI: [Queries changelog] Here are all schema modifications in October...
```

---

## Troubleshooting

### "I asked about schema but got a generic response"

**Cause**: The system didn't detect your question as schema-related

**Solution**: Try rephrasing with explicit keywords:
- ❌ "What's the info on that?"
- ✅ "What is the Document type definition?"

---

### "The indicator appeared but the response seems incomplete"

**Cause**: Database query may have failed or timed out

**Solution**: 
1. Try asking again
2. Be more specific in your question
3. Contact support if issue persists

---

### "I see old information in the response"

**Cause**: Unlikely - the system queries live data, but could be a caching issue

**Solution**:
1. Refresh the page
2. Ask the question again
3. Verify you're looking at the correct environment (dev/staging/prod)

---

## Privacy & Security

- ✅ All conversations are private to your account
- ✅ Schema information is metadata, not your actual data
- ✅ No user data is exposed through schema queries
- ✅ Conversations are stored securely with your user ID

---

## Limitations

### What the System Can Do

✅ Query current schema version  
✅ Show recent schema changes  
✅ Explain type definitions and relationships  
✅ Provide accurate field information  

### What the System Cannot Do

❌ Modify schema (read-only)  
❌ Execute database queries on your actual data  
❌ Show historical versions beyond recent changelog  
❌ Predict future schema changes  

---

## Examples Library

### Getting Started

```
You: What is the current schema version?
```

### Exploring Types

```
You: Tell me about the Document type

You: What properties does Chunk have?

You: Show me all relationships for the Project type
```

### Tracking Changes

```
You: What changed in the schema since last week?

You: Show me changes to the Document type

You: What was added in version 1.2.3?
```

### Complex Queries

```
You: Compare the Document type definition between version 1.2.0 and now

You: What types were modified in October?

You: Show me all one-to-many relationships in the schema
```

---

## Keyboard Shortcuts

| Action | Shortcut |
|--------|----------|
| New conversation | `Cmd/Ctrl + N` (if implemented) |
| Focus message input | `Cmd/Ctrl + K` (if implemented) |
| Send message | `Enter` |
| New line in message | `Shift + Enter` |

---

## Mobile Usage

The schema-enhanced chat works on mobile devices:

- ✅ Same schema query detection
- ✅ Status indicators adapt to screen size
- ✅ Touch-friendly interface
- ✅ Swipe navigation for conversation history

---

## Feedback

Help us improve! If you:
- Find a schema question that isn't detected
- Get incorrect schema information
- Experience slow response times
- Have suggestions for new features

Please reach out to the development team with:
1. Your exact question
2. Expected vs actual response
3. Screenshots (if applicable)

---

## FAQ

**Q: Is the schema information always up to date?**  
A: Yes! The system queries the live database every time, so you always get current information.

**Q: Can I ask about multiple types in one question?**  
A: Yes, but the system works best with one type per question for detailed information.

**Q: Does this work in all chat conversations?**  
A: Yes, both shared and private conversations have schema query support.

**Q: Will my schema questions appear in shared conversations?**  
A: Only if the conversation is set to "shared". Private conversations remain private.

**Q: Can I disable schema queries?**  
A: As a user, no. If you're an admin, you can disable the feature with `CHAT_ENABLE_MCP=0`.

**Q: How fast are schema queries?**  
A: Typically 50-200ms - you'll barely notice the delay!

**Q: Can I export conversation history with schema information?**  
A: This feature is planned for a future release.

---

## Related Documentation

- [MCP Chat Architecture](./MCP_CHAT_ARCHITECTURE.md) - Technical details
- [MCP Chat UI Integration](./MCP_CHAT_UI_INTEGRATION.md) - Frontend implementation
- [API Documentation](./API.md) - REST API reference

---

## Summary

The MCP-enhanced chat makes it easy to:
- ✅ Get accurate schema information instantly
- ✅ Track schema changes over time
- ✅ Understand type relationships
- ✅ Stay informed about your data model

Just ask naturally - the system figures out when to query the database and when to use its training data. Happy chatting! 🎉
