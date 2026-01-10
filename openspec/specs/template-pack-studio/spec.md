# template-pack-studio Specification

## Purpose
TBD - created by archiving change add-template-pack-studio. Update Purpose after archive.
## Requirements
### Requirement: Studio Session Management

The system SHALL manage studio sessions for creating and editing template pack definitions with draft mode and version tracking.

#### Scenario: Create new studio session for new template pack

- **WHEN** a user initiates a new template pack creation
- **THEN** the system SHALL create a new studio session
- **AND** the system SHALL create a draft template pack with `draft: true`
- **AND** the system SHALL initialize an empty schema definition
- **AND** the system SHALL return a session ID for subsequent interactions

#### Scenario: Create studio session for existing template pack

- **WHEN** a user opens an existing template pack in the studio
- **THEN** the system SHALL create a new studio session
- **AND** the system SHALL clone the existing pack as a draft with `draft: true`
- **AND** the system SHALL set `parent_version_id` to reference the original pack
- **AND** the system SHALL load the existing schema into the preview

#### Scenario: Discard studio session

- **WHEN** a user discards a studio session
- **THEN** the system SHALL delete the draft template pack
- **AND** the system SHALL delete all conversation history for the session
- **AND** the system SHALL NOT affect the original template pack (if editing existing)

#### Scenario: Session timeout

- **WHEN** a studio session has been inactive for 24 hours
- **THEN** the system SHALL mark the session as expired
- **AND** the system SHALL retain the draft pack for potential recovery
- **AND** the system SHALL warn the user on next access

### Requirement: Chat Interface

The system SHALL provide a streaming chat interface for natural language schema definition with the LLM.

#### Scenario: User sends schema description message

- **WHEN** a user sends a message describing a schema requirement
- **THEN** the system SHALL stream the LLM response in real-time
- **AND** the system SHALL display a loading indicator while waiting for first token
- **AND** the system SHALL parse any schema suggestions from the response
- **AND** the system SHALL render suggestions as actionable change cards

#### Scenario: User asks about schema best practices

- **WHEN** a user asks a question about JSON Schema or template pack conventions
- **THEN** the system SHALL provide educational information from the system prompt
- **AND** the system SHALL NOT modify the current schema
- **AND** the system SHALL suggest relevant schema changes if applicable

#### Scenario: Chat error handling

- **WHEN** the LLM API fails or times out
- **THEN** the system SHALL display a clear error message
- **AND** the system SHALL preserve the conversation history
- **AND** the system SHALL provide a retry option
- **AND** the system SHALL NOT corrupt the draft schema

#### Scenario: Context assembly for LLM

- **WHEN** the system prepares context for the LLM request
- **THEN** the system SHALL include the current draft schema definition
- **AND** the system SHALL include the full conversation history
- **AND** the system SHALL include JSON Schema best practices in the system prompt
- **AND** the system SHALL include template pack structure guidelines

### Requirement: Schema Preview Panel

The system SHALL display a real-time preview of the template pack schema being defined.

#### Scenario: Display object type schema

- **WHEN** the draft pack contains object type definitions
- **THEN** the system SHALL display each object type with its JSON Schema
- **AND** the system SHALL highlight required vs optional properties
- **AND** the system SHALL show property types and constraints
- **AND** the system SHALL display UI configuration (icon, color)

#### Scenario: Display relationship type schema

- **WHEN** the draft pack contains relationship type definitions
- **THEN** the system SHALL display each relationship type with source and target constraints
- **AND** the system SHALL show relationship properties if defined
- **AND** the system SHALL display cardinality constraints

#### Scenario: Display extraction prompts

- **WHEN** the draft pack contains extraction prompts for types
- **THEN** the system SHALL display the extraction prompt text for each type
- **AND** the system SHALL highlight prompt variables (e.g., {{document_content}})

#### Scenario: Schema preview updates in real-time

- **WHEN** a user accepts a schema suggestion
- **THEN** the preview panel SHALL update immediately
- **AND** the system SHALL animate the changed sections
- **AND** the system SHALL scroll to show the modified section

#### Scenario: Empty schema state

- **WHEN** the draft pack has no types defined yet
- **THEN** the preview panel SHALL display an empty state message
- **AND** the system SHALL suggest starting prompts (e.g., "Describe your first object type")

### Requirement: Suggestion Workflow

The system SHALL present schema changes as suggestions that the user can accept or reject.

#### Scenario: LLM suggests adding object type

- **WHEN** the LLM response contains a new object type suggestion
- **THEN** the system SHALL parse the suggestion into a structured change
- **AND** the system SHALL display the change as a diff card
- **AND** the system SHALL provide Accept and Reject buttons
- **AND** the system SHALL NOT apply the change until explicitly accepted

#### Scenario: LLM suggests modifying existing type

- **WHEN** the LLM response contains a modification to an existing type
- **THEN** the system SHALL display a before/after diff view
- **AND** the system SHALL highlight added, removed, and changed properties
- **AND** the system SHALL allow partial acceptance if multiple changes are suggested

#### Scenario: User accepts suggestion

- **WHEN** a user clicks Accept on a suggestion
- **THEN** the system SHALL apply the change to the draft schema
- **AND** the system SHALL update the preview panel
- **AND** the system SHALL mark the suggestion as accepted in the conversation
- **AND** the system SHALL persist the change to the database

#### Scenario: User rejects suggestion

