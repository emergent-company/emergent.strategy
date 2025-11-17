# MCP Server Implementation Plan

## Overview

This document provides a detailed implementation plan for building an MCP (Model Context Protocol) server that exposes the project's knowledge base data model and provides AI agents with tools to query and manipulate data.

**Based on**: `docs/mcp-server-implementation.md`  
**Status**: Planning  
**Created**: 2025-10-20

---

## 1. Executive Summary

### Goals
- Expose knowledge base schema (Template Packs) to AI agents
- Provide structured data access tools for querying objects and relationships
- Enable AI Agent Service to interact with data through standardized MCP protocol
- Integrate with existing NestJS architecture using `@rekog/mcp-nest`
- **Use hybrid tool approach**: Specific tools (e.g., `getPersons()`, `getTasks()`) + generic fallbacks
- **Implement schema caching**: Version-based cache invalidation for optimal performance

### Success Criteria
- AI agents can discover and understand the data schema
- AI agents can query objects by type, ID, and relationships
- **Tools are discoverable**: Agent sees clear tool names like `getPersons`, `getTasks` in tool list
- Frontend chat UI can communicate with AI Agent Service
- All tools are properly authenticated and authorized
- Performance meets requirements (< 500ms for schema queries, < 1s for data queries)
- **Cache invalidation works**: Agents refresh when schemas change (via version checks)

---

## 2. Implementation Phases

### Phase 1: Foundation & Setup (Week 1)

#### 1.1 Install Dependencies
```bash
cd apps/server
npm install @rekog/mcp-nest
```

**Verification**: Check `package.json` includes `@rekog/mcp-nest`

#### 1.2 Create MCP Module Structure
Create new module directories:
```
apps/server/src/modules/mcp/
├── mcp.module.ts           # Main MCP module
├── tools/
│   ├── schema.tool.ts      # Schema exposure tools
│   ├── data.tool.ts        # Data access tools
│   └── index.ts            # Tool exports
├── guards/
│   ├── mcp-auth.guard.ts   # Authentication guard
│   └── index.ts
├── dto/
│   ├── schema.dto.ts       # Schema-related DTOs
│   ├── data.dto.ts         # Data query DTOs
│   └── index.ts
└── README.md               # Module documentation
```

**Tasks**:
- [ ] Create directory structure
- [ ] Create `mcp.module.ts` with basic configuration
- [ ] Register MCP module in `app.module.ts`
- [ ] Add module-level README with usage examples

#### 1.3 Configure MCP Module
Update `apps/server/src/modules/app.module.ts`:

```typescript
import { McpModule } from '@rekog/mcp-nest';
import { McpAuthGuard } from './modules/mcp/guards/mcp-auth.guard';

@Module({
  imports: [
    // ... other imports
    McpModule.forRoot({
      serverName: 'knowledge-base-mcp',
      serverVersion: '1.0.0',
      guards: [McpAuthGuard],
    }),
  ],
  // ...
})
export class AppModule {}
```

**Verification**:
- [ ] Server starts without errors
- [ ] MCP module is loaded (check logs)

---

### Phase 2: Schema Exposure Tools (Week 1-2)

#### 2.1 Create Schema DTOs
File: `apps/server/src/modules/mcp/dto/schema.dto.ts`

```typescript
import { IsString, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class GetTemplatePacksDto {
  // No parameters needed for listing
}

export class GetTemplatePackDetailsDto {
  @ApiProperty({
    description: 'Template pack ID',
    example: 'software-eng-pack-v1',
  })
  @IsString()
  pack_id: string;
}

export class TemplatePackSummaryDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty()
  version: string;

  @ApiProperty({ required: false })
  description?: string;
}

export class ObjectTypeSchemaDto {
  @ApiProperty()
  name: string;

  @ApiProperty()
  properties: Record<string, any>;

  @ApiProperty({ required: false })
  required?: string[];
}

export class RelationshipTypeSchemaDto {
  @ApiProperty()
  name: string;

  @ApiProperty()
  from_object_type: string;

  @ApiProperty()
  to_object_type: string;

  @ApiProperty({ required: false })
  properties?: Record<string, any>;
}

export class TemplatePackDetailsDto extends TemplatePackSummaryDto {
  @ApiProperty({ type: [ObjectTypeSchemaDto] })
  objectTypeSchemas: ObjectTypeSchemaDto[];

  @ApiProperty({ type: [RelationshipTypeSchemaDto] })
  relationshipTypeSchemas: RelationshipTypeSchemaDto[];
}
```

#### 2.2 Implement Schema Tool
File: `apps/server/src/modules/mcp/tools/schema.tool.ts`

