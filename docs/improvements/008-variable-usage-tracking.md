# Variable Usage Tracking in Environment Verification

**Date:** 2024-11-21  
**Category:** Developer Experience  
**Status:** Implemented

## Overview

Enhanced the environment verification script (`scripts/verify-env.mjs`) to track and report **which files in our source code** use each environment variable. This helps identify unused configuration and understand where variables are referenced.

## Problem

Previously, the verification script could tell you if a variable was defined, but not:

1. **Where it's actually used** - Which specific files reference each variable
2. **If it's dead code** - Variables that are defined but never used
3. **Usage scope** - Whether a variable is used in one place or throughout the codebase
4. **Refactoring impact** - Which files need updating when changing a variable

## Solution

Added a `--usage` flag that searches **only our source code** (not dependencies) using ripgrep to list which files use each variable.

### Features

1. **File Listing by Variable**

   - Shows actual file paths where each variable is used
   - Searches only in `apps/`, `scripts/`, `tools/` directories
   - Excludes: `node_modules`, `dist`, `build`, `.next`, `coverage`
   - Excludes the verification script itself (avoid false positives)

2. **Usage Categories**

   - **Unused (0 files)** - Variables defined but never referenced in source code
   - **Single file** - Variable used in only one file
   - **Multiple files** - Variable used across codebase

3. **Detailed Reporting**
   - Summary: "X unused, Y used (Z in single file)"
   - Verbose mode: Shows up to 5 files per variable
   - Color-coded: Cyan for single-file, blue for 2-3 files, default for more
   - Sorted by file count (most widely used first)

### Search Scope

The script searches for variable names (with word boundaries) in:

- TypeScript files (`.ts`, `.tsx`)
- JavaScript files (`.js`, `.jsx`, `.mjs`)
- Our source directories: `apps/`, `scripts/`, `tools/`

It does NOT search:

- `node_modules/` - dependencies
- `dist/`, `build/` - build artifacts
- `.next/`, `coverage/` - framework/tool directories
- `verify-env.mjs` itself - avoid false positives from variable definitions

## Usage

### Basic Usage List

```bash
npm run verify-env -- --usage
```

Shows unused variables only (summary).

### Detailed File Listing

```bash
npm run verify-env -- --usage --verbose
```

Shows which files use each variable, with up to 5 files listed per variable.

### Quick Mode Compatible

```bash
npm run verify-env -- --usage --quick
```

Works with `--quick` (skips connectivity tests, still analyzes usage).

## Example Output

### Summary (default)

```
─── Unused Variables ───
⚠️  GOOGLE_REDIRECT_URL is defined but not used in source code
⚠️  ORGS_DEMO_SEED is defined but not used in source code

✅ Usage analysis complete: 7 unused, 63 used (9 in single file)
```

### Detailed List (--verbose)

```
─── Variable Usage by File ───

NODE_ENV (39 files)
  • scripts/setup-e2e-tests.mjs
  • tools/workspace-cli/src/config/application-processes.ts
  • tools/workspace-cli/src/config/env-profiles.ts
  • apps/server/vitest.e2e.config.ts
  • apps/server/src/common/config/config.schema.ts
  ... and 34 more file(s)

POSTGRES_PORT (23 files)
  • scripts/debug-vector-final-test.ts
  • scripts/setup-e2e-tests.mjs
  • apps/server/src/typeorm.config.ts
  • apps/server/src/common/config/config.schema.ts
  • apps/server/tests/e2e/e2e-context.ts
  ... and 18 more file(s)

CORS_ORIGIN (1 file)
  • apps/server/src/main.ts

TEST_USER_EMAIL (1 file)
  • scripts/test-chat-sdk-search.mjs
```

## Benefits

1. **Identify Dead Code**

   - See which variables are truly unused in source code
   - Distinguish between runtime-only vars and dead config

