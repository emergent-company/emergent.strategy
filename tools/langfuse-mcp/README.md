# Langfuse MCP Server

An MCP (Model Context Protocol) server for browsing Langfuse traces and managing prompts from AI coding assistants like OpenCode, Cursor, and others.

## Features

- **List Traces** - Browse traces with filtering by name, user, session, time range, and tags
- **Get Trace Details** - Retrieve full trace information including observations, scores, and costs
- **List Sessions** - View available sessions for filtering
- **List Prompts** - Browse prompts with filtering by name, label, and tag
- **Get Prompt** - Retrieve a specific prompt by name and version/label
- **Update Prompt** - Create new prompts or new versions of existing prompts

## Installation

The server is part of the workspace and uses the existing `tsx` setup. No additional installation required.

## Configuration

The server requires the following environment variables:

| Variable              | Description                                   | Example                      |
| --------------------- | --------------------------------------------- | ---------------------------- |
| `LANGFUSE_HOST`       | Langfuse API host                             | `https://cloud.langfuse.com` |
| `LANGFUSE_PUBLIC_KEY` | Public API key from Langfuse project settings | `pk-lf-...`                  |
| `LANGFUSE_SECRET_KEY` | Secret API key from Langfuse project settings | `sk-lf-...`                  |

These should be set in your `.env` file.

## Usage

### With OpenCode

The server is configured in `opencode.jsonc`:

```json
{
  "langfuse": {
    "type": "local",
    "command": ["npx", "tsx", "tools/langfuse-mcp/src/index.ts"]
  }
}
```

### With VS Code

The server is configured in `.vscode/mcp.json`:

```json
{
  "langfuse": {
    "command": "npx",
    "args": ["tsx", "tools/langfuse-mcp/src/index.ts"],
    "env": {
      "LANGFUSE_HOST": "${LANGFUSE_HOST}",
      "LANGFUSE_PUBLIC_KEY": "${LANGFUSE_PUBLIC_KEY}",
      "LANGFUSE_SECRET_KEY": "${LANGFUSE_SECRET_KEY}"
    }
  }
}
```

### Manual Testing

Run the server directly:

```bash
npx tsx tools/langfuse-mcp/src/index.ts
```

## Available Tools

### `list_traces`

List traces with optional filtering.

**Parameters:**

| Parameter       | Type     | Description                               |
| --------------- | -------- | ----------------------------------------- |
| `name`          | string   | Filter by trace name                      |
| `userId`        | string   | Filter by user ID                         |
| `sessionId`     | string   | Filter by session ID                      |
| `tags`          | string[] | Filter by tags                            |
| `fromTimestamp` | string   | Start of time range (ISO 8601)            |
| `toTimestamp`   | string   | End of time range (ISO 8601)              |
| `limit`         | number   | Number of results (default: 10, max: 100) |
| `page`          | number   | Page number for pagination                |

**Example Response:**

```json
{
  "traces": [
    {
      "id": "abc123",
      "name": "opencode",
      "timestamp": "2024-01-15T10:30:00Z",
      "userId": "user-1",
      "sessionId": "session-1",
      "input": "Help me debug this error",
      "output": "I found the issue...",
      "tags": ["debug"],
      "latency": 2500,
      "totalCost": 0.0025
    }
  ],
  "meta": {
    "page": 1,
    "limit": 10,
    "totalItems": 150
  }
}
```

### `get_trace`

Get detailed information for a specific trace.

**Parameters:**

| Parameter | Type   | Required | Description  |
| --------- | ------ | -------- | ------------ |
| `traceId` | string | Yes      | The trace ID |

**Example Response:**

```json
{
  "id": "abc123",
  "name": "opencode",
  "timestamp": "2024-01-15T10:30:00Z",
  "input": "Help me debug this error",
  "output": "I found the issue...",
  "observations": [
    {
      "id": "obs-1",
      "type": "GENERATION",
      "name": "claude-3-5-sonnet",
      "startTime": "2024-01-15T10:30:00Z",
      "endTime": "2024-01-15T10:30:02Z",
      "model": "claude-3-5-sonnet-20241022",
      "usage": {
        "input": 1500,
        "output": 500,
        "total": 2000
      },
      "calculatedTotalCost": 0.0025
    }
  ],
  "scores": [],
  "latency": 2500,
  "totalCost": 0.0025
}
```

### `list_sessions`

List available sessions.

**Parameters:**

| Parameter       | Type   | Description                     |
| --------------- | ------ | ------------------------------- |
| `fromTimestamp` | string | Start of time range (ISO 8601)  |
| `toTimestamp`   | string | End of time range (ISO 8601)    |
| `limit`         | number | Number of results (default: 10) |
| `page`          | number | Page number for pagination      |