```typescript
import { Injectable } from '@nestjs/common';
import { McpTool, ToolParam, ToolResult } from '@rekog/mcp-nest';
import { TemplatePackService } from '../../template-packs/template-pack.service';
import {
  TemplatePackSummaryDto,
  TemplatePackDetailsDto,
  GetTemplatePackDetailsDto,
} from '../dto/schema.dto';

@Injectable()
export class SchemaTool {
  constructor(private readonly templatePackService: TemplatePackService) {}

  @McpTool({
    name: 'schema.getTemplatePacks',
    description: 'Returns a list of all available template packs with their basic information',
  })
  async getTemplatePacks(): Promise<ToolResult<TemplatePackSummaryDto[]>> {
    try {
      const packs = await this.templatePackService.listTemplatePacks();
      
      const summaries: TemplatePackSummaryDto[] = packs.map(pack => ({
        id: pack.id,
        name: pack.name,
        version: pack.version,
        description: pack.description,
      }));

      return {
        success: true,
        data: summaries,
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  @McpTool({
    name: 'schema.getTemplatePackDetails',
    description: 'Returns the full definition of a single template pack including all object type and relationship type schemas',
  })
  async getTemplatePackDetails(
    @ToolParam('pack_id', { description: 'The ID of the template pack to retrieve' })
    pack_id: string,
  ): Promise<ToolResult<TemplatePackDetailsDto>> {
    try {
      const pack = await this.templatePackService.getTemplatePackById(pack_id);
      
      if (!pack) {
        return {
          success: false,
          error: `Template pack with ID '${pack_id}' not found`,
        };
      }

      const details: TemplatePackDetailsDto = {
        id: pack.id,
        name: pack.name,
        version: pack.version,
        description: pack.description,
        objectTypeSchemas: pack.objectTypeSchemas || [],
        relationshipTypeSchemas: pack.relationshipTypeSchemas || [],
      };

      return {
        success: true,
        data: details,
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  }
}
```

#### 2.3 Register Schema Tool
Update `apps/server/src/modules/mcp/mcp.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { SchemaTool } from './tools/schema.tool';
import { TemplatePackModule } from '../template-packs/template-pack.module';

@Module({
  imports: [TemplatePackModule],
  providers: [SchemaTool],
  exports: [SchemaTool],
})
export class McpToolsModule {}
```

**Testing**:
- [ ] Unit tests for `SchemaTool.getTemplatePacks()`
- [ ] Unit tests for `SchemaTool.getTemplatePackDetails()`
- [ ] Integration test: Call tools via MCP protocol
- [ ] Verify error handling (non-existent pack ID)

---

### Phase 3: Specific Data Tools - Hybrid Approach (Week 2)

> **Design Decision**: We're implementing **both specific tools** (e.g., `getPersons()`, `getTasks()`) **and generic fallbacks** (`data.getObjectsByType()`) for optimal discoverability and flexibility. See `docs/mcp-tools-design-comparison.md` for rationale.

#### 3.1 Create Specific Tool DTOs
File: `apps/server/src/modules/mcp/dto/data.dto.ts`

```typescript
import { IsString, IsOptional, IsInt, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class GetObjectsByTypeDto {
  @ApiProperty()
  @IsString()
  object_type: string;

  @ApiProperty({ required: false, minimum: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  limit?: number;

  @ApiProperty({ required: false, minimum: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  offset?: number;
}

export class GetObjectByIdDto {
  @ApiProperty()
  @IsString()
  object_type: string;

  @ApiProperty()
  @IsString()
  object_id: string;
}

export class GetRelatedObjectsDto {
  @ApiProperty()
  @IsString()
  source_object_type: string;

  @ApiProperty()
  @IsString()
  source_object_id: string;

  @ApiProperty()
  @IsString()
  relationship_type: string;
}

export class GraphObjectDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  type: string;

  @ApiProperty()
  name: string;

  @ApiProperty()
  properties: Record<string, any>;

  @ApiProperty({ required: false })
  created_at?: string;

  @ApiProperty({ required: false })
  updated_at?: string;
}
```

#### 3.2 Implement Specific Tools (Discoverable)
File: `apps/server/src/modules/mcp/tools/specific-data.tool.ts`

