# chat-sdk-ui Specification

## Purpose
TBD - created by archiving change add-vercel-ai-sdk-chat. Update Purpose after archive.
## Requirements
### Requirement: Vercel AI SDK Streaming Interface

The system SHALL provide a chat interface using Vercel AI SDK's `useChat()` hook with automatic state management and protocol compliance.

#### Scenario: User sends message via SDK hook

- **WHEN** a user submits a message using the Vercel AI SDK interface
- **THEN** the system SHALL use the `useChat()` hook from `@ai-sdk/react`
- **AND** the hook SHALL automatically manage messages array state
- **AND** the hook SHALL handle streaming protocol parsing
- **AND** the system SHALL send request to `/api/chat-sdk` endpoint

#### Scenario: SDK receives streaming response

- **WHEN** the backend streams a response via Vercel AI SDK protocol
- **THEN** the `useChat()` hook SHALL parse newline-delimited JSON chunks
- **AND** the hook SHALL update the messages array automatically
- **AND** the hook SHALL set `isLoading` state during streaming
- **AND** the hook SHALL handle errors and set `error` state

#### Scenario: SDK handles conversation continuation

- **WHEN** a user continues an existing conversation
- **THEN** the system SHALL pass `id` prop to `useChat()` with conversationId
- **AND** the hook SHALL include conversationId in API requests
- **AND** the system SHALL load conversation history from backend
- **AND** the hook SHALL maintain message history client-side

### Requirement: SDK Protocol Endpoint

The system SHALL provide a `/api/chat-sdk` endpoint that implements Vercel AI SDK's UI Message Stream Protocol.

#### Scenario: Backend uses LangChainAdapter to convert stream

- **WHEN** the chat-sdk endpoint receives a request
- **THEN** the system SHALL call `LangGraphService.streamConversation()` to get LangGraph stream
- **AND** the system SHALL use `LangChainAdapter.toDataStreamResponse()` to convert the stream
- **AND** the adapter SHALL convert LangGraph messages to Vercel AI SDK protocol format
- **AND** the system SHALL return the converted streaming response

#### Scenario: SDK protocol chunk format

- **WHEN** the backend streams a response
- **THEN** the system SHALL emit newline-delimited JSON chunks
- **AND** text chunks SHALL use format `0:"text content"`
- **AND** data chunks SHALL use format `d:{"key":"value"}`
- **AND** finish chunks SHALL include finishReason and usage data
- **AND** error chunks SHALL use format `3:"error message"`

#### Scenario: Conversation persistence via SDK

- **WHEN** the SDK endpoint receives a chat request
- **THEN** the system SHALL reuse `ConversationService` for database operations
- **AND** the system SHALL save user messages to `chat_messages` table
- **AND** the system SHALL save assistant responses after streaming completes
- **AND** the system SHALL return conversationId in finish chunk

### Requirement: Parallel Implementation Coexistence

The system SHALL maintain two independent chat implementations without conflicts or shared state issues.

#### Scenario: Both endpoints active simultaneously

- **WHEN** both `/api/chat-ui` and `/api/chat-sdk` endpoints are deployed
- **THEN** both SHALL be accessible and functional
- **AND** both SHALL share the same `LangGraphService` instance
- **AND** both SHALL share the same `ConversationService` instance
- **AND** both SHALL share the same database tables
- **AND** neither SHALL interfere with the other's operation

#### Scenario: Route isolation

- **WHEN** a user navigates to `/chat` or `/chat-sdk`
- **THEN** the system SHALL render the correct implementation
- **AND** each SHALL have independent frontend state
- **AND** each SHALL make requests to its designated endpoint
- **AND** switching between routes SHALL not cause state leakage

#### Scenario: Shared conversation data

- **WHEN** a conversation is created via either implementation
- **THEN** the conversation SHALL be stored in `chat_conversations` table
- **AND** messages SHALL be stored in `chat_messages` table
- **AND** the conversation SHALL be visible in both implementations' sidebar
- **AND** switching implementations SHALL preserve conversation history

### Requirement: SDK Feature Parity

The system SHALL implement feature parity with the custom chat implementation using Vercel AI SDK patterns.

#### Scenario: Markdown rendering in SDK chat

- **WHEN** an assistant message contains markdown
- **THEN** the system SHALL render markdown using `react-markdown`
- **AND** the system SHALL support GitHub Flavored Markdown via `remark-gfm`
- **AND** code blocks SHALL have syntax highlighting with Prism
- **AND** rendering SHALL match the visual style of custom implementation

#### Scenario: Copy to clipboard in SDK chat

- **WHEN** a user hovers over an AI message in SDK chat
- **THEN** the system SHALL display a copy button
- **AND** clicking SHALL copy message content to clipboard
- **AND** the system SHALL show "Copied!" feedback for 2 seconds
- **AND** behavior SHALL match custom implementation

