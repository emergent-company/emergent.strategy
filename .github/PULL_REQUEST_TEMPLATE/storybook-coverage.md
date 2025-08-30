## Summary
Describe the change, the user impact, and the primary components touched.

## Storybook Coverage Checklist
- [ ] For every component created/renamed/refactored in `apps/admin/src/components/**`, a typed CSF story (`*.stories.tsx`) exists or was updated in the same PR.
- [ ] Stories import the same app styles so visuals match the app.
- [ ] Stories work with global providers (router, ConfigProvider, AuthProvider) via Storybook preview decorators.
- [ ] Key states included where sensible (default, loading/skeleton, empty, error, disabled, interactive).
- [ ] No `any` types in story args/props.

## Notes
Add links to Storybook knobs/controls you added and any follow-up tasks if coverage was deferred for trivial wrappers. 
