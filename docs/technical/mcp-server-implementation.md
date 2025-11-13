# Model Context Protocol (MCP) Server Implementation

## 1. Introduction

The Model Context Protocol (MCP) Server will provide a standardized interface for AI agents to interact with the project's database. Its primary purpose is to expose the data model (schema) and provide structured "tools" for agents to query and manipulate data.

This document outlines the implementation of the MCP server within the existing `apps/server` application, using the `@rekog/mcp-nest` library. This library is designed for building MCP servers in a NestJS environment and will allow us to seamlessly integrate with our existing services.

## 2. Core Concepts (MCP)

The MCP standard defines several key concepts for how AI agents interact with a server:

-   **Tools:** Functions that an AI agent can execute. These are the primary method for data interaction.
-   **Resources:** A file-system-like interface for agents to browse and read data.
-   **Prompts:** Reusable prompt templates for AI interactions.

Our implementation will focus on exposing our data through a set of well-defined **tools**.

## 3. Implementation with `@rekog/mcp-nest`

We will integrate the `@rekog/mcp-nest` module into our `server` application. This involves:

1.  Installing the npm package: `@rekog/mcp-nest`.
2.  Importing and configuring the `McpModule` in our main `app.module.ts`.
3.  Creating new "Tool" services that will expose our data to AI agents.

### 3.1. Schema Exposure Tool

We will create a `SchemaTool` to expose our "Template Pack" data models.

-   **Tool Name:** `schema.getTemplatePacks`
    -   **Description:** Returns a list of all available template packs.
    -   **Returns:** A list of template pack summaries (ID, name, version).

-   **Tool Name:** `schema.getTemplatePackDetails`
    -   **Description:** Returns the full definition of a single template pack.
    -   **Parameters:** `pack_id` (string)
    -   **Returns:** The full template pack definition, including `objectTypeSchemas` and `relationshipTypeSchemas`.

### 3.2. Data Access Tools

We will create a `DataTool` for querying objects and their relationships.

-   **Tool Name:** `data.getObjectsByType`
    -   **Description:** Retrieves a collection of objects of a specified type.
    -   **Parameters:**
        -   `object_type` (string)
        -   `limit` (integer, optional)
        -   `offset` (integer, optional)
    -   **Returns:** A list of objects.

-   **Tool Name:** `data.getObjectById`
    -   **Description:** Retrieves a single object by its type and ID.
    -   **Parameters:**
        -   `object_type` (string)
        -   `object_id` (string)
    -   **Returns:** A single object.

-   **Tool Name:** `data.getRelatedObjects`
    -   **Description:** Traverses a relationship from a source object to find related objects.
    -   **Parameters:**
        -   `source_object_type` (string)
        -   `source_object_id` (string)
        -   `relationship_type` (string)
    -   **Returns:** A list of related objects.

## 4. Example Usage Workflow

An AI agent would use the MCP server as follows:

1.  **Discover Schemas:** Call the `schema.getTemplatePacks` tool.
2.  **Understand a Schema:** Call `schema.getTemplatePackDetails` with a specific `pack_id` to get the data model.
3.  **Query Data:** Use the `data.getObjectsByType` and `data.getRelatedObjects` tools to query for data based on the discovered schema.

## 5. Authentication

The `@rekog/mcp-nest` library supports Guard-based authentication. We will implement a guard to ensure that all AI agent requests are properly authenticated and authorized, likely using a bearer token system.

## 6. AI Agent Service Requirements

To enable the frontend chat UI to utilize the MCP server, a dedicated AI Agent Service is required. This service will act as an intermediary, connecting the user interface to the underlying data tools and a Large Language Model (LLM).

### 6.1. Core Functionality

-   The service must expose an API endpoint for the frontend chat UI to send user messages.
-   It must be able to receive a user's query and the conversation history.
-   It must process the query to understand user intent.
-   It must return a response to the UI, preferably in a streaming manner for a better user experience.

### 6.2. LLM and Tool Integration

-   The service shall integrate with an LLM (Google Gemini via the LangChain framework) to power its reasoning capabilities.
-   The service must consume and execute the tools exposed by the MCP server (`schema.*` and `data.*` tools) to answer questions and fulfill requests related to the project's data.

### 6.3. Conversation Memory

-   The service must maintain the context of a conversation.
-   It shall manage a history of messages (user and AI) to allow for follow-up questions and contextual understanding.

### 6.4. Frontend Integration

-   The existing chat UI (`apps/admin/src/pages/admin/apps/chat/ChatApp.tsx`) must be integrated with the new AI Agent Service's API endpoint.
-   The UI must be able to send the user's message and history, and render the agent's streaming response.