2. **Understand Variable Scope**

   - Single-file variables might be feature-specific
   - Multi-file variables are critical infrastructure
   - Know the impact radius before changing anything

3. **Safe Refactoring**

   - See exactly which files need updating
   - No guessing about where a variable is used
   - Confidently remove unused variables

4. **Code Navigation**
   - Jump directly to files using a specific variable
   - Understand configuration dependencies
   - Document variable usage automatically

## Real Results

From the actual codebase:

- **70 total variables** tracked
- **7 unused variables** (defined but not referenced in source)
  - 5 not set (optional variables)
  - 2 set but unused (`GOOGLE_REDIRECT_URL`, `ORGS_DEMO_SEED`)
- **63 used variables**
  - 9 used in single file only
  - 54 used across multiple files
- **Most used**: `NODE_ENV` (39 files)
- **Performance**: ~5 seconds to analyze entire codebase

## Implementation Details

### Files Modified

- `scripts/verify-env.mjs` - Added file listing functionality
- `docs/technical/environment-verification.md` - Updated documentation

### Technical Approach

1. **Collect Variables**: Gather all from `varSpecs`
2. **Search with ripgrep**: Use `rg -l -w 'VARNAME'` to list files
3. **Filter Results**: Remove excluded directories and files
4. **Categorize**: Group by usage (unused, single-file, multi-file)
5. **Report**: Display summary and optionally detailed list

### Command Details

```bash
rg -l -w 'VARIABLE_NAME' \
  apps/ scripts/ tools/ \
  -t ts -t js \
  --glob '!**/node_modules/**' \
  --glob '!**/dist/**' \
  --glob '!**/build/**' \
  --glob '!**/.next/**' \
  --glob '!**/coverage/**' \
  --glob '!**/verify-env.mjs'
```

- `-l` - List files only (not line matches)
- `-w` - Word boundary matching (avoid partial matches)
- `-t ts -t js` - TypeScript and JavaScript files only
- `--glob '!...'` - Exclude patterns

### Performance

- Uses ripgrep (Rust-based, extremely fast)
- Takes ~5 seconds for 70 variables across entire codebase
- Minimal overhead, can run in CI/CD
- Works with `--quick` mode (independent of connectivity tests)

## Limitations

1. **Source Code Only**

   - Only searches our code, not dependencies
   - This is intentional - we care about OUR usage
   - Runtime-only variables may show as "unused"

2. **Static Analysis**

   - Won't find dynamic property access: `process.env[varName]`
   - Won't find destructured variables: `const {VAR} = process.env`
   - These patterns are rare in the codebase

3. **False Negatives**
   - Variables used only at runtime (e.g., by NestJS, TypeORM)
   - Variables accessed dynamically
   - These show as "unused" but with note "May be used at runtime"

## Future Enhancements

1. **Interactive Mode**

   - Click on variable to jump to file
   - Show usage context (surrounding lines)
   - Filter by directory or app

2. **Additional Metrics**

   - Group by app (admin vs server)
   - Show usage trends over time
   - Detect newly added unused variables

3. **Integration**
   - Pre-commit hook to warn about unused variables
   - CI/CD check to prevent adding dead config
   - Automated PR comments with usage stats

## Related Documentation

- `docs/technical/environment-verification.md` - Complete verification guide
- `docs/fixes/056-vertex-ai-model-configuration-investigation.md` - Related investigation
- `docs/fixes/057-vertex-ai-location-consolidation.md` - Related refactoring

## Testing

Tested with:

- All variable types (required, optional, secrets)
- Single-file and multi-file usage patterns
- Unused variables (both set and unset)
- Large codebase (70+ variables, 1000+ files)
- Verbose and non-verbose modes

Results:

- ✅ Correctly identifies unused variables
- ✅ Lists actual source files (not dependencies)
- ✅ Fast performance (~5 seconds)
- ✅ Accurate file counts and listings
- ✅ Proper exclusion of build artifacts and node_modules
