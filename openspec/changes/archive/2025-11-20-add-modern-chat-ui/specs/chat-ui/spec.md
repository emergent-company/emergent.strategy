## ADDED Requirements

### Requirement: Streaming Chat Interface

The system SHALL provide a streaming chat interface that displays messages in real-time with proper loading states and error handling.

#### Scenario: User sends message and receives streaming response

- **WHEN** a user submits a message in the chat interface
- **THEN** the system SHALL stream the assistant's response token-by-token in real-time
- **AND** the system SHALL display a loading indicator while waiting for the first token
- **AND** the system SHALL update the message display incrementally as tokens arrive

#### Scenario: Streaming connection fails

- **WHEN** the streaming connection is interrupted or fails
- **THEN** the system SHALL display a clear error message to the user
- **AND** the system SHALL preserve any partial response received
- **AND** the system SHALL provide a retry option

#### Scenario: User submits empty message

- **WHEN** a user attempts to submit an empty or whitespace-only message
- **THEN** the system SHALL prevent submission
- **AND** the system SHALL keep the submit button disabled

### Requirement: Message Display

The system SHALL display chat messages with clear visual distinction between user and assistant messages, including tool calls.

#### Scenario: Display user message

- **WHEN** a user sends a message
- **THEN** the system SHALL display the message with a user-specific visual style
- **AND** the system SHALL include a timestamp

#### Scenario: Display assistant message

- **WHEN** an assistant response is received
- **THEN** the system SHALL display the message with an assistant-specific visual style
- **AND** the system SHALL include a timestamp
- **AND** the system SHALL support markdown formatting in the content

#### Scenario: Display tool call in message

- **WHEN** an assistant message includes tool invocations
- **THEN** the system SHALL display each tool call with its name and arguments
- **AND** the system SHALL display the tool result if available
- **AND** the system SHALL provide a distinct visual style for tool calls

### Requirement: Message Input

The system SHALL provide an input field for composing and submitting chat messages with keyboard support.

#### Scenario: User types and submits message

- **WHEN** a user types in the message input field
- **THEN** the system SHALL enable the submit button when text is present
- **AND** the system SHALL submit the message when the user presses Enter (without Shift)
- **AND** the system SHALL submit the message when the user clicks the send button

#### Scenario: Multi-line message composition

- **WHEN** a user presses Shift+Enter in the message input field
- **THEN** the system SHALL insert a newline without submitting the message
- **AND** the system SHALL expand the textarea height to accommodate multiple lines

#### Scenario: Input disabled during streaming

- **WHEN** the system is streaming a response
- **THEN** the system SHALL disable the message input field
- **AND** the system SHALL disable the submit button
- **AND** the system SHALL display a loading indicator

### Requirement: LangGraph Conversation Orchestration

The system SHALL use LangGraph to orchestrate multi-turn conversations with tool calling and state management.

#### Scenario: Execute conversation graph

- **WHEN** a chat request is received
- **THEN** the system SHALL execute the LangGraph conversation graph
- **AND** the system SHALL process the user message through the input node
- **AND** the system SHALL determine if tool calls are needed in the process node
- **AND** the system SHALL invoke the LLM with full conversation context

#### Scenario: Tool call required

- **WHEN** the LangGraph process node determines a tool call is needed
- **THEN** the system SHALL route to the tool call node
- **AND** the system SHALL invoke the appropriate MCP tool with extracted arguments
- **AND** the system SHALL inject the tool result into the conversation context
- **AND** the system SHALL continue to the respond node with the augmented context

#### Scenario: No tool call required

- **WHEN** the LangGraph process node determines no tool call is needed
- **THEN** the system SHALL route directly to the respond node
- **AND** the system SHALL generate a response using the LLM with existing context

### Requirement: PostgreSQL Conversation Checkpointing

The system SHALL persist conversation state to PostgreSQL using LangGraph's checkpointing mechanism.

#### Scenario: Save conversation checkpoint

- **WHEN** a conversation completes a LangGraph node
- **THEN** the system SHALL save the current state as a checkpoint in PostgreSQL
- **AND** the system SHALL include all messages, tool calls, and metadata
- **AND** the system SHALL use the conversation ID as the checkpoint key

#### Scenario: Load conversation checkpoint

- **WHEN** a chat request is received with a conversation ID
- **THEN** the system SHALL load the latest checkpoint from PostgreSQL
- **AND** the system SHALL restore the conversation state including message history
- **AND** the system SHALL continue the conversation from the restored state

#### Scenario: Checkpoint fails to save

- **WHEN** a checkpoint save operation fails
- **THEN** the system SHALL log the error with full context
- **AND** the system SHALL continue the conversation with in-memory state
- **AND** the system SHALL warn that conversation state may be lost

### Requirement: Anonymous Chat Access

The system SHALL allow anonymous users to access the chat interface without authentication.

#### Scenario: Anonymous user opens chat

