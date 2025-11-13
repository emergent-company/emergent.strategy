# Chat Prompt Templates

## Overview

The chat system supports **custom prompt templates** stored per-project in the database. This allows users to customize how the LLM responds to chat messages by defining their own prompt structure with placeholder replacement.

## Features

- **Per-Project Customization**: Each project can have its own prompt template
- **Placeholder System**: Templates support dynamic content injection
- **Database-Backed**: Templates stored in `kb.projects.chat_prompt_template` column
- **Fallback to Default**: Projects without custom templates use the system default
- **UI-Editable**: Templates can be edited through the admin interface (coming soon)

## Supported Placeholders

### {{SYSTEM_PROMPT}}
System-level instructions that define the assistant's role and behavior. Includes intent-specific instructions based on query type.

**Example content:**
```
You are a helpful assistant specialized in knowledge graphs and data schemas. 
IMPORTANT: Always respond using proper markdown formatting.

When presenting entity query results, respond with a brief introduction and 
then format each entity as a structured object reference...
```

### {{MCP_CONTEXT}}
Context retrieved from MCP (Model Context Protocol) tool execution. Includes schema information, version data, type definitions, etc.

**Example content:**
```
## Context from Schema

### Schema Version
Current version: 1.2.0
Last updated: 2024-10-20
```

### {{GRAPH_CONTEXT}}
Relevant knowledge graph objects and their relationships found through semantic search.

**Example content:**
```
## Context from Knowledge Graph

**Relevant Knowledge Graph Objects:**
- [Location] Sweden: Country in Northern Europe
  Related objects:
    • [City] Stockholm
    • [Organization] IKEA
- [Person] John Doe: Software engineer
```

### {{MESSAGE}}
The user's actual question or message.

**Example:** `"What are the main cities in Sweden?"`

### {{MARKDOWN_RULES}}
Formatting instructions for the LLM response, ensuring consistent markdown output.

**Example content:**
```
## Your Response

Provide a helpful, accurate answer based on the context above. Use proper markdown formatting:
- Use ### for headings
- Use - or * for unordered lists (with space after)
- Use 1. 2. 3. for ordered lists
- Use **text** for bold
- Use `code` for inline code
- Use proper blank lines between sections
```

## Default Template

When no custom template is configured, the system uses:

```
{{SYSTEM_PROMPT}}

{{MCP_CONTEXT}}

{{GRAPH_CONTEXT}}

## User Question

{{MESSAGE}}

{{MARKDOWN_RULES}}
```

## Example Custom Templates

### Simple Template
```
{{SYSTEM_PROMPT}}

User asked: {{MESSAGE}}

{{MARKDOWN_RULES}}
```

### Domain-Specific Template
```
You are a specialized assistant for {{DOMAIN}} knowledge.

{{GRAPH_CONTEXT}}

Question: {{MESSAGE}}

Please provide a concise answer with relevant examples.
```

### Research-Focused Template
```
{{SYSTEM_PROMPT}}

## Research Context

{{MCP_CONTEXT}}
{{GRAPH_CONTEXT}}

## Research Question

{{MESSAGE}}

## Analysis

Provide a comprehensive analysis including:
1. Direct answer with supporting evidence
2. Related concepts and connections
3. Potential follow-up questions

{{MARKDOWN_RULES}}
```

## Database Schema

```sql
-- Column added to kb.projects table
ALTER TABLE kb.projects
ADD COLUMN IF NOT EXISTS chat_prompt_template TEXT;

-- Column is nullable: NULL = use default template
COMMENT ON COLUMN kb.projects.chat_prompt_template IS 
  'Custom chat prompt template. Supports placeholders: 
   {{SYSTEM_PROMPT}}, {{MCP_CONTEXT}}, {{GRAPH_CONTEXT}}, 
   {{MESSAGE}}, {{MARKDOWN_RULES}}. If null, uses default template.';
```

## API Endpoints

### Get Project (includes template)
```http
GET /projects/:id
Headers:
  X-Org-ID: {org_id}
  X-Project-ID: {project_id}

Response:
{
  "id": "proj_123",
  "name": "My Project",
  "orgId": "org_456",
  "kb_purpose": "Research project",
  "chat_prompt_template": "{{SYSTEM_PROMPT}}\n\n{{MESSAGE}}"
}
```

### Update Project (set custom template)
```http
PATCH /projects/:id
Headers:
  X-Org-ID: {org_id}
  X-Project-ID: {project_id}
Content-Type: application/json

Body:
{
  "chat_prompt_template": "Your custom template here...\n\n{{MESSAGE}}"
}

Response:
{
  "id": "proj_123",
  "name": "My Project",
  "orgId": "org_456",
  "chat_prompt_template": "Your custom template here...\n\n{{MESSAGE}}"
}
```

### Reset to Default (set to null)
```http
PATCH /projects/:id
Headers:
  X-Org-ID: {org_id}
  X-Project-ID: {project_id}
Content-Type: application/json

Body:
{
  "chat_prompt_template": null
}
```

## Implementation Details

### Backend Components

1. **Database**: `kb.projects.chat_prompt_template` (TEXT, nullable)
2. **DTOs**: `ProjectDto` and `UpdateProjectDto` include `chat_prompt_template` field
3. **Service**: `ProjectsService.update()` and `getById()` handle the field
4. **Generation Service**: `ChatGenerationService.buildPrompt()` fetches and applies template
5. **Controller**: `ChatController` POST endpoint passes `projectId` to prompt builder

### Prompt Building Flow

