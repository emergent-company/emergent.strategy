# chat-ui Specification Delta

## ADDED Requirements

### Requirement: LangSmith Observability Integration

The system SHALL support optional LangSmith tracing for LangGraph chat conversations to provide observability into conversation flows, tool invocations, and LLM interactions.

#### Scenario: LangSmith tracing enabled

- **WHEN** `LANGSMITH_TRACING` environment variable is set to `true` or `1`
- **AND** `LANGSMITH_ENDPOINT`, `LANGSMITH_API_KEY`, and `LANGSMITH_PROJECT` are configured
- **THEN** the system SHALL automatically trace all LangGraph executions to LangSmith
- **AND** traces SHALL include conversation messages, tool calls, LLM interactions, and state transitions
- **AND** traces SHALL be organized by project name and conversation thread ID
- **AND** the system SHALL handle LangSmith API errors gracefully without disrupting chat functionality

#### Scenario: LangSmith tracing disabled

- **WHEN** `LANGSMITH_TRACING` is not set, set to `false`, or any LangSmith credentials are missing
- **THEN** the system SHALL operate normally without tracing
- **AND** the system SHALL not make any network calls to LangSmith API
- **AND** chat functionality SHALL remain fully operational
- **AND** no errors SHALL be logged about missing LangSmith configuration

#### Scenario: LangSmith configuration validation

- **WHEN** the chat service initializes with LangSmith enabled
- **THEN** the system SHALL read `LANGSMITH_TRACING` from environment
- **AND** the system SHALL read `LANGSMITH_ENDPOINT` from environment (e.g., https://eu.api.smith.langchain.com or https://api.smith.langchain.com)
- **AND** the system SHALL read `LANGSMITH_API_KEY` from environment (format: lsv2*pt*...)
- **AND** the system SHALL read `LANGSMITH_PROJECT` from environment (project name for organizing traces)
- **AND** the config service SHALL provide typed access to these values with safe defaults

#### Scenario: Trace data includes conversation context

- **WHEN** a traced conversation executes through LangGraph
- **THEN** the trace SHALL include all user messages and AI responses
- **AND** the trace SHALL include tool invocation details (name, arguments, results)
- **AND** the trace SHALL include LangGraph node transitions and state changes
- **AND** the trace SHALL include LLM call details (model, tokens, latency)
- **AND** the trace SHALL be tagged with conversation thread ID and metadata

#### Scenario: LangSmith tracing backward compatibility

- **WHEN** LangSmith is enabled or disabled
- **THEN** existing chat API contracts SHALL not change
- **AND** frontend behavior SHALL remain unchanged
- **AND** conversation checkpointing SHALL continue to work as before
- **AND** no breaking changes SHALL be introduced to existing code

### Requirement: LangSmith Configuration Documentation

The system SHALL provide clear documentation for LangSmith configuration and usage.

#### Scenario: Environment variable documentation

- **WHEN** a developer reviews `.env.example`
- **THEN** they SHALL find LangSmith environment variables documented with clear descriptions
- **AND** they SHALL find example values for each variable
- **AND** they SHALL find a link to obtain LangSmith credentials (https://smith.langchain.com/)
- **AND** they SHALL understand that LangSmith is optional and disabled by default

#### Scenario: Privacy considerations documented

- **WHEN** deploying to production with sensitive data
- **THEN** documentation SHALL explain that traces include user messages and AI responses
- **AND** documentation SHALL mention self-hosted LangSmith option for privacy-sensitive deployments
- **AND** documentation SHALL note that tracing can be disabled without impacting functionality
