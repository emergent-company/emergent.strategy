# 22. ClickUp Integration

## 1. Overview

This document outlines the design for integrating ClickUp into our system. The goal is to import all relevant information from ClickUp and keep it synchronized with our internal data model. This integration will serve as a template for future importers from other sources.

The integration will support two modes of operation:

1.  **Full Import:** A one-time process to import all data from a ClickUp workspace.
2.  **Webhook Updates:** A real-time process to handle incremental updates from ClickUp via webhooks.

## 2. Plugin Architecture

Integrations will be implemented as plugins that can be enabled or disabled by a project administrator. This will allow for a flexible system where administrators can choose which integrations to use and provide their own credentials.

### 2.1. Plugin Management

A new section in the admin panel will be created for managing plugins. This section will list all available plugins and allow administrators to:

*   Enable or disable a plugin.
*   Configure the plugin's settings, including credentials.

### 2.2. Plugin Interface

Each plugin will implement a common `Plugin` interface:

```typescript
interface Plugin {
  name: string;
  description: string;
  enabled: boolean;
  configure(settings: any): void;
  runFullImport?(): Promise<void>;
  handleWebhook?(payload: any): Promise<void>;
}
```

## 3. ClickUp Importer

The ClickUp importer will be the first implementation of the `Plugin` interface.

### 3.1. Authentication

All requests to the ClickUp API must be authenticated. The importer will support both personal API tokens and OAuth 2.0. The project administrator will be able to choose the authentication method and provide the necessary credentials in the plugin's settings. The credentials will be stored securely.

### 3.2. Rate Limiting

The ClickUp API has a rate limit of 100 requests per minute per token. The importer will respect this rate limit by implementing a mechanism to throttle its API requests.


### 3.3. Data Model Mapping

ClickUp objects will be mapped to our internal graph data model as follows:

| ClickUp Object | Our Graph Object | Relationships |
| --- | --- | --- |
| Workspace | `Organization` | |
| Space | `Project` | `BELONGS_TO` Organization |
| Folder | `Collection` | `BELONGS_TO` Project |
| List | `Collection` | `BELONGS_TO` Collection (Folder) or Project |
| Task | `Task` | `BELONGS_TO` Collection (List) |
| Subtask | `Task` | `PARENT_OF` Task |
| Comment | `Comment` | `COMMENT_ON` Task |
| Assignee | `User` | `ASSIGNED_TO` Task |

Custom fields in ClickUp will be stored as properties on the corresponding graph objects.

#### 3.3.1. Source Tracking Metadata

**Every imported object MUST include the following metadata properties to track its origin:**

| Property | Type | Description | Example |
| --- | --- | --- | --- |
| `external_source` | string | The name of the integration source | `"clickup"` |
| `external_id` | string | The unique identifier from the source system | `"9hz"` (task ID) |
| `external_url` | string (optional) | Direct link to the object in the source system | `"https://app.clickup.com/t/9hz"` |
| `external_parent_id` | string (optional) | The parent object's external ID (for hierarchies) | `"90120"` (list ID) |
| `synced_at` | datetime | Timestamp of last sync from source | `"2025-10-05T19:51:05Z"` |
| `external_updated_at` | datetime (optional) | Last modified time in source system | `"2025-10-05T18:30:00Z"` |

**URL Construction Examples:**

- **Task:** `https://app.clickup.com/t/{task_id}`
- **List:** `https://app.clickup.com/t/{workspace_id}/v/li/{list_id}`
- **Folder:** `https://app.clickup.com/t/{workspace_id}/v/f/{folder_id}`
- **Space:** `https://app.clickup.com/t/{workspace_id}/v/s/{space_id}`

**Benefits of Source Tracking:**

1. **Bidirectional Sync:** Enables updates to flow both ways between systems
2. **Conflict Resolution:** Detect when objects were modified in both systems
3. **Debugging:** Easily trace objects back to their source for troubleshooting
4. **Deduplication:** Prevent creating duplicate objects on re-import
5. **Deep Linking:** Allow users to navigate directly to the source object
6. **Audit Trail:** Track when and from where objects were imported

**Implementation Notes:**