#### Scenario: Keyboard shortcuts in SDK chat

- **WHEN** a user presses Ctrl+Enter (or Cmd+Enter) in SDK chat
- **THEN** the system SHALL submit the current message
- **AND** the form SHALL call the `useChat()` handleSubmit function
- **WHEN** a user presses Escape
- **THEN** the system SHALL clear the input field
- **AND** the input SHALL lose focus

#### Scenario: Timestamps in SDK chat

- **WHEN** a message is displayed in SDK chat
- **THEN** the system SHALL show a timestamp
- **AND** the timestamp SHALL use relative time format ("2m ago", "just now")
- **AND** the format SHALL match custom implementation

#### Scenario: Conversation search in SDK chat

- **WHEN** a user types in the search input
- **THEN** the system SHALL filter conversations by title in real-time
- **AND** the filter SHALL be case-insensitive
- **AND** the system SHALL show "No matches found" when empty
- **AND** behavior SHALL match custom implementation

### Requirement: SDK-Specific Configuration

The system SHALL support configuration specific to Vercel AI SDK integration.

#### Scenario: Reuse existing Vertex AI configuration

- **WHEN** the ChatSdkController processes a request
- **THEN** the system SHALL reuse `LangGraphService` which already connects to Vertex AI
- **AND** the system SHALL NOT create a separate Vertex AI connection
- **AND** the system SHALL use the same model via LangGraph (configured in `LangGraphService`)
- **AND** no new Vertex AI configuration SHALL be needed

#### Scenario: Feature flag for SDK endpoint

- **WHEN** the environment variable `ENABLE_CHAT_SDK` is set to "false"
- **THEN** the system SHALL not register ChatSdkModule
- **AND** the `/api/chat-sdk` endpoint SHALL return 404
- **AND** the `/chat-sdk` route SHALL display a disabled message
- **WHEN** the variable is "true" or unset
- **THEN** the SDK endpoint SHALL be fully functional

### Requirement: SDK Error Handling

The system SHALL handle errors gracefully using Vercel AI SDK's error patterns.

#### Scenario: SDK stream interruption

- **WHEN** the streaming connection is interrupted mid-stream
- **THEN** the `useChat()` hook SHALL set the `error` state
- **AND** the frontend SHALL display a user-friendly error message
- **AND** the system SHALL preserve any partial response
- **AND** the user SHALL be able to retry

#### Scenario: SDK API error response

- **WHEN** the `/api/chat-sdk` endpoint returns an error
- **THEN** the system SHALL format error using SDK protocol
- **AND** the error chunk SHALL use format `3:"error message"`
- **AND** the `useChat()` hook SHALL parse and set error state
- **AND** the frontend SHALL display the error message

#### Scenario: SDK LangGraph failure

- **WHEN** the LangGraph service throws an exception during SDK stream
- **THEN** the system SHALL catch the exception in ChatSdkController
- **AND** the system SHALL log error with full context
- **AND** the system SHALL return an error chunk in SDK protocol
- **AND** the stream SHALL close gracefully

### Requirement: SDK Performance Monitoring

The system SHALL monitor performance metrics for SDK implementation to compare with custom implementation.

#### Scenario: Log SDK first token latency

- **WHEN** a chat request is processed via SDK endpoint
- **THEN** the system SHALL measure time to first token
- **AND** the system SHALL log latency with "sdk" tag
- **AND** metrics SHALL be comparable to custom implementation metrics

#### Scenario: Log SDK full response latency

- **WHEN** a streaming response completes via SDK
- **THEN** the system SHALL measure total response time
- **AND** the system SHALL log response size and token count
- **AND** metrics SHALL be tagged with "sdk" for filtering

#### Scenario: Monitor SDK memory usage

- **WHEN** both implementations are running
- **THEN** the system SHALL not leak memory in either implementation
- **AND** shared services SHALL handle concurrent requests efficiently
- **AND** SDK overhead SHALL be documented

### Requirement: SDK Migration Support

The system SHALL support gradual migration from custom to SDK implementation if desired.

#### Scenario: Feature flag routing

- **WHEN** an admin configures user-level routing
- **THEN** the system SHALL support redirecting `/chat` to `/chat-sdk`
- **AND** the system SHALL support percentage-based rollout
- **AND** the system SHALL preserve conversationId across implementations

#### Scenario: Cross-implementation conversation loading

- **WHEN** a user starts a conversation in custom chat
- **AND** the user opens the same conversation in SDK chat
- **THEN** the system SHALL load the same message history
- **AND** the conversation SHALL continue seamlessly
- **AND** no data SHALL be duplicated or lost

#### Scenario: Rollback support

- **WHEN** SDK implementation has issues
- **THEN** admins SHALL be able to disable via `ENABLE_CHAT_SDK=false`
- **AND** users SHALL fall back to custom implementation
- **AND** existing conversations SHALL remain accessible

