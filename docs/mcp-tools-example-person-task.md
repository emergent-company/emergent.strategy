# MCP Tools Example: Person and Task Objects

This document demonstrates how MCP tools would work with concrete object types: **Person** and **Task**.

## 1. Schema Definition

### Template Pack: "Project Management Pack v1"

```json
{
  "id": "project-mgmt-pack-v1",
  "name": "Project Management Pack",
  "version": "1.0.0",
  "description": "Template pack for managing people and tasks",
  "objectTypeSchemas": [
    {
      "name": "Person",
      "properties": {
        "name": { "type": "string", "description": "Full name" },
        "email": { "type": "string", "description": "Email address" },
        "role": { "type": "string", "description": "Job role" },
        "department": { "type": "string", "description": "Department name" },
        "skills": { "type": "array", "items": { "type": "string" } }
      },
      "required": ["name", "email"]
    },
    {
      "name": "Task",
      "properties": {
        "title": { "type": "string", "description": "Task title" },
        "description": { "type": "string", "description": "Detailed description" },
        "status": { 
          "type": "string", 
          "enum": ["todo", "in_progress", "done", "blocked"],
          "description": "Current status" 
        },
        "priority": { 
          "type": "string", 
          "enum": ["low", "medium", "high", "critical"] 
        },
        "due_date": { "type": "string", "format": "date" },
        "estimated_hours": { "type": "number" }
      },
      "required": ["title", "status"]
    }
  ],
  "relationshipTypeSchemas": [
    {
      "name": "assigned_to",
      "from_object_type": "Task",
      "to_object_type": "Person",
      "description": "Links a task to the person assigned to work on it",
      "properties": {
        "assigned_date": { "type": "string", "format": "date" },
        "assignment_type": { "type": "string", "enum": ["owner", "contributor", "reviewer"] }
      }
    },
    {
      "name": "created_by",
      "from_object_type": "Task",
      "to_object_type": "Person",
      "description": "Links a task to the person who created it"
    },
    {
      "name": "reports_to",
      "from_object_type": "Person",
      "to_object_type": "Person",
      "description": "Organizational hierarchy - who reports to whom"
    },
    {
      "name": "depends_on",
      "from_object_type": "Task",
      "to_object_type": "Task",
      "description": "Task dependency - one task must be completed before another can start"
    }
  ]
}
```

---

## 2. AI Agent Workflow Examples

### Example 1: Discovering the Schema

**AI Agent Query**: "What data can I work with?"

**Tool Call 1**: `schema.getTemplatePacks()`
```json
{
  "success": true,
  "data": [
    {
      "id": "project-mgmt-pack-v1",
      "name": "Project Management Pack",
      "version": "1.0.0",
      "description": "Template pack for managing people and tasks"
    }
  ]
}
```

**Tool Call 2**: `schema.getTemplatePackDetails({ pack_id: "project-mgmt-pack-v1" })`
```json
{
  "success": true,
  "data": {
    "id": "project-mgmt-pack-v1",
    "name": "Project Management Pack",
    "version": "1.0.0",
    "objectTypeSchemas": [
      {
        "name": "Person",
        "properties": { "...": "..." }
      },
      {
        "name": "Task",
        "properties": { "...": "..." }
      }
    ],
    "relationshipTypeSchemas": [
      {
        "name": "assigned_to",
        "from_object_type": "Task",
        "to_object_type": "Person"
      },
      "..."
    ]
  }
}
```

**AI Agent Response**: "I can work with People and Tasks. Tasks can be assigned to people, have statuses, priorities, and dependencies on other tasks."

---

### Example 2: Finding All Tasks

**User Question**: "Show me all tasks"

**Tool Call**: `data.getObjectsByType({ object_type: "Task", limit: 50 })`

