# Hot Reload Configuration

## Overview

Both the Admin frontend and API backend are configured with hot reload (auto-restart on file changes) **by default** when running under the workspace CLI.

## Current Hot Reload Setup

### Admin (Frontend)
**Technology:** Vite with Hot Module Replacement (HMR)

**Script:** `npm run dev` → `vite`

**How it works:**
- Detects changes to `.tsx`, `.ts`, `.css`, `.jsx`, `.js` files
- Updates modules in the browser **instantly** without full page reload
- Preserves component state during updates
- Shows build errors in browser overlay

**Watch paths:**
- `apps/admin/src/**/*`
- `apps/admin/index.html`
- `apps/admin/vite.config.ts`

**Performance:**
- ⚡ **Lightning fast** - updates in < 100ms
- Uses native ES modules (no bundling in dev)
- Optimized dependency pre-bundling with esbuild

### Server (API)
**Technology:** ts-node-dev with respawn

**Script:** `npm run start:dev` → `ts-node-dev --respawn --no-notify --ignore-watch node_modules src/main.ts`

**How it works:**
- Detects changes to `.ts` files in `apps/server-nest/src/`
- Automatically recompiles TypeScript
- Restarts the NestJS application
- Preserves compilation cache for faster restarts

**Watch paths:**
- `apps/server-nest/src/**/*.ts`
- Excludes `node_modules/`

**Performance:**
- ⚙️ **Fast restarts** - typically 2-5 seconds
- Incremental compilation (only changed files)
- Smart caching between restarts

**Flags:**
- `--respawn` - Automatically restart on crash/exit
- `--no-notify` - Disable desktop notifications
- `--ignore-watch node_modules` - Don't watch dependencies
- `NODE_OPTIONS=--enable-source-maps` - Better error stack traces

## Usage

### Starting with Hot Reload (Default)

```bash
# Start both admin and server with hot reload
npm run workspace:start

# Or start individually
npm run admin:start    # Vite HMR enabled
npm run server:start   # ts-node-dev watch enabled
```

**Result:**
- Edit any file in `apps/admin/src/` → browser updates instantly
- Edit any file in `apps/server-nest/src/` → server restarts automatically

### Checking Hot Reload Status

```bash
# View running processes
npm run workspace:status

# Watch logs in real-time
npm run workspace:logs -- --follow
```

**Look for:**
- Admin: `[vite] HMR connected` or `[vite] page reload`
- Server: `[ts-node-dev] restarting due to changes...`

## Customization

### Admin: Disable HMR (Production Build)

If you want to run a production build locally (no hot reload):

```bash
# Build for production
cd apps/admin
npm run build

# Preview production build
npm run preview
```

### Server: Run Compiled Version (No Watch)

If you want to run the compiled server without watch mode:

```bash
# Build TypeScript to JavaScript
cd apps/server-nest
npm run build

# Run compiled version
npm run start  # Uses dist/main.js
```

### Custom Watch Patterns

#### Admin (Vite)
Edit `apps/admin/vite.config.ts`:

```typescript
export default defineConfig({
  server: {
    watch: {
      ignored: ['**/node_modules/**', '**/dist/**'],
      // Add custom patterns
      include: ['src/**/*.tsx', 'src/**/*.ts'],
    },
  },
});
```

#### Server (ts-node-dev)
Edit `apps/server-nest/package.json`:

```json
{
  "scripts": {
    "start:dev": "ts-node-dev --respawn --no-notify --ignore-watch node_modules --watch 'src/**/*.ts' src/main.ts"
  }
}
```

## PM2 Configuration

The workspace CLI uses PM2 to supervise processes. Hot reload works seamlessly with PM2:

**File:** `tools/workspace-cli/pm2/ecosystem.apps.cjs`

```javascript
{
  name: 'admin',
  script: 'npm',
  args: ['run', 'dev'],  // ← Runs Vite dev server (HMR enabled)
  autorestart: true,
  // ...
}

{
  name: 'server',
  script: 'npm',
  args: ['run', 'start:dev'],  // ← Runs ts-node-dev (watch enabled)
  autorestart: true,
  // ...
}
```