- The `external_source` field should be indexed for efficient filtering by integration type
- The combination of `(external_source, external_id)` must be unique across the system
- When updating an existing object via webhook, match by `(external_source, external_id)`
- Store `external_url` even if not immediately displayed to users (useful for future features)
- The `external_parent_id` helps maintain hierarchical relationships during partial imports

### 3.4. API Endpoints

The following ClickUp API v2 endpoints will be used for the full import process:

*   **Get Teams (Workspaces):** `GET /api/v2/team`
*   **Get Spaces:** `GET /api/v2/team/{team_id}/space`
*   **Get Folders:** `GET /api/v2/space/{space_id}/folder`
*   **Get Lists:** `GET /api/v2/folder/{folder_id}/list`
*   **Get Tasks:** `GET /api/v2/list/{list_id}/task`

### 3.5. Full Import Process

The full import process will be initiated via the admin UI or an API endpoint. It will require a ClickUp API key with the necessary permissions.

#### 3.5.1. User Flow

1.  **Sync Button:** The user clicks a "Sync" button in the ClickUp integration configuration panel.
2.  **List Selection Modal:** A modal opens displaying a hierarchical tree of the ClickUp workspace structure:
    *   Workspace (root)
        *   Spaces (expandable)
            *   Folders (expandable)
                *   Lists (selectable with checkboxes)
3.  **Tree Interactions:**
    *   Users can expand/collapse spaces and folders to navigate the hierarchy
    *   Each list has a checkbox to select/deselect it for import
    *   Parent nodes (spaces/folders) have tri-state checkboxes:
        *   Checked: All child lists selected
        *   Unchecked: No child lists selected
        *   Indeterminate: Some child lists selected
    *   "Select All" and "Deselect All" buttons at the top
4.  **Import Configuration:** Below the tree, additional options are provided:
    *   "Include completed tasks" checkbox
    *   "Batch size" number input (default: 100, range: 10-1000)
    *   "Run in background" toggle
5.  **Confirmation:** User clicks "Start Import" button to begin the sync with selected lists
6.  **Progress Tracking:** Modal shows progress with:
    *   Overall progress bar
    *   Current item being processed
    *   Items imported count
    *   Estimated time remaining (if available)

#### 3.5.2. Backend API

**Fetch Workspace Structure:**
```
GET /api/v1/integrations/clickup/structure
Response: {
  workspace: {
    id: string;
    name: string;
    spaces: Array<{
      id: string;
      name: string;
      folders: Array<{
        id: string;
        name: string;
        lists: Array<{
          id: string;
          name: string;
          task_count: number;
        }>;
      }>;
      lists: Array<{
        id: string;
        name: string;
        task_count: number;
      }>;
    }>;
  };
}
```

**Trigger Selective Import:**
```
POST /api/v1/integrations/clickup/sync
Body: {
  list_ids: string[];
  include_completed: boolean;
  batch_size: number;
  background: boolean;
}
Response: {
  job_id?: string;
  success: boolean;
  message: string;
  total_lists: number;
  estimated_tasks: number;
}
```

#### 3.5.3. Import Process

The actual import process will execute as follows:

1.  Fetch all workspaces (cached from structure endpoint).
2.  For each selected list, fetch all tasks with pagination.
3.  For each task, fetch all subtasks, comments, and assignees.
4.  For each object, create a corresponding node in our graph database.
5.  Create relationships between the nodes as defined in the data model mapping.
6.  Track progress and update job status if running in background.

To avoid overwhelming the ClickUp API, the import process will be rate-limited.

### 3.6. Webhook Updates

ClickUp webhooks will be used to keep our data synchronized in real-time. A new webhook endpoint will be created to handle incoming webhook events.

The endpoint will be `/webhooks/clickup`.

The following ClickUp events will be handled:

*   `taskCreated`
*   `taskUpdated`
*   `taskDeleted`
*   `listCreated`
*   `listUpdated`
*   `listDeleted`
*   `folderCreated`
*   `folderUpdated`
*   `folderDeleted`
*   `spaceCreated`
*   `spaceUpdated`
*   `spaceDeleted`

When a webhook is received, the payload will be parsed, and the corresponding object in our graph will be created, updated, or deleted.

## 4. Future Extensibility

The `importer` module is designed to be easily extensible. To add a new importer (e.g., for Jira), a new class that implements the `Importer` interface will be created. This new class will handle the specific logic for that source, such as API communication and data mapping.
