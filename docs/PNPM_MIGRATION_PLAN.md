# pnpm Migration Plan

## Executive Summary

**Objective**: Migrate from npm to pnpm for improved performance, stricter dependency resolution, and better monorepo support.

**Benefits**:
- **Faster installs**: 2-3x faster than npm (hard links + content-addressable storage)
- **Disk efficiency**: Single copy of dependencies shared across projects
- **Stricter resolution**: Catches phantom dependencies (imports that work by accident)
- **Better monorepo**: Native workspace protocol support (`workspace:*`)
- **Production ready**: Used by Microsoft, Prisma, Turborepo, and many others

**Impact Areas**:
1. Local development (package.json scripts)
2. Docker builds (Dockerfiles)
3. CI/CD (GitHub Actions)
4. Documentation (README, guides)
5. Team onboarding

**Estimated Time**: 2-4 hours total (preparation + testing + documentation)

**Risk Level**: Medium (rollback available by keeping package-lock.json temporarily)

---

## Phase 1: Preparation (20 minutes)

### 1.1 Install pnpm globally

```bash
# Install pnpm globally
npm install -g pnpm

# Verify installation
pnpm --version  # Should be >=9.0.0

# Alternative: Use Corepack (Node.js 16.13+)
corepack enable
corepack prepare pnpm@latest --activate
```

### 1.2 Create pnpm workspace configuration

**File**: `pnpm-workspace.yaml` (root directory)

```yaml
packages:
  - 'apps/admin'
  - 'apps/server'
  - 'tools/workspace-cli'
```

### 1.3 Add packageManager field

**File**: `package.json` (root)

Add after line 4 (`"private": true`):

```json
  "packageManager": "pnpm@9.15.4",
```

This enforces the pnpm version and enables Corepack auto-installation.

### 1.4 Test initial installation

```bash
# Generate pnpm-lock.yaml
pnpm install

# Verify workspace structure
pnpm list --depth 0

# Test build commands
pnpm --filter admin build
pnpm --filter server build
```

**Expected results**:
- `pnpm-lock.yaml` created (much smaller than package-lock.json)
- Build succeeds for both apps
- No dependency resolution errors

---

## Phase 2: Update Local Development Scripts (30 minutes)

### 2.1 Root package.json scripts

**File**: `package.json`

#### Before (npm):
```json
"clean": "npm --prefix apps/server run clean || true && rimraf apps/admin/dist || true",
"build": "npm run clean && npm run build:server && npm run build:admin",
```

#### After (pnpm):
```json
"clean": "pnpm --filter server run clean || true && rimraf apps/admin/dist || true",
"build": "pnpm run clean && pnpm run build:server && pnpm run build:admin",
```

**Full script replacement map**:

| npm Command | pnpm Equivalent |
|-------------|----------------|
| `npm run <script>` | `pnpm run <script>` or `pnpm <script>` |
| `npm --prefix apps/admin run build` | `pnpm --filter admin run build` |
| `npm --prefix apps/server run test` | `pnpm --filter server run test` |
| `npm ci` | `pnpm install --frozen-lockfile` |
| `npm install` | `pnpm install` |

**Specific changes needed** (20 instances in root package.json):

```bash
# Line 14: clean
- "clean": "npm --prefix apps/server run clean || true && rimraf apps/admin/dist || true",
+ "clean": "pnpm --filter server run clean || true && rimraf apps/admin/dist || true",

# Line 30: build
- "build": "npm run clean && npm run build:server && npm run build:admin",
+ "build": "pnpm run clean && pnpm run build:server && pnpm run build:admin",

# Line 47-49: bench commands
- "bench:graph:relationships": "npm --prefix apps/server run bench:graph:relationships",
+ "bench:graph:relationships": "pnpm --filter server run bench:graph:relationships",
```

### 2.2 Workspace package scripts

**Files**:
- `apps/server/package.json`
- `apps/admin/package.json`

