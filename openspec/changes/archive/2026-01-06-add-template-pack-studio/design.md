## Context

The project already has:

1. **Template pack management** (`apps/server/src/modules/template-packs/`) - CRUD operations for template packs, project assignments
2. **Object refinement chat** (`apps/server/src/modules/object-refinement/`) - LLM-powered chat for refining extracted objects with suggestions
3. **Discovery wizard** - Multi-step wizard for discovering schemas from documents
4. **LangGraph integration** - Agent infrastructure with tool calling for chat features

The Template Pack Studio will reuse patterns from the object refinement chat but adapt them for schema editing rather than object property editing.

## Goals

- Enable users to create custom template packs through natural language conversation
- Provide real-time schema preview as users describe their requirements
- Support iterative refinement with accept/reject workflow for AI suggestions
- Allow versioning of template packs with clear lineage tracking
- Validate generated schemas against JSON Schema spec and system requirements

## Non-Goals

- Automated schema discovery from documents (covered by Discovery Wizard)
- Direct JSON editing (users can export and edit externally)
- Multi-user collaborative editing (single user per session)
- Schema migration tooling for existing objects (separate concern)

## Decisions

### Decision: Reuse Object Refinement Chat Pattern

- **What**: Adapt the two-panel chat + preview layout from ObjectRefinementChat
- **Why**: Proven UX pattern, shared components reduce maintenance, familiar to users
- **Alternatives**: Full-page editor, modal-based wizard, code editor with AI assist
- **Rationale**: The object refinement chat pattern has been validated for iterative AI-assisted editing

### Decision: Draft Mode for Work-in-Progress

- **What**: Template packs being edited in studio are marked as `draft: true` until explicitly saved
- **Why**: Prevents partial schemas from being installed in projects, allows abandoning sessions
- **Alternatives**: Auto-save with version history, session-only state
- **Rationale**: Explicit save aligns with user mental model of "I'm done editing"

### Decision: Version Lineage via parent_version_id

- **What**: New versions link to their parent via foreign key, not separate version table
- **Why**: Simpler schema, allows querying version history with recursive CTE, matches existing pattern
- **Alternatives**: Separate versions table, JSON changelog field
- **Rationale**: Keeps entity simple while enabling version traversal

### Decision: Suggestion-Based Edits Only

- **What**: AI suggests changes as structured diffs that user accepts/rejects
- **Why**: Maintains user control, creates clear audit trail, matches refinement chat pattern
- **Alternatives**: Direct AI edits without confirmation, inline editing with AI completion
- **Rationale**: User control is critical for schema authoring where mistakes are costly

## Risks / Trade-offs

- **Risk**: LLM generates invalid JSON Schema
  - Mitigation: Schema validation before suggestion is shown, error feedback to LLM
- **Risk**: Complex relationship constraints hard to express in natural language
  - Mitigation: Provide examples in system prompt, suggest follow-up questions
- **Risk**: Users expect more automation than iterative chat provides
  - Mitigation: Clear onboarding, link to Discovery Wizard for automated approach

## Migration Plan

1. Add database columns (non-breaking, nullable defaults)
2. Deploy backend service and API endpoints
3. Deploy frontend studio page (new route, no changes to existing)
4. Add navigation link to studio from Templates settings page

No rollback concerns - new feature, no changes to existing functionality.

## Open Questions

1. Should there be a "template library" of community-shared templates? (Out of scope for initial version)
2. Should we support importing schemas from external sources (JSON Schema URLs)? (Potential future enhancement)
3. Should the studio support relationship visualization in the preview? (Nice to have, not MVP)