```json
{
  "success": true,
  "data": [
    {
      "id": "task-001",
      "type": "Task",
      "name": "Implement authentication",
      "properties": {
        "title": "Implement authentication",
        "description": "Add JWT-based authentication to the API",
        "status": "in_progress",
        "priority": "high",
        "due_date": "2025-10-25",
        "estimated_hours": 16
      },
      "created_at": "2025-10-15T10:00:00Z",
      "updated_at": "2025-10-20T14:30:00Z"
    },
    {
      "id": "task-002",
      "type": "Task",
      "name": "Write API documentation",
      "properties": {
        "title": "Write API documentation",
        "description": "Document all REST endpoints using OpenAPI",
        "status": "todo",
        "priority": "medium",
        "due_date": "2025-10-30",
        "estimated_hours": 8
      },
      "created_at": "2025-10-16T09:00:00Z",
      "updated_at": "2025-10-16T09:00:00Z"
    },
    {
      "id": "task-003",
      "type": "Task",
      "name": "Fix login bug",
      "properties": {
        "title": "Fix login bug",
        "description": "Users can't login with special characters in password",
        "status": "blocked",
        "priority": "critical",
        "due_date": "2025-10-22",
        "estimated_hours": 4
      },
      "created_at": "2025-10-18T11:00:00Z",
      "updated_at": "2025-10-19T16:00:00Z"
    }
  ],
  "metadata": {
    "count": 3,
    "limit": 50,
    "offset": 0
  }
}
```

**AI Agent Response**: 
"I found 3 tasks:
1. **Implement authentication** (High priority, In Progress) - Due Oct 25
2. **Write API documentation** (Medium priority, Todo) - Due Oct 30  
3. **Fix login bug** (Critical priority, Blocked) - Due Oct 22"

---

### Example 3: Finding a Specific Person

**User Question**: "Who is John Smith?"

