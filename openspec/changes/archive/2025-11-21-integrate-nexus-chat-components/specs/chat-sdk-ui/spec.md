# chat-sdk-ui Spec Deltas

## MODIFIED Requirements

### Requirement: Nexus Template UI Components

The system SHALL use production-ready chat UI components adapted from the Nexus React template for professional, polished AI chat interface.

#### Scenario: Message bubbles use Nexus styling patterns

- **WHEN** a message is displayed in the chat
- **THEN** the system SHALL render using DaisyUI `chat` component classes
- **AND** user messages SHALL use `chat-end` alignment with simple bubble
- **AND** AI messages SHALL use `chat-start` alignment with bot avatar
- **AND** bot avatar SHALL use primary color theming (`bg-primary/5`, `text-primary`, `border-primary/10`)
- **AND** message bubble SHALL use `chat-bubble` class with `bg-base-200` background

#### Scenario: Message action toolbar on hover

- **WHEN** a user hovers over an AI message
- **THEN** the system SHALL display an action toolbar at the bottom of the message
- **AND** the toolbar SHALL contain "Regenerate", "Copy", "Thumbs down", and "Thumbs up" buttons
- **AND** the toolbar SHALL use fade-in transition (`opacity-0` to `opacity-100`)
- **AND** the toolbar SHALL use scale transition (`scale-90` to `scale-100`)
- **AND** clicking "Copy" SHALL copy message text to clipboard
- **AND** clicking "Regenerate" SHALL call AI SDK `regenerate()` method
- **AND** clicking thumbs up/down SHALL log feedback to console

#### Scenario: Relative timestamps

- **WHEN** a message is displayed
- **THEN** the system SHALL show a relative timestamp in `chat-footer`
- **AND** timestamps SHALL use format like "Just now", "2m ago", "1 hour ago", "2 days ago"
- **AND** timestamps SHALL update automatically every minute
- **AND** timestamps SHALL have opacity-50 styling

### Requirement: Professional Chat Input Component

The system SHALL provide a polished chat input with attachment button and send button matching Nexus patterns.

#### Scenario: Chat input with action buttons

- **WHEN** the chat input is displayed
- **THEN** the system SHALL render a form with `bg-base-200` background
- **AND** the form SHALL contain an attachment button on the left (iconify `lucide--paperclip`)
- **AND** the form SHALL contain a text input in the center with `grow` class
- **AND** the form SHALL contain a send button on the right (iconify `lucide--send-horizonal`)
- **AND** send button SHALL use `btn-primary btn-circle btn-sm` classes
- **AND** input SHALL have placeholder "Type a message..."

#### Scenario: Input disabled during streaming

- **WHEN** AI is responding (status === 'streaming' or 'submitted')
- **THEN** the text input SHALL be disabled
- **AND** the send button SHALL be disabled
- **AND** disabled styles SHALL be applied automatically via DaisyUI

#### Scenario: Input clearing after send

- **WHEN** a user submits a message
- **THEN** the input field SHALL clear immediately
- **AND** focus SHALL remain on the input field
- **AND** the cursor SHALL be ready for next input

### Requirement: Smooth Scrolling Container

The system SHALL use SimpleBar for smooth, cross-browser scrolling in the message container.

#### Scenario: SimpleBar scrollable messages

- **WHEN** the message list is rendered
- **THEN** the system SHALL wrap messages in a SimpleBar component
- **AND** the container SHALL have fixed height (e.g., `h-[calc(100vh_-_320px)]`)
- **AND** SimpleBar SHALL provide custom scrollbar styling
- **AND** scrollbar SHALL be consistent across browsers

#### Scenario: Auto-scroll to bottom on new messages

- **WHEN** a new message is added to the chat
- **THEN** the system SHALL scroll to the bottom of the message container
- **AND** the scroll SHALL use smooth behavior
- **AND** the scroll SHALL target the last message element
- **AND** auto-scroll SHALL only occur if user was already at/near bottom

### Requirement: Loading Animation

