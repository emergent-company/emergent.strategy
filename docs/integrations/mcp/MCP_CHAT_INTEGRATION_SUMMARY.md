# MCP Chat Integration - Executive Summary

**Date**: October 20, 2025  
**Status**: Design Approved - Ready for Implementation  
**Timeline**: 3 weeks (phased rollout)

---

## ✅ Approved Strategy

### Current System → Future Vision

**Current (To Be Removed)**:
```
User Question → Hybrid Search (Vector + Full-Text) → Document Chunks → LLM
                       ↓
               Unstructured text snippets (no relationships)
```

**Phase 1 (Immediate - Week 1)**:
```
User Question → MCP Schema Tools → Structured Schema Info → LLM
                       ↓
               Schema context (types, relationships, versions)
```

**Future Vision (Phase 3+)**:
```
User Question → Graph Search → Objects + Relationships → LLM
                       ↓
               Structured data with semantic connections
```

---

## Key Decisions Made

### 1. ✅ Disable Hybrid Search Citations
**Why**: 
- Current system returns unstructured text chunks
- No relationship context (just content similarity)
- Document-centric, not graph-oriented
- Future: Replace with graph search for structured object/relationship responses

**Impact**:
- Chat will temporarily lose document context retrieval
- LLM will rely on schema information only (Phase 1)
- Graph query capability added in Phase 3

### 2. ✅ Keyword-Based Detection (Phase 1)
**Approach**: Simple, fast keyword matching for schema intents
- ✅ Fast (< 10ms)
- ✅ No additional API calls
- ✅ Easy to test
- Phase 3 upgrade: LLM-based detection using configured Vertex AI model

### 3. ✅ Three-Phase Implementation
**Week 1**: Foundation (disable citations, add schema tools)  
**Week 2**: UI integration  
**Week 3**: Advanced features + graph search planning

### 4. ✅ Configurable Vertex AI Model
**Configuration**: Uses `VERTEX_AI_MODEL` environment variable
- Accessed via `AppConfigService.vertexAiModel`
- Supports any Vertex AI model (e.g., `gemini-1.5-flash-latest`, `gemini-1.5-pro-002`, `gemini-2.0-flash-exp`)
- Same model used for both chat generation and (optionally) intent classification

---

## Implementation Steps

### 🚧 Next: Task 4 - Disable Citation Retrieval (30 min)

**Files to modify**:
- `apps/server/src/modules/chat/chat.controller.ts`
  - Line ~248: Comment out `retrieveCitations()` call in `streamPost()`
  - Line ~313: Comment out in offline/test mode
  - Line ~436: Comment out in `POST /chat/stream` endpoint
  - Update prompt assembly to remove citation context
  - Keep `citations` variable as empty array for backward compatibility

**Changes**:
```typescript
// Before
citations = await this.chat.retrieveCitations(userQuestion, 4, orgId, projectId, null);
const contextSnippet = citations.slice(0, 3).map(c => c.text).join('\n---\n');
const prompt = `Context:\n${contextSnippet}\n\nQuestion: ${userQuestion}`;

// After
// citations = await this.chat.retrieveCitations(...); // DISABLED - will be replaced with graph search
const citations: any[] = []; // Keep for backward compatibility
const prompt = `You are a helpful assistant for querying knowledge graphs.\n\nQuestion: ${userQuestion}`;
```

**SSE Events**:
```typescript
// Update meta event to not include citations
res.write(`data: ${JSON.stringify({ 
    type: 'meta', 
    conversationId: id,
    // citations: [] // Remove from payload
})}\n\n`);
```

---

## Architecture Changes

### Before (Current)
```
┌─────────────┐
│ User Query  │
└──────┬──────┘
       │
       ▼
┌─────────────────────────────┐
│ Hybrid Search (RRF)         │
│ • Vector similarity         │
│ • Full-text ranking         │
│ • Returns document chunks   │
└──────┬──────────────────────┘
       │
       ▼
┌─────────────────┐
│ LLM Generation  │
│ (with chunks)   │
└─────────────────┘
```

### After (Phase 1)
```
┌─────────────┐
│ User Query  │
└──────┬──────┘
       │
       ▼
┌────────────────────┐
│ MCP Tool Detector  │
│ (keyword-based)    │
└──────┬─────────────┘
       │
       ▼
┌────────────────────┐     ┌──────────────────┐
│ MCP Tool Router    │────▶│ MCP Schema API   │
│ • getSchemaVersion │     │ • /schema/version│
│ • getChangelog     │     │ • /schema/changelog
└──────┬─────────────┘     └──────────────────┘
       │
       ▼
┌─────────────────┐
│ LLM Generation  │
│ (with schema)   │
└─────────────────┘
```

### Future (Phase 3+)
```
┌─────────────┐
│ User Query  │
└──────┬──────┘
       │
       ▼
┌────────────────────┐
│ Graph Query        │
│ Translator         │
└──────┬─────────────┘
       │
       ▼
┌────────────────────┐     ┌──────────────────┐
│ Graph Search       │────▶│ Graph Database   │
│ • Find objects     │     │ • Objects        │
│ • Traverse         │     │ • Relationships  │
│ • Permissions      │     │ • Properties     │
└──────┬─────────────┘     └──────────────────┘
       │
       ▼
┌─────────────────┐
│ LLM Generation  │
│ (structured)    │
└─────────────────┘
```