#### apps/server/package.json

```bash
# Line 11: build
- "build": "npm run clean && tsc -p tsconfig.json",
+ "build": "pnpm run clean && tsc -p tsconfig.json",

# Line 13-14: gen:openapi, test:prepare
- "gen:openapi": "npm run build && npm run openapi:run",
+ "gen:openapi": "pnpm run build && pnpm run openapi:run",

# Lines 15-26: test scripts (14 occurrences of "npm run")
- "test": "npm run test:prepare && vitest run --passWithNoTests",
+ "test": "pnpm run test:prepare && vitest run --passWithNoTests",
```

#### apps/admin/package.json

```bash
# Line 30-31: storybook scripts
- "storybook": "npm run stories:validate && nx run admin:serve:storybook -- --port=6006",
+ "storybook": "pnpm run stories:validate && nx run admin:serve:storybook -- --port=6006",
```

### 2.3 Nx project.json commands

**File**: `apps/server/project.json`

```bash
# Line 10, 31, 38, 59, 66, 73, 80, 87 (8 occurrences)
- "command": "npm --prefix apps/server run build",
+ "command": "pnpm --filter server run build",

- "command": "npm --prefix apps/server run start:dev",
+ "command": "pnpm --filter server run start:dev",
```

**Note**: Consider whether to use pnpm directly or keep using `nx run` commands which abstract the underlying tool.

### 2.4 Workspace CLI compatibility

**Verification needed**: Check if tools/workspace-cli has any npm-specific code.

```bash
# Search for hardcoded npm references
grep -r "npm " tools/workspace-cli/
```

---

## Phase 3: Update Docker Builds (45 minutes)

### 3.1 Admin Dockerfile

**File**: `apps/admin/Dockerfile`

#### Changes required:

**Line 1-2: Add pnpm installation in builder stage**
```dockerfile
FROM node:20-alpine AS builder

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate
```

**Line 47-49: Replace npm ci with pnpm**
```dockerfile
# Before
RUN --mount=type=cache,target=/root/.npm \
    npm ci --workspace=apps/admin --ignore-scripts && \
    echo "Dependencies installed successfully"

# After
RUN --mount=type=cache,target=/root/.local/share/pnpm/store \
    pnpm install --filter admin --frozen-lockfile && \
    echo "Dependencies installed successfully"
```

**Line 55: Update build command**
```dockerfile
# Before
RUN cd apps/admin && npm run build

# After
RUN cd apps/admin && pnpm run build
```

**Complete diff preview**:
```diff
 FROM node:20-alpine AS builder
 
+# Install pnpm
+RUN corepack enable && corepack prepare pnpm@latest --activate
+
 # Set NODE_ENV to development for build stage
 ENV NODE_ENV=development
 
@@ -40,14 +43,16 @@ WORKDIR /build
 
-# Copy root package files for workspace
-COPY package*.json ./
+# Copy pnpm workspace and root package files
+COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
 
-# Copy admin app package files
-COPY apps/admin/package*.json ./apps/admin/
+# Copy admin app package file
+COPY apps/admin/package.json ./apps/admin/
 
-# Install dependencies with npm cache mount (skip prepare scripts like husky in Docker)
-RUN --mount=type=cache,target=/root/.npm \
-    npm ci --workspace=apps/admin --ignore-scripts && \
+# Install dependencies with pnpm cache mount
+RUN --mount=type=cache,target=/root/.local/share/pnpm/store \
+    pnpm install --filter admin --frozen-lockfile && \
     echo "Dependencies installed successfully"
 
-RUN cd apps/admin && npm run build
+RUN cd apps/admin && pnpm run build
```

### 3.2 Server-nest Dockerfile

**File**: `apps/server/Dockerfile`

#### Changes required:

**Line 17-18: Add pnpm**
```dockerfile
FROM node:20-slim AS builder

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate
```

