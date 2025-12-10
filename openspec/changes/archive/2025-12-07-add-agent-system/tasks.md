# Tasks

## Phase 1: Agent Infrastructure (COMPLETED)

- [x] Install `@nestjs/schedule` dependency in `apps/server` <!-- id: 0 -->
- [x] Create `Agent` and `AgentRun` entities in `apps/server/src/modules/agents/entities` <!-- id: 1 -->
- [x] Create migration for new agent tables <!-- id: 2 -->
- [x] Implement `AgentsModule` and `AgentService` with `SchedulerRegistry` logic <!-- id: 3 -->
- [x] Define `AgentStrategy` interface and registry <!-- id: 4 -->
- [x] Implement `MergeAgentStrategy` with vector search logic <!-- id: 5 -->
- [x] Implement `checkQueue` logic to skip run if > 5 pending notifications <!-- id: 6 -->
- [x] Implement deduplication/update logic for `Notification` creation <!-- id: 7 -->
- [x] Create `AgentsController` to allow admins to list/update agents (prompt, schedule) <!-- id: 8 -->
- [x] Seed the default "Merge Agent" configuration in a migration or seed script <!-- id: 9 -->
- [x] Verify agent runs periodically and creates notifications in local environment <!-- id: 10 -->

## Phase 2: Tasks System & Merge Execution (COMPLETED)

- [x] Create `Task` entity for actionable items requiring user decision <!-- id: 11 -->
- [x] Create migration for tasks table in `kb` schema <!-- id: 12 -->
- [x] Implement `TasksModule` and `TasksService` with CRUD operations <!-- id: 13 -->
- [x] Implement `TasksController` with endpoints for listing, resolving, cancelling tasks <!-- id: 14 -->
- [x] Update `MergeAgentStrategy` to create Tasks instead of/in addition to Notifications <!-- id: 15 -->
- [x] Link notifications to tasks via `task_id` foreign key <!-- id: 16 -->

## Phase 3: Merge Execution Logic (COMPLETED)

- [x] Create `ObjectMergeService` in `apps/server/src/modules/graph/` <!-- id: 17 -->

  - Implemented property merging with configurable strategy (source-wins/target-wins)
  - Implemented relationship redirection from source to target
  - Implemented source object soft-delete (tombstoning)
  - Added merge provenance tracking via `_mergeHistory` property

- [x] Update `TasksService.resolve()` to execute merge on acceptance <!-- id: 18 -->

  - Added logic to detect `merge_suggestion` task type
  - Extract `sourceId` and `targetId` from task metadata
  - Call `ObjectMergeService.mergeObjects()` when task is accepted
  - Return both task and merge result in response

- [x] Update `TasksController` to return merge result in response <!-- id: 19 -->

## Phase 4: Frontend UI (COMPLETED)

- [x] Reorganize sidebar into 3 groups: Overview, System Monitoring, Settings <!-- id: 20 -->

  - Overview: Inbox (renamed to Recent), Tasks, Documents, Chunks, Objects, Chat
  - System Monitoring: Dashboard, Extraction Jobs, Agents
  - Settings: at bottom

- [x] Create separate Tasks page at `/admin/tasks` <!-- id: 21 -->

  - Created `apps/admin/src/pages/admin/tasks/index.tsx`
  - Added route registration in `apps/admin/src/router/register.tsx`

- [x] Simplify Inbox page to show only Notifications <!-- id: 22 -->

  - Removed Tasks tab from Inbox page
  - Inbox now focuses on notification stream

- [x] Create `TasksInbox` component with filtering by status <!-- id: 23 -->

  - Status filters: Pending, Accepted, Rejected, All
  - Time-based grouping: Today, Yesterday, Last 7 days, Older

- [x] Create `TaskRow` component with inline Accept/Reject actions <!-- id: 24 -->

  - Accept button (green, solid)
  - Reject button (outline)
  - Shows resolved status with resolver name and timestamp

