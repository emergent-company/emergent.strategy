# Update AGENT.md Documentation

## Status: completed

## Problem Statement

The AGENT.md documentation files have drifted from the actual codebase state. This creates confusion for AI agents and developers who rely on these files to understand existing patterns before implementing new features.

### Evidence of Drift

**Entities AGENT.md** - Missing 7 entities that exist in codebase:

- `email-job.entity.ts` - Queued emails with retry logic
- `email-log.entity.ts` - Email event audit trail
- `email-template.entity.ts` - MJML email templates
- `email-template-version.entity.ts` - Template version history
- `notification.entity.ts` - User notifications
- `task.entity.ts` - Project-scoped actionable items
- `system-process-log.entity.ts` - Background process logging

**Modules AGENT.md** - Missing ~15 modules:

- email, notifications, releases, invites, superadmin, tasks
- template-packs, unified-search, user-activity, user-email-preferences
- verification, type-registry, agents, discovery-jobs, monitoring

**Components AGENT.md** - Missing new UI components:

- Molecules: `PendingInvitationCard`, `TaskActionsPanel`, `TaskRow`, `SystemStatusDropdown`
- Organisms: `TasksInbox`, `NotificationInbox`, `DiscoveryWizard`, `DeletionConfirmationModal`, `KBPurposeEditor`

**Hooks AGENT.md** - Potentially missing superadmin hooks

## Proposed Solution

Systematically update each AGENT.md file to reflect current codebase state:

1. Add missing entity documentation with schema, table, purpose, and key columns
2. Add missing module documentation with endpoints and services
3. Add missing component documentation following atomic design categories
4. Verify hooks documentation completeness

## Impact

- **AI Agents**: Will have accurate reference material, reducing duplicate code creation
- **Developers**: Will discover existing functionality faster
- **Codebase**: Reduced duplicate implementations

## Spec Changes

No spec changes required - this is documentation-only.

## Related

- Root `AGENTS.md` references these files
- `.opencode/instructions.md` references these files
