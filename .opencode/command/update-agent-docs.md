# /update-agent-docs

Review and update AGENT.md documentation files to ensure they stay synchronized with the codebase.

## All AGENT.md Files (10 total, ~6,026 lines)

### Frontend (Admin App)

| File                                                     | Lines | Domain     | Key Patterns                                      |
| -------------------------------------------------------- | ----- | ---------- | ------------------------------------------------- |
| `apps/admin/src/components/AGENT.md`                     | 263   | Components | Atomic design, DaisyUI + Tailwind, 50+ components |
| `apps/admin/src/components/organisms/DataTable/AGENT.md` | 488   | DataTable  | Table patterns, sorting, filtering, pagination    |
| `apps/admin/src/contexts/AGENT.md`                       | 772   | Contexts   | React contexts, providers, state management       |
| `apps/admin/src/hooks/AGENT.md`                          | 361   | Hooks      | `useApi` (REQUIRED), 33+ hooks categorized        |
| `apps/admin/src/pages/AGENT.md`                          | 1150  | Pages      | Page components, routing, layouts                 |

### Backend (Server App)

| File                                     | Lines | Domain    | Key Patterns                           |
| ---------------------------------------- | ----- | --------- | -------------------------------------- |
| `apps/server/src/common/AGENT.md`        | 587   | Utilities | Decorators, guards, filters, pipes     |
| `apps/server/src/entities/AGENT.md`      | 524   | Entities  | TypeORM, schemas (kb/core), relations  |
| `apps/server/src/modules/AGENT.md`       | 367   | Modules   | NestJS patterns, Controllers, Services |
| `apps/server/src/modules/graph/AGENT.md` | 796   | Graph     | Graph module (most complex), traversal |
| `apps/server/tests/AGENT.md`             | 718   | Testing   | Test patterns, FakeGraphDb, E2E        |

## Review Procedure

### Step 1: Check for Code Drift

For each AGENT.md file, verify documented patterns still match the codebase:

```bash
# Example: Check if documented components still exist
ls apps/admin/src/components/atoms/
ls apps/admin/src/components/molecules/
ls apps/admin/src/components/organisms/

# Example: Check if documented hooks exist
ls apps/admin/src/hooks/

# Example: Check if documented modules exist
ls apps/server/src/modules/
```

### Step 2: Review Checklist

#### Frontend Files (components, contexts, hooks, pages)

- [ ] All documented components/hooks/contexts still exist
- [ ] New components/hooks/contexts are documented
- [ ] Import paths are correct
- [ ] DaisyUI class names are current (v5 syntax)
- [ ] Example code compiles without errors

#### Backend Files (common, entities, modules, graph)

- [ ] All documented modules/services/entities exist
- [ ] New modules/services/entities are documented
- [ ] TypeORM decorators match current schema
- [ ] Guard/decorator usage is accurate
- [ ] RLS patterns are documented

#### Testing Files

- [ ] Test helper patterns are accurate
- [ ] FakeGraphDb API is current
- [ ] E2E test patterns work
- [ ] Auth helper usage is documented

### Step 3: Update Process

1. **Read the AGENT.md file** you're updating
2. **Explore the directory** for new/changed files
3. **Update sections** that are outdated
4. **Add new sections** for undocumented patterns
5. **Remove sections** for deleted code
6. **Update line counts** in this command file

### Step 4: Log Changes

After updating any AGENT.md file, log the change:

```markdown
<!-- Add to docs/AGENT_DOCS_CHANGELOG.md -->

## YYYY-MM-DD

### Updated Files

- `path/to/AGENT.md`

### Changes

- Added documentation for NewComponent
- Updated useApi examples for new error handling
- Removed deprecated patterns

### Context

Brief description of why updates were needed (new feature, refactor, bug fix, etc.)
```

## Quick Commands

```bash
# Count lines in all AGENT.md files
find . -name "AGENT.md" -exec wc -l {} + | tail -1

# List all AGENT.md files with paths
find . -name "AGENT.md" -type f | sort

# Check git history for recent changes to documented directories
git log --oneline -10 -- apps/admin/src/components/
git log --oneline -10 -- apps/admin/src/hooks/
git log --oneline -10 -- apps/server/src/modules/
git log --oneline -10 -- apps/server/src/entities/
```

## When to Run This Command

- After adding new components, hooks, or modules
- After major refactoring
- Before onboarding new AI sessions
- Monthly maintenance (recommended)
- When AI sessions report outdated documentation

## Common Issues

### "Component/hook not found"

The AGENT.md lists something that was deleted. Remove it from documentation.

### "New pattern not documented"

Code exists but isn't in AGENT.md. Add documentation with examples.

### "Example code doesn't work"

API changed but examples weren't updated. Fix the examples.

### "Import path wrong"

File was moved. Update the documented paths.
