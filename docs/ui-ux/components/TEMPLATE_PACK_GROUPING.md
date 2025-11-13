# Template Pack Grouping Implementation

## Overview

Updated the Project Settings - Template Packs page to group available packs into "Built-in Packs" and "User Created & Discovered Packs" sections. Built-in packs (TOGAF, Demo, Meeting & Decision Management) cannot be removed from the installed section.

**Date**: October 20, 2025  
**Status**: Complete ✅

---

## Changes Made

### 1. Frontend TypeScript Interfaces

**File**: `apps/admin/src/pages/admin/pages/settings/project/templates.tsx`

Added `source` field to interfaces:

```typescript
interface TemplatePack {
    // ... existing fields
    source?: 'manual' | 'discovered' | 'imported' | 'system';
}

interface InstalledPack {
    template_pack: {
        // ... existing fields
        source?: 'manual' | 'discovered' | 'imported' | 'system';
    };
}
```

### 2. Available Template Packs Section

Split into two subsections:

#### Built-in Packs
- **Filter**: `pack.source === 'system'`
- **Icon**: Shield with checkmark (`lucide--shield-check`)
- **Color**: Info (blue)
- **Badge**: "Built-in" (info color)
- **Visual**: Info-themed cards with info icon

#### User Created & Discovered Packs
- **Filter**: `pack.source !== 'system'`
- **Icon**: User icon (`lucide--user`)
- **Color**: Primary
- **Badge**: "Discovered" (secondary color, only for discovered packs)
- **Visual**: Primary-themed cards with primary icon

### 3. Installed Template Packs Section

Updated to:
- Show "Built-in" badge for system packs
- Show "Discovered" badge for discovered packs
- **Hide Remove button** for built-in packs (`source === 'system'`)
- Keep Enable/Disable button for all packs (including built-in)

```tsx
{pack.template_pack.source !== 'system' && (
    <button className="btn-outline btn btn-sm btn-error" onClick={() => handleUninstall(pack.id)}>
        <Icon icon="lucide--trash-2" className="size-4" />
        Remove
    </button>
)}
```

---

## Pack Source Types

Based on database schema (`kb.graph_template_packs.source`):

| Source | Description | Badge | Removable |
|--------|-------------|-------|-----------|
| `system` | Built-in packs (TOGAF, Demo, Meeting) | "Built-in" (info) | ❌ No |
| `manual` | User-created packs | None | ✅ Yes |
| `discovered` | Auto-discovery packs | "Discovered" (secondary) | ✅ Yes |
| `imported` | Imported from file/marketplace | None | ✅ Yes |

---

## Built-in Packs (System Source)

These packs are set to `source = 'system'` via migration:

1. **Extraction Demo Pack**
2. **TOGAF Enterprise Architecture**
3. **Meeting & Decision Management**

Migration file: `apps/server/migrations/20251019_extend_template_packs_for_discovery.sql`

```sql
UPDATE kb.graph_template_packs
SET source = 'system'
WHERE name IN (
    'Extraction Demo Pack',
    'TOGAF Enterprise Architecture',
    'Meeting & Decision Management'
)
AND source IS NULL;
```

---

## UI/UX Changes

### Before
- All available packs in single flat list
- All installed packs could be removed (including built-in)
- No visual distinction between built-in and user packs

### After
- Available packs grouped into two clear sections
- Built-in packs have info-themed styling and badge
- User/discovered packs have primary-themed styling
- Built-in packs cannot be removed (but can be disabled)
- Clear visual hierarchy with section headers

---

## Visual Design

### Built-in Packs Card
```
┌─────────────────────────────────────────────┐
│ 🛡️ TOGAF Enterprise Architecture [Built-in]│
│ v1.0.0                                      │
│ Enterprise architecture framework...        │
│ 15 object types • by Spec Team             │
│ [👁️ Preview]  [⬇️ Install]                 │
└─────────────────────────────────────────────┘
```
- Info icon (blue)
- Info badge
- Hover: Info border

### User Created Pack Card
```
┌─────────────────────────────────────────────┐
│ 📦 My Custom Pack [Discovered]             │
│ v1.0.0                                      │
│ Custom types from discovery...              │
│ 8 object types • by Auto-Discovery         │
│ [👁️ Preview]  [⬇️ Install]                 │
└─────────────────────────────────────────────┘
```
- Primary icon
- Secondary badge (for discovered)
- Hover: Primary border

### Installed Built-in Pack
```
✅ TOGAF Enterprise Architecture [Built-in]
v1.0.0
15 object types • Installed Oct 20, 2025

[⏸️ Disable]  (no remove button)
```