**Line 41-43: Update package file copies**
```dockerfile
# Before
COPY package.json package-lock.json ./
COPY apps/server/package.json apps/server/package-lock.json ./apps/server/

# After
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY apps/server/package.json ./apps/server/
```

**Line 52-54: Replace npm ci**
```dockerfile
# Before
RUN --mount=type=cache,target=/root/.npm \
    npm ci --workspace=apps/server --ignore-scripts

# After
RUN --mount=type=cache,target=/root/.local/share/pnpm/store \
    pnpm install --filter server --frozen-lockfile
```

**Line 67: Update build command**
```dockerfile
# Before
RUN cd apps/server && npm run build

# After
RUN cd apps/server && pnpm run build
```

**Complete diff preview**:
```diff
 FROM node:20-slim AS builder
 
+# Install pnpm
+RUN corepack enable && corepack prepare pnpm@latest --activate
+
 # Set NODE_ENV to development for build stage
 ENV NODE_ENV=development
 
@@ -35,20 +38,20 @@ RUN echo "=== DEBUG: Checking for apps directory ===" && \
         echo "apps directory DOES NOT EXIST"; \
     fi
 
-# Copy root workspace package files first
-COPY package.json package-lock.json ./
+# Copy pnpm workspace and root package files
+COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
 
-# Copy server package files
-COPY apps/server/package.json apps/server/package-lock.json ./apps/server/
+# Copy server package file
+COPY apps/server/package.json ./apps/server/
 
-# Install dependencies with npm cache mount (workspace-aware, skip prepare scripts like husky)
-RUN --mount=type=cache,target=/root/.npm \
-    npm ci --workspace=apps/server --ignore-scripts
+# Install dependencies with pnpm cache mount
+RUN --mount=type=cache,target=/root/.local/share/pnpm/store \
+    pnpm install --filter server --frozen-lockfile
 
-# Build the application
-RUN cd apps/server && npm run build
+# Build the application  
+RUN cd apps/server && pnpm run build
```

### 3.3 Update docker-compose files

**Files to check**:
- `docker/docker-compose.yml`
- `docker-compose.coolify.yml`

**Search for npm references**:
```bash
grep -n "npm" docker/docker-compose.yml docker-compose.coolify.yml
```

**Expected**: No npm commands found (these files use Dockerfiles, no changes needed)

### 3.4 Test Docker builds locally

```bash
# Test admin build
docker build -f apps/admin/Dockerfile . -t admin:pnpm-test \
  --build-arg VITE_API_URL=http://localhost:3002 \
  --build-arg VITE_ZITADEL_ISSUER=http://localhost:8080 \
  --build-arg VITE_ZITADEL_CLIENT_ID=test

# Test server build
docker build -f apps/server/Dockerfile . -t server:pnpm-test

# Verify build artifacts
docker run --rm admin:pnpm-test ls -la /usr/share/nginx/html
docker run --rm server:pnpm-test ls -la /app/dist
```

**Success criteria**:
- ✅ Both builds complete without errors
- ✅ Build times similar or faster than npm
- ✅ Application files exist in expected locations
- ✅ No "module not found" errors

---

## Phase 4: Update CI/CD (30 minutes)

### 4.1 GitHub Actions workflows

**Files**:
- `.github/workflows/admin-e2e.yml`
- `.github/workflows/workspace-cli-verify.yml`
- Any other workflow files with npm commands

#### admin-e2e.yml

**Line 18-19: Add pnpm setup**
```yaml
      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'  # ← REMOVE or change to 'pnpm'

      # ADD: Setup pnpm
      - name: Setup pnpm
        uses: pnpm/action-setup@v4
        with:
          version: 9
```

**Line 21-22, 24-25: Replace npm ci**
```yaml
      # Before
      - name: Install root deps
        run: npm ci

      - name: Install admin deps
        working-directory: apps/admin
        run: npm ci

      # After
      - name: Install dependencies
        run: pnpm install --frozen-lockfile
```

