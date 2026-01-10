# object-refinement-chat Specification

## Purpose
TBD - created by archiving change add-object-refinement-chat. Update Purpose after archive.
## Requirements
### Requirement: Object-Chunk Provenance Tracking

The system SHALL maintain a join table tracking which chunks each object was extracted from.

#### Scenario: Create object-chunk link during extraction

- **WHEN** an object is extracted from a document chunk
- **THEN** the system SHALL create a record in `object_chunks` table
- **AND** the record SHALL include object_id, chunk_id, extraction_job_id, and confidence
- **AND** the system SHALL support objects extracted from multiple chunks

#### Scenario: Query source chunks for object

- **WHEN** a user or system requests the source chunks for an object
- **THEN** the system SHALL return all linked chunks with their text content
- **AND** the system SHALL include the parent document title and ID for each chunk
- **AND** the results SHALL be ordered by confidence descending

#### Scenario: Delete object cascades to provenance

- **WHEN** an object is deleted
- **THEN** the system SHALL delete all associated object_chunks records
- **AND** the chunk records themselves SHALL remain intact

### Requirement: Object-Scoped Refinement Conversation

The system SHALL support chat conversations scoped to a specific object for refinement purposes.

#### Scenario: Create refinement conversation for object

- **WHEN** a user initiates a refinement chat for an object
- **THEN** the system SHALL create a conversation with `object_id` set
- **AND** the conversation SHALL be marked as shared (`isPrivate: false`)
- **AND** the conversation title SHALL be auto-generated as "Refinement: {object.key}"

#### Scenario: Retrieve existing refinement conversation

- **WHEN** a user opens refinement chat for an object that has an existing conversation
- **THEN** the system SHALL return the existing conversation
- **AND** the system SHALL load all previous messages
- **AND** multiple users accessing the same object SHALL see the same conversation

#### Scenario: Only one refinement conversation per object

- **WHEN** the system creates a refinement conversation for an object
- **THEN** the system SHALL enforce uniqueness on `object_id`
- **AND** attempts to create a second conversation SHALL return the existing one

#### Scenario: Persist all messages to database

- **WHEN** a user sends a message in the refinement chat
- **THEN** the system SHALL save the user message to `chat_messages` table
- **AND** the system SHALL save the assistant response to `chat_messages` table after streaming completes
- **AND** each message SHALL include role, content, timestamp, and user attribution
- **AND** messages SHALL be persisted before returning success to the client

#### Scenario: Load full message history on open

- **WHEN** a user opens the refinement chat for an object
- **THEN** the system SHALL load all messages from `chat_messages` for that conversation
- **AND** messages SHALL be displayed in chronological order
- **AND** the chat SHALL scroll to the most recent message
- **AND** applied/rejected status for suggestions SHALL be visible in historical messages

### Requirement: Rich Context Assembly

The system SHALL assemble comprehensive context for the LLM including object details, relationships, and source chunks.

#### Scenario: Assemble object context for refinement

- **WHEN** a refinement chat request is processed
- **THEN** the system SHALL include the full object details (type, key, properties, labels, version)
- **AND** the system SHALL include all outgoing relationships with full target object details
- **AND** the system SHALL include all incoming relationships with full source object details
- **AND** the system SHALL include source chunks with document metadata

#### Scenario: Include schema context

- **WHEN** assembling context for refinement
- **THEN** the system SHALL include the object type definition from the template pack
- **AND** the system SHALL include valid relationship types for this object type
- **AND** the LLM SHALL use schema to validate suggested changes

#### Scenario: Handle large context gracefully

- **WHEN** the assembled context exceeds token limits
- **THEN** the system SHALL prioritize: object details > direct relationships > source chunks
- **AND** the system SHALL truncate source chunks by relevance (embedding similarity)
- **AND** the system SHALL summarize distant relationships if necessary

### Requirement: Structured Change Suggestions

The system SHALL enable the LLM to suggest changes as structured diffs that can be individually accepted or rejected.

#### Scenario: LLM suggests property change

- **WHEN** a user requests a property modification (e.g., "make description more compact")
- **THEN** the LLM SHALL return a structured suggestion with type `property_change`
- **AND** the suggestion SHALL include `before` value and `after` value
- **AND** the suggestion SHALL include `reasoning` explaining the change

