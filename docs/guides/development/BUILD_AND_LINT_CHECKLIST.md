# Build and Lint Checklist

**Always run these checks at the end of every implementation!**

## Quick Commands

```bash
# Admin (Frontend)
npx nx run admin:build    # TypeScript compilation + Vite build
npx nx run admin:lint     # ESLint code quality checks

# Server (Backend)
npx nx run server:build    # TypeScript compilation
# Note: server doesn't have lint configured yet
```

## Full Verification Script

```bash
#!/bin/bash
# Run all checks

echo "🔍 Checking Admin Frontend..."
npx nx run admin:build
if [ $? -ne 0 ]; then
    echo "❌ Admin build failed!"
    exit 1
fi

npx nx run admin:lint
if [ $? -ne 0 ]; then
    echo "❌ Admin lint failed!"
    exit 1
fi

echo "✅ Admin checks passed!"

echo "🔍 Checking Server Backend..."
npx nx run server:build
if [ $? -ne 0 ]; then
    echo "❌ Server build failed!"
    exit 1
fi

echo "✅ Server checks passed!"
echo "🎉 All checks passed successfully!"
```

## Recent Session (October 22, 2025)

### Issues Found and Fixed

1. **WorkspaceTree.stories.tsx** - Missing `documents` field
   - **Problem**: 18 TypeScript errors - `ClickUpSpace` interface requires `documents: ClickUpDocument[]` field
   - **Root Cause**: Mock data in Storybook stories didn't include the required `documents` property
   - **Fix**: Added `documents: []` to all space objects in the stories file
   - **Files Changed**: `apps/admin/src/pages/admin/pages/integrations/clickup/WorkspaceTree.stories.tsx`

2. **app.ts fixture** - Empty object pattern in TypeScript
   - **Problem**: ESLint error `no-empty-pattern` for `async ({ }, use, testInfo)`
   - **Fix**: Changed to `async (_unusedFixture, use, testInfo)`
   - **Files Changed**: `apps/admin/e2e/fixtures/app.ts`

3. **ESLint ignoring generated files**
   - **Problem**: ESLint checking generated files (coverage/, storybook-static/) with irrelevant errors
   - **Fix**: Updated `eslint.config.mjs` to ignore `coverage` and `storybook-static` directories
   - **Files Changed**: `apps/admin/eslint.config.mjs`

### Final Results

✅ **Admin Build**: SUCCESS (6 seconds)  
✅ **Admin Lint**: SUCCESS (2 seconds)  
✅ **Server Build**: SUCCESS (4 seconds)

## Common Issues

### TypeScript Compilation Errors

**Symptoms**: `error TS2741: Property 'X' is missing in type 'Y'`

**Solution**: 
1. Check interface definitions in `src/api/` or type files
2. Ensure all required properties are provided in mock data
3. Use TypeScript's type system to guide you - hover over the type to see what's required

### ESLint Errors in Generated Files

**Symptoms**: Errors in `coverage/`, `dist/`, `storybook-static/` directories

**Solution**: Add these directories to the `ignores` array in `eslint.config.mjs`:

```javascript
export default tseslint.config({ 
    ignores: ["dist", "coverage", "storybook-static"] 
}, {
    // ... rest of config
});
```

### Empty Object Pattern

**Symptoms**: `error no-empty-pattern Unexpected empty object pattern`

**Solution**: Replace `{ }` with a named parameter like `_unusedFixture` or `_props`

```typescript
// ❌ Bad
async ({ }, use) => { }

// ✅ Good
async (_unusedFixture, use) => { }
```

## Best Practices

1. **Always run build before committing**
   - Catches TypeScript errors early
   - Ensures production build will succeed

2. **Run lint to maintain code quality**
   - Catches common mistakes
   - Enforces consistent code style
   - Identifies unused variables and imports

3. **Fix errors immediately**
   - Don't let them accumulate
   - Easier to fix when context is fresh
   - Prevents blocking other work

4. **Check both admin and server**
   - Frontend and backend are independent
   - Changes in shared types affect both
   - Full-stack confidence before deployment

5. **Use Nx caching**
   - Nx caches successful builds
   - Subsequent runs are faster if nothing changed
   - Run with `--skip-nx-cache` to force fresh build

## Integration with Development Workflow

### During Feature Development

```bash
# 1. Make changes to code
# 2. Quick type check (faster than full build)
cd apps/admin && npm run build -- --mode development

# 3. Fix any errors
# 4. Before committing, run full checks
npx nx run admin:build
npx nx run admin:lint
npx nx run server:build
```

### Before Creating PR

```bash
# Run all checks
npx nx run admin:build && \
npx nx run admin:lint && \
npx nx run server:build && \
echo "✅ Ready for PR!"
```

### CI/CD Pipeline

These same commands should run in CI:

```yaml
# .github/workflows/ci.yml
- name: Build Admin
  run: npx nx run admin:build

- name: Lint Admin  
  run: npx nx run admin:lint

- name: Build Server
  run: npx nx run server:build
```

## Troubleshooting

### Build is slow

- Use `--skip-nx-cache` to bypass cache if you suspect stale build
- Check if `node_modules` needs refresh: `npm install`
- Vite build can take 3-6 seconds, TypeScript check is instant

### Lint finds too many errors

- Fix them one at a time
- Use `--fix` to auto-fix: `npx nx run admin:lint -- --fix`
- Focus on actual source code errors, ignore generated files

### Server build fails with module errors

- Check `tsconfig.json` paths configuration
- Ensure all imports use correct paths (e.g., `@/common/...`)
- Verify `package.json` dependencies are installed

## Summary

**Golden Rule**: At the end of every implementation session:

```bash
npx nx run admin:build && npx nx run admin:lint && npx nx run server:build
```

If all three pass, you're good to commit! 🎉

---

**Last Updated**: October 22, 2025  
**Status**: All checks passing ✅