**Line 36-37, 50-51: Update run commands**
```yaml
      # Before
        run: npm run e2e

      # After
        run: pnpm run e2e
```

**Complete diff for admin-e2e.yml**:
```diff
       - name: Setup Node
         uses: actions/setup-node@v4
         with:
           node-version: '20'
-          cache: 'npm'
+          cache: 'pnpm'
 
+      - name: Setup pnpm
+        uses: pnpm/action-setup@v4
+        with:
+          version: 9
+
-      - name: Install root deps
-        run: npm ci
-
-      - name: Install admin deps
-        working-directory: apps/admin
-        run: npm ci
+      - name: Install dependencies
+        run: pnpm install --frozen-lockfile
 
-        run: npm run e2e
+        run: pnpm run e2e
```

### 4.2 Other workflows

**Search for all workflow files**:
```bash
find .github/workflows -name "*.yml" -exec echo "=== {} ===" \; -exec cat {} \;
```

**Apply same pattern** to any workflow using npm.

### 4.3 Test CI locally (optional)

```bash
# Install act for local GitHub Actions testing
brew install act

# Run workflow locally
act pull_request -j e2e
```

---

## Phase 5: Update Documentation (30 minutes)

### 5.1 README.md

**File**: `README.md`

Update installation instructions:

```markdown
## Prerequisites

- Node.js 20+
- pnpm 9+ (install: `npm install -g pnpm` or use Corepack: `corepack enable`)
- Docker & Docker Compose
- PostgreSQL 16+ (via Docker or local)

## Installation

```bash
# Install dependencies
pnpm install

# Start Docker dependencies
pnpm run workspace:deps:start

# Start application services
pnpm run workspace:start
```
```

### 5.2 QUICK_START_DEV.md

**File**: `QUICK_START_DEV.md`

**Changes needed** (14 instances):
```bash
# Replace all npm run commands
- npm run workspace:deps:start
+ pnpm run workspace:deps:start

- npm run workspace:start
+ pnpm run workspace:start

- npm run workspace:status
+ pnpm run workspace:status
```

### 5.3 Development guides

**Files to update**:
- `docs/guides/MIGRATIONS_QUICKREF.md`
- `docs/MIGRATION_LIFECYCLE_FIX.md`
- `AGENTS.md`
- Any file with `npm --prefix` or `npm run` commands

**Search and replace**:
```bash
# Find all markdown files with npm commands
grep -r "npm run\|npm --prefix\|npm ci\|npm install" docs/ *.md

# Preview what would change
find docs/ *.md -type f -exec sed -n '/npm run\|npm --prefix\|npm ci\|npm install/p' {} +
```

### 5.4 Create pnpm migration guide

**File**: `docs/PNPM_MIGRATION_COMPLETE.md`

Document:
- What changed and why
- New commands developers need to know
- Troubleshooting common issues
- Performance improvements observed

### 5.5 Update .github/copilot-instructions.md

**File**: `.github/copilot-instructions.md`

Add pnpm section:

```markdown
## Package Manager

This project uses **pnpm** for dependency management.

### Common Commands

- `pnpm install` - Install all dependencies
- `pnpm run <script>` - Run a root script
- `pnpm --filter <workspace> <command>` - Run command in specific workspace
- `pnpm --filter admin build` - Build admin app
- `pnpm --filter server test` - Run server tests

### Workspace Commands

- `pnpm run workspace:start` - Start all services
- `pnpm run workspace:stop` - Stop all services
- `pnpm run workspace:logs` - View logs

### Why pnpm?

- 2-3x faster installs than npm
- Disk space efficient (hard links)
- Stricter dependency resolution (catches phantom dependencies)
- Better monorepo support
```

---

## Phase 6: Migration Execution (15 minutes)

### 6.1 Pre-migration checklist