---

## Example User Experience

### Phase 1: Schema Queries

**User**: "What version of the schema am I using?"

**System**:
1. 🔍 Detect intent: `schema-version` (90% confidence)
2. 🔌 Call MCP: `GET /mcp/schema/version`
3. 📡 Stream event: `{ type: 'mcp_tool', tool: 'schema-version', status: 'started' }`
4. ✅ Get result: `{ version: '57c52257693ae983', updated_at: '2025-10-20T22:45:11Z' }`
5. 💬 LLM generates: "You're currently using schema version 57c52257693ae983..."

### Phase 3: Graph Queries (Future)

**User**: "Show me all Projects related to the Product Roadmap document"

**System**:
1. 🔍 Detect entities: "Product Roadmap" (Document), "Projects" (target type)
2. 🗺️ Translate to graph query:
   ```json
   {
     "match": { "type": "Document", "name": "Product Roadmap" },
     "traverse": { "relationship": "*", "targetType": "Project" }
   }
   ```
3. 📊 Execute query: Returns objects + relationships
4. 📡 Stream structured results
5. 💬 LLM formats response:
   > The Product Roadmap document is related to 2 projects:
   > - **Q4 Planning** (supports planning)
   > - **Product Launch** (provides documentation)

---

## Benefits of New Approach

### Structured Over Unstructured
| Old (Citations) | New (Graph) |
|----------------|-------------|
| Text chunks | Objects with types |
| Content similarity | Semantic relationships |
| No structure | Structured properties |
| Document-level | Object-level permissions |

### Better Reasoning
- ✅ LLM can reason about **relationships** (not just co-occurrence)
- ✅ Multi-hop traversal ("Projects → Documents → Tags")
- ✅ Path finding ("How is X related to Y?")
- ✅ Aggregation ("Count all Documents in active Projects")

### Cleaner Architecture
- ✅ Separation of concerns (graph search vs LLM generation)
- ✅ Testable components (query translator, permission checker)
- ✅ Extensible (add new query types without changing LLM)

---

## Timeline & Milestones

### Week 1: Foundation ✅ DESIGN COMPLETE
- [x] Task 1: Analyze chat architecture
- [x] Task 2: Design MCP integration
- [x] Task 3: Get user approval
- [ ] Task 4: **Disable citation retrieval** (30 min) ← NEXT
- [ ] Task 5: Implement MCP tool detector (2 hours)
- [ ] Task 6: Implement MCP tool router (2 hours)
- [ ] Task 7: Modify chat controller (3 hours)
- [ ] Task 8: Enhance generation service (2 hours)

**Estimated**: 10 hours total

### Week 2: UI Integration
- [ ] Task 9: Create E2E tests (3 hours)
- [ ] Task 10: Update chat UI (4 hours)

**Estimated**: 7 hours total

### Week 3: Advanced Features
- [ ] Task 11: User testing & documentation (3 hours)
- [ ] Phase 3 planning: Graph search design

**Estimated**: 3-5 hours + planning time

---

## Risk Mitigation

### User Impact
**Risk**: Chat loses document context (citations disabled)  
**Mitigation**: 
- Clear messaging: "Schema-focused assistant (document search coming soon)"
- Fast rollout of graph search (Phase 3)
- Feature flag: Can re-enable citations if needed

### Performance
**Risk**: MCP tool calls add latency  
**Mitigation**:
- Caching (5-15 min TTL for schema info)
- Parallel tool invocation
- Fail fast on errors (don't block generation)

### Testing
**Risk**: Complex integration, hard to test  
**Mitigation**:
- Unit tests for each component
- E2E tests with real auth/scopes
- Manual testing with example queries

---

## Success Metrics

1. **Adoption**: % of chat messages that invoke MCP tools (target: 20%)
2. **Accuracy**: Intent detection precision (target: >85%)
3. **Performance**: Tool invocation latency (target: <200ms)
4. **Errors**: Tool call failure rate (target: <5%)
5. **User Satisfaction**: Feedback on schema-aware responses

---

## Related Documentation

- **Full Design**: [MCP_CHAT_INTEGRATION_DESIGN.md](./MCP_CHAT_INTEGRATION_DESIGN.md)
- **MCP Phase 4**: [MCP_PHASE4_AUTH_COMPLETE.md](./MCP_PHASE4_AUTH_COMPLETE.md)
- **Security Scopes**: [../SECURITY_SCOPES.md](../SECURITY_SCOPES.md)

---

## Questions & Decisions

### ✅ Resolved
1. **Disable citations?** YES - Replace with graph search later
2. **Keyword vs LLM detection?** Keyword for Phase 1, LLM for Phase 3
3. **Timeline?** 3 weeks, phased rollout
4. **Tool calling approach?** Context injection (Phase 1), advanced tool calling (Phase 3)

### 🤔 Open Questions
1. When will MCP data tools be ready for graph queries?
2. What graph query syntax should we use?
3. Should we support multi-turn graph conversations?
4. How to visualize graph results in UI?

---

**Ready to implement!** 🚀

Next command: Start Task 4 (Disable Citation Retrieval)
