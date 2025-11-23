# Chat Keyboard Shortcuts - Research & Design

## Research Summary

### Industry Standards

Based on research of popular chat applications (Slack, Discord, ChatGPT, Claude, etc.), common keyboard shortcuts in chat experiences include:

#### **Message History Navigation**

- **Arrow Up (↑)** - Load previous message you sent for editing
- **Arrow Down (↓)** - Navigate forward through message history (if navigating back)
- **Escape** - Cancel editing and return to empty input

#### **Text Editing & Navigation**

- **Cmd/Ctrl + A** - Select all text in input
- **Home** - Move cursor to beginning of message
- **End** - Move cursor to end of message
- **Cmd/Ctrl + Left/Right** - Jump by word
- **Cmd/Ctrl + Backspace/Delete** - Delete by word

#### **Message Actions**

- **Enter** - Send message (standard)
- **Shift + Enter** - New line in message (multi-line support)
- **Cmd/Ctrl + Enter** - Alternative send (some apps)
- **Escape** - Clear input or close modal

#### **Application Navigation**

- **Cmd/Ctrl + K** - Quick search / command palette
- **Cmd/Ctrl + /** - Show keyboard shortcuts help
- **Cmd/Ctrl + ,** - Open settings

### W3C ARIA Guidelines

From W3C ARIA Authoring Practices Guide (APG), combobox/input patterns recommend:

- **Arrow keys** for navigation when appropriate
- **Escape** for dismissing or canceling
- **Enter** for confirming actions
- **Home/End** for cursor positioning
- Accessibility focus management with `aria-activedescendant`

## Design: Keyboard Shortcuts for Chat SDK

### Core Features to Implement

#### 1. **Message History Navigation** (Priority: HIGH)

**Arrow Up (↑) when input is empty or cursor at start:**

- Load the last message the user sent
- Populate input field with that message content
- Enable editing and re-sending
- Visual indication that you're in "edit mode"

**Arrow Down (↓) after navigating up:**

- Move forward through message history
- If at the end of history, clear the input
- Return to normal input mode

**Implementation:**

- Track message history (user messages only)
- Store history index in component state
- Detect cursor position in input
- Only trigger if cursor is at position 0 (beginning)

#### 2. **Multi-line Support** (Priority: HIGH)

**Shift + Enter:**

- Insert newline character
- Convert input from `<input>` to `<textarea>`
- Allow multi-line message composition
- Adjust height dynamically

**Enter (without Shift):**

- Send message
- Only if not holding Shift

#### 3. **Text Navigation** (Priority: MEDIUM)

**Home:**

- Move cursor to beginning of input
- Browser default behavior

**End:**

- Move cursor to end of input
- Browser default behavior

**Escape:**

- Clear input field
- Cancel any editing mode
- Return to normal state

#### 4. **Keyboard Shortcuts Help** (Priority: MEDIUM)

**Cmd/Ctrl + /:**

- Open keyboard shortcuts modal
- Display all available shortcuts
- Clean, accessible modal with DaisyUI

**Icon in UI:**

- Small keyboard icon in chat header
- Tooltip: "Keyboard shortcuts"
- Opens same modal as Cmd+/

### Technical Implementation

#### Component Changes

**ChatInput.tsx:**

- Convert from `<input>` to `<textarea>` for multi-line support
- Add `onKeyDown` handler for keyboard shortcuts
- Track message history and current index
- Dynamic height adjustment
- Preserve draft text when navigating history

**chat-sdk/index.tsx:**

- Track sent messages (user role only)
- Pass message history to ChatInput
- Handle history navigation state

**New: KeyboardShortcutsModal.tsx:**

- Modal component listing all shortcuts
- Organized by category
- Accessible (aria-labels, focus management)
- Keyboard-dismissible (Escape)

### Keyboard Shortcuts Map

| Shortcut        | Action                      | Context                        |
| --------------- | --------------------------- | ------------------------------ |
| `↑`             | Load previous message       | Input empty or cursor at start |
| `↓`             | Navigate forward in history | After using ↑                  |
| `Enter`         | Send message                | Always                         |
| `Shift + Enter` | New line                    | Always                         |
| `Escape`        | Clear input / Cancel edit   | Input has content              |
| `Home`          | Move to start               | Always                         |
| `End`           | Move to end                 | Always                         |
| `Cmd/Ctrl + /`  | Show shortcuts help         | Always                         |
| `Cmd/Ctrl + A`  | Select all                  | Always (browser default)       |
| `Cmd/Ctrl + Z`  | Undo                        | Always (browser default)       |
| `Cmd/Ctrl + K`  | Focus input                 | Any (future)                   |

### User Experience Flow

```
User types message → presses Enter → message sent
    ↓
User realizes typo → presses ↑
    ↓
Previous message loads in input (in "edit mode")
    ↓
User edits the message → presses Enter
    ↓
Edited message sent as new message
    ↓
User presses ↑ again → sees the edited message
```

### Accessibility Considerations

- Announce keyboard shortcuts availability to screen readers
- `aria-label` on keyboard shortcuts button
- Focus trap in modal when open
- Clear visual indication of edit mode
- Preserve natural text editing behaviors
- Support standard OS keyboard shortcuts (Cmd+A, Cmd+C, etc.)

### Visual Indicators

**Edit Mode:**

- Subtle border color change (accent color)
- Small badge: "Editing previous message"
- Cancel button to exit edit mode

**Keyboard Shortcuts Help:**

- Small icon in chat header (keyboard or "?")
- Tooltip on hover
- Modal with organized shortcuts list

### Edge Cases

1. **Empty message history** - Arrow Up does nothing
2. **At first message** - Arrow Up does nothing
3. **At last message** - Arrow Down clears input
4. **Multi-line message** - Arrow Up/Down navigate within text unless at first/last line
5. **Draft text exists** - Save draft before loading history
6. **Streaming in progress** - Disable history navigation

## Implementation Checklist

- [ ] Convert ChatInput from `<input>` to `<textarea>`
- [ ] Add dynamic height adjustment to textarea
- [ ] Implement Shift+Enter for multi-line
- [ ] Track user message history in chat-sdk page
- [ ] Implement Arrow Up/Down navigation
- [ ] Add cursor position detection
- [ ] Add Escape to clear input
- [ ] Create KeyboardShortcutsModal component
- [ ] Add keyboard icon to chat header
- [ ] Implement Cmd/Ctrl+/ to open shortcuts modal
- [ ] Add visual edit mode indicator
- [ ] Test all keyboard shortcuts
- [ ] Add keyboard shortcuts documentation

## References

- W3C ARIA Combobox Pattern: https://www.w3.org/WAI/ARIA/apg/patterns/combobox/
- Slack keyboard shortcuts: https://slack.com/help/articles/201374536
- Discord shortcuts: https://support.discord.com/hc/en-us/articles/225977308
- ChatGPT interface patterns (observed behavior)
