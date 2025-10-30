# Project Creation Navigation Fix

## Problem

After successfully creating a project via the setup page (`/setup/project`), the navigation to `/admin/apps/documents` was not happening. The test would stay on the `/setup/project` page despite the API call succeeding (returning 201).

### HTTP Logs Evidence
```
2025-10-28T16:36:26.932Z ::1 POST /orgs 201 12ms         ← Org creation successful
2025-10-28T16:36:28.993Z ::1 POST /projects 201 15ms    ← Project creation successful
```

### Test Behavior
- Form filled correctly ✅
- Button enabled ✅
- Form submitted ✅
- API returned 201 ✅
- Navigation did NOT happen ❌ (stayed on `/setup/project`)

## Root Cause

The issue was a **React state propagation timing problem**:

1. `apps/admin/src/pages/setup/project.tsx` calls `setActiveProject(proj.id, proj.name)`
2. `setActiveProject()` updates config via `useLocalStorage` hook
3. `useLocalStorage` **synchronously** writes to `localStorage` but **asynchronously** updates React state
4. `navigate('/admin/apps/documents')` was called **immediately** after `setActiveProject()`
5. Navigation happened **before** React state propagated through component tree
6. `OrgAndProjectGateRedirect` component in admin layout checks for `config.activeProjectId`
7. At navigation time, `config.activeProjectId` was still `undefined` (state hadn't updated yet)
8. Gate blocked content and either:
   - Showed project creation form again, OR
   - Redirected back to setup

### Code Flow

```typescript
// apps/admin/src/pages/setup/project.tsx (BEFORE - BROKEN)
async function handleCreate(e: React.FormEvent) {
    const proj = await createProject(trimmed);  // ← API returns 201 ✅
    setActiveProject(proj.id, proj.name);       // ← Triggers async React state update
    navigate('/admin/apps/documents');          // ← Runs BEFORE state propagates ❌
}

// apps/admin/src/hooks/use-local-storage.ts
const setValue = (value: T | ((val: T) => T)) => {
    const valueToStore = value instanceof Function ? value(storedValue) : value;
    setStoredValue(valueToStore);  // ← Schedules React re-render (async)
    window.localStorage.setItem(key, JSON.stringify(valueToStore));  // ← Synchronous
};

// apps/admin/src/components/organisms/OrgAndProjectGate/index.tsx
export function OrgAndProjectGateRedirect({ children }: OrgAndProjectGateRedirectProps) {
    const { config } = useConfig();
    const ready = !!config.activeOrgId && !!config.activeProjectId;  // ← Checks config
    
    if (!ready) return <OrgAndProjectGate>{children}</OrgAndProjectGate>;  // ← Blocks content
    return <>{children}</>;
}
```

### Why localStorage Write Wasn't Enough

Even though `useLocalStorage` writes to `window.localStorage` synchronously:
```typescript
window.localStorage.setItem('spec-server', JSON.stringify({ ...config, activeProjectId: 'abc' }));
```

The **React state** (`config` from `useConfig()`) doesn't update until the next render cycle. The `OrgAndProjectGateRedirect` component reads from React state, not directly from localStorage:

```typescript
const { config } = useConfig();  // ← React state, not localStorage
const ready = !!config.activeProjectId;  // ← Checks React state
```

## Solution

Use **useEffect** to navigate only after the React state has updated:

```typescript
// apps/admin/src/pages/setup/project.tsx (AFTER - FIXED)
const [shouldNavigate, setShouldNavigate] = useState(false);

// Navigate after project is set in config
useEffect(() => {
    if (shouldNavigate && config.activeProjectId) {
        console.log('[SetupProjectPage] Config updated with project, navigating now');
        navigate('/admin/apps/documents', { replace: true });
        setShouldNavigate(false);  // Reset flag
    }
}, [shouldNavigate, config.activeProjectId, navigate]);

async function handleCreate(e: React.FormEvent) {
    const proj = await createProject(trimmed);
    
    // Verify localStorage writes (debugging)
    const beforeConfig = window.localStorage.getItem('spec-server');
    console.log('[SetupProjectPage] localStorage BEFORE:', beforeConfig);
    
    setActiveProject(proj.id, proj.name);  // ← Triggers React state update
    
    const afterConfig = window.localStorage.getItem('spec-server');
    console.log('[SetupProjectPage] localStorage AFTER:', afterConfig);
    
    // Don't navigate directly - let useEffect handle it after state updates
    setShouldNavigate(true);  // ← Signal to useEffect
}
```

### How It Works

1. **Project created** via API (201 response)
2. **localStorage written** synchronously by `useLocalStorage`
3. **React state scheduled** for update via `setStoredValue()`
4. **shouldNavigate flag** set to `true`
5. **React re-renders** with updated config (including `activeProjectId`)
6. **useEffect fires** because dependencies changed: `shouldNavigate === true` AND `config.activeProjectId !== undefined`
7. **Navigation happens** via `navigate('/admin/apps/documents')`
8. **OrgAndProjectGateRedirect** sees `config.activeProjectId` and allows content through ✅

### Why useEffect Instead of setTimeout

The original attempt used `setTimeout(100)` to delay navigation:
```typescript
setActiveProject(proj.id, proj.name);
await new Promise(resolve => setTimeout(resolve, 100));  // ← Arbitrary delay
navigate('/admin/apps/documents');
```

Problems with this approach:
- **Unreliable**: 100ms might not be enough on slow devices/browsers
- **Wasteful**: Often longer than needed (React updates can be <10ms)
- **No guarantee**: Still racing against React's render cycle
- **Brittle**: Breaks if React behavior changes or other state updates interfere

Using `useEffect` with state dependencies is **deterministic** - it waits for the exact conditions needed (config updated) before navigating.

## Verification

### Expected Console Output

When creating a project, you should see:
```
[SetupProjectPage] Creating project: My Project
[SetupProjectPage] Project created: { id: '...', name: 'My Project', ... }
[SetupProjectPage] localStorage BEFORE: {...}
[SetupProjectPage] localStorage AFTER: {..., "activeProjectId": "...", "activeProjectName": "My Project"}
[SetupProjectPage] Config updated with project, navigating now
```

### Expected Behavior

1. User fills project name
2. User clicks "Create project"
3. API call succeeds (201)
4. Button shows loading spinner briefly
5. **Navigation happens smoothly** to `/admin/apps/documents`
6. Documents page loads with project in sidebar dropdown
7. No redirect loops, no stuck on setup page

### HTTP Logs

Should show successful creation followed by documents page requests:
```
POST /projects 201 15ms
GET /documents?limit=50 200 25ms
GET /type-registry 200 10ms
```

## Related Files

- `apps/admin/src/pages/setup/project.tsx` - Project creation form (FIXED)
- `apps/admin/src/hooks/use-local-storage.ts` - localStorage sync hook
- `apps/admin/src/contexts/config.tsx` - Global config context
- `apps/admin/src/components/organisms/OrgAndProjectGate/index.tsx` - Navigation guard
- `apps/admin/src/pages/admin/layout.tsx` - Admin layout using gate
- `logs/http.log` - HTTP access logs for debugging API calls

## Lessons Learned

1. **localStorage write ≠ React state update** - Even synchronous localStorage writes don't guarantee React state propagation
2. **Navigation guards + state** = potential race conditions
3. **useEffect with dependencies** is more reliable than arbitrary timeouts
4. **HTTP access logs** are invaluable for separating backend vs frontend issues
5. **State propagation timing** matters when navigation depends on that state
6. **Read the component hierarchy** - understand what guards/checks exist on target route

## Testing

### Manual Test
1. Start services: `nx run workspace-cli:workspace:start`
2. Open browser: `http://localhost:5176`
3. Create org if needed
4. Create project
5. Verify navigation to `/admin/apps/documents` happens immediately
6. Check console for localStorage logging

### E2E Test
```bash
# From apps/admin directory
source .env.e2e
npx playwright test e2e/specs/authenticated.example.spec.ts --workers=1
```

Expected: Test passes through org creation AND project creation without getting stuck.

## Future Improvements

1. Consider making `setActiveProject()` return a Promise that resolves when React state updates
2. Add integration test specifically for state propagation timing
3. Consider refactoring config to use a state management library with better sync guarantees (Zustand, Jotai)
4. Add TypeScript types to ensure navigation only happens after config is ready
5. Consider creating a `useNavigateAfterConfig()` hook to encapsulate this pattern