### Installed User Pack
```
✅ My Custom Pack [Discovered] [Disabled]
v1.0.0
8 object types • Installed Oct 20, 2025

[▶️ Enable]  [🗑️ Remove]
```

---

## Backend Support

### Database Schema
The `kb.graph_template_packs` table includes:
```sql
source TEXT DEFAULT 'manual' 
CHECK (source IN ('manual', 'discovered', 'imported', 'system'))
```

### API Response
The backend already returns `source` field in all template pack responses:
- `GET /api/template-packs/projects/:projectId/available`
- `GET /api/template-packs/projects/:projectId/installed`
- `GET /api/template-packs/:id`

No backend changes needed - it uses `SELECT *` which includes `source`.

---

## Testing Checklist

- [ ] Built-in packs appear in "Built-in Packs" section
- [ ] User/discovered packs appear in "User Created & Discovered Packs" section
- [ ] Built-in badge shows for system packs
- [ ] Discovered badge shows for discovered packs
- [ ] Can install built-in packs
- [ ] Can install user packs
- [ ] Can enable/disable built-in packs when installed
- [ ] Cannot remove built-in packs (Remove button hidden)
- [ ] Can remove user packs (Remove button visible)
- [ ] Preview modal works for both types
- [ ] Empty states work correctly
- [ ] Cards have correct hover colors (info for built-in, primary for user)

---

## User Stories

### As a Project Admin
- **I can** see built-in packs separately from custom packs
- **I can** install any pack (built-in or custom)
- **I can** enable/disable any installed pack
- **I can** remove custom packs but not built-in packs
- **I know** which packs are official (built-in badge)
- **I know** which packs came from auto-discovery (discovered badge)

### Visual Feedback
- **Built-in packs** use info theme (blue) to indicate official/system status
- **User packs** use primary theme to indicate user-created content
- **Badges** provide at-a-glance categorization
- **No Remove button** on built-in packs prevents accidental deletion

---

## Related Files

### Frontend
- `apps/admin/src/pages/admin/pages/settings/project/templates.tsx` (updated)

### Backend
- `apps/server/src/modules/template-packs/template-pack.service.ts` (no changes needed)
- `apps/server/migrations/20251019_extend_template_packs_for_discovery.sql` (sets system source)

### Documentation
- `docs/TEMPLATE_PACK_GROUPING.md` (this file)

---

## Future Enhancements

1. **Search/Filter**: Add search within each group
2. **Sort Options**: Allow sorting by name, date, type count
3. **Pack Categories**: Add category tags (Architecture, Project Management, etc.)
4. **Marketplace Tab**: Separate tab for community packs
5. **Pack Details Page**: Dedicated page for each pack with full documentation
6. **Version History**: Show previous versions and changelog
7. **Dependencies**: Show pack dependencies and conflicts
8. **Export/Import**: Allow exporting user packs for sharing

---

## Migration Notes

### For Existing Deployments

1. **Run Migration**: `20251019_extend_template_packs_for_discovery.sql`
   - Adds `source` column if not exists
   - Sets existing packs to `source = 'system'` where applicable

2. **Verify Built-in Packs**:
   ```sql
   SELECT name, version, source 
   FROM kb.graph_template_packs 
   WHERE source = 'system';
   ```

3. **Update Frontend**: Deploy updated templates.tsx component

### Adding New Built-in Packs

To mark a pack as built-in:

```sql
UPDATE kb.graph_template_packs
SET source = 'system'
WHERE name = 'New Built-in Pack Name';
```

Or when creating:

```sql
INSERT INTO kb.graph_template_packs (name, version, source, ...)
VALUES ('New Pack', '1.0.0', 'system', ...);
```

---

## Accessibility

- Section headers use `<h3>` for proper heading hierarchy
- Icons have semantic meaning (shield = protected, user = custom)
- Badges provide visual and textual indicators
- Buttons have descriptive labels ("Install", "Remove", "Enable/Disable")
- Modal close button has "✕" character for clarity

---

## Performance

- No additional API calls needed
- Filtering done client-side (fast for typical pack counts < 100)
- Two small filter operations: `source === 'system'` and `source !== 'system'`
- Could optimize with useMemo if pack count becomes large (> 500)

---

## Summary

This implementation provides clear visual organization of template packs, protecting system packs from accidental removal while giving users full control over their custom packs. The grouping improves discoverability and helps users understand the origin and purpose of each pack type.
