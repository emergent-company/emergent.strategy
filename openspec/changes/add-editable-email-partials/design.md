## Context

Email templates use Handlebars partials for shared components (headers, footers, buttons). The existing `add-superadmin-email-templates` change adds database-backed template storage but partials remain file-based. This change extends the email template management system to support database-backed partials.

## Goals / Non-Goals

**Goals:**

- Allow superadmins to customize shared email components (headers, footers) without deployments
- Maintain consistency: changes to partials automatically apply to all templates using them
- Preserve version history for audit and rollback
- Preview partials in the context of actual templates

**Non-Goals:**

- Creating new partial types from UI (must exist as file-based first)
- Custom MJML component registration (partials use standard MJML)
- Per-template partial overrides (partials are global)

## Decisions

### Decision 1: Partials identified by name (not UUID)

**What:** Partials are keyed by their file-based name (`footer`, `header`) rather than UUID.
**Why:** Simpler integration with Handlebars `{{> partialName}}` syntax. No need to change existing templates.

### Decision 2: Seed from file-based partials on first access

**What:** On first API access, scan `/templates/email/partials/` and create DB records for discovered partials with `is_customized=false`.
**Why:** Zero-config migration. No manual seed script needed. Partials appear automatically.

### Decision 3: Preview shows partial embedded in sample template

**What:** Partial preview renders within a wrapper template context, not standalone.
**Why:** Partials may rely on parent template context (variables, structure). Standalone preview would be incomplete.

**Alternatives considered:**

- Standalone partial preview → Rejected: partials like `{{> footer}}` need template context for variables
- Full template preview with partial highlighted → Complex to implement, deferred

## Risks / Trade-offs

| Risk                                  | Mitigation                                                                      |
| ------------------------------------- | ------------------------------------------------------------------------------- |
| Partial changes break templates       | Version history + rollback capability                                           |
| Cache invalidation complexity         | Clear partial cache on any partial save; clear template cache on partial change |
| Orphaned partials after file deletion | Admin UI shows warning for DB-only partials; manual cleanup via reset           |

## Migration Plan

1. Deploy schema migration (creates empty tables)
2. First API access seeds existing partials
3. Superadmins can start customizing immediately
4. No rollback needed - file-based partials remain as fallback
