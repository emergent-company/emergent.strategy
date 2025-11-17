# Coolify Docker Build Fix - npm ci Failure

## Problem

Coolify Docker builds were failing with:
```
npm ci exit code: 1
```

Verbose output showed:
```
npm ci can only install packages when your package.json and package-lock.json are in sync.
Missing: @tailwindcss/typography@0.5.19 from lock file
Missing: postcss-selector-parser@6.0.10 from lock file
Missing: cssesc@3.0.0 from lock file
Missing: util-deprecate@1.0.2 from lock file
```

## Root Cause

The repository uses **npm workspaces** (monorepo structure):

```json
{
  "workspaces": [
    "apps/admin",
    "apps/server",
    "tools/workspace-cli"
  ]
}
```

In npm workspaces:
- The `package-lock.json` file lives at the **repository root**
- Individual workspace packages (like `apps/admin`) do NOT have their own lock files
- The root lock file contains all dependencies for all workspaces

The Dockerfile was incorrectly:
1. Building from `apps/admin` context: `docker build -f apps/admin/Dockerfile apps/admin`
2. Copying only admin's package.json: `COPY package*.json ./`
3. Running `npm ci` without workspace context

This meant Docker never saw the root `package-lock.json` file, causing the sync error.

## Solution

Changed the Docker build to use workspace context properly:

### 1. Updated Dockerfile Copy Commands

```dockerfile
# Before (Wrong)
WORKDIR /build
COPY package*.json ./

# After (Correct)
WORKDIR /build
# Copy root package files for workspace
COPY package*.json ./
# Copy admin app package files
COPY apps/admin/package*.json ./apps/admin/
```

### 2. Updated npm ci Command

```dockerfile
# Before (Wrong)
RUN npm ci --verbose

# After (Correct)
RUN npm ci --workspace=apps/admin --verbose
```

### 3. Updated Build Command

```dockerfile
# Before (Wrong)
RUN npm run build

# After (Correct)
RUN cd apps/admin && npm run build
```

### 4. Updated Output Path

```dockerfile
# Before (Wrong)
COPY --from=builder /build/dist /usr/share/nginx/html

# After (Correct)
COPY --from=builder /build/apps/admin/dist /usr/share/nginx/html
```

### 5. Changed Docker Build Context

**CRITICAL**: Build must run from repository root, not from apps/admin:

```bash
# Before (Wrong)
docker build -f apps/admin/Dockerfile apps/admin

# After (Correct)
docker build -f apps/admin/Dockerfile .
```

## Coolify Configuration

In Coolify, you need to update the build configuration:

1. Go to Application Settings
2. Find "Build Pack" or "Docker Settings"
3. Set **Dockerfile Location**: `apps/admin/Dockerfile`
4. Set **Build Context**: `.` (root of repository)
   - NOT `apps/admin`
   - This is crucial!

## Verification

After the fix:
- ✅ npm ci succeeds
- ✅ Dependencies install correctly from workspace lock file
- ✅ Build proceeds past npm ci stage

## Related Issues

- This is separate from the buildtime variables issue (58 variables with incorrect flags)
- TypeScript compilation errors are a separate code quality issue

## References

- NPM Workspaces: https://docs.npmjs.com/cli/v10/using-npm/workspaces
- Docker Build Context: https://docs.docker.com/build/building/context/
