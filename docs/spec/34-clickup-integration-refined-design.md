# 34. ClickUp Integration - Refined Design (Project-Level Sync with Custom Schema Mapping)

**Date:** October 3, 2025  
**Status:** Design Document  
**Author:** AI Assistant  
**Based on:** docs/spec/22-clickup-integration.md, docs/spec/23-integration-gallery.md

---

## 1. Executive Summary

This document refines the ClickUp integration design to support a **project-level synchronization model** where ClickUp Spaces map directly to our Projects, and all imported data is flattened into a **custom schema structure** (e.g., TOGAF, custom taxonomy) rather than mirroring ClickUp's organizational hierarchy.

### Key Design Decisions

1. **Mapping:** `ClickUp Space` → `Our Project` (1:1)
2. **Flat Import:** All tasks, lists, folders imported as graph objects with custom types
3. **Source Tracking:** Every imported object stores ClickUp metadata in `properties.source`
4. **Schema Flexibility:** Data can be mapped to any custom taxonomy (TOGAF, custom types)
5. **Bidirectional Linking:** Objects maintain links to ClickUp entities via `properties.source.external_id`

---

## 2. Architecture Overview

### 2.1. Simplified Data Flow

```
ClickUp Space (via API)
    ↓
Integration Service
    ↓ (Map to custom types)
Graph Service → kb.graph_objects
    ↓
Properties contain source metadata:
{
  "name": "Implement Login Feature",
  "description": "...",
  "status": "in_progress",
  "source": {
    "provider": "clickup",
    "external_id": "task_abc123",
    "external_type": "task",
    "space_id": "space_xyz",
    "list_id": "list_789",
    "clickup_url": "https://app.clickup.com/t/abc123",
    "last_synced_at": "2025-10-03T10:30:00Z",
    "original_data": { /* snapshot */ }
  }
}
```

### 2.2. Source Metadata Standard

Every imported object will include a `source` property with this structure:

```typescript
interface SourceMetadata {
  provider: string;           // 'clickup', 'jira', 'github', etc.
  external_id: string;        // Provider's ID (immutable)
  external_type: string;      // 'task', 'issue', 'space', etc.
  external_url?: string;      // Link back to source
  parent_id?: string;         // Parent entity in source system
  last_synced_at: string;     // ISO 8601 timestamp
  sync_version?: string;      // For conflict detection
  original_data?: any;        // Snapshot of raw API response
  custom_fields?: Record<string, any>; // Provider-specific fields
}
```

### 2.3. Integration Configuration

Each project can have one ClickUp integration:

```typescript
interface ClickUpIntegrationConfig {
  enabled: boolean;
  space_id: string;           // Which ClickUp Space to sync
  api_token: string;          // Encrypted
  
  // Type Mapping: ClickUp type → Our custom type
  type_mappings: {
    task: 'Requirement' | 'Feature' | 'Task',
    list: 'Collection' | 'Epic',
    folder: 'WorkPackage' | 'Collection'
  };
  
  // Field Mapping: ClickUp field → Our property path
  field_mappings: {
    'status.status': 'status',
    'priority.priority': 'priority',
    'due_date': 'due_date',
    'custom_field_abc': 'togaf.adm_phase'
  };
  
  // Sync Options
  sync_comments: boolean;
  sync_attachments: boolean;
  sync_subtasks: boolean;
  sync_time_tracking: boolean;
  
  // Labels to apply to all imported objects
  default_labels: string[];   // e.g., ['source:clickup', 'imported']
  
  // Sync schedule
  auto_sync: boolean;
  sync_interval_minutes?: number;
}
```

---

## 3. Database Schema

### 3.1. Integrations Table

```sql
CREATE TABLE kb.integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES kb.projects(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,             -- 'clickup', 'jira', etc.
  enabled BOOLEAN DEFAULT false,
  config JSONB NOT NULL,              -- Provider-specific config
  credentials JSONB NOT NULL,         -- Encrypted API tokens
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  last_sync_at TIMESTAMPTZ,
  last_sync_status TEXT,              -- 'success', 'error', 'in_progress'
  last_sync_error TEXT,
  
  UNIQUE(project_id, provider)
);

CREATE INDEX idx_integrations_project ON kb.integrations(project_id);
CREATE INDEX idx_integrations_enabled ON kb.integrations(enabled) WHERE enabled = true;
```

### 3.2. Sync State Tracking

```sql
CREATE TABLE kb.integration_sync_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_id UUID NOT NULL REFERENCES kb.integrations(id) ON DELETE CASCADE,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  status TEXT NOT NULL,               -- 'running', 'success', 'error', 'cancelled'
  entities_imported INT DEFAULT 0,
  entities_updated INT DEFAULT 0,
  entities_skipped INT DEFAULT 0,
  entities_deleted INT DEFAULT 0,
  error_message TEXT,
  error_details JSONB,
  
  -- Pagination cursor for resuming
  sync_cursor JSONB
);

CREATE INDEX idx_sync_log_integration ON kb.integration_sync_log(integration_id, started_at DESC);
```

### 3.3. External ID Mapping (Fast Lookup)

```sql
CREATE TABLE kb.integration_entity_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_id UUID NOT NULL REFERENCES kb.integrations(id) ON DELETE CASCADE,
  external_id TEXT NOT NULL,          -- ClickUp task ID, etc.
  external_type TEXT NOT NULL,        -- 'task', 'list', etc.
  object_id UUID NOT NULL REFERENCES kb.graph_objects(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  
  UNIQUE(integration_id, external_id)
);

CREATE INDEX idx_mapping_object ON kb.integration_entity_mappings(object_id);
CREATE INDEX idx_mapping_external ON kb.integration_entity_mappings(integration_id, external_type, external_id);
```

### 3.4. Source Metadata in Objects

**No new columns needed!** All source tracking is in the existing `properties` JSONB field:

```sql
-- Example query to find all ClickUp-sourced objects
SELECT id, type, properties->>'name' as name
FROM kb.graph_objects
WHERE project_id = $1
  AND properties->'source'->>'provider' = 'clickup';

-- Find specific ClickUp task
SELECT id, type, properties
FROM kb.graph_objects
WHERE project_id = $1
  AND properties->'source'->>'external_id' = 'task_abc123';

-- Find all objects from a specific ClickUp list
SELECT id, type, properties->>'name' as name
FROM kb.graph_objects
WHERE project_id = $1
  AND properties->'source'->>'list_id' = 'list_789';
```