The system SHALL display a professional loading animation while AI is generating a response.

#### Scenario: Loading dots during streaming

- **WHEN** AI SDK status is 'streaming' or 'submitted'
- **THEN** the system SHALL display loading dots at the end of messages
- **AND** loading dots SHALL use DaisyUI `loading loading-dots loading-sm` classes
- **AND** loading container SHALL have primary color theming (`bg-primary/5`, `text-primary`, `border-primary/10`)
- **AND** loading dots SHALL be inside a `rounded-box` with border and padding

#### Scenario: Loading dots disappear when complete

- **WHEN** AI SDK status changes to 'ready'
- **THEN** the loading dots SHALL be removed from the UI
- **AND** the final AI message SHALL be displayed
- **AND** no loading indicators SHALL remain visible

## ADDED Requirements

### Requirement: Component Library Structure

The system SHALL organize chat-sdk components in a dedicated component library directory.

#### Scenario: Component directory structure

- **WHEN** chat-sdk components are created
- **THEN** they SHALL be located in `apps/admin/src/components/chat-sdk/`
- **AND** the directory SHALL contain `MessageBubble.tsx`, `ChatInput.tsx`, `MessageList.tsx`, `ConversationList.tsx`
- **AND** the directory SHALL have an `index.ts` barrel export
- **AND** components SHALL be imported from `@/components/chat-sdk`

#### Scenario: Reusable component patterns

- **WHEN** a component is created
- **THEN** it SHALL accept clear, typed props
- **AND** it SHALL be independent and composable
- **AND** it SHALL follow single responsibility principle
- **AND** it SHALL include JSDoc comments for API documentation

### Requirement: SimpleBar Dependency

The system SHALL include SimpleBar library for enhanced scrolling experience.

#### Scenario: SimpleBar installation

- **WHEN** setting up the chat-sdk UI
- **THEN** the system SHALL have `simplebar-react` installed in package.json
- **AND** the system SHALL import SimpleBar CSS (`simplebar-react/dist/simplebar.min.css`)
- **AND** SimpleBar SHALL only be used in chat-sdk components (scoped usage)

#### Scenario: SimpleBar integration

- **WHEN** MessageList component renders
- **THEN** it SHALL wrap message content in `<SimpleBar>` component
- **AND** it SHALL set a ref to access SimpleBar instance
- **AND** it SHALL call `getScrollElement()` for scroll operations
- **AND** it SHALL use `scrollTo()` method for auto-scroll

### Requirement: Clipboard Integration

The system SHALL provide one-click copy-to-clipboard functionality for AI messages.

#### Scenario: Copy message text

- **WHEN** a user clicks the "Copy" button on an AI message
- **THEN** the system SHALL extract text from message.parts[] array
- **AND** the system SHALL call `navigator.clipboard.writeText(text)`
- **AND** the system SHALL show temporary "Copied!" feedback
- **AND** the button SHALL change to "Copied" text for 2 seconds
- **AND** the system SHALL handle clipboard API errors gracefully

### Requirement: Message Regeneration

The system SHALL allow users to regenerate the last AI response.

#### Scenario: Regenerate AI response

- **WHEN** a user clicks "Regenerate" button on the last AI message
- **THEN** the system SHALL call AI SDK's `regenerate()` method
- **AND** the system SHALL remove the current AI message
- **AND** the system SHALL stream a new response
- **AND** loading dots SHALL appear during regeneration
- **AND** regeneration SHALL only be available on the last message

### Requirement: User Feedback Collection

The system SHALL provide thumbs up/down buttons for collecting user feedback on AI responses.

#### Scenario: Thumbs up/down feedback

- **WHEN** a user clicks thumbs up or thumbs down on an AI message
- **THEN** the system SHALL log the feedback to console (temporary implementation)
- **AND** the log SHALL include message ID, feedback type ('positive' or 'negative'), and timestamp
- **AND** the button SHALL show visual indication of selection
- **AND** the system SHALL prepare data structure for future analytics integration
