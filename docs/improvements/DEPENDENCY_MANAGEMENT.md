# Dependency Management Improvements

## Issues Discovered (December 2025)

### 1. Stale Compiled Config Files
**Problem**: `vite.config.js` was being loaded instead of `vite.config.ts` because Vite prefers `.js` files. The `.js` file was stale and missing `allowedHosts: true`.

**Fix Applied**:
- Deleted `vite.config.js` and `vite.config.d.ts`
- Added to `.gitignore` to prevent future occurrences

**Prevention**:
- Never commit compiled versions of TypeScript config files
- Add `vite.config.js`, `*.config.d.ts` patterns to `.gitignore`

### 2. Duplicate Dependencies with Version Conflicts
**Problem**: Root `package.json` had `vite: ^6.0.0` while `apps/admin` had `vite: ^7.0.6`. With pnpm hoisting, the wrong version was being resolved.

**Fix Applied**:
- Removed `vite` and `@vitejs/plugin-react` from root `package.json`

### 3. Current Version Mismatches (Need Review)

The following packages have version mismatches between root and apps. Consider consolidating:

| Package | Root | Admin | Server |
|---------|------|-------|--------|
| `@ai-sdk/react` | ^2.0.97 | ^2.0.104 | - |
| `@modelcontextprotocol/sdk` | ^1.1.7 | - | ^1.23.0 |
| `zod` | ^3.23.8 | ^3.25.76 | ^3.25.76 |
| `typescript` | ^5.5.4 | ^5.8.3 | - |
| `prettier` | ^2.6.2 | ^3.6.2 | - |
| `@types/node` | ^22.17.2 | ^24.1.0 | - |

## Recommendations

### Immediate Actions
1. ✅ Remove app-specific build tools from root (vite, @vitejs/plugin-react)
2. ✅ Add compiled config files to .gitignore
3. ⏳ Audit which dependencies truly need to be at root level

### Best Practices Going Forward

#### Root package.json should contain:
- Workspace-wide tooling (nx, husky, prettier)
- Shared runtime dependencies used by multiple apps
- Scripts that orchestrate the monorepo

#### App package.json should contain:
- App-specific build tools (vite, webpack, etc.)
- App-specific dependencies
- App-specific type definitions

### Cleanup Script

Run this to find potential issues:

```bash
# Find duplicate dependencies between root and apps
pnpm ls --depth=0 -r | grep -E "^(├|└)" | sort | uniq -d

# Find stale compiled config files
find . -name "*.config.js" -newer "*.config.ts" 2>/dev/null
```

### pnpm Configuration

Consider adding to `.npmrc`:
```ini
# Prevent hoisting of app-specific packages
public-hoist-pattern[]=!vite
public-hoist-pattern[]=!@vitejs/*
```

Or use `pnpm-workspace.yaml` to control hoisting:
```yaml
packages:
  - 'apps/*'
  - 'tools/*'
```

## Process Improvements

### When Adding New Dependencies
1. Determine if it's workspace-wide or app-specific
2. Add to the appropriate `package.json`
3. Run `pnpm install` and verify correct resolution with `pnpm why <package>`

### When Upgrading Dependencies
1. Check for version conflicts: `pnpm ls <package> -r`
2. Update all instances to the same version if shared
3. Test all affected apps after upgrade

### Pre-commit Checks
Consider adding a lint rule to detect:
- `.config.js` files that have corresponding `.config.ts` files
- Version mismatches in shared dependencies