```typescript
import { Injectable } from '@nestjs/common';
import { McpTool, ToolParam, ToolResult } from '@rekog/mcp-nest';
import { GraphService } from '../../graph/graph.service';
import { PersonDto, TaskDto, ProjectDto } from '../dto/data.dto';

@Injectable()
export class SpecificDataTool {
  constructor(private readonly graphService: GraphService) {}
  
  // ============================================
  // PERSONS
  // ============================================
  
  @McpTool({
    name: 'getPersons',
    description: 'Get all persons with optional filters for department, role, and skills',
  })
  async getPersons(
    @ToolParam('department', { description: 'Filter by department', optional: true })
    department?: string,
    @ToolParam('role', { description: 'Filter by job role', optional: true })
    role?: string,
    @ToolParam('skills', { description: 'Filter by required skills', optional: true })
    skills?: string[],
    @ToolParam('limit', { description: 'Maximum results', optional: true })
    limit?: number,
    @ToolParam('offset', { description: 'Skip N results', optional: true })
    offset?: number,
  ): Promise<ToolResult<PersonDto[]>> {
    try {
      const filters = { department, role, skills };
      const persons = await this.graphService.getPersons(filters, { limit, offset });
      
      return {
        success: true,
        data: persons,
        metadata: { count: persons.length, limit, offset },
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
  
  @McpTool({
    name: 'getPerson',
    description: 'Get a single person by ID',
  })
  async getPerson(
    @ToolParam('person_id', { description: 'Person ID' })
    person_id: string,
  ): Promise<ToolResult<PersonDto>> {
    try {
      const person = await this.graphService.getPerson(person_id);
      if (!person) {
        return { success: false, error: `Person not found: ${person_id}` };
      }
      return { success: true, data: person };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
  
  // ============================================
  // TASKS
  // ============================================
  
  @McpTool({
    name: 'getTasks',
    description: 'Get all tasks with optional filters for status, priority, and assignee',
  })
  async getTasks(
    @ToolParam('status', { description: 'Filter by status', optional: true })
    status?: 'todo' | 'in_progress' | 'done' | 'blocked',
    @ToolParam('priority', { description: 'Filter by priority', optional: true })
    priority?: 'low' | 'medium' | 'high' | 'critical',
    @ToolParam('assignee_id', { description: 'Filter by assigned person ID', optional: true })
    assignee_id?: string,
    @ToolParam('due_before', { description: 'Filter by due date (ISO format)', optional: true })
    due_before?: string,
    @ToolParam('limit', { description: 'Maximum results', optional: true })
    limit?: number,
    @ToolParam('offset', { description: 'Skip N results', optional: true })
    offset?: number,
  ): Promise<ToolResult<TaskDto[]>> {
    try {
      const filters = { status, priority, assignee_id, due_before };
      const tasks = await this.graphService.getTasks(filters, { limit, offset });
      
      return {
        success: true,
        data: tasks,
        metadata: { count: tasks.length, limit, offset },
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
  
  @McpTool({
    name: 'getTask',
    description: 'Get a single task by ID',
  })
  async getTask(
    @ToolParam('task_id', { description: 'Task ID' })
    task_id: string,
  ): Promise<ToolResult<TaskDto>> {
    try {
      const task = await this.graphService.getTask(task_id);
      if (!task) {
        return { success: false, error: `Task not found: ${task_id}` };
      }
      return { success: true, data: task };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
  
  // ============================================
  // RELATIONSHIPS (Specific)
  // ============================================
  
  @McpTool({
    name: 'getTaskAssignees',
    description: 'Get persons assigned to a task',
  })
  async getTaskAssignees(
    @ToolParam('task_id', { description: 'Task ID' })
    task_id: string,
  ): Promise<ToolResult<PersonDto[]>> {
    try {
      const assignees = await this.graphService.getRelatedObjects(
        'Task',
        task_id,
        'assigned_to'
      );
      return { success: true, data: assignees };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
  
  @McpTool({
    name: 'getPersonTasks',
    description: 'Get all tasks assigned to a person',
  })
  async getPersonTasks(
    @ToolParam('person_id', { description: 'Person ID' })
    person_id: string,
  ): Promise<ToolResult<TaskDto[]>> {
    try {
      // Note: This queries in reverse direction
      const tasks = await this.graphService.getObjectsRelatedTo(
        'Person',
        person_id,
        'assigned_to'
      );
      return { success: true, data: tasks };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
  
  @McpTool({
    name: 'getTaskDependencies',
    description: 'Get tasks that must be completed before this task can start',
  })
  async getTaskDependencies(
    @ToolParam('task_id', { description: 'Task ID' })
    task_id: string,
  ): Promise<ToolResult<TaskDto[]>> {
    try {
      const dependencies = await this.graphService.getRelatedObjects(
        'Task',
        task_id,
        'depends_on'
      );
      return { success: true, data: dependencies };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
  
  @McpTool({
    name: 'getPersonManager',
    description: 'Get the manager of a person',
  })
  async getPersonManager(
    @ToolParam('person_id', { description: 'Person ID' })
    person_id: string,
  ): Promise<ToolResult<PersonDto | null>> {
    try {
      const managers = await this.graphService.getRelatedObjects(
        'Person',
        person_id,
        'reports_to'
      );
      // Should only be one manager
      return { 
        success: true, 
        data: managers.length > 0 ? managers[0] : null 
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
}
```

#### 3.3 Implement Generic Fallback Tools
File: `apps/server/src/modules/mcp/tools/generic-data.tool.ts`

