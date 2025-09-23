# Atomic Migration Tracking

> Source of truth for component migrations from legacy paths (e.g. `src/components/layout/sidebar/...`) into atomic layer directories. Shims remain until 2025-11 unless otherwise noted. Remove rows (or mark `removed`) once shim file is deleted.

| Legacy Path | New Atomic Path | Layer | Shim File Present | Planned Removal | Notes |
|-------------|-----------------|-------|-------------------|-----------------|-------|
| `components/layout/sidebar/MenuItemBadges` | `components/atoms/SidebarMenuItemBadges` | Atom | Yes | 2025-11 | Pure visual badges. |
| `components/layout/sidebar/MenuItem` | `components/molecules/SidebarMenuItem` | Molecule | Yes | 2025-11 | Handles nested + collapsible logic. |
| `components/layout/sidebar/Section` | `components/organisms/SidebarSection` | Organism | Yes | 2025-11 | Activation delegated via props when provided. |
| `components/layout/sidebar/ProjectDropdown` | `components/organisms/SidebarProjectDropdown` | Organism | Yes | 2025-11 | Stateless; consumers pass projects + handlers. |
| `components/layout/sidebar/ProjectDropdown/ProjectItem` | `components/molecules/SidebarProjectItem` | Molecule | Yes | 2025-11 | Single project row. |
| `components/layout/sidebar/Sidebar` | `components/organisms/Sidebar` | Organism | Yes | 2025-11 | Migrated with static member shims. |
| `components/layout/sidebar/helpers` | `utils/sidebar/activation` | Util | Yes | 2025-11 | Exports `getActivatedItemParentKeys`. |
| `components/PageTitle (breadcrumb + hero variants)` | `components/molecules/PageTitle` | Molecule | Removed (2025-09-20) | 2025-11 | Shim deleted; import directly from molecules path. |
| `components/PageTitle (hero variant)` | `components/molecules/PageTitleHero` | Molecule | Removed (2025-09-20) | 2025-11 | Shim deleted. |
| `components/ui/Icon` | `components/atoms/Icon` | Atom | Removed (2025-09-20) | 2025-11 | Shim early-removed; legacy story/tests blanked. |
| `components/LoadingEffect` | `components/atoms/LoadingEffect` | Atom | Removed (2025-09-20) | 2025-11 | Shim deleted; story relocated under atoms. |
| `components/Logo` | `components/atoms/Logo` | Atom | Removed (2025-09-20) | 2025-11 | Shim deleted; story relocated under atoms. |
| `components/ui/IconButton` | `components/molecules/IconButton` | Molecule | Removed (2025-09-20) | 2025-11 | Shim early-removed; legacy story/tests blanked. |
| `components/chat/ChatCtaCard` | `components/molecules/ChatCtaCard` | Molecule | Removed (2025-09-20) | 2025-11 | Shim deleted; collocated story in place. |
| `components/chat/ChatPromptActions` | `components/molecules/ChatPromptActions` | Molecule | Removed (2025-09-20) | 2025-11 | Shim deleted; collocated story added. |
| `components/chat/ChatPromptComposer` | `components/molecules/ChatPromptComposer` | Molecule | Removed (2025-09-20) | 2025-11 | Shim deleted; collocated story in place. |
| `components/TableEmptyState` | `components/molecules/TableEmptyState` | Molecule | Yes | 2025-11 | Table row empty-state renderer. |
| `components/ui/Tooltip` | `components/atoms/Tooltip` | Atom | Removed (2025-09-20) | 2025-11 | Shim early-removed; legacy story/tests blanked. |
| `components/ThemeToggle` | `components/molecules/ThemeToggle` | Molecule | Removed (2025-09-20) | 2025-11 | Shim deleted; collocated story retained. |
| `components/ui/Button` | `components/atoms/Button` | Atom | Removed (2025-09-20) | 2025-11 | Shim early-removed; legacy story/tests blanked. |
| `components/layout/Topbar` | `components/organisms/Topbar` | Organism | Yes | 2025-11 | Decomposed into partials; shim warns. |
| `components/layout/TopbarProfileMenu` | `components/organisms/Topbar/partials/TopbarProfileMenu` | Organism-Partial | Yes | 2025-11 | Profile dropdown partial. |
| `components/layout/TopbarLeftmenuToggle` | `components/organisms/Topbar/partials/TopbarLeftmenuToggle` | Organism-Partial | Yes | 2025-11 | Sidebar open/close trigger. |
| `components/layout/TopbarRightbarButton` | `components/organisms/Topbar/partials/TopbarRightbarButton` | Organism-Partial | Yes | 2025-11 | Rightbar toggle trigger. |
| `components/layout/TopbarSearchButton` | `components/organisms/Topbar/partials/TopbarSearchButton` | Organism-Partial | Yes | 2025-11 | Search modal trigger. |
| `components/layout/TopbarNotificationButton` | `components/organisms/Topbar/partials/TopbarNotificationButton` | Organism-Partial | Yes | 2025-11 | Notifications dropdown trigger. |
| `components/layout/Footer` | `components/organisms/Footer` | Organism | Yes | 2025-11 | Added props for status message & year override. |
| `components/layout/Rightbar` | `components/organisms/Rightbar` | Organism | Yes | 2025-11 | Customization drawer. |
| `components/layout/RightbarThemeSelector` | `components/organisms/Rightbar/partials/RightbarThemeSelector` | Organism-Partial | Yes | 2025-11 | Theme selection grid. |
| `components/layout/RightbarSidebarThemeSelector` | `components/organisms/Rightbar/partials/RightbarSidebarThemeSelector` | Organism-Partial | Yes | 2025-11 | Sidebar theme choice. |
| `components/layout/RightbarFontSelector` | `components/organisms/Rightbar/partials/RightbarFontSelector` | Organism-Partial | Yes | 2025-11 | Font family selector. |
| `components/layout/RightbarDirectionSelector` | `components/organisms/Rightbar/partials/RightbarDirectionSelector` | Organism-Partial | Yes | 2025-11 | Text direction selector. |
| `components/PageTitle (legacy root duplicate stories)` | (removed) | Docs Artifact | Removed (2025-09-20) | 2025-11 | Root duplicate stories eliminated; canonical molecules stories retained. (Confirmed purged) |
| `components/ThemeToggle (legacy root duplicate story)` | (removed) | Docs Artifact | Removed (2025-09-20) | 2025-11 | Root duplicate eliminated. (Confirmed purged) |
| `components/PageTitleHero (legacy root duplicate story)` | (removed) | Docs Artifact | Removed (2025-09-20) | 2025-11 | Root duplicate eliminated. (Confirmed purged) |
| `components/ui/* test placeholders` | (removed) | Test Artifacts | Removed (2025-09-20) | 2025-11 | All deprecated placeholder tests deleted. |

