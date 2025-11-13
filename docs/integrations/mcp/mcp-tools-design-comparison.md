# MCP Tools Design Comparison: Generic vs Specific

**Created**: 2025-10-20  
**Status**: Design Decision

## Problem Statement

Should MCP tools be **generic** (e.g., `getObjectsByType(type, filters)`) or **specific** (e.g., `getPersons(filters)`, `getTasks(filters)`)?

---

## Approach 1: Generic Tools (Original Design)

### Tool Definition
```typescript
@McpTool({
  name: 'data.getObjectsByType',
  description: 'Retrieves objects of any type',
})
async getObjectsByType(
  @ToolParam('object_type') type: string,
  @ToolParam('limit', { optional: true }) limit?: number,
  @ToolParam('offset', { optional: true }) offset?: number,
): Promise<GraphObject[]>
```

### Usage Examples
```typescript
// Get all persons
await data.getObjectsByType("Person", 50, 0);

// Get all tasks
await data.getObjectsByType("Task", 50, 0);

// Get all projects
await data.getObjectsByType("Project", 50, 0);
```

### Pros ✅
- **Fewer tools to implement** - One tool handles all object types
- **Dynamic** - Works with any new object type without code changes
- **Consistent API** - Same interface for all types
- **Flexible** - Can handle unknown types at runtime

### Cons ❌
- **Poor discoverability** - Agent doesn't know what types exist without calling `schema.getTemplatePacks()` first
- **String-based typing** - Error-prone ("Person" vs "person" vs "People")
- **No type-specific parameters** - Can't have `getTasks({ status: "done" })`
- **Generic parameters** - Filtering is awkward: `getObjectsByType("Task", { filters: { status: "done" } })`
- **Less intuitive** - AI agent must remember to pass correct type strings

---

## Approach 2: Specific/Direct Tools (Recommended)

### Tool Definition
```typescript
// Separate tool for each object type
@McpTool({
  name: 'getPersons',
  description: 'Get all persons with optional filters',
})
async getPersons(
  @ToolParam('department', { optional: true }) department?: string,
  @ToolParam('role', { optional: true }) role?: string,
  @ToolParam('skills', { optional: true }) skills?: string[],
  @ToolParam('limit', { optional: true }) limit?: number,
  @ToolParam('offset', { optional: true }) offset?: number,
): Promise<Person[]>

@McpTool({
  name: 'getTasks',
  description: 'Get all tasks with optional filters',
})
async getTasks(
  @ToolParam('status', { optional: true }) status?: 'todo' | 'in_progress' | 'done' | 'blocked',
  @ToolParam('priority', { optional: true }) priority?: 'low' | 'medium' | 'high' | 'critical',
  @ToolParam('assignee_id', { optional: true }) assignee_id?: string,
  @ToolParam('due_before', { optional: true }) due_before?: string,
  @ToolParam('limit', { optional: true }) limit?: number,
  @ToolParam('offset', { optional: true }) offset?: number,
): Promise<Task[]>

@McpTool({
  name: 'getPerson',
  description: 'Get a single person by ID',
})
async getPerson(
  @ToolParam('person_id') person_id: string,
): Promise<Person>

@McpTool({
  name: 'getTask',
  description: 'Get a single task by ID',
})
async getTask(
  @ToolParam('task_id') task_id: string,
): Promise<Task>
```

### Usage Examples
```typescript
// Get all persons in Engineering
await getPersons({ department: "Engineering" });

// Get high-priority tasks
await getTasks({ priority: "high" });

// Get blocked tasks assigned to John
await getTasks({ status: "blocked", assignee_id: "person-123" });

// Get specific person
await getPerson("person-123");

// Get specific task
await getTask("task-001");
```

### Pros ✅
- **Excellent discoverability** - Agent sees `getPersons`, `getTasks` in tool list
- **Type-specific parameters** - Each tool has relevant filters
- **Strongly typed** - Enum values for status, priority, etc.
- **Self-documenting** - Tool name clearly indicates what it does
- **Better UX** - Natural, intuitive API
- **IDE-friendly** - Autocomplete works perfectly
- **Optimized queries** - Can add indexes specific to common filters

### Cons ❌
- **More tools to implement** - Need one set per object type
- **Code duplication** - Similar logic repeated across tools
- **Less flexible** - Need to add new tools for new types
- **More maintenance** - Changes to object types require tool updates

---

## Approach 3: Hybrid (Best of Both Worlds)

### Design Philosophy
- **Specific tools** for known, frequently-used types (Person, Task, Project, etc.)
- **Generic fallback** for dynamic/unknown types or advanced use cases

