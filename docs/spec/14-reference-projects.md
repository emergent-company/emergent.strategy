# Reference Projects

This document defines how we use external codebases as references for design, architecture, and reusable UI patterns without directly coupling our runtime to them. Reference projects live in the repository under `reference/` and are treated as read-only sources of inspiration.

## Goals
- Preserve a clean, minimal app while leveraging proven patterns from high-quality templates.
- Enable selective extraction of components and ideas with proper attribution and licensing.
- Prevent accidental runtime imports from reference code.

## Folder Structure
- `reference/` — root folder for all references (read-only).
  - One subfolder per reference (e.g., `reference/nexus`).
  - Prefer Git submodules to retain history and allow updates.
- App code must never import from `reference/` at runtime.

## Current Reference
- Name: Nexus React (3.0.0)
- Repo: `git@github.com:eyedea-io/Nexus-React-3.0.0.git`
- Purpose: UI/UX reference for React + Vite + TypeScript + Tailwind CSS (v4) + daisyUI (v5) and Iconify (Lucide) patterns.
- Location (recommended): `reference/nexus`

Suggested setup (submodule)
- Add: `git submodule add -b master git@github.com:eyedea-io/Nexus-React-3.0.0.git reference/nexus`
- Init on fresh clones: `git submodule update --init --recursive`
- Update: `git -C reference/nexus pull origin master`

See also: `reference/README.md` for the operational policy and commands.

## Policy
- Read-only: do not modify code inside `reference/**`. Copy patterns into our app instead.
- No runtime imports: never import from paths under `reference/`. Treat as examples only.
- Licensing: keep license headers and honor original licenses when copying code. Add attribution notes in copied files when required.
- Minimalism: keep our app free of unused template code; only copy what we use.

## How to Extract a Component/Pattern
When taking something from a reference project:
1. Identify the smallest reusable unit (component/hook/util) and its dependencies.
2. Create a new, strongly typed component/hook in our codebase (no `any`).
   - Location: `apps/admin/src/components/**` (or `hooks/**`, `utils/**` as appropriate).
3. Styling: prefer Tailwind CSS utilities and daisyUI 5 component classes. Avoid custom CSS unless required; if needed, add overrides to `apps/admin/src/styles/core/components.css` and import via `apps/admin/src/styles/app.css`.
4. Icons: use Iconify with Lucide classes, e.g. `<span className="iconify lucide--home"></span>`.
5. Global config: integrate with `useConfig` (theme/font/direction) in `apps/admin/src/contexts/config.ts` where relevant.
6. State/props: define explicit prop interfaces and default values; ensure accessibility (aria, roles, focus order).
7. Stories: add a typed CSF Storybook story next to the component (`*.stories.tsx`) covering default and key states.
8. Tests (where reasonable): include minimal unit tests for logic-heavy hooks/utils.
9. Docs: add a brief comment noting the origin (reference project + file path) and any deviations.

## Cleanup and Separation
- We started from the Nexus template. Moving forward, remove unused template code from the app and keep Nexus only as a reference under `reference/nexus`.
- Exception: we keep a minimal Public Landing page in our app (routes `/` and alias `/landing`). All other template demo pages (dashboards, ecommerce, file-manager, generic component galleries) should be removed from runtime and, if needed, referenced via `reference/nexus`.
- Avoid “wrapper on wrapper” layers; prefer straightforward components aligned with our actual needs.

## (Optional) Safeguards
To prevent accidental imports from `reference/`, consider:
- ESLint rule (no-restricted-imports or no-restricted-paths) to block `reference/**` in app source.
- CI grep check that fails if `from "reference/"` or `from '../reference'` appears in app files.

## Adding Future References
- Criteria: proven quality, compatible stack (React 19, Vite, Tailwind v4, daisyUI v5), permissive license.
- Process: add as a submodule under `reference/<name>`, document the purpose in `reference/README.md`, and update this spec with guidelines specific to that reference if needed.

---

Appendix: Quick Checklist for Component Extraction
- [ ] Prop types defined (no `any`), sensible defaults, and JSDoc comments for complex props.
- [ ] Tailwind/daisyUI classes only; minimal overrides; no unused styles.
- [ ] Iconify Lucide icons used; accessibility attributes present.
- [ ] `useConfig` integration for theme-related behavior (if applicable).
- [ ] Storybook story present with default + key states; renders with app styles.
- [ ] Licenses respected; origin noted in file header comment.
- [ ] No imports from `reference/**` remain in the final code.