- [x] Create `TaskActionsPanel` component for reusable task actions <!-- id: 25 -->

- [x] Create `MergeComparisonModal` for reviewing merge suggestions <!-- id: 26 -->

  - Side-by-side comparison of source and target objects
  - Accept/Reject buttons with merge execution on accept

- [x] Implement `useTasks`, `useTaskCounts`, `useTaskMutations` hooks <!-- id: 27 -->

- [x] Create `createTasksClient` API client for tasks endpoints <!-- id: 28 -->

## Phase 5: Integration & Testing (IN PROGRESS)

- [x] Verify API routing: Vite proxy `/api/*` correctly forwards to backend <!-- id: 29 -->
- [ ] End-to-end test: Accept a merge suggestion and verify objects are merged <!-- id: 30 -->

  - Requires local Zitadel authentication to be configured
  - Current environment uses remote Zitadel (`zitadel.dev.emergent-company.ai`)

- [ ] End-to-end test: Reject a merge suggestion and verify task status updates <!-- id: 31 -->
- [ ] Verify linked notifications are marked as read when task is resolved <!-- id: 32 -->
- [ ] Add unit tests for `ObjectMergeService` <!-- id: 33 -->
- [ ] Add integration tests for task resolution flow <!-- id: 34 -->

## Implementation Summary

### Files Created

**Backend:**

- `apps/server/src/modules/graph/object-merge.service.ts` - Core merge execution logic
- `apps/server/src/entities/task.entity.ts` - Task entity
- `apps/server/src/modules/tasks/tasks.module.ts` - Tasks module
- `apps/server/src/modules/tasks/tasks.service.ts` - Task CRUD and resolution
- `apps/server/src/modules/tasks/tasks.controller.ts` - REST API endpoints
- `apps/server/src/modules/tasks/dto/task.dto.ts` - DTOs for task operations

**Frontend:**

- `apps/admin/src/pages/admin/tasks/index.tsx` - Tasks page
- `apps/admin/src/components/organisms/TasksInbox/TasksInbox.tsx` - Tasks inbox UI
- `apps/admin/src/components/molecules/TaskRow/TaskRow.tsx` - Task row component
- `apps/admin/src/components/molecules/TaskActionsPanel/TaskActionsPanel.tsx` - Reusable actions
- `apps/admin/src/components/organisms/MergeComparisonModal/` - Merge review modal
- `apps/admin/src/api/tasks.ts` - API client
- `apps/admin/src/hooks/useTasks.ts` - React hooks
- `apps/admin/src/types/task.ts` - TypeScript types

### Files Modified

**Backend:**

- `apps/server/src/modules/graph/graph.module.ts` - Added ObjectMergeService to providers/exports
- `apps/server/src/modules/tasks/tasks.module.ts` - Added GraphModule import
- `apps/server/src/modules/app.module.ts` - Added TasksModule

**Frontend:**

- `apps/admin/src/pages/admin/layout.tsx` - Reorganized sidebar navigation
- `apps/admin/src/pages/admin/inbox/index.tsx` - Simplified to notifications only
- `apps/admin/src/router/register.tsx` - Added tasks route

### Key Design Decisions

1. **Tasks vs Notifications**: Tasks are actionable items requiring user decision (accept/reject). Notifications are informational items. Tasks can link to notifications via `task_id`.

2. **Merge Execution on Accept**: When a `merge_suggestion` task is accepted, the merge is executed automatically. This provides human-in-the-loop control while avoiding separate "execute merge" step.

3. **Property Strategy**: Uses `source-wins` strategy by default - source object properties override target. This is configurable.

4. **Provenance Tracking**: Merged objects maintain `_mergeHistory` array tracking what was merged, when, and by whom.

5. **Soft Delete**: Source objects are tombstoned (soft-deleted) after merge, maintaining referential integrity and audit trail.