### `list_prompts`

List prompts with optional filtering.

**Parameters:**

| Parameter | Type   | Description                               |
| --------- | ------ | ----------------------------------------- |
| `name`    | string | Filter by prompt name (partial match)     |
| `label`   | string | Filter by label (e.g., "production")      |
| `tag`     | string | Filter by tag                             |
| `limit`   | number | Number of results (default: 20, max: 100) |
| `page`    | number | Page number for pagination                |

**Example Response:**

```json
{
  "totalItems": 5,
  "page": 1,
  "totalPages": 1,
  "prompts": [
    {
      "name": "extraction-system-prompt",
      "versions": [1, 2, 3],
      "labels": ["production", "v3"],
      "tags": ["extraction", "core"],
      "lastUpdatedAt": "2024-01-15T10:30:00Z"
    }
  ]
}
```

### `get_prompt`

Get a specific prompt by name.

**Parameters:**

| Parameter | Type   | Required | Description                                   |
| --------- | ------ | -------- | --------------------------------------------- |
| `name`    | string | Yes      | The prompt name                               |
| `version` | number | No       | Specific version number                       |
| `label`   | string | No       | Label to filter by (defaults to "production") |

**Example Response:**

```json
{
  "name": "extraction-system-prompt",
  "version": 3,
  "type": "text",
  "labels": ["production", "v3"],
  "tags": ["extraction", "core"],
  "config": {
    "temperature": 0.7
  },
  "prompt": "You are an extraction assistant..."
}
```

### `update_prompt`

Create a new prompt or a new version of an existing prompt.

**Parameters:**

| Parameter       | Type               | Required | Description                                      |
| --------------- | ------------------ | -------- | ------------------------------------------------ |
| `name`          | string             | Yes      | Prompt name (creates new version if exists)      |
| `type`          | "text" \| "chat"   | Yes      | Prompt type                                      |
| `prompt`        | string \| object[] | Yes      | Prompt content (string for text, array for chat) |
| `config`        | object             | No       | Configuration (e.g., model parameters)           |
| `labels`        | string[]           | No       | Labels (e.g., ["production", "v2"])              |
| `tags`          | string[]           | No       | Tags for categorization                          |
| `commitMessage` | string             | No       | Description of changes                           |

**Example - Text Prompt:**

```json
{
  "name": "extraction-system-prompt",
  "type": "text",
  "prompt": "You are an extraction assistant...",
  "labels": ["staging"],
  "tags": ["extraction"],
  "commitMessage": "Updated extraction instructions"
}
```

**Example - Chat Prompt:**

```json
{
  "name": "chat-assistant",
  "type": "chat",
  "prompt": [
    { "role": "system", "content": "You are a helpful assistant." },
    { "role": "user", "content": "{{user_message}}" }
  ],
  "labels": ["production"],
  "config": { "temperature": 0.8 }
}
```

**Example Response:**

```json
{
  "success": true,
  "message": "Prompt \"extraction-system-prompt\" version 4 created successfully",
  "prompt": {
    "name": "extraction-system-prompt",
    "version": 4,
    "type": "text",
    "labels": ["staging"],
    "tags": ["extraction"],
    "config": {}
  }
}
```

## Development

### Project Structure

```
tools/langfuse-mcp/
├── src/
│   ├── index.ts           # MCP server entry point
│   ├── langfuse-client.ts # REST API client
│   └── tools/
│       ├── list-traces.ts
│       ├── get-trace.ts
│       ├── list-sessions.ts
│       ├── list-prompts.ts
│       ├── get-prompt.ts
│       └── update-prompt.ts
├── package.json
├── project.json
├── tsconfig.json
└── README.md
```

### Building

The server uses `tsx` for TypeScript execution, no build step required.

### Testing

```bash
# Test server startup
npx tsx tools/langfuse-mcp/src/index.ts

# The server will output JSON-RPC messages to stdout
# Use an MCP client to test the tools
```

## API Reference

This server uses the [Langfuse Public API](https://api.reference.langfuse.com/). Key endpoints:

- `GET /api/public/traces` - List traces
- `GET /api/public/traces/{traceId}` - Get trace details
- `GET /api/public/sessions` - List sessions
- `GET /api/public/v2/prompts` - List prompts
- `GET /api/public/v2/prompts/{name}` - Get prompt by name
- `POST /api/public/v2/prompts` - Create/update prompt

Authentication uses HTTP Basic Auth with `publicKey:secretKey`.