```typescript
import { Injectable } from '@nestjs/common';
import { McpTool, ToolParam, ToolResult } from '@rekog/mcp-nest';
import { GraphService } from '../../graph/graph.service';
import { GraphObjectDto } from '../dto/data.dto';

@Injectable()
export class GenericDataTool {
  constructor(private readonly graphService: GraphService) {}

  @McpTool({
    name: 'data.getObjectsByType',
    description: 'Retrieves a collection of objects of a specified type with optional pagination',
  })
  async getObjectsByType(
    @ToolParam('object_type', { description: 'The type of objects to retrieve' })
    object_type: string,
    @ToolParam('limit', { description: 'Maximum number of objects to return', optional: true })
    limit?: number,
    @ToolParam('offset', { description: 'Number of objects to skip', optional: true })
    offset?: number,
  ): Promise<ToolResult<GraphObjectDto[]>> {
    try {
      const objects = await this.graphService.getObjectsByType(
        object_type,
        { limit: limit || 50, offset: offset || 0 }
      );

      const dtos: GraphObjectDto[] = objects.map(obj => ({
        id: obj.id,
        type: obj.type_name,
        name: obj.name,
        properties: obj.properties || {},
        created_at: obj.created_at?.toISOString(),
        updated_at: obj.updated_at?.toISOString(),
      }));

      return {
        success: true,
        data: dtos,
        metadata: {
          count: dtos.length,
          limit,
          offset,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  @McpTool({
    name: 'data.getObjectById',
    description: 'Retrieves a single object by its type and ID',
  })
  async getObjectById(
    @ToolParam('object_type', { description: 'The type of the object' })
    object_type: string,
    @ToolParam('object_id', { description: 'The unique ID of the object' })
    object_id: string,
  ): Promise<ToolResult<GraphObjectDto>> {
    try {
      const object = await this.graphService.getObjectById(object_type, object_id);

      if (!object) {
        return {
          success: false,
          error: `Object not found: ${object_type}#${object_id}`,
        };
      }

      const dto: GraphObjectDto = {
        id: object.id,
        type: object.type_name,
        name: object.name,
        properties: object.properties || {},
        created_at: object.created_at?.toISOString(),
        updated_at: object.updated_at?.toISOString(),
      };

      return {
        success: true,
        data: dto,
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  @McpTool({
    name: 'data.getRelatedObjects',
    description: 'Traverses a relationship from a source object to find related objects',
  })
  async getRelatedObjects(
    @ToolParam('source_object_type', { description: 'Type of the source object' })
    source_object_type: string,
    @ToolParam('source_object_id', { description: 'ID of the source object' })
    source_object_id: string,
    @ToolParam('relationship_type', { description: 'Type of relationship to traverse' })
    relationship_type: string,
  ): Promise<ToolResult<GraphObjectDto[]>> {
    try {
      const relatedObjects = await this.graphService.getRelatedObjects(
        source_object_type,
        source_object_id,
        relationship_type,
      );

      const dtos: GraphObjectDto[] = relatedObjects.map(obj => ({
        id: obj.id,
        type: obj.type_name,
        name: obj.name,
        properties: obj.properties || {},
        created_at: obj.created_at?.toISOString(),
        updated_at: obj.updated_at?.toISOString(),
      }));

      return {
        success: true,
        data: dtos,
        metadata: {
          count: dtos.length,
          source: {
            type: source_object_type,
            id: source_object_id,
          },
          relationship_type,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  }
}
```

#### 3.4 Register All Tools
Update `apps/server/src/modules/mcp/mcp.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { SchemaTool } from './tools/schema.tool';
import { SpecificDataTool } from './tools/specific-data.tool';
import { GenericDataTool } from './tools/generic-data.tool';
import { TemplatePackModule } from '../template-packs/template-pack.module';
import { GraphModule } from '../graph/graph.module';

@Module({
  imports: [TemplatePackModule, GraphModule],
  providers: [
    SchemaTool,
    SpecificDataTool,  // Discoverable tools (getPersons, getTasks, etc.)
    GenericDataTool,   // Fallback for unknown types
  ],
  exports: [SchemaTool, SpecificDataTool, GenericDataTool],
})
export class McpToolsModule {}
```

**Testing**:
- [ ] Unit tests for all specific tools (getPersons, getTasks, etc.)
- [ ] Unit tests for generic fallback tools
- [ ] Test that specific tools are preferred over generic
- [ ] Integration tests with real graph data
- [ ] Test pagination behavior
- [ ] Test filtering (status, priority, department, etc.)
- [ ] Test error cases (invalid types, missing objects)
- [ ] Test relationship tools (getTaskAssignees, getPersonTasks, etc.)

---

### Phase 3.5: Schema Versioning & Caching (Week 2)

> **Design Decision**: Implement version-based caching so agents know when schemas change. See `docs/mcp-schema-caching-and-changes.md` for full details.

#### 3.5.1 Add Schema Versioning to Database

```sql
-- Track schema versions
CREATE TABLE kb.template_pack_versions (
  pack_id TEXT NOT NULL,
  version TEXT NOT NULL,
  schema_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (pack_id, version)
);

-- Track current active version
CREATE TABLE kb.template_pack_current (
  pack_id TEXT PRIMARY KEY,
  current_version TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

#### 3.5.2 Add Version Endpoints

File: `apps/server/src/modules/mcp/mcp.controller.ts`

```typescript
import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { TemplatePackService } from '../template-packs/template-pack.service';

@Controller('mcp')
@ApiTags('MCP')
export class McpController {
  constructor(
    private readonly templatePackService: TemplatePackService,
  ) {}
  
  @Get('schema/version')
  @ApiOperation({ 
    summary: 'Get current schema version hash',
    description: 'Returns a hash representing the current state of all schemas. Agents can use this to determine if cached tools are still valid.'
  })
  async getSchemaVersion(): Promise<{ 
    version: string; 
    updated_at: string;
    cache_hint_ttl: number; // seconds
  }> {
    const version = await this.templatePackService.getSchemaVersion();
    const updatedAt = await this.templatePackService.getSchemaLastUpdated();
    
    return {
      version,
      updated_at: updatedAt.toISOString(),
      cache_hint_ttl: 300, // Suggest 5 min cache
    };
  }
  
  @Get('schema/changelog')
  @ApiOperation({ 
    summary: 'Get schema change history',
    description: 'Returns recent schema changes for debugging and tracking'
  })
  async getSchemaChangelog(
    @Query('since') since?: string,
    @Query('limit') limit: number = 10,
  ): Promise<SchemaChange[]> {
    return this.templatePackService.getSchemaChangelog(since, limit);
  }
}
```

#### 3.5.3 Update TemplatePackService with Versioning

File: `apps/server/src/modules/template-packs/template-pack.service.ts`

```typescript
import * as crypto from 'crypto';

@Injectable()
export class TemplatePackService {
  async getSchemaVersion(): Promise<string> {
    // Return hash of all current schema versions
    const packs = await this.listTemplatePacks();
    const versions = packs
      .map(p => `${p.id}:${p.version}`)
      .sort();
    
    const hash = crypto
      .createHash('sha256')
      .update(versions.join(','))
      .digest('hex');
    
    return hash.substring(0, 16); // e.g., "a1b2c3d4e5f6g7h8"
  }
  
  async updateTemplatePack(packId: string, schema: TemplatePackSchema) {
    await this.db.transaction(async (trx) => {
      // Save new version
      await trx('kb.template_packs').update({
        schema: schema,
        version: schema.version,
        updated_at: new Date(),
      }).where({ id: packId });
      
      // Record version history
      await trx('kb.template_pack_versions').insert({
        pack_id: packId,
        version: schema.version,
        schema_hash: this.hashSchema(schema),
      });
      
      // Update current version pointer
      await trx('kb.template_pack_current').upsert({
        pack_id: packId,
        current_version: schema.version,
        updated_at: new Date(),
      });
    });
    
    // Optional: Notify connected clients via WebSocket
    // await this.notifySchemaChanged(packId);
  }
  
  private hashSchema(schema: TemplatePackSchema): string {
    const normalized = JSON.stringify(schema, Object.keys(schema).sort());
    return crypto.createHash('sha256').update(normalized).digest('hex');
  }
}
```

#### 3.5.4 Include Version in Tool Responses

Update `SchemaTool` to include version metadata:

```typescript
@McpTool({
  name: 'schema.getTemplatePacks',
  description: 'Returns a list of all available template packs',
})
async getTemplatePacks(): Promise<ToolResult<TemplatePackSummary[]>> {
  const packs = await this.templatePackService.listTemplatePacks();
  const schemaVersion = await this.templatePackService.getSchemaVersion();
  
  return {
    success: true,
    data: packs.map(p => ({
      id: p.id,
      name: p.name,
      version: p.version,
      description: p.description,
    })),
    metadata: {
      schema_version: schemaVersion,     // Version hash for cache validation
      cached_until: Date.now() + 300000, // 5 min TTL hint
    },
  };
}
```

#### 3.5.5 Agent-Side Caching Implementation (Reference)

Example implementation for AI agent clients:

```typescript
class McpClient {
  private toolsCache: Map<string, CachedTools> = new Map();
  private schemaVersion: string | null = null;
  
  async getTools(packId: string): Promise<Tool[]> {
    // Check version first
    const serverVersion = await this.getSchemaVersion();
    
    if (this.schemaVersion === serverVersion) {
      const cached = this.toolsCache.get(packId);
      if (cached && Date.now() - cached.timestamp < 300000) { // 5 min TTL
        console.log('Using cached tools');
        return cached.tools;
      }
    }
    
    // Version changed or cache expired, fetch fresh
    console.log('Fetching fresh tools (version changed or TTL expired)');
    const tools = await this.fetchTools(packId);
    
    this.toolsCache.set(packId, {
      tools,
      timestamp: Date.now(),
    });
    this.schemaVersion = serverVersion;
    
    return tools;
  }
  
  private async getSchemaVersion(): Promise<string> {
    const response = await fetch(`${this.serverUrl}/mcp/schema/version`);
    const data = await response.json();
    return data.version;
  }
}
```

**Testing**:
- [ ] Test schema version generation
- [ ] Test version changes when schema updates
- [ ] Test version endpoint returns consistent hashes
- [ ] Test changelog tracks schema changes
- [ ] Test cache TTL behavior (5 min expiration)
- [ ] Test version-based cache invalidation
- [ ] Document agent caching best practices

**Configuration**:
```env
# Schema caching behavior
MCP_SCHEMA_CACHE_TTL=300                   # 5 minutes default
MCP_SCHEMA_VERSION_CHECK_INTERVAL=60       # Check every minute
MCP_SCHEMA_ENABLE_NOTIFICATIONS=false      # WebSocket notifications (future)
```

---

### Phase 4: Authentication & Authorization (Week 2-3)

#### 4.1 Create MCP Auth Guard
File: `apps/server/src/modules/mcp/guards/mcp-auth.guard.ts`

```typescript
import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Request } from 'express';

@Injectable()
export class McpAuthGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const token = this.extractTokenFromHeader(request);

    if (!token) {
      throw new UnauthorizedException('Missing authentication token');
    }

    try {
      // TODO: Implement actual token validation
      // This should verify:
      // 1. Token is valid (not expired, properly signed)
      // 2. Token has required scopes for MCP access
      // 3. User/service has permission to access requested resources
      
      // For now, basic validation:
      const isValid = await this.validateToken(token);
      if (!isValid) {
        throw new UnauthorizedException('Invalid token');
      }

      // Attach user info to request for downstream use
      request['user'] = await this.getUserFromToken(token);
      
      return true;
    } catch (error) {
      throw new UnauthorizedException('Authentication failed');
    }
  }

  private extractTokenFromHeader(request: Request): string | undefined {
    const [type, token] = request.headers.authorization?.split(' ') ?? [];
    return type === 'Bearer' ? token : undefined;
  }

  private async validateToken(token: string): Promise<boolean> {
    // TODO: Implement token validation logic
    // Could integrate with existing auth module
    return token.length > 0; // Placeholder
  }

  private async getUserFromToken(token: string): Promise<any> {
    // TODO: Extract user info from token
    return { id: 'user-id', email: 'user@example.com' }; // Placeholder
  }
}
```

#### 4.2 Add Scope-Based Authorization
Consider adding scope requirements to tools:

```typescript
@McpTool({
  name: 'data.getObjectsByType',
  description: '...',
  requiredScopes: ['kb:read'], // Example: require read scope
})
```

**Tasks**:
- [ ] Implement token validation
- [ ] Integrate with existing auth module
- [ ] Add scope checking
- [ ] Add rate limiting (optional)
- [ ] Document authentication flow

**Testing**:
- [ ] Test with valid token
- [ ] Test with invalid token
- [ ] Test with missing token
- [ ] Test with insufficient scopes

---

### Phase 5: AI Agent Service (Week 3-4)

#### 5.1 Create AI Agent Module
```
apps/server/src/modules/ai-agent/
├── ai-agent.module.ts
├── ai-agent.controller.ts
├── ai-agent.service.ts
├── dto/
│   ├── chat.dto.ts
│   └── index.ts
└── README.md
```

#### 5.2 Implement AI Agent Service
File: `apps/server/src/modules/ai-agent/ai-agent.service.ts`

```typescript
import { Injectable } from '@nestjs/common';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { SchemaTool } from '../mcp/tools/schema.tool';
import { DataTool } from '../mcp/tools/data.tool';

@Injectable()
export class AiAgentService {
  private llm: ChatGoogleGenerativeAI;
  
  constructor(
    private readonly schemaTool: SchemaTool,
    private readonly dataTool: DataTool,
  ) {
    this.llm = new ChatGoogleGenerativeAI({
      modelName: 'gemini-pro',
      temperature: 0.7,
    });
  }

  async chat(message: string, history: any[] = []): Promise<AsyncIterable<string>> {
    // TODO: Implement LangChain agent with tool calling
    // 1. Convert MCP tools to LangChain tools
    // 2. Create agent with conversation memory
    // 3. Process message and return streaming response
    
    // Placeholder implementation
    return this.streamResponse(`Echo: ${message}`);
  }

  private async *streamResponse(text: string): AsyncIterable<string> {
    const words = text.split(' ');
    for (const word of words) {
      yield word + ' ';
      await new Promise(resolve => setTimeout(resolve, 50));
    }
  }
}
```

#### 5.3 Create AI Agent Controller
File: `apps/server/src/modules/ai-agent/ai-agent.controller.ts`

```typescript
import { Controller, Post, Body, Sse } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Observable } from 'rxjs';
import { AiAgentService } from './ai-agent.service';
import { ChatMessageDto, ChatHistoryDto } from './dto/chat.dto';

@ApiTags('AI Agent')
@Controller('ai-agent')
export class AiAgentController {
  constructor(private readonly aiAgentService: AiAgentService) {}

  @Post('chat')
  @Sse()
  @ApiOperation({ summary: 'Send message to AI agent and receive streaming response' })
  async chat(
    @Body() body: { message: string; history?: ChatHistoryDto[] },
  ): Promise<Observable<MessageEvent>> {
    const stream = await this.aiAgentService.chat(body.message, body.history);
    
    return new Observable(observer => {
      (async () => {
        try {
          for await (const chunk of stream) {
            observer.next({ data: chunk } as MessageEvent);
          }
          observer.complete();
        } catch (error) {
          observer.error(error);
        }
      })();
    });
  }
}
```

**Tasks**:
- [ ] Implement LangChain agent integration
- [ ] Convert MCP tools to LangChain tool format
- [ ] Add conversation memory management
- [ ] Implement streaming response
- [ ] Add error handling and retry logic

**Testing**:
- [ ] Test basic question answering
- [ ] Test tool calling (schema and data tools)
- [ ] Test conversation context/memory
- [ ] Test streaming response
- [ ] Load testing for concurrent requests

---

### Phase 6: Frontend Integration (Week 4)

#### 6.1 Update Chat UI
File: `apps/admin/src/pages/admin/apps/chat/ChatApp.tsx`

Update to call new AI Agent Service endpoint:

```typescript
// Add function to call AI agent endpoint
const sendMessage = async (message: string) => {
  const response = await fetch('/api/ai-agent/chat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({
      message,
      history: conversationHistory,
    }),
  });

  // Handle SSE stream
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    
    const chunk = decoder.decode(value);
    // Update UI with chunk
  }
};
```

**Tasks**:
- [ ] Update chat UI to use new endpoint
- [ ] Implement SSE streaming in frontend
- [ ] Add loading states
- [ ] Add error handling
- [ ] Test end-to-end flow

---

## 3. Testing Strategy

### Unit Tests
- All tool methods (SchemaTool, DataTool)
- AI Agent Service logic
- Authentication guard
- DTOs validation

### Integration Tests
- MCP protocol communication
- Tool execution with real services
- Authentication flow
- Database queries

### E2E Tests
- Complete user flow from chat UI
- Tool discovery and execution
- Error scenarios
- Performance benchmarks

### Performance Tests
- Schema query latency (target: < 500ms)
- Data query latency (target: < 1s)
- Concurrent request handling
- Memory usage under load

---

## 4. Documentation Requirements

### Technical Documentation
- [ ] API documentation (OpenAPI/Swagger)
- [ ] MCP tool catalog with examples
- [ ] Authentication guide
- [ ] Deployment guide

### Developer Documentation
- [ ] Architecture overview
- [ ] Tool development guide
- [ ] Testing guide
- [ ] Troubleshooting guide

### User Documentation
- [ ] Chat UI user guide
- [ ] Example queries
- [ ] FAQ

---

## 5. Deployment Checklist

### Prerequisites
- [ ] `@rekog/mcp-nest` package installed
- [ ] Environment variables configured
- [ ] Database migrations applied
- [ ] Authentication tokens configured

### Configuration
- [ ] MCP module registered
- [ ] Tools registered and exported
- [ ] Guards applied
- [ ] Logging configured
- [ ] Monitoring enabled

### Verification
- [ ] All tests passing
- [ ] Type checking passes
- [ ] OpenAPI spec generated
- [ ] Performance benchmarks met
- [ ] Security audit completed

---

## 6. Rollout Plan

### Week 1-2: Development Environment
- Deploy to dev environment
- Internal testing
- Bug fixes and refinements

### Week 3: Staging Environment
- Deploy to staging
- User acceptance testing
- Performance testing
- Load testing

### Week 4: Production
- Phased rollout (10% → 50% → 100%)
- Monitor metrics and logs
- Quick rollback plan ready
- User feedback collection

---

## 7. Success Metrics

### Technical Metrics
- Tool response time: < 500ms (p95)
- Data query time: < 1s (p95)
- Uptime: > 99.9%
- Error rate: < 0.1%

### Business Metrics
- AI agent query success rate: > 95%
- User satisfaction score: > 4.5/5
- Chat session duration: > 5 min average
- Tool usage frequency: measure adoption

---

## 8. Risks & Mitigation

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| `@rekog/mcp-nest` compatibility issues | High | Medium | Prototype early, have fallback plan |
| Performance bottlenecks | High | Medium | Load testing, caching strategy |
| Authentication complexity | Medium | Medium | Leverage existing auth module |
| LLM tool calling limitations | Medium | Low | Thorough testing, fallback prompts |
| Frontend streaming issues | Medium | Low | Progressive enhancement approach |

---

## 9. Caching Strategy Configuration

### Client-Side Caching Behavior

**Recommended Agent Implementation**:
```typescript
class McpClient {
  private toolsCache: Map<string, CachedTools> = new Map();
  private schemaVersion: string | null = null;
  
  async getTools(packId: string): Promise<Tool[]> {
    // 1. Check schema version
    const serverVersion = await this.getSchemaVersion();
    
    // 2. Use cache if version matches and TTL not expired
    if (this.schemaVersion === serverVersion) {
      const cached = this.toolsCache.get(packId);
      const ttl = Number(process.env.MCP_SCHEMA_CACHE_TTL || 300) * 1000;
      
      if (cached && Date.now() - cached.timestamp < ttl) {
        return cached.tools;
      }
    }
    
    // 3. Fetch fresh if version changed or expired
    const tools = await this.fetchTools(packId);
    
    this.toolsCache.set(packId, {
      tools,
      timestamp: Date.now(),
    });
    this.schemaVersion = serverVersion;
    
    return tools;
  }
}
```

**Cache Invalidation Triggers**:
1. **Version Check**: Agent checks `/mcp/schema/version` periodically
2. **TTL Expiration**: Default 5 minutes, configurable
3. **WebSocket Notification** (optional): Real-time schema change events

**Configuration**:
```env
# Schema Caching
MCP_SCHEMA_CACHE_TTL=300                   # 5 minutes (agent-side cache)
MCP_SCHEMA_VERSION_CHECK_INTERVAL=60       # Check every 60 seconds
MCP_SCHEMA_ENABLE_NOTIFICATIONS=false      # WebSocket notifications (future)

# HTTP Caching Headers
MCP_SCHEMA_CACHE_CONTROL=public, max-age=300
MCP_SCHEMA_ETAG_ENABLED=true
```

**HTTP Cache Headers**:
- `Cache-Control: public, max-age=300` - Browser/proxy caching (5 min)
- `ETag: "schema-version-hash"` - Conditional requests (304 Not Modified)
- `Last-Modified: timestamp` - Additional cache validation

---

## 10. Open Questions

1. **Authentication**: Should we use existing Zitadel tokens or create separate MCP tokens?
2. **Rate Limiting**: What limits should we impose on AI agent queries?
3. **Monitoring**: What specific metrics should we track for MCP tools?
4. **WebSocket Notifications**: Should we implement real-time schema change notifications in Phase 1 or defer to Phase 2?

---

## 10. Next Steps

1. **Review this plan** with the team
2. **Prototype** MCP module integration (Phase 1)
3. **Validate** `@rekog/mcp-nest` works with our stack
4. **Set up** development environment
5. **Begin** Phase 1 implementation

---

## Appendix: Tool Catalog Summary

### Schema Tools (with versioning)
| Tool Name | Description | Parameters | Returns | Metadata |
|-----------|-------------|------------|---------|----------|
| `schema.getTemplatePacks` | List all template packs | None | Array of pack summaries | `schema_version`, `cached_until` |
| `schema.getTemplatePackDetails` | Get full pack definition | `pack_id` | Complete pack schema | `schema_version`, `cached_until` |

### Versioning Endpoints
| Endpoint | Description | Returns |
|----------|-------------|---------|
| `GET /mcp/schema/version` | Get current schema version hash | `{ version, updated_at, cache_hint_ttl }` |
| `GET /mcp/schema/changelog` | Get schema change history | Array of schema changes |

### Specific Data Tools (Recommended - High Discoverability)
| Tool Name | Description | Parameters | Returns |
|-----------|-------------|------------|---------|
| **People** |||
| `getPersons` | Get all persons with filters | `department?`, `role?`, `skills?`, `limit?`, `offset?` | Array of persons |
| `getPerson` | Get single person by ID | `person_id` | Single person |
| **Tasks** |||
| `getTasks` | Get all tasks with filters | `status?`, `priority?`, `assignee_id?`, `due_before?`, `limit?`, `offset?` | Array of tasks |
| `getTask` | Get single task by ID | `task_id` | Single task |
| **Relationships** |||
| `getTaskAssignees` | Get persons assigned to task | `task_id` | Array of persons |
| `getPersonTasks` | Get tasks assigned to person | `person_id`, `status?` | Array of tasks |
| `getTaskDependencies` | Get tasks that block this task | `task_id` | Array of tasks |
| `getPersonManager` | Get person's manager | `person_id` | Single person or null |

### Generic Data Tools (Fallback - For Custom Types)
| Tool Name | Description | Parameters | Returns |
|-----------|-------------|------------|---------|
| `data.getObjectsByType` | Query objects of any type | `type_name`, `filters?`, `limit?`, `offset?` | Array of objects |
| `data.getObject` | Get single object by type and ID | `type_name`, `object_id` | Single object |
| `data.getRelatedObjects` | Traverse any relationship type | `object_id`, `relationship_type`, `direction?` | Array of related objects |

**Tool Selection Strategy**:
1. **First Choice**: Use specific tools (getPersons, getTasks) - better discoverability and type safety
2. **Fallback**: Use generic tools for custom types or relationships not covered by specific tools
3. **Future**: Add more specific tools as common use cases emerge

---

## References

### External Documentation
- [MCP Specification](https://modelcontextprotocol.io/docs)
- [@rekog/mcp-nest Documentation](https://www.npmjs.com/package/@rekog/mcp-nest)
- [LangChain Documentation](https://js.langchain.com/docs/)
- [NestJS Guards](https://docs.nestjs.com/guards)

### Internal Design Documents
- `docs/mcp-server-implementation.md` - Original specification
- `docs/mcp-tools-design-comparison.md` - Generic vs Specific tools analysis (hybrid approach decision)
- `docs/mcp-schema-caching-and-changes.md` - Schema versioning and cache invalidation strategy
- `docs/mcp-tools-example-person-task.md` - Concrete examples with Person/Task objects
