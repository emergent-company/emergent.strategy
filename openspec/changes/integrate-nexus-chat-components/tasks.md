# Tasks for Nexus Chat Component Integration

## Phase 1: Setup & Extraction

- [ ] Install `simplebar-react` dependency in apps/admin package.json
- [ ] Create component directory `apps/admin/src/components/chat-sdk/`
- [ ] Copy Nexus `ContentItem.tsx` to project as reference
- [ ] Copy Nexus `ChatInput.tsx` to project as reference
- [ ] Copy Nexus `ChatMessageList.tsx` pattern as reference
- [ ] Verify DaisyUI chat classes work in current setup

## Phase 2: Component Adaptation

- [ ] Create `MessageBubble.tsx` component adapted from ContentItem
  - Accept AI SDK UIMessage parts[] format
  - Render user messages (chat-end) and AI messages (chat-start)
  - Add bot avatar for AI messages
  - Add hover action toolbar (copy, regenerate, thumbs up/down)
  - Add relative timestamp display
- [ ] Create `ChatInput.tsx` component adapted from Nexus
  - Integrate with AI SDK sendMessage function
  - Add attachment button (placeholder for future)
  - Add send button with iconify icon
  - Handle form submission and input clearing
- [ ] Create `MessageList.tsx` container component
  - Use SimpleBar for smooth scrolling
  - Auto-scroll to bottom on new messages
  - Handle empty state
- [ ] Create `ConversationList.tsx` sidebar component
  - Reuse existing conversation list logic
  - Match Nexus styling patterns
  - Add delete and new chat buttons

## Phase 3: Integration

- [ ] Update `chat-sdk/index.tsx` to use MessageBubble component
- [ ] Update `chat-sdk/index.tsx` to use ChatInput component
- [ ] Update `chat-sdk/index.tsx` to use MessageList component
- [ ] Wire up copy-to-clipboard action handler
- [ ] Wire up regenerate action handler (use AI SDK regenerate method)
- [ ] Wire up thumbs up/down feedback handlers (log to console for now)
- [ ] Add loading dots animation during AI response
- [ ] Implement relative time formatting utility

## Phase 4: Testing & Polish

- [ ] Test message rendering with various content lengths
- [ ] Test hover states and action button interactions
- [ ] Test scrolling behavior with long conversations
- [ ] Test copy-to-clipboard functionality
- [ ] Test regenerate functionality
- [ ] Verify responsive design on mobile viewport
- [ ] Check for visual consistency with Nexus patterns
- [ ] Remove old basic UI code

## Phase 5: Documentation

- [ ] Document new component API in code comments
- [ ] Add usage examples for each component
- [ ] Update OpenSpec chat-sdk-ui spec with new requirements
- [ ] Take screenshots of new UI for reference
