# chat-ui Spec Delta

## ADDED Requirements

### Requirement: External Link Detection in Chat

The system SHALL detect and recognize external source links (starting with Google Drive) in user chat messages.

#### Scenario: Detect Google Drive file link

- **WHEN** a user sends a chat message containing a Google Drive file link (e.g., `https://drive.google.com/file/d/{fileId}/view`)
- **THEN** the system SHALL detect the link as a Google Drive source
- **AND** the system SHALL extract the file ID from the URL
- **AND** the system SHALL trigger the document import flow

#### Scenario: Detect Google Drive open link format

- **WHEN** a user sends a chat message containing a Google Drive open link (e.g., `https://drive.google.com/open?id={fileId}`)
- **THEN** the system SHALL detect the link as a Google Drive source
- **AND** the system SHALL extract the file ID from the query parameter

#### Scenario: Detect Google Docs/Sheets/Slides links

- **WHEN** a user sends a chat message containing a Google Docs link (e.g., `https://docs.google.com/document/d/{docId}/edit`)
- **THEN** the system SHALL detect the link as a Google Drive source
- **AND** the system SHALL extract the document ID from the URL
- **AND** the system SHALL handle Sheets (`spreadsheets`) and Slides (`presentation`) URLs similarly

#### Scenario: Multiple links in single message

- **WHEN** a user sends a chat message containing multiple Google Drive links
- **THEN** the system SHALL detect all links in the message
- **AND** the system SHALL process each link sequentially
- **AND** the system SHALL report status for each link individually

#### Scenario: Non-Google Drive links ignored

- **WHEN** a user sends a chat message containing URLs that are not Google Drive links
- **THEN** the system SHALL NOT trigger the document import flow
- **AND** the system SHALL process the message as a normal chat message

### Requirement: Chat Document Import Tool

The system SHALL provide an MCP tool for importing documents from external sources via the chat interface.

#### Scenario: Import Google Drive document via chat

- **WHEN** the LangGraph agent detects a Google Drive link and invokes the import tool
- **THEN** the system SHALL:
  1. Validate the link format and extract the file ID
  2. Check if the file is publicly accessible
  3. Download the file content via Google Drive API
  4. Create a document record with `source_type: 'google_drive'`
  5. Process the document through the ingestion pipeline (chunking, embedding)
- **AND** the system SHALL stream progress updates to the user

#### Scenario: Import tool reports accessibility error

- **WHEN** the import tool attempts to access a non-public Google Drive file
- **THEN** the tool SHALL return a user-friendly error message
- **AND** the message SHALL explain: "I couldn't access that file. Please make sure it's shared with 'Anyone with the link' and try again."
- **AND** the chat SHALL continue without crashing

#### Scenario: Import tool handles duplicate document

- **WHEN** the import tool attempts to import a document that already exists (by external_source_id)
- **THEN** the tool SHALL return a message indicating the document already exists
- **AND** the message SHALL include: "That document is already in your knowledge base. I can answer questions about it."
- **AND** the system SHALL NOT create a duplicate document

#### Scenario: Import tool reports progress

- **WHEN** the import tool is processing a document
- **THEN** the tool SHALL emit progress updates:
  - "Checking access to the file..."
  - "Downloading document: {filename}..."
  - "Processing document into chunks..."
  - "Document imported successfully! It has {chunkCount} chunks and is ready for questions."

#### Scenario: Import tool timeout

- **WHEN** the document import takes longer than 30 seconds
- **THEN** the tool SHALL return a timeout error
- **AND** the message SHALL explain: "The import is taking longer than expected. The document may still be processing in the background."

### Requirement: Chat Imported Document Context Awareness

The system SHALL make the chat aware of documents that have been imported during the conversation, enabling immediate querying.

#### Scenario: Query newly imported document

- **WHEN** a user imports a document via chat and immediately asks a question about it
- **THEN** the system SHALL include the newly imported document in the RAG context
- **AND** the system SHALL be able to answer questions about the document content
- **AND** the system SHALL reference the document by name in responses

#### Scenario: Confirm document readiness

- **WHEN** a document import completes successfully
- **THEN** the chat SHALL inform the user: "I've imported '{filename}' into your knowledge base. You can now ask me questions about it."
- **AND** the system SHALL update the conversation context to include the new document

#### Scenario: List recently imported documents

- **WHEN** a user asks "What documents have I imported?" or similar
- **THEN** the chat SHALL list documents imported during the current session
- **AND** the list SHALL include document names, source types, and import timestamps

#### Scenario: Document processing incomplete

- **WHEN** a user asks about a document that is still being processed (chunks not yet embedded)
- **THEN** the chat SHALL inform the user: "That document is still being processed. It should be ready for questions in a moment."
- **AND** the system SHALL NOT return incomplete or empty results

### Requirement: Chat Import Error Recovery

The system SHALL handle import errors gracefully and guide users toward resolution.

#### Scenario: Invalid Google Drive URL format

- **WHEN** a user pastes a malformed Google Drive URL
- **THEN** the chat SHALL respond: "That doesn't look like a valid Google Drive link. Please paste a link that looks like: https://drive.google.com/file/d/..."
- **AND** the system SHALL NOT attempt to process the invalid URL

#### Scenario: Google Drive API rate limit

- **WHEN** the Google Drive API returns a rate limit error
- **THEN** the chat SHALL respond: "Google Drive is temporarily limiting requests. Please try again in a few minutes."
- **AND** the system SHALL log the rate limit event for monitoring

#### Scenario: Network error during import

- **WHEN** a network error occurs while downloading from Google Drive
- **THEN** the chat SHALL respond: "I had trouble downloading that file. Please check your internet connection and try again."
- **AND** the system SHALL log the network error with details

#### Scenario: File too large

- **WHEN** the Google Drive file exceeds the maximum allowed size (e.g., 50MB)
- **THEN** the chat SHALL respond: "That file is too large to import ({size}MB). The maximum file size is 50MB."
- **AND** the system SHALL NOT attempt to download the oversized file
