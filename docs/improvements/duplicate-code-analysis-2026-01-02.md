# Duplicate Code Analysis Report

**Date**: 2026-01-02  
**Tool**: jscpd v3.x  
**Analyzed by**: AI Assistant  
**Scope**: `apps/` directory (admin + server)

## Executive Summary

| Metric               | Value           |
| -------------------- | --------------- |
| Total Lines Analyzed | 237,020         |
| Total Tokens         | 1,716,838       |
| Source Files         | 1,534           |
| Duplicated Lines     | 15,440 (6.51%)  |
| Duplicated Tokens    | 122,944 (7.16%) |
| Total Clones Found   | 558             |

### Severity Breakdown

| Severity  | Line Threshold | Count | % of Total |
| --------- | -------------- | ----- | ---------- |
| 🔴 High   | ≥50 lines      | 55    | 9.9%       |
| 🟠 Medium | 20-49 lines    | 195   | 34.9%      |
| ⚪ Low    | <20 lines      | 309   | 55.2%      |

### Duplication by Area

| Directory                    | Clone Count | Primary Issue              |
| ---------------------------- | ----------- | -------------------------- |
| `apps/server/src/modules/`   | 321         | Service patterns, DTOs     |
| `apps/admin/src/pages/`      | 231         | Landing pages, admin pages |
| `apps/admin/src/components/` | 163         | Chat, modals, graphs       |
| `apps/admin/src/hooks/`      | 97          | Hook patterns              |
| `apps/admin/backups/`        | 77          | **Stale backups - DELETE** |
| `apps/admin/tests/`          | 64          | Test patterns              |

---

## 🔴 High Priority Duplicates

### 1. Stale Backups Directory (QUICK WIN)

**Location**: `apps/admin/backups/landing-page-20251122-101757/`

**Impact**: 77 clone references, ~2,000+ duplicated lines

**Issue**: November 2025 backup containing duplicate copies of:

- Hero.tsx (233 lines)
- Features.tsx (216 lines)
- FAQ.tsx (198 lines)
- Process.tsx (163 lines)
- Footer.tsx (162 lines)
- Topbar.tsx (134 lines)
- Benefits.tsx (115 lines)
- CTA.tsx (86 lines)
- WavePath.tsx (85 lines)
- Theme CSS files (50 lines each)

**Recommended Action**: DELETE entire directory

**Effort**: 5 minutes

**Command**:

```bash
rm -rf apps/admin/backups/
```

---

### 2. Landing Page Component Duplication

**Locations**:

- `apps/admin/src/pages/automation/components/`
- `apps/admin/src/pages/emergent-core/components/`
- `apps/admin/src/pages/landing/components/`
- `apps/admin/src/pages/product-framework/components/`

**Duplicated Components**:

| Component        | Lines | Copies | Total Waste |
| ---------------- | ----- | ------ | ----------- |
| Pricing.tsx      | 224   | 2      | 224         |
| Process.tsx      | 163   | 4      | 489         |
| Topbar.tsx       | 126   | 2+     | 252         |
| Testimonials.tsx | 121   | 2      | 121         |
| Benefits.tsx     | 115   | 4      | 345         |
| Integrations.tsx | 112   | 2      | 112         |
| Footer.tsx       | 92    | 4      | 276         |
| WavePath.tsx     | 74-85 | 4      | ~300        |
| CTA.tsx          | 86    | 2+     | ~170        |

**Total**: ~2,300 duplicated lines

**Recommended Action**: Extract to shared marketing components

**Proposed Structure**:

```
apps/admin/src/components/marketing/
├── Benefits.tsx        # Shared benefits section
├── CTA.tsx            # Call-to-action component
├── Footer.tsx         # Marketing footer
├── Pricing.tsx        # Pricing tables
├── Process.tsx        # Process/steps visualization
├── Testimonials.tsx   # Customer testimonials
├── Topbar.tsx         # Marketing navigation
├── WavePath.tsx       # Decorative wave SVG
└── index.ts           # Barrel export
```

**Migration Pattern**:

```tsx
// Before (in each landing page)
import { Pricing } from './components/Pricing';

// After
import { Pricing } from '@/components/marketing';

// Component accepts variant prop for customization
<Pricing variant="automation" features={automationFeatures} />;
```

**Effort**: 4-8 hours

---

### 3. Superadmin CRUD Pages

**Locations**:

- `apps/admin/src/pages/admin/superadmin/projects.tsx` (lines 106-255)
- `apps/admin/src/pages/admin/superadmin/users.tsx` (lines 211-341)
- `apps/admin/src/pages/admin/superadmin/organizations.tsx`
- `apps/admin/src/pages/admin/superadmin/emails.tsx`

**Duplicated Lines**: 150+ per pair

**Issue**: All pages follow identical pattern:

1. DataTable with columns
2. Create/Edit modal
3. Delete confirmation
4. CRUD operations with useApi

**Recommended Action**: Create generic admin pattern

**Option A - Generic Component**:

```tsx
// apps/admin/src/components/organisms/AdminCrudPage.tsx
interface AdminCrudPageProps<T> {
  title: string;
  columns: ColumnDef<T>[];
  endpoint: string;
  createForm: React.ComponentType<FormProps<T>>;
  editForm: React.ComponentType<FormProps<T>>;
}

export function AdminCrudPage<T>({ ... }: AdminCrudPageProps<T>) {
  // Shared DataTable, modal, CRUD logic
}
```

**Option B - Custom Hook**:

```tsx
// apps/admin/src/hooks/useAdminCrud.ts
export function useAdminCrud<T>(endpoint: string) {
  // Returns: { items, isLoading, create, update, delete, ... }
}
```

**Effort**: 4-6 hours

---

### 4. Chat/Refinement Components

**Locations**:

- `apps/admin/src/components/email-templates/EmailTemplateRefinementChat.tsx` (lines 182-310)
- `apps/admin/src/components/organisms/ObjectDetailModal/ObjectRefinementChat.tsx` (lines 163-280)
- `apps/admin/src/components/organisms/MergeComparisonModal/MergeChat.tsx` (lines 207-320)

**Duplicated Lines**: 129 + 114 = 243 lines

**Issue**: Three nearly identical chat interfaces with minor variations

**Recommended Action**: Extract shared chat primitives

**Proposed Structure**:

```tsx
// apps/admin/src/components/chat/BaseChatInterface.tsx
interface BaseChatInterfaceProps {
  messages: Message[];
  onSend: (message: string) => void;
  isLoading?: boolean;
  placeholder?: string;
  systemPrompt?: string;
  renderMessage?: (message: Message) => React.ReactNode;
}

export function BaseChatInterface({ ... }: BaseChatInterfaceProps) {
  // Shared chat UI: message list, input, send button
}
```

**Effort**: 2-4 hours

---

### 5. ActionCard / SuggestionCard Duplication

**Locations**:

- `apps/admin/src/components/chat/ActionCard.tsx` (lines 226-342)
- `apps/admin/src/components/chat/SuggestionCard.tsx` (lines 262-378)

**Duplicated Lines**: 117

**Issue**: Nearly identical card components with different icons/colors

**Recommended Action**: Merge into single configurable component

```tsx
// apps/admin/src/components/chat/InteractiveCard.tsx
interface InteractiveCardProps {
  variant: 'action' | 'suggestion';
  title: string;
  description: string;
  onClick: () => void;
  icon?: React.ReactNode;
}
```

**Effort**: 1-2 hours

---

## 🟠 Medium Priority Duplicates

### 6. RelationshipGraph Components

**Locations**:

- `apps/admin/src/components/organisms/RelationshipGraph/RelationshipGraph.tsx`
- `apps/admin/src/components/organisms/RelationshipGraph/TreeRelationshipGraph.tsx`
- `apps/admin/src/components/organisms/RelationshipGraph/useGraphData.ts`
- `apps/admin/src/components/organisms/RelationshipGraph/useTreeGraphData.ts`

**Duplicated Lines**: 86 + 59 + 57 + 56 = 258 lines

**Recommended Action**: Extract shared graph utilities

**Effort**: 2-3 hours

---

### 7. Test File Duplication

**Locations**:

- `apps/admin/tests/unit/components/organisms/DeletionConfirmationModal.test.tsx`
  - Internal duplication: 172 + 115 + 103 + 97 + 54 + 53 + 50 = ~644 lines
- `apps/admin/tests/unit/components/organisms/ConfirmActionModal.test.tsx`
  - Internal duplication: 87 + 72 + 69 + 56 = ~284 lines

**Issue**: Repeated test setup, mock data, and assertion patterns within same file

**Recommended Action**: Extract test fixtures and helpers

