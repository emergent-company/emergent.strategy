# Notification System and Badge Rendering Fixes

**Date**: January 2025
**Session**: Part 20

## Summary
Fixed two critical bugs discovered during testing after the notification migration:
1. React rendering error in `SidebarMenuItemBadges` component
2. Invalid Gemini model name causing extraction failures

---

## Issue 1: React Object Rendering Error

### Problem
```
Error: Objects are not valid as a React child (found: object with keys {label, variant})
Component: SidebarMenuItemBadges
Location: apps/admin/src/components/atoms/SidebarMenuItemBadges/index.tsx:23
```

### Root Cause
The `SidebarMenuItemBadges` component was typed to accept only `Array<"new" | string>`, but the `AdminLayout` was passing badge objects with `{label: string, variant: string}` properties.

**Usage in AdminLayout** (lines 64-67):
```typescript
badges={extractionJobsCounts.total > 0 ? [
    {
        label: extractionJobsCounts.total > 99 ? '99+' : extractionJobsCounts.total.toString(),
        variant: extractionJobsCounts.running > 0 ? 'info' : 'warning'
    }
] : undefined}
```

**Original Component Type** (incorrect):
```typescript
export type SidebarMenuItemBadgesProps = {
    badges?: Array<"new" | string>;
};
```

### Solution
Updated the component to handle both simple strings (backward compatibility) and badge objects with label and variant properties.

**New Type Definition**:
```typescript
export type BadgeObject = {
    label: string;
    variant?: 'info' | 'warning' | 'primary' | 'neutral' | 'error' | 'success';
};

export type SidebarMenuItemBadgesProps = {
    badges?: Array<"new" | string | BadgeObject>;
};
```

**Updated Component Logic**:
```typescript
export function SidebarMenuItemBadges({ badges }: SidebarMenuItemBadgesProps) {
    if (!badges || !badges.length) return null;
    return (
        <div className="inline-flex gap-2 ms-auto">
            {badges.map((badge, index) => {
                // Handle "new" keyword
                if (badge === "new") {
                    return (
                        <div
                            key="new"
                            className="bg-primary/10 px-1.5 border border-primary/20 rounded-box text-[12px] text-primary"
                        >
                            New
                        </div>
                    );
                }
                
                // Handle badge objects with label and variant
                if (typeof badge === 'object' && badge !== null) {
                    const variant = badge.variant || 'secondary';
                    const variantClasses: Record<string, string> = {
                        info: 'bg-info/20 text-info border border-info/30',
                        warning: 'bg-warning/20 text-warning border border-warning/30',
                        primary: 'bg-primary/20 text-primary border border-primary/30',
                        neutral: 'bg-neutral/20 text-neutral border border-neutral/30',
                        error: 'bg-error/20 text-error border border-error/30',
                        success: 'bg-success/20 text-success border border-success/30',
                    };
                    
                    return (
                        <div
                            key={`${badge.label}-${index}`}
                            className={`px-1.5 rounded-box text-[12px] ${variantClasses[variant] || variantClasses.neutral}`}
                        >
                            {badge.label}
                        </div>
                    );
                }
                
                // Handle simple string badges (backward compatibility)
                return (
                    <div
                        key={typeof badge === 'string' ? badge : `badge-${index}`}
                        className="bg-secondary ms-0 px-1.5 rounded-box text-[12px] text-secondary-content"
                    >
                        {badge}
                    </div>
                );
            })}
        </div>
    );
}
```

**File Modified**:
- `apps/admin/src/components/atoms/SidebarMenuItemBadges/index.tsx`

---

## Issue 2: Invalid Gemini Model Name

### Problem
```
[404 Not Found] models/gemini-1.5-pro-002 is not found for API version v1beta
Failed extractions: Issue, Stakeholder, Constraint types
```

### Root Cause
The default Gemini model was set to `gemini-1.5-pro-002`, which doesn't exist in the Google Gemini API.

**Valid Model Names**:
- ✅ `gemini-1.5-flash-latest` (recommended for speed)
- ✅ `gemini-1.5-pro-latest` (recommended for quality)
- ✅ `gemini-1.5-flash` (stable version)
- ✅ `gemini-1.5-pro` (stable version)
- ❌ `gemini-1.5-pro-002` (DOES NOT EXIST)

### Solution
Changed the default model from `gemini-1.5-pro-002` to `gemini-1.5-flash-latest` in all configuration files.

**Files Modified**:

1. **apps/server/src/common/config/config.service.ts** (line 60):
```typescript
// Before
get vertexAiModel() { return this.env.VERTEX_AI_MODEL || 'gemini-1.5-pro-002'; }

// After
get vertexAiModel() { return this.env.VERTEX_AI_MODEL || 'gemini-1.5-flash-latest'; }
```

2. **apps/server/src/common/config/config.schema.ts** (line 120):
```typescript
// Before
VERTEX_AI_MODEL: process.env.VERTEX_AI_MODEL || 'gemini-1.5-pro-002',

// After
VERTEX_AI_MODEL: process.env.VERTEX_AI_MODEL || 'gemini-1.5-flash-latest',
```

3. **Test Files Updated**:
   - `apps/server/src/modules/extraction-jobs/__tests__/vertex-ai.provider.spec.ts`
   - `apps/server/src/modules/extraction-jobs/__tests__/llm-provider.factory.spec.ts`

---

## Verification

### Backend Status
```bash
✅ Build successful
✅ Backend restarted (PID 36784)
✅ Health check passing: http://localhost:3001/health
```

### Frontend Status
```bash
✅ Build successful (209 modules transformed in 1.95s)
✅ Type check passing
✅ No React rendering errors
```

### Expected Behavior After Fixes

1. **Sidebar Badges**:
   - ✅ Extraction Jobs: Shows count with "info" variant when running, "warning" when idle
   - ✅ Inbox: Shows unread count with "primary" variant when important, "neutral" otherwise
   - ✅ No React rendering errors

2. **Entity Extraction**:
   - ✅ Uses valid Gemini model (`gemini-1.5-flash-latest`)
   - ✅ Extraction jobs can complete successfully
   - ✅ All entity types (Issue, Stakeholder, Constraint) can be extracted

---

## Testing Recommendations

1. **Test Sidebar Badges**:
   - Navigate to admin dashboard
   - Verify extraction jobs badge displays count correctly
   - Start an extraction job and verify badge shows "info" variant
   - Check inbox badge displays unread count

2. **Test Entity Extraction**:
   - Create a new extraction job
   - Select multiple entity types (Issue, Stakeholder, Constraint)
   - Verify job completes without 404 model errors
   - Check debug info shows correct model name in request details

3. **Test Badge Variants**:
   - Verify all badge variants render correctly: info, warning, primary, neutral, error, success
   - Verify backward compatibility with string badges still works

---

## Related Changes

These fixes build on the notification system migration completed earlier in this session:
- Migration 008: `user_id TEXT` → `subject_id UUID` in notifications table
- Migration 009: `user_id TEXT` → `subject_id UUID` in user_notification_preferences table
- Service layer updated to use `subject_id` column (22 changes across 3 files)

See: `docs/migrations/MIGRATION_TRACKING.md`

---

## Impact

**Users Affected**: All users viewing the admin dashboard
**Features Affected**: 
- Sidebar navigation badges
- Entity extraction (all types)
- Extraction job monitoring

**Severity Before Fix**: 
- React error: Critical (UI crash)
- Gemini error: Critical (extraction feature non-functional)

**Severity After Fix**: 
- ✅ Resolved