**Tool Call**: First, search for people (we'd need a search tool, but for now using getObjectsByType)
`data.getObjectsByType({ object_type: "Person", limit: 100 })`

Then filter in AI agent memory for "John Smith", or:

**Tool Call**: `data.getObjectById({ object_type: "Person", object_id: "person-123" })`

```json
{
  "success": true,
  "data": {
    "id": "person-123",
    "type": "Person",
    "name": "John Smith",
    "properties": {
      "name": "John Smith",
      "email": "john.smith@example.com",
      "role": "Senior Software Engineer",
      "department": "Engineering",
      "skills": ["TypeScript", "React", "Node.js", "PostgreSQL"]
    },
    "created_at": "2025-01-10T08:00:00Z",
    "updated_at": "2025-10-01T12:00:00Z"
  }
}
```

**AI Agent Response**:
"John Smith is a Senior Software Engineer in the Engineering department. His email is john.smith@example.com. His skills include TypeScript, React, Node.js, and PostgreSQL."

---

### Example 4: Finding Tasks Assigned to a Person

**User Question**: "What tasks is John Smith working on?"

**Step 1**: Get John's person ID (from previous query or search)

**Step 2**: Get tasks assigned to John
**Tool Call**: `data.getRelatedObjects({ 
  source_object_type: "Person", 
  source_object_id: "person-123",
  relationship_type: "assigned_to"
})`

Wait, this is backwards! The relationship goes from Task → Person. So we need to think about this differently...

**Better Approach**: Query tasks, then filter by relationship
**Tool Call**: `data.getObjectsByType({ object_type: "Task", limit: 100 })`

Then for each task, call:
**Tool Call**: `data.getRelatedObjects({
  source_object_type: "Task",
  source_object_id: "task-001",
  relationship_type: "assigned_to"
})`

```json
{
  "success": true,
  "data": [
    {
      "id": "person-123",
      "type": "Person",
      "name": "John Smith",
      "properties": { "...": "..." }
    }
  ],
  "metadata": {
    "count": 1,
    "source": {
      "type": "Task",
      "id": "task-001"
    },
    "relationship_type": "assigned_to"
  }
}
```

**AI Agent Response**:
"John Smith is working on 2 tasks:
1. **Implement authentication** (High priority, In Progress)
2. **Fix login bug** (Critical priority, Blocked)"

---

### Example 5: Finding All People in a Department

**User Question**: "Who works in Engineering?"

**Tool Call**: `data.getObjectsByType({ object_type: "Person", limit: 100 })`

Filter by `department === "Engineering"` in the AI agent's logic.

```json
{
  "success": true,
  "data": [
    {
      "id": "person-123",
      "type": "Person",
      "name": "John Smith",
      "properties": {
        "name": "John Smith",
        "email": "john.smith@example.com",
        "role": "Senior Software Engineer",
        "department": "Engineering"
      }
    },
    {
      "id": "person-456",
      "type": "Person",
      "name": "Sarah Johnson",
      "properties": {
        "name": "Sarah Johnson",
        "email": "sarah.j@example.com",
        "role": "Engineering Manager",
        "department": "Engineering"
      }
    },
    {
      "id": "person-789",
      "type": "Person",
      "name": "Mike Chen",
      "properties": {
        "name": "Mike Chen",
        "email": "mike.chen@example.com",
        "role": "DevOps Engineer",
        "department": "Engineering"
      }
    }
  ]
}
```

**AI Agent Response**:
"There are 3 people in Engineering:
1. **John Smith** - Senior Software Engineer
2. **Sarah Johnson** - Engineering Manager
3. **Mike Chen** - DevOps Engineer"

---

### Example 6: Finding Task Dependencies

**User Question**: "What tasks need to be done before we can start the API documentation task?"

**Tool Call**: `data.getRelatedObjects({
  source_object_type: "Task",
  source_object_id: "task-002",  // API documentation task
  relationship_type: "depends_on"
})`

```json
{
  "success": true,
  "data": [
    {
      "id": "task-001",
      "type": "Task",
      "name": "Implement authentication",
      "properties": {
        "title": "Implement authentication",
        "status": "in_progress",
        "priority": "high"
      }
    }
  ],
  "metadata": {
    "count": 1,
    "source": {
      "type": "Task",
      "id": "task-002"
    },
    "relationship_type": "depends_on"
  }
}
```

**AI Agent Response**:
"The API documentation task depends on **Implement authentication** (currently In Progress). Once that's done, you can start on the documentation."

---

### Example 7: Complex Multi-Step Query

**User Question**: "Show me all high-priority tasks that are blocked and tell me who they're assigned to"

**Step 1**: Get all tasks
**Tool Call**: `data.getObjectsByType({ object_type: "Task" })`

**Step 2**: Filter for high priority + blocked status (in agent logic)

**Step 3**: For each matching task, get assigned person
**Tool Call**: `data.getRelatedObjects({
  source_object_type: "Task",
  source_object_id: "task-003",
  relationship_type: "assigned_to"
})`

```json
{
  "success": true,
  "data": [
    {
      "id": "person-123",
      "type": "Person",
      "name": "John Smith",
      "properties": { "...": "..." }
    }
  ]
}
```

**AI Agent Response**:
"There is 1 high-priority blocked task:
- **Fix login bug** (Critical priority) - Assigned to John Smith (john.smith@example.com)"

---

### Example 8: Finding Who Created a Task

**User Question**: "Who created the authentication task?"

**Tool Call**: `data.getRelatedObjects({
  source_object_type: "Task",
  source_object_id: "task-001",
  relationship_type: "created_by"
})`

```json
{
  "success": true,
  "data": [
    {
      "id": "person-456",
      "type": "Person",
      "name": "Sarah Johnson",
      "properties": {
        "name": "Sarah Johnson",
        "role": "Engineering Manager"
      }
    }
  ],
  "metadata": {
    "count": 1,
    "source": {
      "type": "Task",
      "id": "task-001"
    },
    "relationship_type": "created_by"
  }
}
```

**AI Agent Response**:
"The authentication task was created by Sarah Johnson, who is the Engineering Manager."

---

### Example 9: Organizational Hierarchy

**User Question**: "Who does John Smith report to?"

**Tool Call**: `data.getRelatedObjects({
  source_object_type: "Person",
  source_object_id: "person-123",
  relationship_type: "reports_to"
})`

```json
{
  "success": true,
  "data": [
    {
      "id": "person-456",
      "type": "Person",
      "name": "Sarah Johnson",
      "properties": {
        "name": "Sarah Johnson",
        "role": "Engineering Manager"
      }
    }
  ]
}
```

**AI Agent Response**:
"John Smith reports to Sarah Johnson, the Engineering Manager."

---

## 3. Tool Implementation Details

### Schema Tool Usage

```typescript
// AI Agent discovers available schemas
const packs = await schemaTool.getTemplatePacks();
// Returns: [{ id: "project-mgmt-pack-v1", name: "...", version: "..." }]

// AI Agent loads specific schema details
const schema = await schemaTool.getTemplatePackDetails("project-mgmt-pack-v1");
// Returns: Full schema with Person, Task types and their relationships
```

### Data Tool Usage

```typescript
// Get all tasks
const tasks = await dataTool.getObjectsByType("Task", 50, 0);

// Get specific person
const person = await dataTool.getObjectById("Person", "person-123");

// Get tasks assigned to a person (traversing relationship)
const assignedTasks = await dataTool.getRelatedObjects(
  "Task",           // source type
  "task-001",       // source ID
  "assigned_to"     // relationship type
);
// Returns: Array of Person objects
```

---

## 4. Advanced Scenarios

### Scenario A: Workload Analysis

**User**: "How many tasks does each person have?"

**Agent Strategy**:
1. Get all people: `data.getObjectsByType("Person")`
2. Get all tasks: `data.getObjectsByType("Task")`
3. For each task, get assigned person: `data.getRelatedObjects(task, "assigned_to")`
4. Aggregate counts by person
5. Present summary

**Response**: 
"Task distribution:
- John Smith: 2 tasks
- Sarah Johnson: 1 task
- Mike Chen: 0 tasks"

---

### Scenario B: Critical Path Analysis

**User**: "What's blocking our critical tasks?"

**Agent Strategy**:
1. Get all tasks with priority="critical"
2. Filter for status="blocked"
3. For each blocked task, get dependencies: `data.getRelatedObjects(task, "depends_on")`
4. Check status of dependent tasks

**Response**:
"The critical 'Fix login bug' task is blocked. It depends on 'Implement authentication' which is still in progress."

---

### Scenario C: Skills Matching

**User**: "Who has TypeScript skills?"

**Agent Strategy**:
1. Get all people: `data.getObjectsByType("Person")`
2. Filter by skills array containing "TypeScript"
3. Return matches

**Response**:
"2 people have TypeScript skills:
- John Smith (Senior Software Engineer)
- Mike Chen (DevOps Engineer)"

---

## 5. Potential Tool Enhancements

### Additional Tools That Would Be Useful

```typescript
// Search tool with filters
data.searchObjects({
  object_type: "Task",
  filters: {
    status: "blocked",
    priority: ["high", "critical"]
  }
})

// Reverse relationship traversal
data.getObjectsRelatedTo({
  target_object_type: "Person",
  target_object_id: "person-123",
  relationship_type: "assigned_to"
})
// Returns: All tasks assigned to this person

// Aggregation tool
data.aggregateObjects({
  object_type: "Task",
  group_by: "status",
  count: true
})
// Returns: { todo: 5, in_progress: 3, done: 12, blocked: 1 }

// Path finding
data.findPath({
  from_type: "Task",
  from_id: "task-001",
  to_type: "Task",
  to_id: "task-005",
  via_relationship: "depends_on"
})
// Returns: Chain of dependencies between tasks
```

---

## 6. Key Insights

### What Works Well
✅ Schema discovery is straightforward  
✅ Single object retrieval is efficient  
✅ Direct relationship traversal works well  
✅ Type system is clear and consistent  

### What's Challenging
⚠️ Need to fetch all objects to filter by properties  
⚠️ Reverse relationship queries require iteration  
⚠️ Complex multi-hop queries require multiple tool calls  
⚠️ No built-in aggregation or counting  

### Recommendations
1. **Add search/filter tool** for property-based queries
2. **Add reverse relationship tool** for bidirectional traversal
3. **Add aggregation tool** for analytics queries
4. **Consider caching** frequently accessed schemas
5. **Add pagination** for large result sets

---

## 7. Summary

The MCP tools provide a **solid foundation** for AI agents to:
- Discover what data exists (schema tools)
- Query objects by type and ID (data tools)
- Traverse relationships between objects (data tools)

For the **Person and Task** example, an AI agent can:
- List all tasks and people
- Find who is assigned to what task
- Navigate organizational hierarchies
- Trace task dependencies
- Answer complex questions by combining multiple tool calls

The architecture is **flexible and extensible**, allowing for additional tools to be added as needed based on actual usage patterns and user questions.
