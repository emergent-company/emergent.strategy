# Reference Projects

This folder holds external, read-only reference projects used for inspiration and selective extraction of patterns/components. Code here MUST NOT be imported at runtime by our app. Treat these as design libraries and examples only.

Policy
- Keep each reference in its own subfolder (e.g., `reference/nexus`).
- Prefer adding as a Git submodule to preserve original history and allow updates.
- Do not edit code inside reference folders; copy patterns into our codebase instead.
- Respect licenses and attribution. Preserve headers when copying code.

Nexus React (3.0.0)
- Repo: git@github.com:eyedea-io/Nexus-React-3.0.0.git
- Purpose: UI/UX reference for React + Vite + TypeScript + Tailwind CSS (v4) + daisyUI (v5) and Iconify (Lucide) usage.
- Location (recommended): `reference/nexus`

react-daisyui
- Repo: https://github.com/daisyui/react-daisyui
- Purpose: Source reference for standalone React component patterns aligned with daisyUI 5. Used to manually copy specific component implementations when a richer baseline than our existing code is helpful.
- Location: `reference/react-daisyui`

Suggested setup (submodule)
1) Add the submodule:
   git submodule add -b master git@github.com:eyedea-io/Nexus-React-3.0.0.git reference/nexus
2) Initialize and update submodules on fresh clones:
   git submodule update --init --recursive
3) To pull latest from upstream:
   git -C reference/nexus pull origin master

Pinning and updates
- Submodules are pinned by commit. After updating to latest master, stage and commit the submodule pointer:
   git submodule update --remote --merge reference/nexus
   git add reference/nexus
   git commit -m "chore(reference): bump nexus"
   git push

Notes
- Prefer `git submodule update --remote --merge reference/nexus` to move the pointer forward, rather than only pulling inside the submodule. The superproject commit should record the new pointer.

Usage guidelines
- Never import from `reference/` at runtime.
- ESLint safeguard: `no-restricted-imports` rule blocks `reference/**` imports in app code.
- When extracting a component:
  - Rewrite to strict TypeScript (no `any`) and align with our lint/format rules.
  - Replace ad-hoc styles with Tailwind + daisyUI classes when possible.
  - Use Iconify with Lucide classes: `<span className="iconify lucide--home"></span>`.
  - Add Storybook stories/tests where applicable.
  - Integrate with `apps/admin/src/contexts/config.ts` for theme/font/direction when relevant.

Cleanup
- If a reference is no longer needed, remove the submodule and folder:
  git submodule deinit -f reference/nexus
  git rm -f reference/nexus
  rm -rf .git/modules/reference/nexus