**Key settings:**
- `autorestart: true` - PM2 restarts if process crashes
- Hot reload runs **inside** the supervised process
- PM2 doesn't interfere with file watching

## Troubleshooting

### Admin Not Hot Reloading

**Symptoms:** Browser doesn't update after saving files

**Solutions:**

1. **Check Vite is running:**
   ```bash
   npm run workspace:logs -- --service=admin
   # Look for: "Local: http://localhost:5175/"
   ```

2. **Clear Vite cache:**
   ```bash
   rm -rf apps/admin/node_modules/.vite
   npm run admin:restart
   ```

3. **Check browser console:**
   - Should see: `[vite] connected.`
   - If missing, check network tab for WebSocket connection

4. **File system watchers:**
   ```bash
   # macOS/Linux: Check if you hit the limit
   sysctl kern.maxfiles
   ulimit -n
   
   # Increase if needed
   ulimit -n 10240
   ```

### Server Not Restarting on Changes

**Symptoms:** Code changes don't trigger server restart

**Solutions:**

1. **Check ts-node-dev is running:**
   ```bash
   npm run workspace:logs -- --service=server
   # Look for: "[ts-node-dev] restarting due to changes..."
   ```

2. **Verify watch mode active:**
   ```bash
   npm run workspace:status
   # Server should show "online" with recent uptime resets
   ```

3. **Check file is in watch path:**
   - Only `apps/server-nest/src/**/*.ts` files trigger restart
   - Changes to `node_modules/` are ignored
   - Changes to `.env` require manual restart

4. **Manual restart if needed:**
   ```bash
   npm run server:restart
   ```

5. **Check TypeScript errors:**
   - ts-node-dev stops on compilation errors
   - Check logs for TypeScript diagnostics

### Performance Issues

**Symptoms:** Slow reloads, high CPU usage

**Solutions:**

1. **Admin (Vite):**
   - Check for large files in `src/`
   - Optimize imports (avoid barrel exports)
   - Use `vite-plugin-inspect` to debug slow transforms

2. **Server (ts-node-dev):**
   - Use `--transpile-only` for faster restarts (skip type checking)
   - Add `--prefer-ts` to use TypeScript compiler
   - Consider using `nodemon` with `swc` for very fast restarts

## Advanced: Alternative Watch Tools

### Server: Using nodemon + swc

For even faster server restarts:

```bash
# Install swc (already in dependencies)
npm install -D @swc/cli @swc/core nodemon

# Create nodemon.json
{
  "watch": ["src"],
  "ext": "ts",
  "exec": "swc-node src/main.ts"
}

# Update package.json
{
  "scripts": {
    "start:dev:fast": "nodemon"
  }
}
```

**Speed improvement:** 5x faster than ts-node-dev

### Admin: Alternative Port

If you need to run multiple instances:

```bash
# Edit .env
VITE_PORT=5176

# Or pass as argument
npm run dev -- --port 5176
```

## CI/CD Considerations

Hot reload is **development-only**:

- Production builds use `npm run build` (both admin and server)
- Docker containers run compiled artifacts
- No file watching in production
- Environment variables control behavior

## Summary

✅ **Hot reload is enabled by default**
- No configuration needed for basic usage
- Just run `npm run workspace:start` and start coding
- File saves automatically trigger updates/restarts

🔧 **Customization available**
- Adjust watch patterns if needed
- Switch to production builds for testing
- Alternative tools for specific use cases

📚 **Well-supported**
- Vite HMR: Industry-standard for React
- ts-node-dev: Proven tool for Node.js/TypeScript
- PM2: Production-grade process manager

## Related Documentation
- Vite HMR API: https://vitejs.dev/guide/api-hmr.html
- ts-node-dev: https://github.com/wclr/ts-node-dev
- PM2 Process Management: https://pm2.keymetrics.io/docs/usage/process-management/
