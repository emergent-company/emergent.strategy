# Implementation Tasks

## Phase 1: Backend Integration (2-3 days)

- [ ] Verify dependencies already installed
  - [ ] Confirm `@ai-sdk/react` in apps/admin/package.json
  - [ ] Confirm `@ai-sdk/langchain` in package.json
  - [ ] No new packages needed (reusing LangGraph's Vertex AI connection)
- [ ] Create ChatSdkModule structure
  - [ ] Create `apps/server/src/modules/chat-sdk/` directory
  - [ ] Create `chat-sdk.module.ts` with module definition
  - [ ] Create `chat-sdk.controller.ts` with ChatSdkController class
  - [ ] Import ChatSdkModule in AppModule
- [ ] Implement POST /api/chat-sdk endpoint
  - [ ] Add `@Post()` route in ChatSdkController
  - [ ] Inject LangGraphService and ConversationService
  - [ ] Parse request body (messages, conversationId)
  - [ ] Call LangGraphService.streamConversation()
  - [ ] Convert stream with `LangChainAdapter.toDataStreamResponse()`
  - [ ] Return streaming response in Vercel AI SDK protocol format
  - [ ] Save assistant response to database after streaming
- [ ] Test backend endpoint
  - [ ] Test with curl sending chat request
  - [ ] Verify streaming response format (newline-delimited JSON)
  - [ ] Test conversation persistence
  - [ ] Test error handling

## Phase 2: Frontend Implementation (2-3 days)

- [ ] Create chat-sdk page structure
  - [ ] Create `apps/admin/src/pages/chat-sdk/` directory
  - [ ] Create `index.tsx` with Chat component
  - [ ] Add route in `apps/admin/src/router/register.tsx`
  - [ ] Test route navigation
- [ ] Implement useChat integration
  - [ ] Import `useChat` from `@ai-sdk/react`
  - [ ] Configure with API endpoint `/api/chat-sdk`
  - [ ] Handle messages array and conversation state
  - [ ] Add input field with submit handler
  - [ ] Display messages list with streaming
- [ ] Add conversation management
  - [ ] Fetch conversations list from `/api/chat-ui/conversations`
  - [ ] Add collapsible sidebar with conversation list
  - [ ] Implement "New Conversation" button
  - [ ] Add conversation selection handler
  - [ ] Add conversation delete handler
  - [ ] Add conversation rename handler
- [ ] Style with DaisyUI
  - [ ] Use chat bubble components for messages
  - [ ] Style sidebar with DaisyUI drawer or menu
  - [ ] Add loading spinner during streaming
  - [ ] Style input field and send button
  - [ ] Add responsive layout (mobile-friendly)

## Phase 3: Feature Parity (2-3 days)

- [ ] Markdown rendering
  - [ ] Install `react-markdown` and `remark-gfm` (already installed)
  - [ ] Add ReactMarkdown component in message display
  - [ ] Configure syntax highlighting with Prism
  - [ ] Test code blocks, lists, links
- [ ] Copy-to-clipboard
  - [ ] Add copy button to AI messages
  - [ ] Implement clipboard API handler
  - [ ] Show "Copied!" feedback for 2 seconds
  - [ ] Add hover state for copy button
- [ ] Keyboard shortcuts
  - [ ] Add Ctrl+Enter to submit message
  - [ ] Add Escape to clear input
  - [ ] Add visual hint in navbar
  - [ ] Test keyboard navigation
- [ ] Timestamps
  - [ ] Add timestamp field to Message interface
  - [ ] Display relative time ("2m ago", "just now")
  - [ ] Update formatRelativeTime helper
- [ ] Conversation search
  - [ ] Add search input in sidebar
  - [ ] Filter conversations by title
  - [ ] Show "No matches found" state

## Phase 4: Testing & Documentation (1-2 days)

- [ ] Unit tests
  - [ ] Test ChatSdkController with mock services
  - [ ] Test streaming response format
  - [ ] Test error handling (LLM failure, invalid input)
  - [ ] Test conversation persistence
- [ ] Integration tests
  - [ ] E2E test: send message and receive response
  - [ ] E2E test: create and load conversation
  - [ ] E2E test: tool calling display
  - [ ] E2E test: error recovery
- [ ] Documentation
  - [ ] Document API endpoint in OpenAPI spec
  - [ ] Create comparison guide (custom vs SDK)
  - [ ] Document architecture differences
  - [ ] Add troubleshooting guide
  - [ ] Update main README with /chat-sdk route
- [ ] Performance testing
  - [ ] Measure first token latency
  - [ ] Compare streaming performance with custom implementation
  - [ ] Test with long conversations
  - [ ] Document performance metrics

## Validation Checklist

- [ ] `/chat-sdk` route loads without errors
- [ ] Messages stream character-by-character
- [ ] Conversations persist to database
- [ ] Sidebar shows conversation list
- [ ] New conversation creates database entry
- [ ] Markdown renders correctly
- [ ] Code blocks have syntax highlighting
- [ ] Copy button works on AI messages
- [ ] Ctrl+Enter submits message
- [ ] Timestamps show relative time
- [ ] Search filters conversations
- [ ] Tool calling displays correctly (if applicable)
- [ ] Errors display user-friendly messages
- [ ] Works on mobile/tablet layouts
- [ ] Build passes with no errors
- [ ] All tests pass