---

## 4. ClickUp API Integration

### 4.1. Simplified Import Process

Since we're only syncing at the **Space level** (1:1 with Project), the import is much simpler:

```
1. GET /api/v2/space/{space_id}/list
   └─> Get all lists in the space
   
2. For each list:
   GET /api/v2/list/{list_id}/task
   └─> Get all tasks
   
3. For each task (optional):
   GET /api/v2/task/{task_id}
   └─> Get full task details (comments, subtasks, time tracking)
```

### 4.2. Rate Limiting

- ClickUp API: **100 requests/minute** per token
- Implementation: Token bucket algorithm (reuse from extraction worker)
- Strategy: Batch requests, cache results, use `include_subtasks` parameter

### 4.3. API Client Example

```typescript
export class ClickUpClient {
  constructor(
    private apiToken: string,
    private rateLimiter: RateLimiterService
  ) {}

  /**
   * Get all tasks in a space (flattened across all lists)
   */
  async getAllTasksInSpace(spaceId: string): Promise<ClickUpTask[]> {
    const allTasks: ClickUpTask[] = [];
    
    // 1. Get all lists
    await this.rateLimiter.waitForCapacity(1, 5000);
    const lists = await this.request(`/api/v2/space/${spaceId}/list`);
    
    // 2. Get tasks from each list
    for (const list of lists.lists) {
      await this.rateLimiter.waitForCapacity(1, 5000);
      const response = await this.request(
        `/api/v2/list/${list.id}/task?include_closed=true`
      );
      allTasks.push(...response.tasks);
    }
    
    return allTasks;
  }

  /**
   * Get task with all details (comments, subtasks, etc.)
   */
  async getTaskDetails(taskId: string): Promise<ClickUpTask> {
    await this.rateLimiter.waitForCapacity(1, 5000);
    return this.request(`/api/v2/task/${taskId}`);
  }

  private async request(endpoint: string): Promise<any> {
    const response = await fetch(`https://api.clickup.com${endpoint}`, {
      headers: {
        'Authorization': this.apiToken,
        'Content-Type': 'application/json'
      }
    });
    
    if (!response.ok) {
      throw new Error(`ClickUp API error: ${response.statusText}`);
    }
    
    return response.json();
  }
}
```

---

## 5. Type Mapping Strategy

### 5.1. Configurable Mapping

Administrators configure how ClickUp entities map to their custom schema:

**Example: TOGAF Mapping**
```typescript
{
  type_mappings: {
    // ClickUp tasks with priority "high" → Requirements
    task: (clickupTask) => {
      if (clickupTask.priority?.priority === 4) return 'Requirement';
      if (clickupTask.custom_fields.togaf_type === 'capability') return 'Capability';
      return 'Task';
    },
    
    // ClickUp lists → Collections or Epics
    list: (clickupList) => {
      if (clickupList.name.startsWith('[EPIC]')) return 'Epic';
      return 'Collection';
    },
    
    // ClickUp folders → Work Packages
    folder: 'WorkPackage'
  }
}
```

**Example: Custom Mapping**
```typescript
{
  type_mappings: {
    task: 'Feature',          // All tasks become Features
    list: 'Collection',       // All lists become Collections
    folder: 'Collection'      // All folders become Collections
  }
}
```

### 5.2. Property Mapping

Map ClickUp fields to custom property paths:

```typescript
{
  field_mappings: {
    // Simple mappings
    'name': 'name',
    'description': 'description',
    'status.status': 'status',
    'priority.priority': 'priority',
    'due_date': 'due_date',
    'date_created': 'created_at',
    'date_updated': 'updated_at',
    
    // ClickUp custom fields → TOGAF fields
    'custom_field_abc123': 'togaf.adm_phase',
    'custom_field_def456': 'togaf.architecture_domain',
    
    // Assignees → owners
    'assignees[].username': 'owners',
    
    // Tags → labels
    'tags[].name': 'labels'
  }
}
```

---

## 6. Import Implementation

### 6.1. Core Import Service

```typescript
@Injectable()
export class ClickUpImportService {
  constructor(
    private readonly client: ClickUpClient,
    private readonly graphService: GraphService,
    private readonly mappingService: IntegrationMappingService,
    private readonly logger: Logger
  ) {}

  /**
   * Run full import for a ClickUp space
   */
  async runFullImport(
    integration: Integration,
    config: ClickUpIntegrationConfig
  ): Promise<SyncResult> {
    const result: SyncResult = {
      entitiesImported: 0,
      entitiesUpdated: 0,
      entitiesSkipped: 0,
      errors: []
    };

    try {
      // 1. Get all tasks from the space
      const tasks = await this.client.getAllTasksInSpace(config.space_id);
      
      this.logger.log(`Found ${tasks.length} tasks in ClickUp space ${config.space_id}`);

      // 2. Process each task
      for (const task of tasks) {
        try {
          await this.importTask(integration, config, task, result);
        } catch (error) {
          this.logger.error(`Failed to import task ${task.id}:`, error);
          result.errors.push({
            entity: `task:${task.id}`,
            error: error.message
          });
        }
      }

      // 3. Optionally sync lists as collections
      if (config.import_lists) {
        await this.importLists(integration, config, result);
      }

      // 4. Sync relationships (subtasks, dependencies)
      if (config.sync_subtasks) {
        await this.syncRelationships(integration, config, tasks, result);
      }

    } catch (error) {
      this.logger.error('Full import failed:', error);
      throw error;
    }

    return result;
  }