- **WHEN** an unauthenticated user navigates to the chat page
- **THEN** the system SHALL display the chat interface without requiring login
- **AND** the system SHALL generate a unique conversation ID for the session
- **AND** the system SHALL allow message submission

#### Scenario: Anonymous chat rate limiting

- **WHEN** an anonymous user exceeds the rate limit
- **THEN** the system SHALL return a 429 Too Many Requests response
- **AND** the system SHALL include a retry-after header
- **AND** the system SHALL display a clear error message in the UI

### Requirement: Vercel AI SDK Integration

The system SHALL integrate Vercel AI SDK for streaming responses using the UI Message Stream Protocol.

#### Scenario: Stream response with AI SDK protocol

- **WHEN** the LangGraph service generates a response
- **THEN** the system SHALL wrap the response using `streamText()` from AI SDK Core
- **AND** the system SHALL format the stream using `toUIMessageStreamResponse()`
- **AND** the system SHALL emit newline-delimited JSON chunks conforming to the protocol

#### Scenario: Frontend consumes stream with useChat

- **WHEN** the frontend receives a streaming response
- **THEN** the `useChat()` hook SHALL parse the newline-delimited JSON stream
- **AND** the hook SHALL update the messages array incrementally
- **AND** the hook SHALL handle tool call chunks and reassemble them
- **AND** the hook SHALL set loading/error states appropriately

### Requirement: MCP Tool Integration

The system SHALL connect LangGraph to Model Context Protocol servers for tool calling capabilities.

#### Scenario: Connect to custom MCP server via HTTP

- **WHEN** the chat service initializes
- **THEN** the system SHALL create a custom HttpMcpTransport to connect to `/mcp/rpc`
- **AND** the system SHALL pass JWT token in Authorization header for authentication
- **AND** the system SHALL use JSON-RPC 2.0 over HTTP POST (not standard MCP transports)
- **AND** the system SHALL retrieve the list of available tools from the server

#### Scenario: Connect to MCP server

- **WHEN** the chat service initializes
- **THEN** the system SHALL establish a connection to configured MCP servers
- **AND** the system SHALL retrieve the list of available tools from each server
- **AND** the system SHALL make tools available to the LangGraph agent

#### Scenario: Invoke MCP tool from LangGraph

- **WHEN** the LangGraph tool call node is executed
- **THEN** the system SHALL send a tool invocation request to the MCP server
- **AND** the system SHALL wait for the tool result with a timeout (default 10 seconds)
- **AND** the system SHALL return the tool result to the LangGraph node
- **AND** the system SHALL handle tool errors gracefully

#### Scenario: MCP tool timeout

- **WHEN** an MCP tool invocation exceeds the timeout
- **THEN** the system SHALL cancel the tool request
- **AND** the system SHALL return an error result to LangGraph
- **AND** the system SHALL allow the conversation to continue with a fallback message

#### Scenario: Handle JSON-RPC 2.0 errors from custom server

- **WHEN** the custom MCP server returns a JSON-RPC error response
- **THEN** the system SHALL parse the error code and message
- **AND** the system SHALL log the error with full context
- **AND** the system SHALL return a graceful error to LangGraph

### Requirement: Error Handling

The system SHALL handle errors gracefully and provide clear feedback to users.

#### Scenario: LLM API failure

- **WHEN** the LLM API returns an error or is unavailable
- **THEN** the system SHALL log the error with full context
- **AND** the system SHALL return a 500 response with a user-friendly error message
- **AND** the system SHALL display the error in the chat UI with a retry option

#### Scenario: Database connection lost

- **WHEN** the PostgreSQL connection is lost during conversation
- **THEN** the system SHALL fall back to in-memory state for the current conversation
- **AND** the system SHALL log the database error
- **AND** the system SHALL warn the user that conversation state may not persist

#### Scenario: Invalid request format

- **WHEN** the chat endpoint receives an invalid request body
- **THEN** the system SHALL return a 400 Bad Request response
- **AND** the system SHALL include validation error details in the response
- **AND** the system SHALL not crash or leak error details to the client

### Requirement: Performance Requirements

The system SHALL meet specified performance targets for chat interactions.

#### Scenario: First token latency target

- **WHEN** a user sends a message
- **THEN** the system SHALL deliver the first token of the response within 1 second (p95)
- **AND** the system SHALL log latency metrics for monitoring

#### Scenario: Full response latency target

- **WHEN** the system generates a typical response (100-200 tokens)
- **THEN** the system SHALL complete streaming within 5 seconds (p95)

#### Scenario: Tool call overhead target

- **WHEN** the system invokes an MCP tool
- **THEN** the tool call SHALL complete within 500ms (excluding LLM processing)

### Requirement: Configuration

The system SHALL support configuration of chat behavior through environment variables.

#### Scenario: Configure chat model

- **WHEN** the chat service initializes
- **THEN** the system SHALL read CHAT_MODEL_PROVIDER and CHAT_MODEL_NAME from environment
- **AND** the system SHALL use the configured model for LLM calls
- **AND** the system SHALL fall back to 'gemini' and 'gemini-1.5-flash' if not configured

