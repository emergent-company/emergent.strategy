# Planned ESLint Rules: Legacy Layout Import Restrictions

Goal: After atomic migration completes (target: 2025-11), disallow importing from legacy layout paths when an atomic equivalent exists.

## Phase 1 (Current - Advisory)
- Provide migration tracker (`atomic-migration.md`).
- Shims emit `console.warn` in development.

## Phase 2 (Pre-Cutover ~2025-10)
- Add custom ESLint rule (or `no-restricted-imports`) entries generated from tracker rows where `Shim File Present = Yes`.
- Rule config in `apps/admin/eslint.config.mjs` with message: `Use atomic path: <new-path>`.
- Allow overrides in tests/stories via inline `eslint-disable-next-line` only if refactor deferred.

## Phase 3 (Cutover 2025-11)
- Remove shim files & tracker rows (or mark `removed`).
- Elevate rule severity to `error`.
- CI blocks on violations.

## Draft Config Snippet (Phase 2)
```js
// eslint.config.mjs
import js from '@eslint/js'
// ...existing imports

const restricted = [
  { name: '@/components/layout/Topbar', message: 'Use @/components/organisms/Topbar' },
  { name: '@/components/layout/Footer', message: 'Use @/components/organisms/Footer' },
  { name: '@/components/layout/Rightbar', message: 'Use @/components/organisms/Rightbar' },
  // generated entries for sidebar + partials...
]

export default [
  js.configs.recommended,
  // ...other configs
  {
    rules: {
      'no-restricted-imports': [
        'warn',
        { paths: restricted }
      ]
    }
  }
]
```

## Automation Idea
Add a script to read `atomic-migration.md` table rows and regenerate `restricted` array. Run via `npm run gen:eslint-restricted` and commit changes.

## Open Questions
- Should we restrict star/glob imports from `components/layout/**` wholesale in Phase 3? (Likely yes.)
- Enforce removal of re-export shims with a codemod?

---
Created: 2025-09-20
Maintainer: Atomic Migration WG