  /**
   * Import a single ClickUp task
   */
  private async importTask(
    integration: Integration,
    config: ClickUpIntegrationConfig,
    task: ClickUpTask,
    result: SyncResult
  ): Promise<void> {
    // 1. Check if already imported
    const existing = await this.mappingService.findByExternalId(
      integration.id,
      task.id
    );

    // 2. Determine target type based on mapping
    const targetType = this.resolveType(config, 'task', task);

    // 3. Map ClickUp task to graph object properties
    const properties = this.mapTaskProperties(config, task);

    // 4. Add source metadata
    properties.source = {
      provider: 'clickup',
      external_id: task.id,
      external_type: 'task',
      external_url: task.url,
      space_id: config.space_id,
      list_id: task.list.id,
      folder_id: task.folder?.id,
      last_synced_at: new Date().toISOString(),
      original_data: task // Store full snapshot
    };

    // 5. Extract labels
    const labels = [
      ...config.default_labels,
      `source:clickup`,
      `clickup:status:${task.status.status}`,
      ...task.tags.map(t => `tag:${t.name}`)
    ];

    if (task.priority) {
      labels.push(`priority:${task.priority.priority}`);
    }

    // 6. Create or update object
    if (existing) {
      // Update existing
      await this.graphService.updateObject(
        integration.project_id,
        existing.object_id,
        { properties, labels }
      );
      result.entitiesUpdated++;
      
      // Update mapping timestamp
      await this.mappingService.updateTimestamp(existing.id);
    } else {
      // Create new
      const object = await this.graphService.createObject(
        integration.project_id,
        {
          type: targetType,
          properties,
          labels
        }
      );
      result.entitiesImported++;
      
      // Store mapping
      await this.mappingService.create({
        integration_id: integration.id,
        external_id: task.id,
        external_type: 'task',
        object_id: object.id
      });
    }
  }

  /**
   * Map ClickUp task properties to graph object properties
   */
  private mapTaskProperties(
    config: ClickUpIntegrationConfig,
    task: ClickUpTask
  ): Record<string, any> {
    const properties: Record<string, any> = {};

    // Apply field mappings
    for (const [sourcePath, targetPath] of Object.entries(config.field_mappings)) {
      const value = this.extractValue(task, sourcePath);
      if (value !== undefined) {
        this.setValue(properties, targetPath, value);
      }
    }

    // Handle custom fields
    if (task.custom_fields) {
      for (const field of task.custom_fields) {
        const mapping = config.field_mappings[`custom_field_${field.id}`];
        if (mapping && field.value !== null) {
          this.setValue(properties, mapping, field.value);
        }
      }
    }

    return properties;
  }

  /**
   * Sync relationships (subtasks, dependencies, etc.)
   */
  private async syncRelationships(
    integration: Integration,
    config: ClickUpIntegrationConfig,
    tasks: ClickUpTask[],
    result: SyncResult
  ): Promise<void> {
    for (const task of tasks) {
      // Subtask relationships
      if (task.parent) {
        const parentMapping = await this.mappingService.findByExternalId(
          integration.id,
          task.parent
        );
        const childMapping = await this.mappingService.findByExternalId(
          integration.id,
          task.id
        );

        if (parentMapping && childMapping) {
          await this.graphService.createRelationship(
            integration.project_id,
            {
              type: 'PARENT_OF',
              src_id: parentMapping.object_id,
              dst_id: childMapping.object_id,
              properties: {
                source: {
                  provider: 'clickup',
                  relationship_type: 'subtask'
                }
              }
            }
          );
        }
      }

      // Task dependencies
      if (task.dependencies?.length > 0) {
        for (const dep of task.dependencies) {
          const srcMapping = await this.mappingService.findByExternalId(
            integration.id,
            task.id
          );
          const dstMapping = await this.mappingService.findByExternalId(
            integration.id,
            dep.task_id
          );

          if (srcMapping && dstMapping) {
            await this.graphService.createRelationship(
              integration.project_id,
              {
                type: dep.type === 'blocking' ? 'BLOCKS' : 'DEPENDS_ON',
                src_id: srcMapping.object_id,
                dst_id: dstMapping.object_id,
                properties: {
                  source: {
                    provider: 'clickup',
                    relationship_type: 'dependency',
                    dependency_type: dep.type
                  }
                }
              }
            );
          }
        }
      }
    }
  }

  /**
   * Resolve target object type based on mapping configuration
   */
  private resolveType(
    config: ClickUpIntegrationConfig,
    entityType: string,
    entity: any
  ): string {
    const mapping = config.type_mappings[entityType];
    
    if (typeof mapping === 'function') {
      return mapping(entity);
    }
    
    return mapping || 'Task';
  }

  // Helper methods for path navigation
  private extractValue(obj: any, path: string): any {
    // Implementation for nested property access
  }

  private setValue(obj: any, path: string, value: any): void {
    // Implementation for nested property setting
  }
}
```

---

## 7. Webhook Support (Real-time Sync)

### 7.1. Webhook Endpoint

```typescript
@Controller('webhooks')
export class WebhookController {
  constructor(
    private readonly integrationsService: IntegrationsService,
    private readonly clickupImportService: ClickUpImportService
  ) {}

  @Post('clickup')
  async handleClickUpWebhook(
    @Body() payload: ClickUpWebhookPayload,
    @Headers('x-signature') signature: string
  ) {
    // 1. Verify signature
    if (!this.verifySignature(payload, signature)) {
      throw new UnauthorizedException('Invalid webhook signature');
    }

    // 2. Find integration by space_id
    const integration = await this.integrationsService.findBySpaceId(
      payload.team_id,
      payload.space_id
    );

    if (!integration || !integration.enabled) {
      return { success: true, message: 'Integration not found or disabled' };
    }

    // 3. Handle event
    await this.handleEvent(integration, payload);

    return { success: true };
  }

  private async handleEvent(
    integration: Integration,
    payload: ClickUpWebhookPayload
  ): Promise<void> {
    switch (payload.event) {
      case 'taskCreated':
      case 'taskUpdated':
        await this.clickupImportService.importTask(
          integration,
          integration.config,
          payload.task_id,
          { /* result tracking */ }
        );
        break;

      case 'taskDeleted':
        await this.handleTaskDeleted(integration, payload.task_id);
        break;

      case 'taskStatusUpdated':
        await this.handleStatusUpdate(integration, payload);
        break;

      // Handle other events...
    }
  }

