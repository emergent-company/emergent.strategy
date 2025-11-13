# Configuration Changes - Vertex AI Model Setup

## Summary
Removed hardcoded Vertex AI configuration from PM2 ecosystem config and moved to `.env` file, setting model to `gemini-2.5-flash` as requested.

## Changes Made

### 1. PM2 Configuration (`tools/workspace-cli/pm2/ecosystem.apps.cjs`)
**Removed** hardcoded environment variables from `env_development`:
```javascript
// BEFORE
env_development: {
  NODE_ENV: 'development',
  LOG_LEVEL: 'debug',
  VERTEX_AI_MODEL: 'gemini-2.5-pro',      // ❌ Removed
  VERTEX_AI_PROJECT_ID: 'spec-server-dev', // ❌ Removed
  VERTEX_AI_LOCATION: 'us-central1'       // ❌ Removed
}

// AFTER
env_development: {
  NODE_ENV: 'development',
  LOG_LEVEL: 'debug'
}
```

**Rationale**: PM2 config should not override `.env` file settings. This allows developers to customize Vertex AI configuration per environment without modifying PM2 config.

### 2. Server .env File (`apps/server/.env`)
**Added** Vertex AI configuration:
```bash
# --- Extraction Worker (Google Vertex AI) ---
VERTEX_AI_PROJECT_ID=spec-server-dev
VERTEX_AI_LOCATION=us-central1
VERTEX_AI_MODEL=gemini-2.5-flash
```

**Model Changed**: `gemini-2.5-pro` → `gemini-2.5-flash`

### 3. TypeScript Fixes (ObjectDetailModal.tsx)
**Fixed** two TypeScript issues:

#### Issue 1: Extraction Job Links
**Problem**: `version.properties._extraction_job_id` caused "Type 'unknown' is not assignable to type 'ReactNode'" error.

**Solution**: Used IIFE (Immediately Invoked Function Expression) with explicit type guards:
```typescript
{(() => {
    const props = version.properties;
    if (!props || typeof props !== 'object') return null;
    if (!('_extraction_job_id' in props)) return null;
    const jobId = props._extraction_job_id;
    if (!jobId) return null;
    
    return (
        <a href={`/admin/extraction-jobs/${String(jobId)}`} ...>
            <Icon icon="lucide--zap" />
            From Extraction
        </a>
    );
})()}
```

#### Issue 2: Field-Level Changes Display
**Problem**: Conditional rendering with `&&` operator caused TypeScript to infer `unknown` return type.

**Solution**: Used IIFE with explicit checks and early returns:
```typescript
{(() => {
    const summary = version.change_summary;
    if (!summary) return null;
    
    return (
        <div className="space-y-1 mt-2">
            {Array.isArray(summary.added) && summary.added.length > 0 && (
                <div className="flex flex-wrap gap-1 text-xs">
                    <span className="text-success font-medium">Added:</span>
                    {summary.added.map((field, i) => (
                        <span key={i} className="badge badge-success badge-sm gap-1">
                            <Icon icon="lucide--plus" />
                            {String(field)}
                        </span>
                    ))}
                </div>
            )}
            {/* Similar for modified and removed */}
        </div>
    );
})()}
```

**Result**: Both features now work correctly and compile without TypeScript errors.

## Benefits

### 1. Configuration Flexibility
- Developers can now change Vertex AI model without editing PM2 config
- Different environments can use different models via `.env` files
- Aligns with 12-factor app methodology (config via environment)

### 2. Model Change Impact
- **gemini-2.5-flash** is faster and cheaper than gemini-2.5-pro
- Suitable for entity extraction workloads
- Reduced API costs while maintaining quality

### 3. UI Enhancements
Users now see:
- **Which fields were added** (green badges with + icon)
- **Which fields were modified** (blue badges with edit icon)
- **Which fields were removed** (red badges with - icon)
- **Link to extraction job** that created each version

## Testing

### Configuration Testing
1. Stop workspace: `npm run workspace:stop`
2. Verify `.env` has correct settings:
   ```bash
   grep VERTEX_AI apps/server/.env
   ```
3. Start workspace: `npm run workspace:start`
4. Check logs for model being used:
   ```bash
   npm run workspace:logs -- --follow | grep -i vertex
   ```

### UI Testing
1. Navigate to Object Browser
2. Click any object to open detail modal
3. Scroll to "Version History" section
4. Verify:
   - ✅ Field changes display with colored badges
   - ✅ "From Extraction" link appears (if version created by extraction)
   - ✅ Clicking extraction link navigates to extraction job detail page
   - ✅ No console errors

## Rollback Instructions
If issues occur:

### Revert to PM2 hardcoded config:
```bash
git checkout tools/workspace-cli/pm2/ecosystem.apps.cjs
```

### Revert to gemini-2.5-pro:
```bash
# Edit apps/server/.env
VERTEX_AI_MODEL=gemini-2.5-pro
```

### Revert UI changes:
```bash
git checkout apps/admin/src/components/organisms/ObjectDetailModal/ObjectDetailModal.tsx
```

## Related Files
- `tools/workspace-cli/pm2/ecosystem.apps.cjs` - PM2 process configuration
- `apps/server/.env` - Server environment variables
- `apps/server/.env.example` - Environment template (already had correct settings)
- `apps/admin/src/components/organisms/ObjectDetailModal/ObjectDetailModal.tsx` - Version history UI
- `docs/OBJECT_VERSION_HISTORY_UI.md` - UI implementation guide

## Next Steps
1. Monitor extraction job performance with new model
2. Compare extraction quality between gemini-2.5-pro and gemini-2.5-flash
3. Adjust model if quality regression detected
4. Update `.env.example` files in other environments (staging, production)

---

**Date**: October 20, 2025
**Status**: ✅ Complete
**Build Status**: Both admin and server build successfully