```typescript
// 1. Chat endpoint receives message
POST /chat/stream
Headers: { X-Project-ID: "proj_123" }
Body: { message: "What are the main cities in Sweden?" }

// 2. Fetch custom template from database
const project = await projectsService.getById(projectId);
const template = project?.chat_prompt_template || DEFAULT_PROMPT_TEMPLATE;

// 3. Build context sections
const systemPrompt = buildSystemPrompt(detectedIntent);
const mcpContext = formatMcpContext(mcpToolResult);
const graphContext = formatGraphObjects(graphSearchResults);
const markdownRules = getMarkdownFormattingRules();

// 4. Replace placeholders
const prompt = template
  .replace(/\{\{SYSTEM_PROMPT\}\}/g, systemPrompt)
  .replace(/\{\{MCP_CONTEXT\}\}/g, mcpContext)
  .replace(/\{\{GRAPH_CONTEXT\}\}/g, graphContext)
  .replace(/\{\{MESSAGE\}\}/g, message)
  .replace(/\{\{MARKDOWN_RULES\}\}/g, markdownRules);

// 5. Send to LLM for generation
await llm.generate(prompt);
```

## Best Practices

### Template Design
1. **Always include {{MESSAGE}}** - Essential for user's question
2. **Use clear section headers** - Helps LLM understand structure
3. **Provide context before question** - Better LLM comprehension
4. **Include formatting instructions** - Consistent markdown output
5. **Test with various queries** - Ensure template works for different intents

### Placeholder Usage
- Don't include placeholders you won't use (empty sections)
- Order matters: system prompt → context → question → rules
- Use blank lines for readability
- Keep templates under 2KB for performance

### Validation
- Warn if {{MESSAGE}} placeholder is missing
- Limit template length (e.g., max 10KB)
- Provide preview/test functionality
- Allow reset to default

## Frontend Integration (Coming Soon)

### Template Editor Component
```tsx
<PromptTemplateEditor
  projectId={projectId}
  value={template}
  onChange={setTemplate}
  onSave={handleSave}
  onReset={handleReset}
/>
```

Features:
- Syntax highlighting for placeholders
- Live preview with sample data
- Placeholder documentation tooltip
- Validation warnings
- Reset to default button
- Save/cancel actions

## Testing

### Unit Tests
```typescript
it('should use custom template when project has one', async () => {
  // Mock project with custom template
  mockProjectsService.getById.mockResolvedValue({
    id: 'proj_123',
    chat_prompt_template: 'Custom: {{MESSAGE}}'
  });

  const prompt = await service.buildPrompt({
    message: 'Hello',
    projectId: 'proj_123'
  });

  expect(prompt).toContain('Custom: Hello');
  expect(prompt).not.toContain('{{MESSAGE}}'); // Placeholder replaced
});

it('should use default template when project has no custom template', async () => {
  mockProjectsService.getById.mockResolvedValue({
    id: 'proj_123',
    chat_prompt_template: null
  });

  const prompt = await service.buildPrompt({
    message: 'Hello',
    projectId: 'proj_123'
  });

  expect(prompt).toContain('## User Question');
  expect(prompt).toContain('Hello');
});
```

### E2E Tests
1. Create project without custom template → verify default used
2. Set custom template → verify used in chat
3. Update template → verify changes reflected
4. Reset to null → verify default used again
5. Test with all placeholders → verify correct replacement

## Migration

Applied: `20251021_add_chat_prompt_template.sql`

```sql
ALTER TABLE kb.projects
ADD COLUMN IF NOT EXISTS chat_prompt_template TEXT;

COMMENT ON COLUMN kb.projects.chat_prompt_template IS 
  'Custom chat prompt template. Supports placeholders: 
   {{SYSTEM_PROMPT}}, {{MCP_CONTEXT}}, {{GRAPH_CONTEXT}}, 
   {{MESSAGE}}, {{MARKDOWN_RULES}}. If null, uses default template.';
```

Status: ✅ Applied successfully

## Troubleshooting

### Template not being used
1. Check `chat_prompt_template` value in database: `SELECT chat_prompt_template FROM kb.projects WHERE id = 'proj_id'`
2. Verify projectId is being passed to `buildPrompt()` call
3. Check server logs for debug message: `"Using custom prompt template for project {projectId}"`

### Placeholders not replaced
- Ensure placeholder syntax is exact: `{{PLACEHOLDER}}` (double braces, uppercase)
- Check for typos: `{{MESAGE}}` vs `{{MESSAGE}}`
- Verify placeholder is supported (see list above)

### Empty sections in output
- Normal if context not available (e.g., no graph objects found)
- Template cleanup removes multiple consecutive newlines
- Check if placeholder has content before including in template

## Future Enhancements

1. **Template Library**: Pre-built templates for common use cases
2. **Template Variables**: Custom variables beyond system placeholders
3. **Conditional Sections**: Show/hide based on context availability
4. **Template Validation**: Schema validation for template structure
5. **Template Versioning**: Track changes and allow rollback
6. **Organization Templates**: Shared templates across projects
7. **Template Testing**: Interactive testing environment
8. **Template Analytics**: Track template effectiveness

## Related Files

- Migration: `apps/server/migrations/20251021_add_chat_prompt_template.sql`
- DTOs: `apps/server/src/modules/projects/dto/project.dto.ts`
- Service: `apps/server/src/modules/projects/projects.service.ts`
- Generation: `apps/server/src/modules/chat/chat-generation.service.ts`
- Controller: `apps/server/src/modules/chat/chat.controller.ts`
- Tests: `apps/server/src/modules/chat/__tests__/chat-generation.spec.ts`

## See Also

- [Graph Context Prompt Fix](./GRAPH_CONTEXT_PROMPT_FIX.md)
- [Chat System Documentation](./CHAT_SYSTEM.md)
- [MCP Integration](./MCP_INTEGRATION.md)
