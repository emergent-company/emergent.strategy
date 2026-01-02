# /detect-duplicate-code

Analyze the codebase for duplicate or similar code patterns and generate an optimization plan.

## Purpose

Identify code duplication across the monorepo to:

- Reduce maintenance burden
- Improve consistency
- Identify extraction opportunities (shared utilities, hooks, components)
- Prevent divergent implementations of the same logic

## Analysis Scope

## Automated Detection with jscpd

### Quick Start

```bash
# Run duplicate detection (uses .jscpd.json config)
npm run lint:duplicates

# Full analysis including tests and stories
npm run lint:duplicates:full

# Generate HTML report for detailed review
npx jscpd apps/ --reporters console,json,html --output ./reports/jscpd
```

### Configuration

The project uses `.jscpd.json` for configuration:

| Setting     | Value             | Description                          |
| ----------- | ----------------- | ------------------------------------ |
| `threshold` | 7%                | CI fails if duplication exceeds this |
| `minLines`  | 10                | Minimum lines to consider a clone    |
| `minTokens` | 50                | Minimum tokens to consider a clone   |
| `output`    | `./reports/jscpd` | Report output directory              |

### Interpreting Results

```
Clones found: 558
Duplicated lines: 15,440 (6.51%)
```

**Severity Guidelines**:

- 🔴 **≥50 lines**: High priority - should be refactored
- 🟠 **20-49 lines**: Medium priority - review for patterns
- ⚪ **<20 lines**: Low priority - often acceptable

### Ignoring False Positives

Add patterns to `.jscpd.json` `ignore` array:

```json
{
  "ignore": ["**/migrations/**", "**/some-intentional-duplicate/**"]
}
```

Or use inline comments (limited support):

```typescript
/* jscpd:ignore-start */
// Intentionally duplicated code
/* jscpd:ignore-end */
```

---

### Frontend (Admin App)

| Directory                    | What to Check                                   |
| ---------------------------- | ----------------------------------------------- |
| `apps/admin/src/components/` | Duplicate UI patterns, similar component logic  |
| `apps/admin/src/hooks/`      | Duplicate data fetching, similar state patterns |
| `apps/admin/src/pages/`      | Repeated page layouts, similar data loading     |
| `apps/admin/src/utils/`      | Duplicate utility functions                     |
| `apps/admin/src/contexts/`   | Similar context patterns                        |

### Backend (Server App)

| Directory                   | What to Check                                        |
| --------------------------- | ---------------------------------------------------- |
| `apps/server/src/modules/`  | Duplicate service methods, similar CRUD patterns     |
| `apps/server/src/common/`   | Duplicate decorators, guards, pipes                  |
| `apps/server/src/entities/` | Similar entity patterns, repeated column definitions |
| `apps/server/tests/`        | Duplicate test setup, similar test patterns          |

### Shared Patterns

| Pattern Type     | Look For                                                  |
| ---------------- | --------------------------------------------------------- |
| API calls        | Similar fetch/axios patterns that could use `useApi`      |
| Error handling   | Repeated try/catch patterns                               |
| Validation       | Duplicate validation logic (Zod schemas, class-validator) |
| Type definitions | Similar interfaces/types across files                     |
| Constants        | Repeated magic strings/numbers                            |

## Detection Procedure

### Step 1: Automated Analysis

Use AST-based search to find similar patterns:

```bash
# Find similar function signatures
ast-grep --pattern 'async function $NAME($$$) { $$$ }' --lang typescript apps/

# Find duplicate React hooks patterns
ast-grep --pattern 'const [$STATE, $SETTER] = useState($$$)' --lang tsx apps/admin/

# Find similar API call patterns
ast-grep --pattern 'await fetch($URL, $$$)' --lang typescript apps/

# Find duplicate try-catch blocks
ast-grep --pattern 'try { $$$ } catch ($E) { $$$ }' --lang typescript apps/
```

### Step 2: Manual Review Categories

#### High-Value Duplicates (prioritize these)

1. **Business Logic Duplication**

   - Same calculation in multiple places
   - Repeated data transformation logic
   - Duplicate validation rules

2. **API Pattern Duplication**

   - Multiple components making similar API calls
   - Repeated error handling for API responses
   - Similar loading/error state management

3. **UI Component Duplication**
   - Similar form layouts
   - Repeated modal patterns
   - Duplicate table configurations

