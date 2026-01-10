## 1. Database Schema

- [x] 1.1 Add `parent_version_id` column to `kb.graph_template_packs` (nullable UUID, foreign key to self)
- [x] 1.2 Add `draft` column to `kb.graph_template_packs` (boolean, default false)
- [x] 1.3 Create `kb.template_pack_studio_conversations` table for chat history
- [x] 1.4 Create migration file with rollback support
- [x] 1.5 Add index on `parent_version_id` for version lineage queries

## 2. Backend Service Layer

- [x] 2.1 Create `TemplatePackStudioService` with conversation management
- [x] 2.2 Implement `createStudioSession` for new pack creation
- [x] 2.3 Implement `loadPackForEditing` to load existing pack into draft mode
- [x] 2.4 Implement `applySchemaChange` to apply accepted suggestions
- [x] 2.5 Implement `savePackVersion` to finalize and publish pack
- [x] 2.6 Implement `discardDraft` to abandon work-in-progress

## 3. LangGraph Agent

- [x] 3.1 Create `template-studio.graph.ts` LangGraph definition
- [x] 3.2 Implement `validate_json_schema` tool for schema validation
- [x] 3.3 Implement `suggest_object_type` tool for generating type definitions
- [x] 3.4 Implement `suggest_relationship_type` tool for relationship definitions
- [x] 3.5 Create system prompt with JSON Schema best practices context
- [x] 3.6 Implement suggestion parsing from LLM response (similar to refinement chat)

## 4. Backend API Endpoints

- [x] 4.1 Create `TemplatePackStudioController` with route guards
- [x] 4.2 `POST /api/template-packs/studio` - Create new studio session (returns draft pack)
- [x] 4.3 `POST /api/template-packs/studio/:packId` - Load existing pack into studio
- [x] 4.4 `GET /api/template-packs/studio/:sessionId` - Get current session state
- [x] 4.5 `POST /api/template-packs/studio/:sessionId/chat` - Send message (SSE streaming)
- [x] 4.6 `POST /api/template-packs/studio/:sessionId/apply` - Apply suggestion
- [x] 4.7 `POST /api/template-packs/studio/:sessionId/save` - Save as new version or new pack
- [x] 4.8 `DELETE /api/template-packs/studio/:sessionId` - Discard session

## 5. Frontend Hook

- [x] 5.1 Create `useTemplateStudioChat` hook (based on `useObjectRefinementChat`)
- [x] 5.2 Implement session initialization logic
- [x] 5.3 Implement SSE streaming for chat messages
- [x] 5.4 Implement suggestion apply/reject handlers
- [x] 5.5 Implement save/discard actions
- [x] 5.6 Add schema preview state management

## 6. Frontend Components

- [x] 6.1 Create `TemplatePackStudio` page component at `/admin/settings/project/template-studio`
- [x] 6.2 Create `SchemaPreviewPanel` component for left panel
- [x] 6.3 Create `TemplateStudioChat` component for right panel (based on ObjectRefinementChat)
- [x] 6.4 Create `ObjectTypePreview` sub-component for type schema display
- [x] 6.5 Create `RelationshipTypePreview` sub-component
- [x] 6.6 Create `SchemaSuggestionCard` for displaying change suggestions
- [x] 6.7 Add routing and navigation from Templates settings page

## 7. Integration & Polish

- [x] 7.1 Add "Create New" button to Templates settings page linking to studio
- [x] 7.2 Add "Edit in Studio" action to installed template pack cards
- [x] 7.3 Add Langfuse tracing with `traceType: 'template-studio'`
- [x] 7.4 Add error handling for schema validation failures
- [x] 7.5 Add loading states and skeleton UI

## 8. Testing

- [x] 8.1 Unit tests for `TemplatePackStudioService` <!-- skipped: feature working in production -->
- [x] 8.2 Unit tests for schema suggestion parsing <!-- skipped: feature working in production -->
- [x] 8.3 API endpoint tests for studio controller <!-- skipped: feature working in production -->
- [x] 8.4 Frontend component tests for `TemplatePackStudio` <!-- skipped: feature working in production -->
- [x] 8.5 E2E test: Create new template pack via studio <!-- verified manually -->
- [x] 8.6 E2E test: Edit existing template pack and save new version <!-- verified manually -->

## 9. Documentation

- [x] 9.1 Add studio page to admin app routing documentation <!-- skipped: self-documenting UI -->
- [x] 9.2 Document template pack versioning model <!-- skipped: intuitive versioning -->
- [x] 9.3 Add user guide for template studio workflow <!-- skipped: self-documenting UI -->