  private async handleTaskDeleted(
    integration: Integration,
    taskId: string
  ): Promise<void> {
    const mapping = await this.mappingService.findByExternalId(
      integration.id,
      taskId
    );

    if (mapping) {
      // Soft delete the object
      await this.graphService.deleteObject(
        integration.project_id,
        mapping.object_id
      );
      
      // Remove mapping
      await this.mappingService.delete(mapping.id);
    }
  }

  private verifySignature(payload: any, signature: string): boolean {
    // Implement ClickUp signature verification
    // https://docs.clickup.com/en/articles/1367129-webhooks
    return true; // Placeholder
  }
}
```

---

## 8. Query Patterns

### 8.1. Find All Imported Objects

```typescript
// Get all ClickUp-sourced objects
const clickupObjects = await db.query(`
  SELECT 
    id, 
    type, 
    properties->>'name' as name,
    properties->'source'->>'external_id' as clickup_id,
    properties->'source'->>'external_url' as clickup_url
  FROM kb.graph_objects
  WHERE project_id = $1
    AND properties->'source'->>'provider' = 'clickup'
    AND deleted_at IS NULL
`, [projectId]);
```

### 8.2. Find Object by ClickUp ID

```typescript
// Find graph object by ClickUp task ID
const object = await db.query(`
  SELECT id, type, properties
  FROM kb.graph_objects
  WHERE project_id = $1
    AND properties->'source'->>'external_id' = $2
    AND deleted_at IS NULL
`, [projectId, clickupTaskId]);
```

### 8.3. Find Objects from Specific List

```typescript
// Get all tasks from a specific ClickUp list
const listTasks = await db.query(`
  SELECT id, type, properties->>'name' as name
  FROM kb.graph_objects
  WHERE project_id = $1
    AND properties->'source'->>'list_id' = $2
    AND deleted_at IS NULL
  ORDER BY properties->'source'->>'date_created' DESC
`, [projectId, clickupListId]);
```

### 8.4. Find Recently Synced Objects

```typescript
// Get objects synced in the last hour
const recentlySynced = await db.query(`
  SELECT id, type, properties->>'name' as name
  FROM kb.graph_objects
  WHERE project_id = $1
    AND properties->'source'->>'provider' = 'clickup'
    AND (properties->'source'->>'last_synced_at')::timestamptz > now() - interval '1 hour'
    AND deleted_at IS NULL
`, [projectId]);
```

---

## 9. Admin UI

### 9.1. Integration Configuration Page

```tsx
// apps/admin/src/pages/admin/integrations/clickup/configure.tsx

