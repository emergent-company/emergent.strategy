---
applyTo: "**"
---

# Atomic Design & Component Structuring Instructions

This document defines how we organize, implement, document, and evolve UI components in this repository using an **Atomic Design** inspired system adapted to our existing Sidebar compound component architecture, Tailwind/daisyUI utility styling, React 19, and strict TypeScript conventions.

> These rules are authoritative for any new UI work. When in doubt, follow the decision tables and checklists below before opening a PR.

## 1. Goals
- Consistency: Predictable file paths, naming, and prop patterns.
- Compo sability: Small, pure, stateless building blocks scaled into complex screens.
- Story Isolation: Every exported component must have at least one focused Storybook story rendering *only that component* (unless trivially covered by a higher-level composite story).
- Testability: Business logic separated from visual shells; logic units get Vitest tests; visuals lean on Storybook & Playwright.
- Theming & Styling: Prefer Tailwind + daisyUI class composition; zero bespoke CSS unless required (then isolate in `src/styles/core/components.css`).
- Incremental Migration: Legacy patterns phased out without blocking feature delivery.

## 2. Layer Definitions
We adopt five canonical layers plus two pragmatic adjunct layers for app-scale patterns.

| Layer | Directory Root | Purpose | Allowed Dependencies | Disallowed | Example |
|-------|----------------|---------|----------------------|------------|---------|
| Atoms | `src/components/atoms/` | Irreducible visual or behavioral primitives | Utility libs, icons | Business hooks (`useConfig`), app contexts | `Icon`, `Badge`, `Spinner` |
| Molecules | `src/components/molecules/` | Composition of atoms forming a small semantic unit | Atoms, internal helpers | Direct API calls, global app state | `ProjectStatusTag`, `FieldWithLabel` |
| Organisms | `src/components/organisms/` | Larger composite sections with layout responsibility | Molecules, Atoms | Direct fetch; own state only for UI (e.g. expand) | `SidebarProjectDropdown`, `SidebarSection` |
| Templates | `src/components/templates/` | Page-level skeletal layouts with named slots | Organisms, Molecules, Atoms | Domain data fetching | `AdminShellLayout` |
| Pages | `src/pages/**` | Route-bound fully wired screens | All lower layers, hooks, API clients | Cross-cutting side effects that belong in services | `admin/DocumentsPage.tsx` |
| Utilities (Adjunct) | `src/lib/` or `src/utils/` | Pure helpers (formatters, mappers) | - | React components | `formatBytes.ts` |
| Compound (Adjunct) | Existing `src/components/layout/sidebar/` etc. | Legacy/compound exports transitioning into Organisms | Atoms, Molecules | Direct fetch unless explicitly grandfathered | `Sidebar` compound API |

### Quick Classification Decision Tree
1. Does it render a single HTML semantic element with styling only? → Atom.
2. Does it combine 2–4 atoms into a purposeful unit (e.g., icon + text + badge)? → Molecule.
3. Does it define structural layout or interaction region (list, panel, dropdown) aggregating molecules? → Organism.
4. Does it provide page scaffolding (nav, header, main slot) without data binding? → Template.
5. Does it bind routing + data + state to deliver user value? → Page.

## 3. Naming Conventions
- **PascalCase** for component folders & files: `ProjectStatusTag/ProjectStatusTag.tsx`.
- Each component folder contains exactly one main export file named after the component; optional siblings:
  - `index.ts` (barrel re-export) – optional, prefer only when sub-exports exist.
  - `Component.stories.tsx` – mandatory for Atoms/Molecules/Organisms.
  - `Component.test.tsx` – add for logic-bearing Molecules/Organisms (state machines, conditional rendering branches).
  - `types.ts` – only if shared types exceed 20 LOC or are reused externally.
- Avoid suffix redundancy (e.g., `ProjectItem` not `ProjectListItemComponent`).
- For variant wrappers use suffix: `*Provider`, `*Context`, `*Adapter`.