### Implementation
```typescript
// Specific tools for common types
@McpTool({ name: 'getPersons' })
async getPersons(filters: PersonFilters): Promise<Person[]>

@McpTool({ name: 'getTasks' })
async getTasks(filters: TaskFilters): Promise<Task[]>

@McpTool({ name: 'getProjects' })
async getProjects(filters: ProjectFilters): Promise<Project[]>

// Generic fallback for any type
@McpTool({ name: 'data.getObjectsByType' })
async getObjectsByType(type: string, filters: Record<string, any>): Promise<GraphObject[]>

// Relationship tools - also specific
@McpTool({ name: 'getTaskAssignees' })
async getTaskAssignees(task_id: string): Promise<Person[]>

@McpTool({ name: 'getPersonTasks' })
async getPersonTasks(person_id: string): Promise<Task[]>

@McpTool({ name: 'getTaskDependencies' })
async getTaskDependencies(task_id: string): Promise<Task[]>

@McpTool({ name: 'getPersonManager' })
async getPersonManager(person_id: string): Promise<Person | null>

// Generic fallback for relationships
@McpTool({ name: 'data.getRelatedObjects' })
async getRelatedObjects(source_type: string, source_id: string, rel_type: string): Promise<GraphObject[]>
```

### Benefits
✅ **Best discoverability** - Specific tools are front and center  
✅ **Flexibility** - Generic tools handle edge cases  
✅ **Future-proof** - New types can use generic tools until they're common enough for specific tools  
✅ **Progressive enhancement** - Start generic, add specific tools as needed  

---

## Real-World Agent Experience Comparison

### Scenario: "Show me high-priority tasks assigned to John"

#### With Generic Tools (Current)
```
Agent sees tool list:
- schema.getTemplatePacks
- schema.getTemplatePackDetails
- data.getObjectsByType
- data.getObjectById
- data.getRelatedObjects

Agent reasoning:
1. Call schema.getTemplatePacks() to find available types
2. Call schema.getTemplatePackDetails() to understand Task structure
3. Call data.getObjectsByType("Task") to get all tasks
4. Filter in memory for priority="high"
5. For each task, call data.getRelatedObjects() to find assignee
6. Filter for John

Total calls: 2 schema + 1 data + N relationship calls
```

#### With Specific Tools (Recommended)
```
Agent sees tool list:
- getPersons
- getTasks
- getTaskAssignees
- getPerson
- getTask
- ... (clear, descriptive names)

Agent reasoning:
1. Call getPersons({ name: "John" }) to find John's ID
2. Call getTasks({ priority: "high", assignee_id: john_id })

Total calls: 2
```

**Result**: 2 calls vs 2+N calls, much simpler logic!

---

## Recommendation: Hybrid Approach

### Phase 1: Core Specific Tools (Week 1-2)
Implement specific tools for the most common object types in your current template packs:

```typescript
// Object retrieval
getPersons(filters?)
getTasks(filters?)
getProjects(filters?)
getDocuments(filters?)

// Single object
getPerson(id)
getTask(id)
getProject(id)
getDocument(id)

// Common relationships
getTaskAssignees(task_id)
getPersonTasks(person_id)
getProjectTasks(project_id)
getTaskDependencies(task_id)
getPersonManager(person_id)
getPersonDirectReports(person_id)
```

### Phase 2: Generic Fallbacks (Week 2)
Keep generic tools for flexibility:

```typescript
// Fallback for unknown types
data.getObjectsByType(type, filters?)
data.getObjectById(type, id)
data.getRelatedObjects(source_type, source_id, relationship_type)

// Schema discovery (still needed)
schema.getTemplatePacks()
schema.getTemplatePackDetails(pack_id)
```

### Phase 3: Code Generation (Future)
Auto-generate specific tools from template pack schemas:

```typescript
// Read template pack schema
const schema = loadTemplatePack("project-mgmt-pack-v1");

// Generate specific tools
for (const objectType of schema.objectTypeSchemas) {
  generateToolForType(objectType);
}

// Result: Automatic getPersons(), getTasks(), etc.
```

---

## Implementation Strategy

### 1. Tool Generator Service
Create a service that generates specific tools from schemas:

```typescript
// apps/server/src/modules/mcp/services/tool-generator.service.ts

@Injectable()
export class ToolGeneratorService {
  generateToolsForSchema(schema: TemplatePackSchema): McpTool[] {
    const tools = [];
    
    // For each object type, generate:
    // - get{Type}s(filters) - list with filters
    // - get{Type}(id) - single by ID
    
    for (const objectType of schema.objectTypeSchemas) {
      tools.push(this.generateListTool(objectType));
      tools.push(this.generateGetByIdTool(objectType));
    }
    
    // For each relationship type, generate:
    // - get{From}{Relationship}{To}(id)
    
    for (const relType of schema.relationshipTypeSchemas) {
      tools.push(this.generateRelationshipTool(relType));
    }
    
    return tools;
  }
  
  private generateListTool(objectType: ObjectTypeSchema): McpTool {
    const toolName = `get${pluralize(objectType.name)}`;
    const filters = this.extractFilterableProperties(objectType);
    
    return {
      name: toolName,
      description: `Get all ${pluralize(objectType.name)} with optional filters`,
      parameters: [...filters, 'limit', 'offset'],
      handler: async (params) => {
        return this.graphService.getObjectsByType(
          objectType.name,
          params
        );
      }
    };
  }
}
```

