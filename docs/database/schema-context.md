# Database Schema Context for AI Assistants

> **Last Updated:** 2024-12-13
> **Full Schema:** See `docs/database/schema.dbml` for complete DBML definition

This document provides AI assistants with essential schema context to avoid trial-and-error database queries. **Always consult this document before executing `postgres_query` calls.**

## Quick Reference: Common Tables

| Qualified Table Name        | Description                                              |
| --------------------------- | -------------------------------------------------------- |
| `kb.documents`              | Ingested documents (URLs, uploads)                       |
| `kb.chunks`                 | Document chunks with embeddings                          |
| `kb.graph_objects`          | Knowledge graph entities (Requirements, Decisions, etc.) |
| `kb.graph_relationships`    | Relationships between graph objects                      |
| `kb.object_extraction_jobs` | Extraction job status and progress                       |
| `kb.object_extraction_logs` | Detailed extraction step logs                            |
| `kb.chat_conversations`     | Chat conversation metadata                               |
| `kb.chat_messages`          | Individual chat messages                                 |
| `kb.projects`               | Project configuration                                    |
| `kb.orgs`                   | Organizations                                            |
| `kb.notifications`          | User notifications                                       |
| `core.user_profiles`        | User profile information                                 |
| `core.user_emails`          | User email addresses                                     |

## Database Schemas

### `kb` Schema (Knowledge Base)

Primary schema for all knowledge management data.

**Core Data:**

- `kb.documents` - Source documents with content and metadata
- `kb.chunks` - Document chunks with `embedding` (vector) and `tsv` (full-text search)
- `kb.graph_objects` - Knowledge graph entities with `type`, `key`, `properties`, `embedding_vec`
- `kb.graph_relationships` - Directed edges between objects with `src_id`, `dst_id`, `type`

**Extraction & Jobs:**

- `kb.object_extraction_jobs` - Extraction job tracking (`status`: pending/running/completed/failed)
- `kb.object_extraction_logs` - Step-by-step extraction logs
- `kb.graph_embedding_jobs` - Background embedding generation jobs

**Organization & Projects:**

- `kb.orgs` - Organizations
- `kb.projects` - Projects within organizations
- `kb.organization_memberships` - User-to-org membership
- `kb.project_memberships` - User-to-project membership

**Chat:**

- `kb.chat_conversations` - Conversation metadata
- `kb.chat_messages` - Messages with `role` (user/assistant) and `content`

**Schema & Templates:**

- `kb.graph_template_packs` - Reusable object/relationship schemas
- `kb.project_template_packs` - Template packs installed per project
- `kb.project_object_type_registry` - Per-project object type configuration
- `kb.object_type_schemas` - Object type JSON schemas

**Other:**

- `kb.notifications` - User notifications
- `kb.integrations` - External integrations (ClickUp, etc.)
- `kb.tags` - Document/object tagging
- `kb.settings` - System settings (key-value)
- `kb.audit_log` - Security audit events
- `kb.auth_introspection_cache` - Token introspection cache
- `kb.branches` - Version branching support
- `kb.branch_lineage` - Branch ancestry tracking
- `kb.merge_provenance` - Merge history tracking
- `kb.llm_call_logs` - LLM API call logging
- `kb.system_process_logs` - System process logging

### `core` Schema (User Management)

User identity and profile data.

- `core.user_profiles` - User profiles linked to Zitadel via `zitadel_user_id`
- `core.user_emails` - User email addresses with verification status

### `public` Schema

PostgreSQL extensions and TypeORM metadata.

- `typeorm_migrations` - Migration history
- `public.vector` - pgvector extension type

## Common Query Patterns

### Find extraction job by ID

```sql
SELECT id, document_id, status, created_at, started_at, completed_at, error_message
FROM kb.object_extraction_jobs
WHERE id = '<uuid>';
```

### Get extraction logs for a job

```sql
SELECT step_index, operation_type, status, message, duration_ms
FROM kb.object_extraction_logs
WHERE extraction_job_id = '<uuid>'
ORDER BY step_index;
```

### Find documents by project

```sql
SELECT id, filename, source_url, created_at
FROM kb.documents
WHERE project_id = '<uuid>'
ORDER BY created_at DESC;
```

### Get graph objects by type

```sql
SELECT id, key, status, properties, created_at
FROM kb.graph_objects
WHERE project_id = '<uuid>' AND type = 'Requirement'
ORDER BY created_at DESC;
```

### Find relationships for an object

```sql
SELECT r.id, r.type, r.src_id, r.dst_id, r.properties
FROM kb.graph_relationships r
WHERE r.src_id = '<uuid>' OR r.dst_id = '<uuid>';
```

### Get recent chat messages

```sql
SELECT m.role, m.content, m.created_at
FROM kb.chat_messages m
JOIN kb.chat_conversations c ON m.conversation_id = c.id
WHERE c.project_id = '<uuid>'
ORDER BY m.created_at DESC
LIMIT 20;
```

## Column Naming Conventions

| Pattern                      | Meaning                                                    |
| ---------------------------- | ---------------------------------------------------------- |
| `*_id`                       | Foreign key UUID reference                                 |
| `*_at`                       | Timestamp (e.g., `created_at`, `updated_at`, `deleted_at`) |
| `*_by`                       | User reference (e.g., `created_by`, `reviewed_by`)         |
| `properties`                 | JSONB field for flexible attributes                        |
| `status`                     | Text enum for state (pending/running/completed/failed)     |
| `embedding`, `embedding_vec` | pgvector embedding columns                                 |
| `tsv`, `fts`                 | Full-text search tsvector columns                          |
| `canonical_id`               | Immutable ID across versions                               |
| `supersedes_id`              | Previous version reference                                 |

## Important Notes

1. **Always use schema-qualified names** (e.g., `kb.documents`, not `documents`)
2. **Most tables use UUID primary keys** - use proper UUID format in queries
3. **Soft deletes** - many tables have `deleted_at` for soft deletion
4. **RLS enabled** - Row Level Security filters by `organization_id`/`project_id`
5. **Timestamps are `timestamptz`** - always timezone-aware
6. **JSONB columns** - use `->` for JSON traversal, `->>` for text extraction