## 4. Prop & State Guidelines
| Principle | Rule |
|-----------|------|
| Purity | Atoms & Molecules must be **pure**: no internal side-effects (except trivial DOM refs). |
| Controlled vs Uncontrolled | Favor controlled props (`open`, `value`) with change callbacks (`onOpenChange`, `onValueChange`). Provide lightweight uncontrolled wrapper only if widely required. |
| Optionality | Use explicit optional props (`?`). No unions with `undefined` unless semantically distinct. |
| Boolean Naming | Use positive booleans (`disabled`, `active`, `loading`). Avoid negated (`notActive`). |
| Callback Typing | Always type callbacks precisely (no `() => void` if parameters exist). Name first param after domain (`projectId: string`). |
| Data Props | Accept already shaped data; do not fetch inside components below Page unless **UI-only** concerns (e.g., collapsible memory). |

## 5. Styling Rules
1. Start with daisyUI component class + semantic modifiers (e.g., `btn btn-primary`).
2. Layer Tailwind utilities for layout/gap/spacing/responsiveness.
3. Use `!` override only as last resort.
4. Extract repeating class clusters: use a small local constant (e.g., `const base = "flex items-center gap-2"`). Avoid global class concatenation helpers unless dynamic complexity justifies.
5. Avoid dynamic Tailwind class name construction (e.g., `text-${color}`) – whitelist or map to static classes.
6. Only create custom CSS if (a) pseudo-element complexity, (b) keyframe animations, or (c) third-party overrides. Place in `src/styles/core/components.css` with a `/* COMPONENT: Name */` heading.

## 6. Accessibility & Semantics
- All interactive elements: use native semantics (`button`, `a[href]`, `input`). Avoid generic `div[role=button]` unless unavoidable.
- Provide `aria-label` or visible text for icon-only buttons.
- Keyboard: focus-visible styles must remain intact (do not remove `outline` without replacement).
- Announce loading states with `aria-busy` or `role="status"` where needed.
- For lists (dropdowns, menus) use `<ul>/<li>` unless an ARIA role pattern mandates alternative.

## 7. Storybook Requirements
| Layer | Minimum Stories |
|-------|-----------------|
| Atom | Default + Variant(s) (size/color if applicable) |
| Molecule | Default + Edge case (long text, truncation, loading) |
| Organism | Default + Empty/Loading/Error variations |

Story File Pattern: `Component.stories.tsx` at the same level. Avoid wrapping components in unrelated shells—only supply required providers (e.g., `ConfigProvider`) via decorators.

Use controls for obvious design tokens (size, variant) and doc blocks to explain responsibilities & non-goals.

## 8. Testing Strategy
| Layer | Test Focus | Tool |
|-------|------------|------|
| Atoms | Snapshot (optional), accessibility sanity | Storybook + Visual Diff |
| Molecules | Conditional rendering, callback firing | Vitest + RTL |
| Organisms | Branching (loading/empty/error), integration of callbacks | Vitest + RTL |
| Templates | Light smoke (slot rendering) | Minimal or skip |
| Pages | E2E user flows | Playwright |

Guidelines:
- Use React Testing Library; assert visible text/roles.
- Avoid brittle snapshot tests for Organisms; prefer explicit assertions.
- If a component gains complex state, extract logic into a pure hook under `src/hooks/` with its own test file.

## 9. Migration Plan (Incremental)
1. New components MUST follow atomic directory placement.
2. When touching existing legacy components:
   - If minor edit: leave in place, add TODO banner comment (`// TODO(atomic-migrate): classify -> target path`).
   - If major refactor: move to atomic path + create re-export shim file at old location exporting from new path (keep for ≥1 release cycle) with console.warn in development.
3. Track outstanding legacy items in a central checklist (`docs/atomic-migration.md`).