- [ ] All changes committed to Git (create backup branch)
- [ ] Tested pnpm install locally
- [ ] Docker builds tested with pnpm
- [ ] Team notified about migration

### 6.2 Execute migration

```bash
# 1. Create backup branch
git checkout -b backup/before-pnpm-migration
git push origin backup/before-pnpm-migration

# 2. Return to master
git checkout master

# 3. Create pnpm workspace file
cat > pnpm-workspace.yaml <<EOF
packages:
  - 'apps/admin'
  - 'apps/server'
  - 'tools/workspace-cli'
EOF

# 4. Add packageManager to package.json
# (Manual edit or use jq)
jq '.packageManager = "pnpm@9.15.4"' package.json > package.json.tmp && mv package.json.tmp package.json

# 5. Generate pnpm-lock.yaml
pnpm install

# 6. Verify workspace
pnpm list --depth 0

# 7. Test builds
pnpm run build

# 8. Run tests
pnpm --filter admin test
pnpm --filter server test

# 9. If all successful, update all files (Phase 2-5 changes)
# (Use prepared scripts or manual editing)

# 10. Update .gitignore
echo "" >> .gitignore
echo "# pnpm" >> .gitignore
echo ".pnpm-store/" >> .gitignore
```

### 6.3 Post-migration verification

```bash
# Clean install
rm -rf node_modules apps/*/node_modules pnpm-lock.yaml
pnpm install

# Build everything
pnpm run build

# Run tests
pnpm run test

# Test Docker builds
docker build -f apps/admin/Dockerfile . -t admin:test
docker build -f apps/server/Dockerfile . -t server:test

# Start workspace
pnpm run workspace:deps:start
pnpm run workspace:start
pnpm run workspace:status
```

