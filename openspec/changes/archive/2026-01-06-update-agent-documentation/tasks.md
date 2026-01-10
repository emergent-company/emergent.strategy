# Implementation Tasks

## Phase 1: Backend Entity Documentation

### Task 1.1: Update entities AGENT.md with Email System entities

- [x] Add `EmailJob` entity documentation
- [x] Add `EmailLog` entity documentation
- [x] Add `EmailTemplate` entity documentation
- [x] Add `EmailTemplateVersion` entity documentation
- [x] Include schema (kb), table names, key columns, relationships

### Task 1.2: Update entities AGENT.md with Notification & Task entities

- [x] Add `Notification` entity documentation
- [x] Add `Task` entity documentation
- [x] Include key columns and relationships

### Task 1.3: Update entities AGENT.md with System entities

- [x] Add `SystemProcessLog` entity documentation
- [x] Add `AuditLog` entity documentation (newly discovered)
- [x] Add `AuthIntrospectionCache` entity documentation (newly discovered)

### Task 1.4: Update entities AGENT.md with additional entities (newly discovered)

- [x] Add `Agent` entity documentation
- [x] Add `AgentRun` entity documentation
- [x] Add `Invite` entity documentation
- [x] Add `Integration` entity documentation
- [x] Add `LlmCallLog` entity documentation
- [x] Add `MergeProvenance` entity documentation
- [x] Add `ClickUpImportLog` entity documentation
- [x] Add `ClickUpSyncState` entity documentation
- [x] Add `ProductVersion` entity documentation
- [x] Add `ProductVersionMember` entity documentation
- [x] Add `Tag` entity documentation

## Phase 2: Backend Module Documentation

### Task 2.1: Audit current modules vs documented modules

- [x] Run `ls -d apps/server/src/modules/*/` to get full list
- [x] Compare against documented modules in AGENT.md
- [x] Create list of missing modules

### Task 2.2: Document missing modules

- [x] Add email module (controllers, services, DTOs)
- [x] Add notifications module
- [x] Add releases module
- [x] Add invites module
- [x] Add superadmin module
- [x] Add tasks module
- [x] Add template-packs module
- [x] Add unified-search module
- [x] Add user-activity module
- [x] Add user-email-preferences module
- [x] Add verification module
- [x] Add type-registry module
- [x] Add agents module
- [x] Add discovery-jobs module
- [x] Add monitoring module
- [x] Add all additional modules (45 total documented)

## Phase 3: Frontend Component Documentation

### Task 3.1: Audit current components vs documented components

- [x] Run `ls apps/admin/src/components/molecules/`
- [x] Run `ls apps/admin/src/components/organisms/`
- [x] Compare against documented components
- [x] Create list of missing components

### Task 3.2: Document missing molecules

- [x] Add `PendingInvitationCard` documentation
- [x] Add `TaskActionsPanel` documentation
- [x] Add `TaskRow` documentation
- [x] Add `SystemStatusDropdown` documentation
- [x] Add all additional molecules (29 total documented)

### Task 3.3: Document missing organisms

- [x] Add `TasksInbox` documentation
- [x] Add `NotificationInbox` documentation
- [x] Add `DiscoveryWizard` documentation
- [x] Add `DeletionConfirmationModal` documentation
- [x] Add `KBPurposeEditor` documentation
- [x] Add all additional organisms (41 total documented)

## Phase 4: Frontend Hooks Documentation

### Task 4.1: Audit current hooks vs documented hooks

- [x] Run `ls apps/admin/src/hooks/`
- [x] Compare against documented hooks
- [x] Verify all 33 hooks are documented (all hooks already documented)

## Phase 5: Verification

### Task 5.1: Validate documentation accuracy

- [x] Cross-reference each AGENT.md against actual file counts
- [x] Ensure examples are still valid
- [x] Update timestamps/version indicators if present

## Completion Criteria

- [x] All missing entities documented (47 entities total)
- [x] All missing modules documented (45 modules total)
- [x] All missing components documented (12 atoms, 29 molecules, 41 organisms)
- [x] Hooks documentation verified complete (33 hooks total)
- [x] Entity count in AGENT.md matches `find apps/server/src/entities -name "*.entity.ts" | wc -l` (47)
