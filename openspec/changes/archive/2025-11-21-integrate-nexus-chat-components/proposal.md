# Integrate Nexus Template AI Chat Components

## Why

The current chat-sdk implementation uses basic, unstyled UI components with minimal visual polish. While functional, it lacks:

- Polished message bubbles with proper avatars
- Action buttons (copy, regenerate, thumbs up/down)
- Professional spacing and visual hierarchy
- Consistent DaisyUI styling patterns
- Loading states and animations

The Nexus React template (`~/code/Nexus-React-3.0.0`) provides production-ready AI chat components with:

- **ContentItem component** - Polished message bubbles with AI/user avatars, action buttons, timestamps
- **ChatMessageList component** - Scrollable message container with SimpleBar
- **ChatInput component** - Professional input with attachment button and send button
- **GeneratedContents component** - History panel with "Older" pagination
- **Consistent DaisyUI patterns** - Uses `chat`, `chat-bubble`, `chat-image` classes

These components are specifically designed for AI chat interfaces with features like:

- Bot avatar with primary color theming
- Hover actions (regenerate, copy, thumbs up/down)
- Relative timestamps ("2 hours ago", "Now")
- Loading dots animation
- Image attachments support
- SimpleBar for smooth scrolling

**Goal:** Replace the basic chat-sdk UI components with Nexus template components to achieve a professional, polished AI chat interface that matches modern AI chat UX patterns.

## What Changes

### Frontend Component Migration (apps/admin)

- **Extract Nexus components** from `~/code/Nexus-React-3.0.0` to project

  - Copy `ContentItem.tsx` component (message bubbles with actions)
  - Copy `ChatInput.tsx` component (input with attachment/send buttons)
  - Adapt `GeneratedContents.tsx` pattern for chat history display
  - Copy `ChatMessageList.tsx` pattern for scrollable container

- **Create new component directory** `apps/admin/src/components/chat-sdk/`

  - `MessageBubble.tsx` - Adapted from Nexus ContentItem
  - `ChatInput.tsx` - Adapted from Nexus ChatInput
  - `ConversationList.tsx` - Sidebar with conversation history
  - `MessageList.tsx` - Scrollable message container

- **Update chat-sdk page** `apps/admin/src/pages/chat-sdk/index.tsx`
  - Replace basic message rendering with MessageBubble component
  - Replace form input with ChatInput component
  - Use MessageList for scrollable container
  - Add action handlers (copy, regenerate, feedback)

### Styling Enhancements

- **Add SimpleBar dependency** - `simplebar-react` for smooth scrolling

  - Already used in Nexus template
  - Provides consistent scrollbar UX across browsers

- **DaisyUI chat classes** - Use Nexus patterns

  - `chat chat-start` / `chat-end` for message alignment
  - `chat-image` with avatar
  - `chat-bubble` with `bg-base-200`
  - `chat-footer` with timestamp

- **Action buttons** - Hover-revealed toolbar
  - Regenerate button (retry failed messages)
  - Copy button (copy message content)
  - Thumbs up/down buttons (feedback)
  - Scale/opacity transitions on hover

### New Features

- **Message actions** - User feedback and utilities

  - Copy to clipboard on click
  - Regenerate last message on error
  - Thumbs up/down for feedback (future analytics)

- **Loading animation** - Nexus loading dots

  - Show while AI is responding
  - Replace "AI is responding..." text

- **Timestamps** - Relative time format

  - "Just now", "2m ago", "1 hour ago"
  - Use `date-fns` or similar library

- **Avatar system** - AI bot vs user
  - Bot: primary color circle with bot icon
  - User: avatar image or fallback

## Impact

### Modified Capabilities

- **specs/chat-sdk-ui** - Updates to UI patterns and component structure
  - Add requirements for Nexus component patterns
  - Add requirements for message actions (copy, regenerate, feedback)
  - Add requirements for loading animations
  - Add requirements for relative timestamps

### Affected Code

- **apps/admin/src/pages/chat-sdk/index.tsx** - Major refactor to use new components
- **apps/admin/src/components/chat-sdk/** - NEW directory with extracted Nexus components
- **apps/admin/package.json** - Add `simplebar-react` dependency
- **No backend changes** - This is purely a frontend UI enhancement

### Dependencies

- **simplebar-react** - Smooth scrollbar library (already in Nexus)
- **date-fns** (optional) - For relative time formatting
- **Existing dependencies** - DaisyUI, Tailwind, @ai-sdk/react remain unchanged

### Breaking Changes

- **NONE** - This is a UI-only enhancement
- The chat-sdk API contract remains unchanged
- Message data structure remains unchanged
- Existing conversations remain compatible

### Migration Path

1. Install new dependencies (`simplebar-react`)
2. Extract Nexus components to project
3. Adapt components to work with AI SDK's UIMessage format
4. Replace current chat-sdk UI incrementally
5. Test message rendering, actions, and scrolling
6. Remove old basic UI code

### Risks & Mitigations

**Risk:** Nexus components may not work with AI SDK message format  
**Mitigation:** Adapt components to consume `message.parts[]` array instead of simple content string

**Risk:** SimpleBar may conflict with existing styles  
**Mitigation:** Scope SimpleBar to chat-sdk components only

**Risk:** Action buttons may not integrate with AI SDK hooks  
**Mitigation:** Use AI SDK's `regenerate()` and `stop()` methods, implement clipboard manually

**Risk:** Visual inconsistency with rest of app  
**Mitigation:** Nexus uses same DaisyUI/Tailwind stack, so consistency is guaranteed

### Success Metrics

- Message bubbles match Nexus visual quality
- Action buttons (copy, regenerate, feedback) work correctly
- Loading animation displays during AI responses
- Timestamps show relative time ("2m ago")
- Scrolling is smooth with SimpleBar
- No visual regressions in existing features
- User can interact with all message actions

## Implementation Plan

### Phase 1: Component Extraction (1 day)

- Copy Nexus components to project
- Install `simplebar-react` dependency
- Verify DaisyUI classes work in our setup
- Create component structure in `apps/admin/src/components/chat-sdk/`

### Phase 2: Component Adaptation (1-2 days)

- Adapt `ContentItem` → `MessageBubble` for AI SDK UIMessage format
- Adapt `ChatInput` → `ChatInput` with AI SDK sendMessage integration
- Create `MessageList` with SimpleBar scrolling
- Add relative time formatting utility

### Phase 3: Integration (1 day)

- Update `chat-sdk/index.tsx` to use new components
- Wire up action handlers (copy, regenerate, feedback)
- Add loading animation during streaming
- Test message rendering with various content types

### Phase 4: Polish & Testing (1 day)

- Fine-tune spacing and transitions
- Test hover states and action buttons
- Verify scrolling behavior
- Test with long conversations
- Verify responsive design on mobile

## References

- Nexus template: `~/code/Nexus-React-3.0.0`
- Nexus ContentItem: `src/pages/admin/apps/gen-ai/content/ContentItem.tsx`
- Nexus ChatInput: `src/pages/admin/apps/chat/components/ChatInput.tsx`
- Nexus ChatMessageList: `src/pages/admin/apps/chat/components/ChatMessageList.tsx`
- Current chat-sdk: `apps/admin/src/pages/chat-sdk/index.tsx`
- DaisyUI Chat: https://daisyui.com/components/chat/
