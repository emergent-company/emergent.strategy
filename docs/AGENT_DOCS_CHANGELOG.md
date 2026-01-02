# AGENT.md Documentation Changelog

This file tracks updates to the AGENT.md documentation files across the codebase.

## Files Tracked

| File                                                     | Domain              | Lines |
| -------------------------------------------------------- | ------------------- | ----- |
| `apps/admin/src/components/AGENT.md`                     | Frontend Components | 263   |
| `apps/admin/src/components/organisms/DataTable/AGENT.md` | DataTable           | 488   |
| `apps/admin/src/contexts/AGENT.md`                       | React Contexts      | 772   |
| `apps/admin/src/hooks/AGENT.md`                          | React Hooks         | 361   |
| `apps/admin/src/pages/AGENT.md`                          | Page Components     | 1150  |
| `apps/server/src/common/AGENT.md`                        | Backend Utilities   | 587   |
| `apps/server/src/entities/AGENT.md`                      | TypeORM Entities    | 524   |
| `apps/server/src/modules/AGENT.md`                       | NestJS Modules      | 367   |
| `apps/server/src/modules/graph/AGENT.md`                 | Graph Module        | 796   |
| `apps/server/tests/AGENT.md`                             | Testing Patterns    | 718   |

**Total: 10 files, ~6,026 lines**

---

## 2026-01-02

### Initial Setup

- Created `/update-agent-docs` command in `.opencode/command/update-agent-docs.md`
- Created this changelog file
- Updated `.opencode/instructions.md` to reference all 10 AGENT.md files

### Baseline Audit

All 10 AGENT.md files inventoried. Line counts recorded above.

---

## Template for Future Entries

```markdown
## YYYY-MM-DD

### Updated Files

- `path/to/AGENT.md` - Brief description of changes

### Changes

- Added: New sections/components/patterns documented
- Updated: Existing sections modified
- Removed: Deleted/deprecated content removed

### Context

Why these updates were needed (feature addition, refactor, bug fix, maintenance, etc.)

### Session Reference (optional)

Link or ID to the AI session that made changes, for continuity.
```