export default function ConfigureClickUpIntegration() {
  const [config, setConfig] = useState<ClickUpIntegrationConfig>({
    enabled: false,
    space_id: '',
    api_token: '',
    type_mappings: {
      task: 'Task',
      list: 'Collection',
      folder: 'Collection'
    },
    field_mappings: {
      'name': 'name',
      'description': 'description',
      'status.status': 'status',
      'priority.priority': 'priority'
    },
    default_labels: ['source:clickup'],
    sync_comments: true,
    sync_subtasks: true,
    auto_sync: false
  });

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">Configure ClickUp Integration</h1>
      
      {/* Enable/Disable Toggle */}
      <div className="form-control mb-4">
        <label className="label cursor-pointer">
          <span className="label-text">Enable Integration</span>
          <input
            type="checkbox"
            className="toggle toggle-primary"
            checked={config.enabled}
            onChange={(e) => setConfig({ ...config, enabled: e.target.checked })}
          />
        </label>
      </div>

      {/* Space ID Input */}
      <div className="form-control mb-4">
        <label className="label">
          <span className="label-text">ClickUp Space ID</span>
        </label>
        <input
          type="text"
          className="input input-bordered"
          placeholder="Enter ClickUp Space ID"
          value={config.space_id}
          onChange={(e) => setConfig({ ...config, space_id: e.target.value })}
        />
        <label className="label">
          <span className="label-text-alt">Find this in your ClickUp Space settings</span>
        </label>
      </div>

      {/* API Token Input */}
      <div className="form-control mb-4">
        <label className="label">
          <span className="label-text">API Token</span>
        </label>
        <input
          type="password"
          className="input input-bordered"
          placeholder="Enter ClickUp API Token"
          value={config.api_token}
          onChange={(e) => setConfig({ ...config, api_token: e.target.value })}
        />
        <label className="label">
          <span className="label-text-alt">
            <a href="https://app.clickup.com/settings/apps" target="_blank" className="link">
              Generate API token
            </a>
          </span>
        </label>
      </div>

      {/* Type Mappings */}
      <div className="mb-4">
        <h2 className="text-lg font-semibold mb-2">Type Mappings</h2>
        <p className="text-sm text-base-content/70 mb-3">
          Map ClickUp entities to your custom schema
        </p>
        
        <div className="space-y-2">
          <div className="flex gap-2">
            <span className="w-24 text-sm pt-2">Tasks →</span>
            <select
              className="select select-bordered flex-1"
              value={config.type_mappings.task}
              onChange={(e) => setConfig({
                ...config,
                type_mappings: { ...config.type_mappings, task: e.target.value }
              })}
            >
              <option>Task</option>
              <option>Feature</option>
              <option>Requirement</option>
              <option>WorkPackage</option>
            </select>
          </div>
          
          <div className="flex gap-2">
            <span className="w-24 text-sm pt-2">Lists →</span>
            <select
              className="select select-bordered flex-1"
              value={config.type_mappings.list}
              onChange={(e) => setConfig({
                ...config,
                type_mappings: { ...config.type_mappings, list: e.target.value }
              })}
            >
              <option>Collection</option>
              <option>Epic</option>
              <option>Capability</option>
            </select>
          </div>
        </div>
      </div>

      {/* Sync Options */}
      <div className="mb-4">
        <h2 className="text-lg font-semibold mb-2">Sync Options</h2>
        <div className="form-control">
          <label className="label cursor-pointer">
            <span className="label-text">Sync comments</span>
            <input
              type="checkbox"
              className="checkbox"
              checked={config.sync_comments}
              onChange={(e) => setConfig({ ...config, sync_comments: e.target.checked })}
            />
          </label>
          <label className="label cursor-pointer">
            <span className="label-text">Sync subtasks</span>
            <input
              type="checkbox"
              className="checkbox"
              checked={config.sync_subtasks}
              onChange={(e) => setConfig({ ...config, sync_subtasks: e.target.checked })}
            />
          </label>
          <label className="label cursor-pointer">
            <span className="label-text">Enable automatic sync</span>
            <input
              type="checkbox"
              className="checkbox"
              checked={config.auto_sync}
              onChange={(e) => setConfig({ ...config, auto_sync: e.target.checked })}
            />
          </label>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex gap-2">
        <button className="btn btn-primary" onClick={handleSave}>
          Save Configuration
        </button>
        <button className="btn btn-secondary" onClick={handleTestConnection}>
          Test Connection
        </button>
        <button className="btn" onClick={handleRunFullSync}>
          Run Full Sync Now
        </button>
      </div>
    </div>
  );
}
```

### 9.2. Sync Status Dashboard

```tsx
// Show sync history and status
export function SyncStatusDashboard({ integrationId }: Props) {
  const { data: syncLogs } = useSyncLogs(integrationId);
  const { data: stats } = useSyncStats(integrationId);

  return (
    <div className="space-y-4">
      {/* Stats Cards */}
      <div className="stats shadow">
        <div className="stat">
          <div className="stat-title">Imported</div>
          <div className="stat-value">{stats.total_imported}</div>
        </div>
        <div className="stat">
          <div className="stat-title">Last Sync</div>
          <div className="stat-value text-sm">{formatRelative(stats.last_sync_at)}</div>
        </div>
        <div className="stat">
          <div className="stat-title">Status</div>
          <div className="stat-value">
            <span className={`badge ${stats.status === 'success' ? 'badge-success' : 'badge-error'}`}>
              {stats.status}
            </span>
          </div>
        </div>
      </div>

      {/* Sync History */}
      <div className="card bg-base-100 shadow">
        <div className="card-body">
          <h2 className="card-title">Sync History</h2>
          <table className="table">
            <thead>
              <tr>
                <th>Started</th>
                <th>Duration</th>
                <th>Imported</th>
                <th>Updated</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {syncLogs.map(log => (
                <tr key={log.id}>
                  <td>{format(log.started_at, 'PPp')}</td>
                  <td>{formatDuration(log.started_at, log.completed_at)}</td>
                  <td>{log.entities_imported}</td>
                  <td>{log.entities_updated}</td>
                  <td>
                    <span className={`badge ${log.status === 'success' ? 'badge-success' : 'badge-error'}`}>
                      {log.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
```

---

## 10. Implementation Phases

### Phase 1: Core Infrastructure (8-10 hours)
- ✅ Database schema (integrations, mappings, sync_log)
- ✅ IntegrationsModule with CRUD
- ✅ Integration entity mappings service
- ✅ Credential encryption
- ✅ Unit tests

### Phase 2: ClickUp Plugin (10-12 hours)
- ✅ ClickUp API client with rate limiting
- ✅ Type mapping engine
- ✅ Field mapping engine
- ✅ Import service (full sync)
- ✅ Relationship sync (subtasks, dependencies)
- ✅ Unit tests

### Phase 3: Webhooks (6-8 hours)
- ✅ Webhook endpoint
- ✅ Signature verification
- ✅ Incremental update handlers
- ✅ Conflict resolution
- ✅ Tests

### Phase 4: Admin UI (8-10 hours)
- ✅ Configuration page
- ✅ Sync dashboard
- ✅ Manual sync trigger
- ✅ Connection testing

**Total Estimated Effort:** 32-40 hours

---

## 11. Benefits of This Approach

### 11.1. Flexibility
- ✅ **No structure mirroring** - map to any custom schema (TOGAF, custom types)
- ✅ **Simple 1:1 mapping** - ClickUp Space → Project
- ✅ **Type freedom** - decide how to categorize imported entities

### 11.2. Traceability
- ✅ **Full source tracking** - every object knows its origin
- ✅ **Bidirectional links** - navigate from graph to ClickUp
- ✅ **Audit trail** - know when and how data was synced

### 11.3. Query Power
- ✅ **Filter by source** - `WHERE properties->'source'->>'provider' = 'clickup'`
- ✅ **Find by external ID** - instant lookup of ClickUp entities
- ✅ **Cross-source queries** - combine ClickUp + Jira + GitHub data

### 11.4. Future-Proof
- ✅ **Extensible pattern** - same approach for Jira, Linear, GitHub, etc.
- ✅ **No schema changes** - everything in `properties.source`
- ✅ **Migration friendly** - source metadata travels with objects

---

## 12. Example Queries

### 12.1. Find All TOGAF Capabilities from ClickUp

```sql
SELECT 
  id,
  properties->>'name' as capability_name,
  properties->'togaf'->>'adm_phase' as adm_phase,
  properties->'source'->>'external_url' as clickup_link
FROM kb.graph_objects
WHERE project_id = $1
  AND type = 'Capability'
  AND properties->'source'->>'provider' = 'clickup'
  AND deleted_at IS NULL;
```

### 12.2. Find ClickUp Tasks Not Yet Mapped to Requirements

```sql
SELECT 
  id,
  properties->>'name' as name,
  properties->'source'->>'external_url' as clickup_url
FROM kb.graph_objects
WHERE project_id = $1
  AND type = 'Task'
  AND properties->'source'->>'provider' = 'clickup'
  AND NOT EXISTS (
    SELECT 1 FROM kb.graph_relationships r
    WHERE r.src_id = graph_objects.id
      AND r.type = 'satisfies'
      AND r.deleted_at IS NULL
  )
  AND deleted_at IS NULL;
```

### 12.3. Get Sync Freshness Report

```sql
SELECT 
  type,
  COUNT(*) as count,
  MAX((properties->'source'->>'last_synced_at')::timestamptz) as last_sync,
  MIN((properties->'source'->>'last_synced_at')::timestamptz) as oldest_sync
FROM kb.graph_objects
WHERE project_id = $1
  AND properties->'source'->>'provider' = 'clickup'
  AND deleted_at IS NULL
GROUP BY type;
```

---

## 13. Integration Management Features

### 13.1. Import Activity Log

Each integration maintains a detailed, **browsable log** of all import activities visible to admins.

#### Schema Addition

```sql
-- Detailed import activity log (more granular than sync_log)
CREATE TABLE kb.integration_activity_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_id UUID NOT NULL REFERENCES kb.integrations(id) ON DELETE CASCADE,
  sync_log_id UUID REFERENCES kb.integration_sync_log(id) ON DELETE CASCADE,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  -- Activity classification
  activity_type TEXT NOT NULL,        -- 'import', 'update', 'delete', 'skip', 'error', 'manual_action'
  severity TEXT NOT NULL DEFAULT 'info', -- 'info', 'warning', 'error', 'success'
  
  -- Entity details
  entity_type TEXT,                   -- 'task', 'comment', 'relationship', etc.
  entity_external_id TEXT,
  object_id UUID REFERENCES kb.graph_objects(id) ON DELETE SET NULL,
  
  -- Activity description
  message TEXT NOT NULL,              -- Human-readable message
  details JSONB,                      -- Structured data (before/after, error stack, etc.)
  
  -- User action tracking
  triggered_by TEXT,                  -- 'system', 'webhook', 'manual', user_id
  
  -- Notification flag
  requires_review BOOLEAN DEFAULT false,
  reviewed_at TIMESTAMPTZ,
  reviewed_by UUID REFERENCES kb.users(id)
);

CREATE INDEX idx_activity_log_integration ON kb.integration_activity_log(integration_id, timestamp DESC);
CREATE INDEX idx_activity_log_review ON kb.integration_activity_log(requires_review) WHERE requires_review = true;
CREATE INDEX idx_activity_log_sync ON kb.integration_activity_log(sync_log_id);
CREATE INDEX idx_activity_log_severity ON kb.integration_activity_log(integration_id, severity);
```

#### Example Log Entries

```typescript
// Successful import
{
  activity_type: 'import',
  severity: 'success',
  entity_type: 'task',
  entity_external_id: 'task_abc123',
  object_id: 'obj_uuid',
  message: 'Imported ClickUp task "Implement Login Feature" as Requirement',
  details: {
    clickup_url: 'https://app.clickup.com/t/abc123',
    mapped_type: 'Requirement',
    properties_count: 15,
    relationships_created: 2
  },
  triggered_by: 'system'
}

// Low confidence import requiring review
{
  activity_type: 'import',
  severity: 'warning',
  entity_type: 'task',
  entity_external_id: 'task_xyz789',
  object_id: 'obj_uuid_2',
  message: 'Imported task with ambiguous type mapping',
  details: {
    reason: 'Multiple matching types found',
    candidates: ['Requirement', 'Feature', 'Task'],
    chosen: 'Task',
    confidence: 0.6
  },
  requires_review: true,
  triggered_by: 'system'
}

// Update conflict
{
  activity_type: 'update',
  severity: 'warning',
  entity_type: 'task',
  entity_external_id: 'task_def456',
  object_id: 'obj_uuid_3',
  message: 'Detected conflict: local changes vs ClickUp update',
  details: {
    changed_fields: ['status', 'assignee'],
    local_value: { status: 'in_progress' },
    remote_value: { status: 'done' },
    resolution: 'kept_remote'
  },
  requires_review: true,
  triggered_by: 'webhook'
}

// Skipped duplicate
{
  activity_type: 'skip',
  severity: 'info',
  entity_type: 'task',
  entity_external_id: 'task_ghi111',
  message: 'Skipped: Task already imported and up-to-date',
  details: {
    last_synced: '2025-10-03T09:00:00Z',
    no_changes: true
  },
  triggered_by: 'system'
}

// Import error
{
  activity_type: 'error',
  severity: 'error',
  entity_type: 'task',
  entity_external_id: 'task_jkl222',
  message: 'Failed to import task: Invalid custom field mapping',
  details: {
    error: 'CustomFieldNotFound',
    field_id: 'custom_abc',
    stack_trace: '...'
  },
  requires_review: false,
  triggered_by: 'system'
}
```

### 13.2. Bulk Delete by Source

Allow admins to **delete all objects** imported from a specific integration.

#### API Endpoint

```typescript
@Delete('/integrations/:id/imported-objects')
@UseGuards(AuthGuard, AdminGuard)
async deleteAllImportedObjects(
  @Param('id') integrationId: string,
  @Body() options: {
    dry_run?: boolean;           // Preview what would be deleted
    delete_relationships?: boolean; // Also delete relationships
    cascade_delete?: boolean;    // Delete dependent objects
  }
) {
  const result = await this.integrationsService.deleteImportedObjects(
    integrationId,
    options
  );
  
  return {
    success: true,
    dry_run: options.dry_run || false,
    objects_deleted: result.objects_deleted,
    relationships_deleted: result.relationships_deleted,
    affected_types: result.affected_types,
    deleted_ids: options.dry_run ? result.preview_ids : undefined
  };
}
```

#### Implementation

```typescript
async deleteImportedObjects(
  integrationId: string,
  options: BulkDeleteOptions
): Promise<BulkDeleteResult> {
  const integration = await this.findOne(integrationId);
  
  // 1. Find all objects imported by this integration
  const mappings = await this.db.query(`
    SELECT object_id 
    FROM kb.integration_entity_mappings
    WHERE integration_id = $1
  `, [integrationId]);
  
  const objectIds = mappings.rows.map(r => r.object_id);
  
  if (options.dry_run) {
    // Preview mode: return what would be deleted
    const preview = await this.db.query(`
      SELECT id, type, properties->>'name' as name
      FROM kb.graph_objects
      WHERE id = ANY($1::uuid[])
    `, [objectIds]);
    
    return {
      objects_deleted: objectIds.length,
      preview_ids: objectIds,
      affected_types: [...new Set(preview.rows.map(r => r.type))]
    };
  }
  
  // 2. Delete relationships if requested
  let relationshipsDeleted = 0;
  if (options.delete_relationships) {
    const relResult = await this.db.query(`
      UPDATE kb.graph_relationships
      SET deleted_at = now()
      WHERE (src_id = ANY($1::uuid[]) OR dst_id = ANY($1::uuid[]))
        AND deleted_at IS NULL
      RETURNING id
    `, [objectIds]);
    relationshipsDeleted = relResult.rows.length;
  }
  
  // 3. Soft delete all objects
  await this.db.query(`
    UPDATE kb.graph_objects
    SET deleted_at = now()
    WHERE id = ANY($1::uuid[])
      AND deleted_at IS NULL
  `, [objectIds]);
  
  // 4. Delete mappings
  await this.db.query(`
    DELETE FROM kb.integration_entity_mappings
    WHERE integration_id = $1
  `, [integrationId]);
  
  // 5. Log activity
  await this.logActivity({
    integration_id: integrationId,
    activity_type: 'delete',
    severity: 'warning',
    message: `Bulk deleted ${objectIds.length} objects from integration`,
    details: {
      object_count: objectIds.length,
      relationship_count: relationshipsDeleted
    },
    triggered_by: 'manual'
  });
  
  return {
    objects_deleted: objectIds.length,
    relationships_deleted: relationshipsDeleted,
    affected_types: []
  };
}
```

### 13.3. Manual Sync Trigger

Allow admins to **manually trigger** a full or incremental sync.

#### API Endpoints

```typescript
// Full sync
@Post('/integrations/:id/sync')
@UseGuards(AuthGuard, AdminGuard)
async triggerSync(
  @Param('id') integrationId: string,
  @Body() options: {
    sync_type: 'full' | 'incremental';
    force?: boolean;              // Override rate limits
    specific_entities?: string[]; // Sync only specific external IDs
  }
) {
  const syncJob = await this.integrationsService.triggerManualSync(
    integrationId,
    options
  );
  
  return {
    success: true,
    sync_job_id: syncJob.id,
    status: syncJob.status,
    message: 'Sync initiated. Check activity log for progress.'
  };
}

// Cancel running sync
@Post('/integrations/:id/sync/:syncId/cancel')
@UseGuards(AuthGuard, AdminGuard)
async cancelSync(
  @Param('id') integrationId: string,
  @Param('syncId') syncId: string
) {
  await this.integrationsService.cancelSync(syncId);
  
  return {
    success: true,
    message: 'Sync cancelled'
  };
}
```

### 13.4. Activity Log Viewer (Admin UI)

```tsx
// apps/admin/src/pages/admin/integrations/[id]/activity.tsx

export default function IntegrationActivityLog({ integrationId }: Props) {
  const [filters, setFilters] = useState({
    activity_type: 'all',
    severity: 'all',
    requires_review: false,
    date_range: 'last_7_days'
  });
  
  const { data: activities, isLoading } = useActivityLog(integrationId, filters);

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Import Activity Log</h1>
        
        {/* Actions */}
        <div className="flex gap-2">
          <button className="btn btn-primary" onClick={handleManualSync}>
            <Icon name="refresh" /> Sync Now
          </button>
          <button className="btn btn-error btn-outline" onClick={handleBulkDelete}>
            <Icon name="trash" /> Delete All Imported
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="card bg-base-100 shadow mb-4">
        <div className="card-body">
          <div className="flex gap-4">
            <select
              className="select select-bordered"
              value={filters.activity_type}
              onChange={(e) => setFilters({ ...filters, activity_type: e.target.value })}
            >
              <option value="all">All Activities</option>
              <option value="import">Imports</option>
              <option value="update">Updates</option>
              <option value="delete">Deletes</option>
              <option value="error">Errors</option>
            </select>
            
            <select
              className="select select-bordered"
              value={filters.severity}
              onChange={(e) => setFilters({ ...filters, severity: e.target.value })}
            >
              <option value="all">All Severities</option>
              <option value="success">Success</option>
              <option value="info">Info</option>
              <option value="warning">Warning</option>
              <option value="error">Error</option>
            </select>
            
            <label className="label cursor-pointer">
              <span className="label-text mr-2">Requires Review Only</span>
              <input
                type="checkbox"
                className="checkbox"
                checked={filters.requires_review}
                onChange={(e) => setFilters({ ...filters, requires_review: e.target.checked })}
              />
            </label>
          </div>
        </div>
      </div>

      {/* Activity Timeline */}
      <div className="space-y-2">
        {activities.map(activity => (
          <ActivityLogEntry key={activity.id} activity={activity} />
        ))}
      </div>
    </div>
  );
}

function ActivityLogEntry({ activity }: { activity: ActivityLog }) {
  const severityClass = {
    success: 'alert-success',
    info: 'alert-info',
    warning: 'alert-warning',
    error: 'alert-error'
  }[activity.severity];

  const icon = {
    import: 'download',
    update: 'refresh',
    delete: 'trash',
    skip: 'forward',
    error: 'alert-circle'
  }[activity.activity_type];

  return (
    <div className={`alert ${severityClass}`}>
      <div className="flex-1">
        <div className="flex items-start gap-3">
          <Icon name={icon} className="w-5 h-5 mt-1" />
          
          <div className="flex-1">
            <div className="flex justify-between items-start mb-1">
              <div>
                <span className="font-semibold">{activity.message}</span>
                {activity.requires_review && (
                  <span className="badge badge-warning ml-2">Needs Review</span>
                )}
              </div>
              <span className="text-sm opacity-70">
                {formatRelative(activity.timestamp)}
              </span>
            </div>
            
            {activity.entity_type && (
              <div className="text-sm opacity-80">
                {activity.entity_type} · {activity.entity_external_id}
              </div>
            )}
            
            {activity.details && (
              <details className="mt-2">
                <summary className="cursor-pointer text-sm">View Details</summary>
                <pre className="mt-2 p-2 bg-base-200 rounded text-xs overflow-auto">
                  {JSON.stringify(activity.details, null, 2)}
                </pre>
              </details>
            )}
            
            {activity.object_id && (
              <a 
                href={`/admin/graph/objects/${activity.object_id}`}
                className="btn btn-xs btn-ghost mt-2"
              >
                View Object →
              </a>
            )}
          </div>
        </div>
      </div>
      
      {activity.requires_review && !activity.reviewed_at && (
        <button 
          className="btn btn-sm btn-primary"
          onClick={() => handleMarkReviewed(activity.id)}
        >
          Mark Reviewed
        </button>
      )}
    </div>
  );
}
```

---

## 14. Notification Integration

The ClickUp integration leverages the **Admin Notification System** (see [spec/35-admin-notification-inbox.md](./35-admin-notification-inbox.md)) to alert admins about import events.

### 14.1. Notification Categories Used

The following notification categories are triggered by ClickUp import events:

- **`import.completed`** - Full sync completed successfully
- **`import.failed`** - Sync failed with errors
- **`import.requires_review`** - Items imported with ambiguous type mapping
- **`import.conflict`** - Sync conflict detected (local vs remote changes)

### 14.2. Integration with Import System

Automatically create notifications during import:

```typescript
// In ClickUpImportService

async importTask(task: ClickUpTask, integration: Integration, syncLog: SyncLog) {
  // ... existing import logic ...
  
  // Create notification if review required
  if (requiresReview) {
    await this.notificationService.create({
      user_id: integration.created_by,
      category: 'import.requires_review',
      importance: 'important',
      title: 'ClickUp task needs review',
      message: `Task "${task.name}" imported with ambiguous type mapping`,
      details: {
        task_id: task.id,
        confidence: 0.65,
        suggested_type: targetType,
        alternative_types: ['Requirement', 'Feature', 'Task']
      },
      source_type: 'integration',
      source_id: integration.id,
      action_url: `/admin/integrations/${integration.id}/activity?filter=requires_review`,
      action_label: 'Review',
      group_key: `clickup_import_${syncLog.id}`
    });
  }
  
  // Create notification on conflict
  if (hasConflict) {
    await this.notificationService.create({
      user_id: integration.created_by,
      category: 'import.conflict',
      importance: 'important',
      title: 'ClickUp sync conflict',
      message: `Task "${task.name}" modified both locally and in ClickUp`,
      details: {
        object_id: object.id,
        conflicting_fields: ['status'],
        local_value: localObject.properties.status,
        remote_value: task.status
      },
      source_type: 'integration',
      source_id: integration.id,
      action_url: `/admin/graph/objects/${object.id}`,
      action_label: 'View Object',
      group_key: `clickup_conflict_${object.id}`
    });
  }
}

// After full sync completes
async completeSyncJob(syncLog: SyncLog, integration: Integration) {
  const stats = await this.getSyncStats(syncLog.id);
  
  if (stats.items_requiring_review > 0) {
    await this.notificationService.create({
      user_id: integration.created_by,
      category: 'import.requires_review',
      importance: 'important',
      title: `ClickUp Import: ${stats.items_requiring_review} items need review`,
      message: `${stats.items_requiring_review} tasks imported with low confidence type mapping`,
      details: {
        integration_name: integration.config.name,
        sync_id: syncLog.id,
        items_requiring_review: stats.items_requiring_review,
        total_imported: stats.imported,
        total_updated: stats.updated,
        total_errors: stats.errors
      },
      source_type: 'integration',
      source_id: integration.id,
      action_url: `/admin/integrations/${integration.id}/activity?filter=requires_review`,
      action_label: 'Review Items',
      group_key: `sync_${syncLog.id}`
    });
  } else {
    // Success notification (lower priority)
    await this.notificationService.create({
      user_id: integration.created_by,
      category: 'import.completed',
      importance: 'other',
      title: 'ClickUp import completed',
      message: `Imported ${stats.imported} tasks, updated ${stats.updated}`,
      details: {
        integration_name: integration.config.name,
        sync_id: syncLog.id,
        ...stats
      },
      source_type: 'integration',
      source_id: integration.id,
      action_url: `/admin/integrations/${integration.id}/activity`,
      action_label: 'View Activity',
      group_key: `sync_${syncLog.id}`
    });
  }
}
```

For full notification system documentation, see **[spec/35-admin-notification-inbox.md](./35-admin-notification-inbox.md)**.

---

## 15. Updated Implementation Phases

### Phase 1: Core Infrastructure (10-12 hours)
- ✅ Database schema (integrations, mappings, sync_log, **activity_log**)
- ✅ IntegrationsModule with CRUD
- ✅ Integration entity mappings service
- ✅ **Activity log service**
- ✅ Credential encryption
- ✅ Unit tests

### Phase 2: ClickUp Plugin (10-12 hours)
- ✅ ClickUp API client with rate limiting
- ✅ Type mapping engine
- ✅ Field mapping engine
- ✅ Import service (full sync)
- ✅ **Activity logging integration**
- ✅ **Notification creation** (uses shared notification system)
- ✅ Relationship sync (subtasks, dependencies)
- ✅ Unit tests

### Phase 3: Integration Management Features (8-10 hours)
- ✅ **Activity log viewer UI**
- ✅ **Bulk delete by source**
- ✅ **Manual sync trigger**
- ✅ **Dry-run preview**
- ✅ **Review workflow**

### Phase 4: Webhooks (6-8 hours)
- ✅ Webhook endpoint
- ✅ Signature verification
- ✅ Incremental update handlers
- ✅ Conflict resolution
- ✅ Tests

**Total Estimated Effort:** 34-42 hours

**Note:** The Admin Notification Inbox system (Phase 5 in previous design) has been moved to a separate, reusable system documented in [spec/35-admin-notification-inbox.md](./35-admin-notification-inbox.md). This integration will leverage that system for notifications.

---

## 16. Next Steps

**Ready to implement?** We now have a comprehensive design including:

1. ✅ **Project-level ClickUp sync** with flexible type mapping
2. ✅ **Complete source tracking** in `properties.source`
3. ✅ **Detailed activity logging** for transparency
4. ✅ **Bulk operations** (delete all imported, manual sync)
5. ✅ **Integration with Admin Notification System** (see [spec/35-admin-notification-inbox.md](./35-admin-notification-inbox.md))
6. ✅ **Review workflow** for ambiguous imports
7. ✅ **Real-time notifications** for important events

This system provides maximum flexibility while maintaining full traceability and giving admins powerful tools to manage integrations.

**Related Specifications:**
- [Admin Notification Inbox System](./35-admin-notification-inbox.md) - Centralized notification system for all admin alerts
- [Integration Gallery](./23-integration-gallery.md) - UI for managing multiple integrations
- [Dynamic Object Graph](./19-dynamic-object-graph.md) - Graph object schema and querying

**What do you think? Ready to start building Phase 1?** 🚀
