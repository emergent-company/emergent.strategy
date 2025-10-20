# UI Update: Template Packs Single Column Layout

## Change

Updated the "Available Template Packs" section to display template packs in a single column layout instead of a 2-column grid.

## Files Changed

**File**: `apps/admin/src/pages/admin/pages/settings/project/templates.tsx`

### Built-in Packs Section

**Before:**
```tsx
<div className="gap-4 grid md:grid-cols-2">
```

**After:**
```tsx
<div className="space-y-3">
```

### User Created & Discovered Packs Section

**Before:**
```tsx
<div className="gap-4 grid md:grid-cols-2">
```

**After:**
```tsx
<div className="space-y-3">
```

## Visual Impact

### Before
- Packs displayed in 2-column grid on medium+ screens
- 1 column on mobile
- Horizontal spacing between cards

### After
- Packs displayed in single column on all screen sizes
- Vertical spacing between cards
- Consistent with installed packs section layout
- Easier to scan through the list
- Better for longer pack descriptions

## Benefits

1. **Consistency**: Matches the installed packs section layout (which is already single column)
2. **Readability**: Easier to scan through pack names and descriptions vertically
3. **Accessibility**: Simpler layout structure
4. **Responsive**: Same layout on all screen sizes (no layout shift between mobile/desktop)
5. **Content**: More horizontal space for pack descriptions and metadata

## Testing

1. Go to Project Settings → Template Packs
2. Verify "Built-in Packs" section shows packs in single column
3. Verify "User Created & Discovered Packs" section shows packs in single column
4. Verify consistent spacing between pack cards
5. Check on mobile and desktop - should look the same
6. Verify pack content is still readable and action buttons are accessible

## Related Changes

This change aligns with the overall template pack UI improvements:
- Built-in vs User Created grouping
- Source field display
- Badge system
- Protected removal for built-in packs