## Conventions
- Shim pattern: legacy file imports new component and warns in development: `console.warn('[DEPRECATED] ...')`.
- All new components must have appropriately scoped Storybook stories (no composite-parent leakage) except when trivially covered.
- Do not expand shim functionality; only re-export.
- Update this document with each migration.

## Storybook Colocation Convention

All component stories must be collocated with their component following Atomic layers:

- Atoms: `src/components/atoms/<Component>/<Component>.stories.tsx`
- Molecules: `src/components/molecules/<Component>/<Component>.stories.tsx`
- Organisms: `src/components/organisms/<Component>/<Component>.stories.tsx`

Rules:
1. One component per story file (no composite/overview implementations that assemble multiple organisms).
2. Story `title` hierarchy mirrors layer path (e.g., `Atoms/Sidebar/SidebarMenuItemBadges`, `Molecules/Sidebar/SidebarProjectItem`, `Organisms/Sidebar/SidebarSection`).
3. Deprecated legacy story locations under `components/ui` and `components/layout/sidebar` were removed. Shims remain only for runtime imports until deprecation date.
4. New components must add a story in the same PR; absence blocks migration completion.
5. Overview/demo stories (e.g., previous `UI.overview`, `Forms.overview`, `Chat.overview`) are considered documentation and should be refactored into MDX docs pages if still needed.

