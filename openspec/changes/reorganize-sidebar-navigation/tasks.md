# Tasks: Reorganize Sidebar Navigation

## 1. Backend - Cross-Project Tasks API

- [ ] 1.1 Add `GET /api/tasks/all` endpoint to fetch tasks across all user-accessible projects
- [ ] 1.2 Add `GET /api/tasks/all/counts` endpoint for aggregated task counts
- [ ] 1.3 Add tests for new cross-project task endpoints

## 2. Frontend - Cross-Project Hooks

- [ ] 2.1 Create `useAllTasks` hook for fetching tasks across all projects
- [ ] 2.2 Create `useAllTaskCounts` hook for cross-project task count badges
- [ ] 2.3 Add tests for new hooks

## 3. Frontend - All Tasks Page

- [ ] 3.1 Create `/admin/all-tasks` page using existing `TasksInbox` component
- [ ] 3.2 Add route registration for all-tasks page
- [ ] 3.3 Update `TasksInbox` component to handle null projectId (all projects mode)

## 4. Frontend - Sidebar Reorganization

- [ ] 4.1 Add prominent Inbox and All Tasks items above project picker (no section title, larger icons)
- [ ] 4.2 Rename "Overview" section to "Project"
- [ ] 4.3 Keep Tasks in Project section (project-scoped)
- [ ] 4.4 Wire up `useAllTaskCounts` for All Tasks badge
- [ ] 4.5 Verify Inbox uses existing cross-project `useNotificationCounts`
- [ ] 4.6 Style prominent items with larger icons (e.g., `size-5` or `size-6` vs standard `size-4`)

## 5. Validation

- [ ] 5.1 Manual testing of sidebar navigation flow
- [ ] 5.2 Verify badge counts display correctly for both All Tasks and Tasks
- [ ] 5.3 Verify project-scoped Tasks filters correctly when project selected