#### Scenario: Configure rate limiting

- **WHEN** the chat service initializes
- **THEN** the system SHALL read CHAT_RATE_LIMIT from environment
- **AND** the system SHALL apply the configured rate limit to anonymous requests
- **AND** the system SHALL fall back to '10/minute' if not configured

#### Scenario: Configure memory backend

- **WHEN** the chat service initializes
- **THEN** the system SHALL read CHAT_MEMORY_BACKEND from environment
- **AND** the system SHALL use PostgreSQL checkpointing if set to 'postgres'
- **AND** the system SHALL fall back to 'postgres' if not configured

### Requirement: Thread ID Management

The system SHALL use conversation IDs (thread IDs) to maintain conversation state across requests without relying on frontend message history.

#### Scenario: Generate thread ID for new conversation

- **WHEN** a chat request is received without a conversationId
- **THEN** the system SHALL generate a unique thread ID
- **AND** the system SHALL use this thread ID for LangGraph checkpointing
- **AND** the system SHALL return the thread ID to the frontend for subsequent requests

#### Scenario: Continue conversation with thread ID

- **WHEN** a chat request is received with a conversationId
- **THEN** the system SHALL use the conversationId as the LangGraph thread ID
- **AND** the system SHALL load conversation history from PostgreSQL (not from frontend messages array)
- **AND** the system SHALL only use the latest frontend message to continue the conversation

#### Scenario: Frontend sends full message history

- **WHEN** useChat sends the full messages array in the request body
- **THEN** the system SHALL ignore all messages except the latest one
- **AND** the system SHALL rely on PostgreSQL checkpointed history as the source of truth
- **AND** the system SHALL NOT append frontend messages to the PostgreSQL history

### Requirement: Stream Mode Configuration

The system SHALL support configurable LangGraph stream modes to control what events are sent to the frontend.

#### Scenario: Configure messages stream mode

- **WHEN** the LangGraph service is configured with streamMode 'messages'
- **THEN** the system SHALL stream only final messages from each LangGraph node
- **AND** the system SHALL NOT stream intermediate "thinking" steps
- **AND** the frontend SHALL display a simple loading spinner during processing

#### Scenario: Configure events stream mode

- **WHEN** the LangGraph service is configured with streamMode 'events'
- **THEN** the system SHALL stream all LangGraph events including intermediate steps
- **AND** the system SHALL stream tool invocation events before tool results
- **AND** the frontend SHALL display intermediate "Thinking..." or "Calling tool..." states

#### Scenario: Tool call visualization in events mode

- **WHEN** streamMode is 'events' and LangGraph invokes a tool
- **THEN** the system SHALL emit a tool_call event with tool name and arguments
- **AND** the system SHALL emit a tool_result event with the tool output
- **AND** the frontend SHALL display these events in the ToolCallDisplay component

### Requirement: Rate Limiting with Proxy Support

The system SHALL implement rate limiting for anonymous users that correctly handles proxied requests.

#### Scenario: Rate limit based on X-Forwarded-For header

- **WHEN** a chat request is received from behind a proxy or load balancer
- **THEN** the system SHALL read the X-Forwarded-For header to determine the client IP
- **AND** the system SHALL use this IP for rate limiting (not the proxy IP)
- **AND** the system SHALL handle multiple comma-separated IPs (take the first/leftmost)

#### Scenario: Rate limit based on direct IP

- **WHEN** a chat request is received directly (no proxy)
- **THEN** the system SHALL use req.ip for rate limiting
- **AND** the system SHALL apply the configured rate limit per IP address

#### Scenario: Proxy IP blocks all users

- **WHEN** the system incorrectly uses the proxy IP for rate limiting
- **THEN** all users SHALL be blocked once the rate limit is reached
- **AND** this scenario MUST be prevented by reading X-Forwarded-For

### Requirement: LangChain Adapter Integration

The system SHALL use LangChainAdapter to convert LangGraph streams to Vercel AI SDK protocol, NOT streamText.

#### Scenario: Use LangChainAdapter instead of streamText

- **WHEN** the chat controller receives a LangGraph stream
- **THEN** the system SHALL use `LangChainAdapter.toDataStreamResponse(stream)` to format the response
- **AND** the system SHALL NOT use `streamText()` which bypasses LangGraph
- **AND** the adapter SHALL convert LangGraph events to Vercel AI SDK protocol chunks

#### Scenario: Tool calls passed through adapter

- **WHEN** LangGraph emits tool call events
- **THEN** the LangChainAdapter SHALL convert these to tool_call chunks
- **AND** the frontend useChat hook SHALL receive properly formatted tool invocations
- **AND** the tool calls SHALL display correctly in the UI

#### Scenario: Adapter error handling

- **WHEN** the LangGraph stream encounters an error mid-stream
- **THEN** the LangChainAdapter SHALL format the error as an error chunk
- **AND** the frontend SHALL display the error message
- **AND** the stream SHALL close gracefully
