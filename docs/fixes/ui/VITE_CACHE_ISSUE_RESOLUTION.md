# Vite Cache Issue - Resolution

## Problem
```
GET http://localhost:5175/node_modules/.vite/deps/react-apexcharts.js?v=d2da020d net::ERR_ABORTED 504 (Outdated Optimize Dep)
```

This error occurs when Vite's dependency cache is outdated after adding new imports.

## Root Cause
- Added `react-apexcharts` import to `CostVisualization.tsx`
- Vite hadn't pre-bundled this dependency yet
- The old cache reference (version `d2da020d`) was stale

## Resolution Applied

### 1. Stop Services
```bash
npm run workspace:stop
```

### 2. Clear Vite Cache
```bash
rm -rf apps/admin/node_modules/.vite
```

### 3. Restart Services
```bash
npm run workspace:start
```

### 4. Refresh Browser
**Important**: After clearing cache, you MUST do a **hard refresh** in your browser:
- **Chrome/Edge**: `Cmd+Shift+R` (Mac) or `Ctrl+Shift+R` (Windows/Linux)
- **Firefox**: `Cmd+Shift+R` (Mac) or `Ctrl+F5` (Windows/Linux)
- **Safari**: `Cmd+Option+R`

## What Happens After Fix

When you refresh the browser, Vite will:
1. Detect the new `react-apexcharts` import
2. Pre-bundle it along with `apexcharts` (its peer dependency)
3. Generate new cache files with updated version hash
4. Serve the fresh dependencies

You should see in the browser console (briefly):
```
[vite] new dependencies optimized: react-apexcharts, apexcharts
[vite] ✨ optimized dependencies changed. reloading
```

## Verification Steps

### 1. Check Browser Console
- Open browser DevTools (F12)
- Go to Console tab
- Look for Vite optimization messages
- Verify no 504 errors

### 2. Check Network Tab
- Open browser DevTools (F12)
- Go to Network tab
- Refresh the page
- Look for `react-apexcharts.js` - should be 200 OK
- New version hash should be different (not `d2da020d`)

### 3. Navigate to Dashboard
```
http://localhost:5175/admin/monitoring/dashboard
```
- Click "Cost Analytics" tab
- Charts should render without errors
- Check console for any React errors

## Common Issues After Fix

### Issue: Still Getting 504 Error
**Solution**: Browser may be using cached response
```bash
# Clear browser cache completely
# Or try in Incognito/Private window
```

### Issue: Module Not Found
**Solution**: Verify dependencies are installed
```bash
cd apps/admin
npm list apexcharts react-apexcharts
```

Should show:
```
├── apexcharts@5.3.2
└── react-apexcharts@1.7.0
```

### Issue: TypeScript Errors
**Solution**: Rebuild TypeScript
```bash
npm --prefix apps/admin run build
```

## Prevention

To avoid this issue in the future:

### 1. After Adding New Heavy Dependencies
Always clear Vite cache if you add:
- Chart libraries (ApexCharts, Recharts, Chart.js)
- Rich text editors (TipTap, Slate, Draft.js)
- Large UI libraries (Ant Design, Material-UI)
- Date libraries (date-fns, moment, dayjs)

### 2. Use Vite's Optimized Deps Config
Add to `vite.config.ts` if you know you'll use heavy dependencies:
```typescript
export default defineConfig({
  optimizeDeps: {
    include: ['react-apexcharts', 'apexcharts']
  }
})
```

### 3. Clear Cache Regularly
Add to your workflow:
```bash
# Before starting work on feature branches
rm -rf apps/admin/node_modules/.vite
npm run workspace:restart
```

## Status

✅ **Fixed**: Vite cache cleared and services restarted
✅ **Admin Server**: Running on http://localhost:5175
✅ **Backend Server**: Running on http://localhost:3001
⏳ **Browser Refresh Required**: Hard refresh to load new dependencies

## Next Steps

1. **Hard refresh browser** (`Cmd+Shift+R` on Mac)
2. Navigate to http://localhost:5175/admin/monitoring/dashboard
3. Click "Cost Analytics" tab
4. Verify charts render correctly
5. Check browser console for no errors

## Related Documentation

- `docs/COST_VISUALIZATION_COMPLETE.md` - Full implementation details
- `docs/COST_VISUALIZATION_TEST_GUIDE.md` - Testing checklist
- Vite Dependency Pre-bundling: https://vitejs.dev/guide/dep-pre-bundling.html