#### Low-Priority Duplicates (often acceptable)

- Simple utility functions (e.g., `formatDate`)
- Standard React patterns (e.g., basic useState)
- Boilerplate code required by frameworks

### Step 3: Generate Optimization Plan

For each duplicate found, document:

````markdown
## Duplicate: [Name/Description]

### Location

- File 1: `path/to/file1.ts` (lines X-Y)
- File 2: `path/to/file2.ts` (lines X-Y)
- [Additional locations...]

### Similarity Score

[High/Medium/Low] - [Brief explanation]

### Current Impact

- Lines of duplicated code: N
- Files affected: N
- Maintenance risk: [High/Medium/Low]

### Recommended Action

[One of: Extract to shared utility | Create custom hook | Create shared component | Create base class | Accept as-is]

### Proposed Solution

```typescript
// Example of extracted/refactored code
```
````

### Migration Steps

1. Step 1
2. Step 2
3. ...

### Effort Estimate

[Small/Medium/Large] - [Time estimate]

````

## Output Format

Create the optimization plan at: `docs/improvements/duplicate-code-analysis-YYYY-MM-DD.md`

### Template Structure

```markdown
# Duplicate Code Analysis Report

**Date**: YYYY-MM-DD
**Analyzed by**: [AI/Human]
**Scope**: [Full codebase / Specific directories]

## Executive Summary

- Total duplicates found: N
- High priority: N
- Medium priority: N
- Low priority: N
- Estimated total effort: [X hours/days]

## High Priority Duplicates

### 1. [Duplicate Name]
[Full analysis using template above]

### 2. [Duplicate Name]
...

## Medium Priority Duplicates

### 1. [Duplicate Name]
...

## Low Priority / Acceptable Duplicates

### 1. [Duplicate Name]
...

## Recommended Action Plan

### Phase 1: Quick Wins (< 1 hour each)
- [ ] Item 1
- [ ] Item 2

### Phase 2: Medium Effort (1-4 hours each)
- [ ] Item 1
- [ ] Item 2

### Phase 3: Larger Refactors (> 4 hours)
- [ ] Item 1
- [ ] Item 2

## Metrics to Track

- Lines of code reduced: N
- Files consolidated: N
- New shared utilities created: N
````

## Common Duplicate Patterns in This Codebase

### Known Patterns to Check

1. **useApi vs raw fetch**

   - Many components may still use raw fetch instead of `useApi` hook
   - Search: `fetch(` in `.tsx` files outside of hooks/

2. **Error Toast Patterns**

   - Similar error handling with toast notifications
   - Search: `toast.error` or `showToast` patterns

3. **Loading State Management**

   - Repeated `isLoading`, `error`, `data` state patterns
   - Should use `useApi` or React Query patterns

4. **Form Handling**

   - Similar form validation and submission logic
   - Consider shared form utilities or hooks

5. **Table Configurations**

   - Similar DataTable column definitions
   - Consider extracting common column configs

6. **Modal Patterns**
   - Repeated modal open/close logic
   - Should use `useModal` context

## Quick Commands

```bash
# Find potential duplicate functions by name pattern
grep -rn "function.*validate" apps/ --include="*.ts" --include="*.tsx"
grep -rn "function.*format" apps/ --include="*.ts" --include="*.tsx"
grep -rn "function.*parse" apps/ --include="*.ts" --include="*.tsx"

# Find duplicate imports (might indicate shared utility opportunity)
grep -rn "^import.*from" apps/ --include="*.ts" --include="*.tsx" | cut -d: -f2 | sort | uniq -c | sort -rn | head -20

# Find files with similar names (potential duplicates)
find apps/ -name "*.ts" -o -name "*.tsx" | xargs -I {} basename {} | sort | uniq -d

# Count lines per file to find unusually large files (often contain duplicates)
find apps/ -name "*.ts" -o -name "*.tsx" | xargs wc -l | sort -rn | head -20
```

## When to Run This Command

- Before major refactoring efforts
- When onboarding to understand code quality
- Quarterly maintenance review
- After rapid feature development sprints
- When noticing "déjà vu" while coding

## Integration with Other Commands

After running this command:

1. Create items in `docs/improvements/` for each refactor
2. Update relevant AGENT.md files after extracting shared utilities
3. Run `/update-agent-docs` to keep documentation in sync