**Success criteria**:
- ✅ pnpm-lock.yaml generated (200-500KB, much smaller than package-lock.json's 1-2MB)
- ✅ All builds succeed
- ✅ All tests pass
- ✅ Docker builds work
- ✅ Workspace CLI commands work
- ✅ No "module not found" errors

---

## Phase 7: Cleanup (15 minutes)

### 7.1 Remove npm artifacts

```bash
# Remove package-lock.json (keep for 1 release cycle as backup)
git mv package-lock.json package-lock.json.npm-backup

# Update .gitignore
echo "package-lock.json.npm-backup" >> .gitignore

# After 1-2 weeks of successful pnpm usage:
git rm package-lock.json.npm-backup
```

### 7.2 Update .gitignore

Add pnpm-specific entries:

```gitignore
# pnpm
.pnpm-store/
.pnpm-debug.log
```

### 7.3 Remove npm cache mounts from Dockerfiles

Already done in Phase 3 (replaced with pnpm cache paths).

---

## Phase 8: Team Onboarding (Ongoing)

### 8.1 Team notification

**Subject**: Migration to pnpm package manager

**Message**:
```
Hi team,

We're migrating from npm to pnpm for better performance and stricter dependency resolution.

**What you need to do:**

1. Install pnpm globally:
   ```
   npm install -g pnpm
   ```

2. Delete old files:
   ```
   rm -rf node_modules apps/*/node_modules package-lock.json
   ```

3. Install with pnpm:
   ```
   pnpm install
   ```

4. Use pnpm commands:
   - `pnpm run <script>` instead of `npm run <script>`
   - `pnpm --filter <workspace> <command>` for workspace-specific commands
   - All existing scripts (workspace:start, etc.) work the same

**Benefits:**
- 2-3x faster installs
- Uses less disk space
- Catches phantom dependencies
- Better monorepo support

**Docs**: See docs/PNPM_MIGRATION_COMPLETE.md for full details.

Let me know if you have any issues!
```

### 8.2 Create troubleshooting guide

**Common issues**:

| Problem | Solution |
|---------|----------|
| "pnpm: command not found" | Install: `npm install -g pnpm` or `corepack enable` |
| "Cannot find module" after migration | Clean install: `rm -rf node_modules && pnpm install` |
| "Lockfile is out of date" | Run: `pnpm install` to update lockfile |
| Docker build fails with pnpm | Ensure Corepack enabled in Dockerfile |
| CI fails with pnpm | Ensure `pnpm/action-setup@v4` in workflow |
| Workspace not found | Check `pnpm-workspace.yaml` paths match folders |

### 8.3 Update contributor guidelines

If you have `CONTRIBUTING.md`:

```markdown
## Development Setup

1. Install pnpm (if not already installed):
   ```bash
   npm install -g pnpm
   # or use Corepack
   corepack enable
   ```

2. Install dependencies:
   ```bash
   pnpm install
   ```

3. Run tests:
   ```bash
   pnpm run test
   ```
```

---

## Rollback Plan

If migration causes issues, rollback is straightforward:

### Option A: Git Revert (Clean rollback)

```bash
# Reset to pre-migration commit
git checkout backup/before-pnpm-migration

# Or revert specific commits
git revert <migration-commit-sha>

# Remove pnpm files
rm -rf pnpm-lock.yaml pnpm-workspace.yaml node_modules apps/*/node_modules

# Reinstall with npm
npm install
```

### Option B: Parallel Operation (Safe approach)

Keep both package-lock.json and pnpm-lock.yaml for 1-2 weeks:

```bash
# Generate both lockfiles
npm install  # Updates package-lock.json
pnpm install # Updates pnpm-lock.yaml

# Developers can choose which to use
npm install  # Use npm
pnpm install # Use pnpm
```

**Recommendation**: Use Option A with backup branch. Complete migration in one PR after thorough testing.

---

## Testing Checklist

### Before Migration
- [ ] All tests passing with npm
- [ ] Docker builds working with npm
- [ ] CI/CD passing with npm
- [ ] Documentation reflects npm usage

### After Migration
- [ ] pnpm install completes successfully
- [ ] pnpm-lock.yaml generated and committed
- [ ] All builds succeed with pnpm
- [ ] All tests pass with pnpm
- [ ] Docker builds work with pnpm
- [ ] CI/CD passes with pnpm
- [ ] Workspace CLI commands work
- [ ] Documentation updated for pnpm
- [ ] Team notified and onboarded

### Specific Test Cases

```bash
# 1. Clean install
rm -rf node_modules apps/*/node_modules pnpm-lock.yaml
pnpm install
# Expected: No errors, all dependencies installed

# 2. Root build
pnpm run build
# Expected: Both admin and server build successfully

# 3. Workspace-specific builds
pnpm --filter admin build
pnpm --filter server build
# Expected: Each workspace builds independently

# 4. Tests
pnpm --filter admin test
pnpm --filter server test
pnpm --filter server test:e2e
# Expected: All tests pass

# 5. Docker builds
docker build -f apps/admin/Dockerfile . -t admin:pnpm-test
docker build -f apps/server/Dockerfile . -t server:pnpm-test
# Expected: Builds complete, no missing dependencies

# 6. Workspace management
pnpm run workspace:deps:start
pnpm run workspace:start
pnpm run workspace:status
pnpm run workspace:logs
pnpm run workspace:stop
pnpm run workspace:deps:stop
# Expected: All commands work as before

# 7. Nx commands
nx run admin:test
nx run server:test
nx run admin:e2e
# Expected: Nx commands still work (they call pnpm internally)
```

---

## Performance Expectations

### Install Speed

| Operation | npm | pnpm | Improvement |
|-----------|-----|------|-------------|
| Fresh install (no cache) | 60s | 25s | 2.4x faster |
| Cached install | 30s | 8s | 3.75x faster |
| Lockfile-only install | 45s | 15s | 3x faster |

### Disk Space

| Item | npm | pnpm | Savings |
|------|-----|------|---------|
| node_modules (single project) | 400MB | 150MB | 62% less |
| Global cache | ~2GB | ~2GB | Same (shared) |
| Monorepo node_modules (3 workspaces) | 1.2GB | 450MB | 62% less |

### CI/CD Build Time

| Stage | npm | pnpm | Improvement |
|-------|-----|------|-------------|
| Install dependencies | 90s | 30s | 3x faster |
| Total CI runtime | 8min | 6.5min | ~20% faster |

*Note: Actual numbers depend on dependency count and network speed*

---

## FAQ

### Why pnpm over npm?

1. **Performance**: 2-3x faster installs due to hard links
2. **Disk efficiency**: Single copy of each dependency version
3. **Strictness**: Catches phantom dependencies (imports that shouldn't work)
4. **Monorepo**: Better workspace protocol support (`workspace:*`)
5. **Production ready**: Used by Microsoft, Prisma, Turborepo, Vue, Vite

### Why pnpm over Yarn?

1. **Simpler**: No Berry/Classic confusion, one tool
2. **Stricter**: Better isolation between packages
3. **Faster**: Content-addressable storage is more efficient
4. **Compatible**: Drop-in replacement for npm commands
5. **Modern**: Active development, better TypeScript support

### Will this break anything?

**Low risk if:**
- ✅ All dependencies in package.json (no phantom dependencies)
- ✅ Tests pass locally before migration
- ✅ Docker builds tested with pnpm before pushing

**Potential issues:**
- ⚠️ Phantom dependencies will be caught (this is good, but may require fixes)
- ⚠️ CI/CD needs pnpm setup action
- ⚠️ Team needs to install pnpm globally

### How do I install pnpm?

```bash
# Option 1: npm global install
npm install -g pnpm

# Option 2: Corepack (recommended, built into Node.js)
corepack enable
corepack prepare pnpm@latest --activate

# Option 3: Homebrew (macOS)
brew install pnpm

# Verify
pnpm --version
```

### What if I encounter issues?

1. **Clean install**: `rm -rf node_modules && pnpm install`
2. **Check workspace config**: `pnpm list --depth 0`
3. **Rollback**: `git checkout backup/before-pnpm-migration`
4. **Ask for help**: Post issue with error message

### Can I still use npm commands?

Yes! pnpm is compatible with npm commands:

- `npm install` → `pnpm install`
- `npm run <script>` → `pnpm run <script>` or `pnpm <script>`
- `npm ci` → `pnpm install --frozen-lockfile`
- `npm test` → `pnpm test`

The only change is replacing `npm --prefix` with `pnpm --filter`.

---

## Success Metrics

After migration, we should see:

1. **Build speed**: 20-30% faster CI/CD runs
2. **Install speed**: 2-3x faster local development setup
3. **Disk usage**: 60% less space in node_modules
4. **Code quality**: Phantom dependencies caught and fixed
5. **Team satisfaction**: Faster feedback loop during development

---

## References

- [pnpm Documentation](https://pnpm.io/)
- [pnpm Workspaces](https://pnpm.io/workspaces)
- [pnpm vs npm](https://pnpm.io/feature-comparison)
- [pnpm GitHub Action](https://github.com/pnpm/action-setup)
- [Corepack Documentation](https://nodejs.org/api/corepack.html)

---

## Next Steps

1. **Review this plan** with the team
2. **Schedule migration time** (low-traffic period)
3. **Create backup branch** before starting
4. **Execute phases 1-6** in order
5. **Test thoroughly** (checklist above)
6. **Commit and push** pnpm configuration
7. **Monitor CI/CD** for first few builds
8. **Document any issues** encountered
9. **Clean up npm artifacts** after 1-2 weeks
10. **Celebrate faster builds!** 🎉

---

**Prepared by**: AI Assistant  
**Date**: 2025-01-26  
**Status**: Ready for review and execution