### 2. Dynamic Tool Registration
Register generated tools at startup:

```typescript
// apps/server/src/modules/mcp/mcp.module.ts

@Module({
  imports: [TemplatePackModule, GraphModule],
  providers: [
    ToolGeneratorService,
    {
      provide: 'MCP_TOOLS',
      useFactory: async (
        toolGenerator: ToolGeneratorService,
        templatePackService: TemplatePackService,
      ) => {
        const packs = await templatePackService.listTemplatePacks();
        const tools = [];
        
        for (const pack of packs) {
          const schema = await templatePackService.getTemplatePackById(pack.id);
          tools.push(...toolGenerator.generateToolsForSchema(schema));
        }
        
        // Also add generic fallback tools
        tools.push(new GenericDataTool());
        
        return tools;
      },
      inject: [ToolGeneratorService, TemplatePackService],
    },
  ],
})
export class McpModule {}
```

### 3. Tool Naming Conventions
```
Object retrieval (plural):
  get{ObjectType}s(filters?)
  Examples: getPersons, getTasks, getProjects

Single object (singular):
  get{ObjectType}(id)
  Examples: getPerson, getTask, getProject

Relationships (descriptive):
  get{SourceType}{Relationship}{TargetType}(source_id)
  Examples:
    - getTaskAssignees(task_id) → Person[]
    - getPersonTasks(person_id) → Task[]
    - getTaskDependencies(task_id) → Task[]
    - getPersonManager(person_id) → Person | null
    
Generic fallbacks (namespaced):
  data.getObjectsByType(type, filters?)
  data.getObjectById(type, id)
  data.getRelatedObjects(source_type, source_id, rel_type)
```

---

## Migration Path

### From Original Design to Hybrid

**Step 1**: Implement specific tools alongside generic tools
```typescript
// Keep existing
data.getObjectsByType()
data.getObjectById()
data.getRelatedObjects()

// Add new
getPersons()
getTasks()
getPerson()
getTask()
getTaskAssignees()
// etc.
```

**Step 2**: Update AI Agent Service to prefer specific tools
```typescript
// AI agent logic: try specific tool first
if (toolExists(`get${pluralize(type)}`)) {
  return callSpecificTool(`get${pluralize(type)}`, filters);
} else {
  return callGenericTool('data.getObjectsByType', type, filters);
}
```

**Step 3**: Gradually deprecate generic tools (optional)
```typescript
// Mark as deprecated but keep functional
@McpTool({
  name: 'data.getObjectsByType',
  description: 'DEPRECATED: Use specific tools like getPersons(), getTasks() instead',
  deprecated: true,
})
```

---

## Performance Considerations

### Specific Tools Can Be Optimized

```typescript
// Generic tool - can't optimize for specific filters
@McpTool({ name: 'data.getObjectsByType' })
async getObjectsByType(type: string, filters: any) {
  // Must handle any filter on any type
  // Hard to add proper indexes
  return this.graphService.query(type, filters);
}

// Specific tool - can optimize for common queries
@McpTool({ name: 'getTasks' })
async getTasks(filters: TaskFilters) {
  // Can use indexed query for status + assignee
  if (filters.status && filters.assignee_id) {
    return this.graphService.getTasksByStatusAndAssignee(
      filters.status,
      filters.assignee_id
    );
  }
  
  // Can use indexed query for priority
  if (filters.priority) {
    return this.graphService.getTasksByPriority(filters.priority);
  }
  
  // Fall back to generic query
  return this.graphService.getTasksGeneric(filters);
}
```

---

## Conclusion

**Recommendation**: Implement the **Hybrid Approach**

### Key Benefits
1. **Better DX**: AI agents find tools easily
2. **Type Safety**: Specific parameters per type
3. **Performance**: Can optimize common queries
4. **Flexibility**: Generic fallback for edge cases
5. **Future-Proof**: Auto-generate from schemas

### Implementation Priority
1. ✅ **Week 1-2**: Implement core specific tools (Person, Task, Project)
2. ✅ **Week 2**: Keep generic fallback tools
3. ✅ **Week 3**: Auto-generation from schemas
4. ✅ **Week 4**: Performance optimization

### Success Metrics
- AI agent can answer "Show me all tasks" in **1 tool call** (vs 3+)
- Tool discovery time: **< 1 second** (instant from tool list)
- Query response time: **< 500ms** for common queries
- Developer happiness: **⭐⭐⭐⭐⭐** (clear, intuitive API)

---

## Next Steps

1. Update `docs/mcp-server-implementation-plan.md` to reflect hybrid approach
2. Design specific tool signatures for Person, Task, Project
3. Implement ToolGeneratorService
4. Update AI Agent Service to prefer specific tools
5. Create migration guide for existing code