```typescript
// apps/admin/tests/helpers/modal-fixtures.ts
export const mockModalProps = { ... };
export const renderModalWithContext = (props) => { ... };
export const assertModalBehavior = (modal, expected) => { ... };
```

**Effort**: 2-3 hours

---

### 8. Migration Archives

**Locations**:

- `apps/server/src/migrations/archive/1762797725044-InitialSchema.ts`
- `apps/server/src/migrations/archive/phase5-pre-squash/1762797725044-InitialSchema.ts`

**Duplicated Lines**: 369 + 149 = 518 lines

**Issue**: Same migrations exist in both archive and phase5-pre-squash

**Recommended Action**:

- Document if intentional (historical record)
- Or consolidate to single archive location
- Add to `.jscpd.json` ignore list

**Effort**: 30 minutes (just ignore) or 1 hour (consolidate)

---

### 9. Dropdown Stories Duplication

**Location**: `apps/admin/src/components/molecules/Dropdown/Dropdown.stories.tsx`

**Duplicated Lines**: 78 (internal)

**Issue**: Copy-paste story variants

**Recommended Action**: Use Storybook args/argTypes for variants instead of duplicated stories

**Effort**: 30 minutes

---

## ⚪ Low Priority / Acceptable

### Acceptable Duplications

1. **NestJS Module Boilerplate** - Standard framework patterns
2. **React Hook Patterns** - Common useState/useEffect structures
3. **Type Definitions** - Interfaces that naturally overlap
4. **Import Statements** - Common library imports
5. **CSS Theme Variables** - Color definitions across themes

### Files to Add to Ignore List

```json
{
  "ignore": [
    "**/migrations/**",
    "**/archive/**",
    "**/backups/**",
    "**/logs/**",
    "**/*.stories.tsx",
    "**/*.test.tsx"
  ]
}
```

---

## Recommended Action Plan

### Phase 1: Quick Wins (< 1 hour total)

| Task                                 | Effort | Impact                 |
| ------------------------------------ | ------ | ---------------------- |
| Delete `apps/admin/backups/`         | 5 min  | -2,000 lines           |
| Add ignore patterns to `.jscpd.json` | 10 min | Cleaner analysis       |
| Create `reports/` directory          | 5 min  | Report output location |

### Phase 2: Landing Page Consolidation (4-8 hours)

| Task                            | Effort  | Impact       |
| ------------------------------- | ------- | ------------ |
| Create `components/marketing/`  | 30 min  | Structure    |
| Extract shared components       | 3-4 hrs | -2,300 lines |
| Update landing pages to import  | 2-3 hrs | Consistency  |
| Add tests for shared components | 1 hr    | Quality      |

### Phase 3: Admin Patterns (4-6 hours)

| Task                                          | Effort  | Impact      |
| --------------------------------------------- | ------- | ----------- |
| Create `useAdminCrud` hook or `AdminCrudPage` | 2-3 hrs | Pattern     |
| Refactor superadmin pages                     | 2-3 hrs | -600+ lines |

### Phase 4: Chat Components (2-4 hours)

| Task                            | Effort  | Impact     |
| ------------------------------- | ------- | ---------- |
| Extract `BaseChatInterface`     | 1-2 hrs | -250 lines |
| Merge ActionCard/SuggestionCard | 1 hr    | -117 lines |

### Phase 5: Test Improvements (2-3 hours)

| Task                               | Effort  | Impact      |
| ---------------------------------- | ------- | ----------- |
| Extract modal test fixtures        | 1-2 hrs | -900+ lines |
| Document test patterns in AGENT.md | 30 min  | Guidance    |

---

## Metrics to Track

After implementing these changes:

| Metric               | Current | Target |
| -------------------- | ------- | ------ |
| Duplication %        | 6.51%   | < 4%   |
| High Priority Clones | 55      | < 10   |
| Total Clones         | 558     | < 200  |

---

## Running Duplicate Detection

```bash
# Quick analysis (production code only)
npm run lint:duplicates

# Full analysis (includes tests)
npm run lint:duplicates:full

# Generate detailed report
npx jscpd apps/ --reporters console,json,html --output ./reports/jscpd
```

---

## Related Documentation

- `.jscpd.json` - Configuration file
- `.opencode/command/detect-duplicate-code.md` - Detection command
- `docs/AGENT_DOCS_CHANGELOG.md` - Documentation updates