#### Scenario: LLM suggests new relationship

- **WHEN** a user requests adding a relationship (e.g., "this should be a child of X")
- **THEN** the LLM SHALL return a structured suggestion with type `relationship_add`
- **AND** the suggestion SHALL include relationship type, target object ID, and direction
- **AND** the LLM SHALL validate the target object exists in the knowledge graph

#### Scenario: LLM suggests relationship removal

- **WHEN** a user requests removing a relationship
- **THEN** the LLM SHALL return a structured suggestion with type `relationship_remove`
- **AND** the suggestion SHALL identify the specific relationship to remove
- **AND** the suggestion SHALL include reasoning for removal

#### Scenario: LLM suggests object rename

- **WHEN** a user requests renaming an object
- **THEN** the LLM SHALL return a structured suggestion with type `rename`
- **AND** the suggestion SHALL include old key and new key
- **AND** the system SHALL check for key conflicts before allowing confirmation

#### Scenario: Multiple suggestions in single response

- **WHEN** a user request implies multiple changes
- **THEN** the LLM SHALL return an array of suggestions
- **AND** each suggestion SHALL be independently acceptable or rejectable
- **AND** the frontend SHALL render each suggestion as a separate diff block

### Requirement: User Confirmation Flow

The system SHALL require explicit user confirmation before applying any suggested changes.

#### Scenario: User accepts suggestion

- **WHEN** a user clicks "Accept" on a suggestion diff
- **THEN** the system SHALL apply the change to the object
- **AND** the system SHALL create a new object version
- **AND** the system SHALL record the applied change in message metadata
- **AND** the chat SHALL show confirmation message with new version number

#### Scenario: User rejects suggestion

- **WHEN** a user clicks "Reject" on a suggestion diff
- **THEN** the system SHALL NOT apply the change
- **AND** the system SHALL record the rejection in message metadata
- **AND** the user SHALL be able to continue the conversation with alternative requests

#### Scenario: Partial acceptance of multiple suggestions

- **WHEN** an LLM response contains multiple suggestions
- **THEN** the user SHALL be able to accept some and reject others
- **AND** each accepted suggestion SHALL be applied independently
- **AND** the system SHALL handle conflicts (e.g., reject conflicting changes)

#### Scenario: Conflict detection on apply

- **WHEN** user attempts to apply a suggestion
- **AND** the object has been modified since the suggestion was generated
- **THEN** the system SHALL detect the version mismatch
- **AND** the system SHALL display an error "Object was modified, please refresh"
- **AND** the system SHALL reload context and allow user to request new suggestion

### Requirement: Refinement Audit Trail

The system SHALL maintain an audit trail linking object changes to refinement conversations.

#### Scenario: Record applied change in message

- **WHEN** a user applies a refinement suggestion
- **THEN** the system SHALL store change details in the message metadata
- **AND** the record SHALL include: userId, timestamp, change type, before/after values
- **AND** the record SHALL include object version before and after

#### Scenario: Query refinement history for object

- **WHEN** a user views object history
- **THEN** the system SHALL show which versions were created via refinement
- **AND** the system SHALL provide link to the refinement conversation
- **AND** the system SHALL show the specific message that triggered the change

#### Scenario: Track rejection in audit trail

- **WHEN** a user rejects a suggestion
- **THEN** the system SHALL record the rejection in message metadata
- **AND** the record SHALL include: userId, timestamp, suggestion details, rejection reason (optional)

### Requirement: Shared Chat Access

The system SHALL provide shared access to refinement conversations for all project users.

#### Scenario: Multiple users view same conversation

- **WHEN** multiple project users open refinement chat for the same object
- **THEN** all users SHALL see the same message history
- **AND** new messages from any user SHALL appear for all users
- **AND** user attribution SHALL be shown for each message

#### Scenario: Poll for new messages

- **WHEN** a user has the refinement chat open
- **THEN** the frontend SHALL poll for new messages periodically (every 5 seconds)
- **AND** new messages from other users SHALL be appended without page refresh
- **AND** the poll SHALL stop when user closes the chat