### Re-export Shim Example
```ts
// src/components/layout/sidebar/OldThing.tsx
// TODO: remove after 2025-11
import { NewThing } from '@/components/molecules/NewThing';
if (import.meta.env.DEV) {
  // eslint-disable-next-line no-console
  console.warn('[DEPRECATED] OldThing: import from molecules/NewThing instead. Will be removed after 2025-11');
}
export const OldThing = NewThing;
```

## 10. Sidebar Compound Component Alignment
The existing `Sidebar` structure maps as:
- `SidebarMenuItem` → Molecule (interactive row)
- `SidebarMenuItemBadges` → Atom/Molecule hybrid (treat as Atom if it renders only labels)
- `SidebarProjectItem` → Molecule
- `SidebarProjectDropdown` (stateless) → Organism
- `SidebarSection` → Organism (structural grouping)
- `Sidebar` root → Organism or Template (depending on presence of layout chrome); treat currently as Organism until generalized.

Refactors:
- Future: Extract layout shell to `templates/AdminSidebarLayout` if reused outside current context.
- Keep barrel export for ergonomics; internal file placement should still reflect classification (consider moving into `organisms/sidebar/` cluster with subfolders).

## 11. TypeScript & API Contracts
- No `any`; prefer discriminated unions for variant props.
- Export `*Props` interfaces when they are part of public API; keep internal prop types inline (not exported) if not reused.
- Use `React.FC<Props>` only when children typing benefits; otherwise `export function Component(props: Props) {}`.
- Derive prop types from data model types (e.g., `Project`) by *importing*, never duplicating shapes.

## 12. Performance Considerations
- Default to fine-grained components to reduce re-render surface; lift state up only when shared.
- Memoization: Use `React.memo` sparingly—only for stable heavy subtrees in profiling.
- List Rendering: Provide `key` on top-level mapped element; avoid array index unless order is truly immutable.

## 13. Dependency Rules
| Allowed | Conditional | Forbidden |
|---------|-------------|-----------|
| `clsx`, lightweight utility merging | External headless UI libs (must justify) | Large UI kits overlapping daisyUI |
| Local hooks in molecules/organisms | Direct fetch in organisms (only if UI-blocking spinner minimal) | Fetching in atoms/molecules |

## 14. PR Checklist (Atomic Components)
Before requesting review:
- [ ] Component placed in correct layer directory
- [ ] Strongly typed props exported appropriately
- [ ] No unused imports / console logs
- [ ] Storybook stories added/updated
- [ ] Vitest tests added (if logic > trivial)
- [ ] No dynamic Tailwind class generation
- [ ] A11y: roles/labels/focus states verified
- [ ] Migration shim (if refactor of legacy path)

## 15. Lint & Enforcement (Future Enhancements)
Add custom ESLint rules / codemods (tracked in `docs/atomic-migration.md`):
- Restrict imports: Atoms cannot import Organisms.
- Flag deprecated shim usage after cutoff date.

## 16. FAQ
**Q: When is something a Molecule vs Organism?**  
Size is not the metric—responsibility is. If it orchestrates layout structure or multiple semantic roles (list + actions + filtering), it's an Organism.

**Q: Can an Organism keep internal state?**  
Yes for view-local UI (open/close, hover state caches). Not for domain data lifecycle.

**Q: Where do cross-cutting modals go?**  
If generic (confirm, toast host) → Organism. If domain-specific (CreateProjectModal) and reused across routes → Molecule + wrapper, otherwise colocate near first usage until second consumer emerges.

**Q: How do we handle theme tokens?**  
Use daisyUI semantic classes (`primary`, `base-*`, etc.). Avoid hard-coded hex except in theme definition files.

## 17. Initial Action Items
1. Create directories: `atoms`, `molecules`, `organisms`, `templates` under `src/components/`.
2. Classify and move new components as they are touched; do not batch-migrate everything at once.
3. Add `docs/atomic-migration.md` to track legacy → target mapping.
4. Add Storybook docs page summarizing layers.

---

Reach out or open a discussion issue if a component doesn't neatly fit a layer—edge cases help refine this model.
