# Add LangSmith Tracing to LangGraph Chat

## Why

The current LangGraph chat implementation lacks observability into conversation flows, tool invocations, and LLM interactions. This makes debugging difficult and provides no visibility into:

- Token usage and costs per conversation
- Latency breakdown across LangGraph nodes
- Tool call success rates and failures
- Conversation quality and user satisfaction
- Performance bottlenecks in the graph execution

LangSmith provides native observability for LangChain/LangGraph applications with automatic tracing of:

- LLM calls (prompts, completions, tokens, latency)
- Tool invocations (inputs, outputs, errors)
- Graph execution (node transitions, state changes)
- Conversation threads and multi-turn context

Integrating LangSmith will enable production monitoring, debugging, and optimization of the chat system without requiring custom instrumentation.

## What Changes

This change adds LangSmith tracing to the existing LangGraph chat implementation with minimal code changes:

- Add optional LangSmith configuration via environment variables
- Enable automatic tracing when LangSmith credentials are configured
- Preserve existing chat functionality when LangSmith is not configured
- No changes to chat API contracts or frontend behavior
- No breaking changes to existing code

The implementation follows LangSmith's standard environment variable pattern:

- `LANGSMITH_TRACING` - Enable/disable tracing (true/false)
- `LANGSMITH_ENDPOINT` - LangSmith API endpoint (EU or US region)
- `LANGSMITH_API_KEY` - Authentication token
- `LANGSMITH_PROJECT` - Project name for organizing traces

All variables are optional and default to disabled state. When enabled, LangChain automatically instruments the LangGraph execution without additional code changes.

## Impact

- **Affected specs:**
  - `chat-ui` - Add observability requirements
- **Affected code:**
  - `.env.example` - Add LangSmith environment variables with documentation
  - `apps/server/src/common/config/config.service.ts` - Add getter methods for LangSmith config
  - `apps/server/src/common/config/config.schema.ts` - Define optional LangSmith environment variable schema
  - `apps/server/src/modules/chat-ui/services/langgraph.service.ts` - Minimal changes (LangChain auto-instruments when env vars are set)
- **Dependencies:**
  - `langsmith` package already installed as transitive dependency of `@langchain/core`
  - No new dependencies required
- **Breaking changes:** None - fully backward compatible, opt-in via environment variables
- **Operational impact:**
  - Optional external dependency (LangSmith cloud service)
  - Network calls to LangSmith API when tracing is enabled
  - Minimal performance overhead (async background upload)
  - Cost consideration: LangSmith has free tier, paid plans for production scale

## How It Works

### Configuration

Environment variables are added to `.env.example` with clear documentation:

```bash
# LangSmith Tracing (Optional)
# Provides observability for LangGraph chat conversations
# Get credentials from: https://smith.langchain.com/
LANGSMITH_TRACING=true
LANGSMITH_ENDPOINT=https://eu.api.smith.langchain.com
LANGSMITH_API_KEY=lsv2_pt_...
LANGSMITH_PROJECT=spec-server-chat
```

The config service provides typed access to these values with safe defaults:

```typescript
get langsmithTracingEnabled(): boolean {
  return this.env.LANGSMITH_TRACING === 'true' || this.env.LANGSMITH_TRACING === '1';
}
```

### Automatic Instrumentation

LangChain automatically detects LangSmith environment variables and instruments:

- `ChatVertexAI` model calls
- LangGraph state transitions
- Tool invocations
- Conversation checkpointing

No manual tracing code is required. The LangGraph service initialization remains unchanged:

```typescript
// Existing code - no changes needed
this.model = new ChatVertexAI({
  model: modelName,
  // ... existing config
});

// LangChain automatically traces when LANGSMITH_TRACING=true
```

### Trace Organization

Traces are organized in LangSmith by:

- **Project:** Configurable via `LANGSMITH_PROJECT` (e.g., "spec-server-chat")
- **Thread ID:** Conversation ID from LangGraph checkpointing
- **Tags:** Automatically added (model name, user ID if available)

### Development Workflow

1. **Local development without tracing:**

   - Leave `LANGSMITH_TRACING` unset or set to `false`
   - Chat works normally with no external dependencies

2. **Local development with tracing:**

   - Set LangSmith environment variables in `.env`
   - Start server and use chat
   - View traces at https://smith.langchain.com/

3. **Production deployment:**
   - Configure LangSmith variables in deployment environment
   - Traces automatically sent to LangSmith cloud
   - Monitor conversations, costs, and performance in dashboard

### Privacy Considerations

LangSmith traces include:

- User messages and AI responses
- Tool invocation details
- Conversation metadata

For production deployments with sensitive data:

- Use LangSmith's self-hosted option (requires separate deployment)
- Or disable tracing and use alternative observability tools
- Or implement data redaction before tracing (future enhancement)

## Open Questions

None - implementation is straightforward following LangChain's standard patterns.

## Next Steps After Approval

1. Add LangSmith environment variables to `.env.example`
2. Update config schema and service with LangSmith getters
3. Document LangSmith integration in README or deployment guide
4. Test with LangSmith cloud account to verify trace collection
5. Update tasks.md checklist and mark complete after validation