#### Scenario: Show user attribution

- **WHEN** displaying messages in shared chat
- **THEN** the system SHALL show which user sent each message
- **AND** the system SHALL show which user accepted/rejected each suggestion
- **AND** the current user's messages SHALL be visually distinguished

### Requirement: Two-Column Modal Layout

The system SHALL display the refinement chat alongside object details in a two-column layout within the ObjectDetailModal.

#### Scenario: Modal opens with two-column layout

- **WHEN** a user opens the ObjectDetailModal
- **THEN** the modal SHALL display two columns side-by-side
- **AND** the left column SHALL contain the existing tabs (Properties, Relationships, System, History)
- **AND** the right column SHALL contain the refinement chat
- **AND** the modal width SHALL expand to accommodate both columns (e.g., max-w-6xl)

#### Scenario: Independent scrolling and navigation

- **WHEN** the user is viewing the ObjectDetailModal
- **THEN** the left column (details) SHALL scroll independently from the right column (chat)
- **AND** switching tabs on the left SHALL NOT affect the chat on the right
- **AND** scrolling chat messages SHALL NOT affect the details view

#### Scenario: User browses details while chatting

- **WHEN** a user is in the middle of a refinement conversation
- **AND** the user switches to the Relationships tab
- **THEN** the chat SHALL remain visible and maintain scroll position
- **AND** the user SHALL be able to continue typing in the chat input
- **AND** pending suggestions SHALL remain visible

#### Scenario: Responsive layout on small screens

- **WHEN** the viewport is below the responsive breakpoint (e.g., < 1024px)
- **THEN** the layout SHALL stack vertically or provide a toggle
- **AND** the user SHALL be able to access both details and chat
- **AND** the experience SHALL remain functional on tablet-sized screens

#### Scenario: Object details update after accepting suggestion

- **WHEN** a user accepts a refinement suggestion in the chat
- **THEN** the left column SHALL refresh to show the updated object data
- **AND** the refresh SHALL preserve the current tab selection
- **AND** the user SHALL see the change reflected immediately

### Requirement: AI SDK Chat Integration

The system SHALL integrate with the existing Vercel AI SDK chat infrastructure.

#### Scenario: Use useChat hook for refinement

- **WHEN** the refinement chat component mounts
- **THEN** the component SHALL use `useChat()` hook from `@ai-sdk/react`
- **AND** the hook SHALL be configured with object-specific endpoint
- **AND** the hook SHALL pass object_id in request body

#### Scenario: Stream refinement response

- **WHEN** the LLM generates a refinement response
- **THEN** the system SHALL stream the response using AI SDK protocol
- **AND** structured suggestions SHALL be included in the response data
- **AND** the frontend SHALL parse suggestions from the stream

#### Scenario: Render suggestion diffs inline

- **WHEN** a streamed response includes structured suggestions
- **THEN** the frontend SHALL render each suggestion as a diff component
- **AND** the diff SHALL show before/after values with syntax highlighting
- **AND** Accept/Reject buttons SHALL appear after streaming completes

### Requirement: Refinement Chat API Endpoint

The system SHALL provide a dedicated API endpoint for object refinement chat.

#### Scenario: Send refinement chat message

- **WHEN** a POST request is made to `/api/objects/:objectId/refinement-chat`
- **THEN** the system SHALL authenticate the user
- **AND** the system SHALL verify user has write access to the object's project
- **AND** the system SHALL assemble context and invoke LLM
- **AND** the system SHALL stream response using AI SDK protocol

#### Scenario: Apply refinement suggestion

- **WHEN** a POST request is made to `/api/objects/:objectId/refinement-chat/apply`
- **THEN** the system SHALL validate the suggestion structure
- **AND** the system SHALL verify object version matches expected
- **AND** the system SHALL apply the change and create new version
- **AND** the system SHALL return the updated object

#### Scenario: Get refinement conversation

- **WHEN** a GET request is made to `/api/objects/:objectId/refinement-chat`
- **THEN** the system SHALL return the existing conversation or create one
- **AND** the response SHALL include all messages with user attribution
- **AND** the response SHALL include applied/rejected status for suggestions