- **WHEN** a user clicks Reject on a suggestion
- **THEN** the system SHALL NOT apply the change
- **AND** the system SHALL mark the suggestion as rejected in the conversation
- **AND** the system SHALL add context for the LLM that the suggestion was rejected
- **AND** the user MAY continue the conversation to refine requirements

#### Scenario: Schema validation before suggestion display

- **WHEN** the LLM generates a schema suggestion
- **THEN** the system SHALL validate the suggestion against JSON Schema spec
- **AND** the system SHALL validate the suggestion against template pack requirements
- **AND** the system SHALL NOT display invalid suggestions
- **AND** the system SHALL re-prompt the LLM with validation errors if invalid

### Requirement: Save and Version Workflow

The system SHALL allow users to save their work as new template packs or new versions of existing packs.

#### Scenario: Save as new template pack

- **WHEN** a user saves a new template pack (no parent version)
- **THEN** the system SHALL set `draft: false` on the pack
- **AND** the system SHALL validate the complete schema
- **AND** the system SHALL require a name and description
- **AND** the system SHALL make the pack available for project installation

#### Scenario: Save as new version of existing pack

- **WHEN** a user saves changes to an existing pack
- **THEN** the system SHALL create a new version with `draft: false`
- **AND** the system SHALL preserve the `parent_version_id` reference
- **AND** the system SHALL NOT modify the original pack version
- **AND** the system SHALL increment the version number

#### Scenario: Validation failure on save

- **WHEN** a user attempts to save an invalid schema
- **THEN** the system SHALL display validation errors
- **AND** the system SHALL highlight invalid sections in the preview
- **AND** the system SHALL suggest fixes via the chat interface
- **AND** the system SHALL NOT allow saving until errors are resolved

#### Scenario: Query version history

- **WHEN** a user views a template pack's version history
- **THEN** the system SHALL traverse `parent_version_id` references
- **AND** the system SHALL display all versions in chronological order
- **AND** the system SHALL allow opening any version in the studio

### Requirement: LangGraph Agent Integration

The system SHALL use a LangGraph agent for schema generation with specialized tools.

#### Scenario: Agent validates generated schema

- **WHEN** the agent generates a schema suggestion
- **THEN** the agent SHALL call the `validate_json_schema` tool
- **AND** the agent SHALL receive validation results
- **AND** the agent SHALL fix errors before returning suggestion to user

#### Scenario: Agent suggests object type

- **WHEN** the user describes an object type requirement
- **THEN** the agent SHALL use the `suggest_object_type` tool
- **AND** the tool SHALL return a properly structured type definition
- **AND** the agent SHALL include JSON Schema, UI config, and extraction prompt

#### Scenario: Agent suggests relationship type

- **WHEN** the user describes a relationship between types
- **THEN** the agent SHALL use the `suggest_relationship_type` tool
- **AND** the tool SHALL validate source and target type references
- **AND** the agent SHALL include cardinality and property constraints

#### Scenario: Agent handles complex requirements

- **WHEN** the user describes complex schema requirements
- **THEN** the agent MAY break the work into multiple suggestions
- **AND** the agent SHALL explain dependencies between suggestions
- **AND** the agent SHALL suggest an order for accepting changes

### Requirement: API Endpoints

The system SHALL expose REST API endpoints for studio operations.

#### Scenario: Create studio session endpoint

- **WHEN** `POST /api/template-packs/studio` is called
- **THEN** the system SHALL create a new session with a draft pack
- **AND** the system SHALL return the session ID and initial state
- **AND** the endpoint SHALL require authentication

#### Scenario: Load existing pack into studio endpoint

- **WHEN** `POST /api/template-packs/studio/:packId` is called
- **THEN** the system SHALL create a session with a cloned draft
- **AND** the system SHALL return the session ID and pack state
- **AND** the endpoint SHALL validate the user has access to the pack

#### Scenario: Chat endpoint with SSE streaming

- **WHEN** `POST /api/template-packs/studio/:sessionId/chat` is called
- **THEN** the system SHALL stream the response using Server-Sent Events
- **AND** the system SHALL include suggestion chunks in the stream
- **AND** the endpoint SHALL persist the conversation turn

#### Scenario: Apply suggestion endpoint

- **WHEN** `POST /api/template-packs/studio/:sessionId/apply` is called with a suggestion ID
- **THEN** the system SHALL apply the suggestion to the draft schema
- **AND** the system SHALL return the updated schema state
- **AND** the endpoint SHALL validate the suggestion exists and is pending

#### Scenario: Save pack endpoint

- **WHEN** `POST /api/template-packs/studio/:sessionId/save` is called
- **THEN** the system SHALL validate and finalize the draft pack
- **AND** the system SHALL return the saved pack details
- **AND** the endpoint SHALL handle name/description in request body

### Requirement: Observability

The system SHALL integrate with Langfuse for tracing and monitoring.

#### Scenario: Trace studio chat requests

- **WHEN** a chat request is processed
- **THEN** the system SHALL create a Langfuse trace with `traceType: 'template-studio'`
- **AND** the trace SHALL include the session ID and user ID
- **AND** the trace SHALL capture LLM inputs and outputs

#### Scenario: Track suggestion acceptance rates

- **WHEN** a user accepts or rejects a suggestion
- **THEN** the system SHALL log the decision to Langfuse
- **AND** the system SHALL include the suggestion type and content
- **AND** metrics SHALL be available for analyzing suggestion quality