Enforcement Plan:
- Future ESLint rule (see `eslint-legacy-import-plan.md`) may also validate story path patterns.
- CI can grep for `src/components/(atoms|molecules|organisms)/**/!(*.stories).tsx` without adjacent `.stories.tsx` to flag missing stories.

## Next Candidates
1. Introduce ESLint rule forbidding legacy sidebar imports.
2. Migrate any residual layout-only utilities (audit needed).

## Post-Migration Hardening Ideas
- ESLint rule to forbid importing from `layout/sidebar/*` when atomic equivalent exists.
- CI script to diff rows in this file vs actual shim presence.

---
_Last updated: 2025-09-20 (legacy duplicate & ui placeholders removal logged)_

## 2025-09-20 Audit Addendum (Reintroduced Duplicates / Misplacements)

During a fresh scan of `src/components/` the following items are currently present and should be addressed before the November shim sunset:

| Issue Type | Path | Details | Recommended Action |
|------------|------|---------|--------------------|
| Duplicate Story (deprecated) | `components/PageTitle.stories.tsx` | Legacy root story (title `Deprecated/PageTitleLegacy`) duplicates `molecules/PageTitle/PageTitle.stories.tsx`. Marked hidden. | Delete file; rely on collocated molecule story. |
| Duplicate Story (deprecated) | `components/PageTitleHero.stories.tsx` | Legacy root story (title `Deprecated/PageTitleHeroLegacy`) duplicates `molecules/PageTitleHero/PageTitleHero.stories.tsx`. | Delete file. |
| Duplicate Story (deprecated) | `components/ThemeToggle.stories.tsx` | Legacy root story (title `Deprecated/ThemeToggleLegacy`) duplicates `molecules/ThemeToggle/ThemeToggle.stories.tsx`. | Delete file. |
| Story Misclassification | `components/TableEmptyState.stories.tsx` | Story lives at root with title `Tables/TableEmptyState` while component has migrated to `molecules/TableEmptyState`. | Move story next to component or remove root version if already collocated (add molecule story). |
| Shim Still Present (Root Exports) | `components/PageTitle.tsx` | Re-export shim for PageTitle + Hero. | Keep until 2025-11; add removal task. |
| Shim Still Present (Root Exports) | `components/ThemeToggle.tsx` | Re-export shim. | Keep until 2025-11. |
| Shim Still Present (Root Exports) | `components/LoadingEffect.tsx` | Re-export shim. | Keep until 2025-11. |
| Shim Still Present (Root Exports) | `components/Logo.tsx` | Re-export shim. | Keep until 2025-11. |
| Orphan Story (needs relocation) | `components/LoadingEffect.stories.tsx` | Title `Feedback/LoadingEffect`; component now an Atom. | Rename title to `Atoms/LoadingEffect` & move story to `atoms/LoadingEffect/` or add new story there, then delete root file. |
| Potential Category Drift | `components/Logo.stories.tsx` | Story is root-level but uses title `Atoms/Logo`; duplicate may exist/should live under `atoms/Logo/`. | Relocate to `atoms/Logo/Logo.stories.tsx` and remove root file. |

### Action Checklist
1. Remove deprecated root duplicate stories: PageTitleLegacy, PageTitleHeroLegacy, ThemeToggleLegacy.
2. Relocate `LoadingEffect.stories.tsx` to `atoms/LoadingEffect/` with corrected title `Atoms/LoadingEffect` (or adjust existing if already there later).
3. Relocate `Logo.stories.tsx` into `atoms/Logo/` (ensure no conflicting story already exists; if one exists, delete root copy).
4. Create collocated molecule story for `TableEmptyState` (currently only root `Tables/TableEmptyState` story) and then delete root story or convert root to MDX docs page.
5. After relocation deletions, re-run `stories:validate` to confirm zero deprecated entries.
6. Schedule shim file removal tasks (convert each shim row from `Yes` to `Removed (<date>)` as they are deleted).

### Enforcement Note
Add a validation rule extension: fail build if any `title` starts with `Deprecated/` after 2025-10-15 to accelerate cleanup ahead of final cut.

---
