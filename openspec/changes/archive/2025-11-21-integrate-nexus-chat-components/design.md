# Design: Nexus Chat Component Integration

## Overview

This design integrates production-ready chat UI components from the Nexus React template into our chat-sdk implementation, replacing basic unstyled components with polished, professional AI chat interface patterns.

## Component Architecture

### Source Components (Nexus Template)

1. **Content Item** (`~/code/Nexus-React-3.0.0/src/pages/admin/apps/gen-ai/content/ContentItem.tsx`)

   - Message bubble component for AI chat
   - Bot avatar with primary color theming
   - Hover-revealed action toolbar (Regenerate, Copy, Thumbs up/down)
   - Relative timestamps
   - Image attachment support

2. **Chat Input** (`~/code/Nexus-React-3.0.0/src/pages/admin/apps/chat/components/ChatInput.tsx`)

   - Form-based input with attachment button
   - Send button with icon
   - Auto-reset after submission

3. **Chat Message List** (`~/code/Nexus-React-3.0.0/src/pages/admin/apps/chat/components/ChatMessageList.tsx`)
   - SimpleBar scrollable container
   - Auto-scroll to bottom
   - Header with user info and actions

### Target Components (Our Project)

Creating new components in `apps/admin/src/components/chat-sdk/`:

1. **MessageBubble.tsx** - Adapted from ContentItem

   - Props: `message` (AISDKUIMessage), `onCopy`, `onRegenerate`, `onFeedback`
   - Renders user vs AI messages with appropriate styling
   - Extracts text from `message.parts[]` array
   - Relative time formatting

2. **ChatInput.tsx** - Adapted from Nexus ChatInput

   - Props: `onSend`, `disabled`, `placeholder`
   - Integrates with AI SDK `sendMessage` function
   - Attachment button (UI only, no functionality yet)

3. **MessageList.tsx** - Adapted from ChatMessageList pattern

   - Props: `messages`, `loading`, `emptyState`
   - SimpleBar scrolling container
   - Auto-scroll behavior
   - Loading dots animation

4. **ConversationList.tsx** - Enhanced existing sidebar
   - Same logic, refreshed styling to match Nexus patterns
   - Better visual hierarchy

## Data Flow

```
User types message
    ↓
ChatInput component
    ↓
onSend callback → sendMessage({ text })
    ↓
AI SDK useChat hook
    ↓
POST /api/chat-sdk
    ↓
Backend streams response
    ↓
AI SDK updates messages array
    ↓
MessageList renders messages
    ↓
MessageBubble shows AI response with actions
    ↓
User clicks "Copy"
    ↓
onCopy callback → clipboard API
```

## Styling Strategy

### DaisyUI Classes (from Nexus)

- `chat` / `chat-start` / `chat-end` - Message alignment
- `chat-image` - Avatar container
- `chat-bubble` - Message content bubble
- `chat-footer` - Timestamp footer
- `bg-base-200` - Message bubble background
- `bg-primary/5` / `text-primary` / `border-primary/10` - Bot avatar theming
- `loading loading-dots loading-sm` - AI thinking animation

### Transitions

- Action toolbar: `opacity-0 group-hover:opacity-100 scale-90 group-hover:scale-100`
- Smooth animations matching Nexus patterns

## Integration Points

### With AI SDK

```typescript
// MessageBubble accepts AI SDK UIMessage format
interface UIMessage {
  id: string;
  role: 'user' | 'assistant';
  parts: Array<{ type: 'text'; text: string }>;
}

// Extract text from parts
const text = message.parts
  .filter((p) => p.type === 'text')
  .map((p) => p.text)
  .join('');
```

### With Existing Hooks

- `useChat()` provides: `messages`, `sendMessage`, `status`, `stop`, `regenerate`
- `onCopy` uses native clipboard API: `navigator.clipboard.writeText()`
- `onRegenerate` calls AI SDK's `regenerate()` method
- `onFeedback` logs to console (placeholder for analytics)

## Dependencies

- **simplebar-react** - Smooth scrollbar (`npm install simplebar-react simplebar-react/dist/simplebar.min.css`)
- **date-fns** (optional) - Relative time formatting (`npm install date-fns`)

## File Structure

```
apps/admin/src/
├── components/
│   └── chat-sdk/
│       ├── MessageBubble.tsx       # AI/user message component
│       ├── ChatInput.tsx           # Input with send button
│       ├── MessageList.tsx         # Scrollable container
│       ├── ConversationList.tsx    # Sidebar with conversations
│       └── index.ts                # Barrel export
├── pages/
│   └── chat-sdk/
│       └── index.tsx               # Main chat page (updated)
└── utils/
    └── time.ts                     # Relative time formatting
```

## Implementation Notes

### Message Bubble Component

Key adaptations from Nexus ContentItem:

1. Accept AI SDK UIMessage format instead of simple { content, isResponse }
2. Extract text from parts[] array
3. Wire action handlers to AI SDK methods
4. Add TypeScript types for all props

### Chat Input Component

Key adaptations:

1. Replace FormData with direct state management
2. Integrate with AI SDK sendMessage function
3. Add disabled state during streaming
4. Keep attachment button as placeholder

### Message List Component

Key adaptations:

1. Map AI SDK messages instead of static data
2. Use useEffect to auto-scroll on new messages
3. Add loading animation during streaming
4. Handle empty state

## Testing Strategy

1. **Visual Testing** - Compare with Nexus template visually
2. **Interaction Testing** - Test all action buttons
3. **Scroll Testing** - Verify auto-scroll behavior
4. **Responsive Testing** - Test on mobile viewports
5. **Accessibility Testing** - Verify ARIA labels and keyboard navigation

## Rollout Plan

1. **Extract components** - Copy and adapt from Nexus
2. **Test in isolation** - Storybook or isolated page
3. **Integrate incrementally** - Replace one component at a time
4. **Verify functionality** - Ensure no regressions
5. **Remove old code** - Clean up basic UI implementation

## Alternatives Considered

### Alternative 1: Use Nexus components directly

**Pros:** Faster implementation  
**Cons:** Tightly coupled to Nexus structure, harder to customize

**Decision:** Adapt components for our needs

### Alternative 2: Build from scratch with shadcn/ui

**Pros:** Full control, modern components  
**Cons:** More work, reinventing wheel

**Decision:** Use Nexus patterns which are already proven

### Alternative 3: Use third-party chat component library

**Pros:** Full-featured out of box  
**Cons:** Bundle size, customization limits, learning curve

**Decision:** Nexus gives us exactly what we need
