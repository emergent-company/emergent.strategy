# Change: Add Object Templates Studio

## Why

Users currently have no way to iteratively create or modify template pack definitions through natural language. The existing Settings > Templates page only allows installing/uninstalling pre-built template packs. Users who want custom schemas for their domain (e.g., custom entity types, specific relationship constraints, tailored extraction prompts) must manually write JSON schemas or use the Discovery Wizard which requires sample documents. An LLM-powered studio would allow users to describe their schema requirements conversationally ("I need a Decision type with rationale, status, and stakeholders properties") and iteratively refine the definition until it meets their needs.

## What Changes

### New Capability: Template Pack Studio

A new page where users can:

1. **Create new template packs** via LLM chat - describe object types, relationships, and constraints in natural language
2. **Edit existing template packs** via LLM chat - load an existing pack and refine it through conversation
3. **Preview schema changes** in real-time - see JSON Schema, UI config, and extraction prompt previews
4. **Version control** - save as new version (for existing packs) or create as new pack
5. **Validate schemas** - ensure generated schemas are valid JSON Schema and compatible with the system

### UI Structure

Two-panel layout (similar to Object Refinement Chat):

- **Left Panel: Schema Preview** - Live preview of the template pack definition showing:
  - Object type schemas (JSON Schema format)
  - Relationship type definitions
  - UI configurations (icons, colors)
  - Extraction prompts per type
- **Right Panel: Chat Interface** - LLM chat for iterative refinement:
  - Natural language input for describing changes
  - AI suggestions rendered as diffs/changes
  - Accept/reject individual changes
  - Conversation history

### Backend Changes

- New `TemplatePackStudioService` for context assembly and change application
- New `/api/template-packs/studio/:packId?/chat` endpoint (packId optional for new packs)
- Extend `GraphTemplatePack` entity with versioning support (parent_version_id)
- LangGraph agent with template-specific tools (validate_schema, suggest_properties, etc.)

### Frontend Changes

- New `/admin/templates/studio` route
- New `TemplatePackStudio` page component
- New `SchemaPreviewPanel` component for live schema visualization
- New `TemplateStudioChat` component (based on `ObjectRefinementChat` pattern)
- Integration with existing template pack management

## Impact

- **Affected specs**:
  - NEW: `template-pack-studio` (new capability)
- **Affected code**:
  - `apps/server/src/modules/template-packs/` - new studio service and controller
  - `apps/server/src/modules/langgraph/` - new template studio agent
  - `apps/admin/src/pages/admin/pages/templates/` - new studio page
  - `apps/admin/src/components/organisms/TemplateStudio/` - new components
  - `apps/admin/src/hooks/` - new hook for template studio chat
- **Database changes**:
  - New column: `kb.graph_template_packs.parent_version_id` (for version lineage)
  - New column: `kb.graph_template_packs.draft` (boolean, for work-in-progress)
  - New table: `kb.template_pack_studio_conversations` (chat history for studio sessions)
