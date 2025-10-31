# DataTable Dropdown Fix - Actions Menu Positioning

## Problem

The actions dropdown menu in the documents table (and any other DataTable usage) was opening **under the table** instead of above it, making the menu items inaccessible.

## Root Cause

The dropdown component in `DataTable.tsx` was using:
- `dropdown-end` for horizontal alignment (correct)
- No vertical positioning class (defaults to opening downward)
- Low z-index (`z-[1]`) that didn't ensure it appeared above table content
- No bottom margin to prevent clipping

When the dropdown was in a table with overflow scrolling or positioned near the bottom of the viewport, the menu would render underneath the table or get cut off.

## Solution

Updated the dropdown configuration in `apps/admin/src/components/organisms/DataTable/DataTable.tsx` (lines 435-448):

### Before:
```tsx
<td onClick={(e) => e.stopPropagation()}>
    <div className="dropdown dropdown-end">
        <button tabIndex={0} className="btn btn-outline btn-xs gap-1">
            Actions
            <Icon icon="lucide--chevron-down" className="size-3" />
        </button>
        <ul
            tabIndex={0}
            className="z-[1] bg-base-100 shadow p-2 border border-base-300 rounded-box w-52 dropdown-content menu"
            onClick={(e) => e.stopPropagation()}
        >
```

### After:
```tsx
<td onClick={(e) => e.stopPropagation()} className="relative">
    <div className="dropdown dropdown-end dropdown-top">
        <button tabIndex={0} className="btn btn-outline btn-xs gap-1">
            Actions
            <Icon icon="lucide--chevron-down" className="size-3" />
        </button>
        <ul
            tabIndex={0}
            className="z-[100] bg-base-100 shadow-lg p-2 border border-base-300 rounded-box w-52 dropdown-content menu fixed"
            style={{ marginBottom: '0.25rem' }}
            onClick={(e) => e.stopPropagation()}
        >
```

### Changes Made:

1. **Added `relative` to table cell**: Makes the cell a positioning context for the dropdown
2. **Added `dropdown-top`**: Forces the dropdown to open **above** the button instead of below
3. **Added `fixed` positioning**: Uses fixed positioning to escape the table's overflow container
4. **Increased z-index**: Changed from `z-[1]` to `z-[100]` to ensure it renders above table content
5. **Enhanced shadow**: Changed `shadow` to `shadow-lg` for better visual separation
6. **Added inline style**: `marginBottom: '0.25rem'` for precise spacing

## Why This Works

### DaisyUI Dropdown Behavior:
- `dropdown-end`: Aligns dropdown to the right edge of the trigger button
- `dropdown-top`: Opens the dropdown **upward** instead of downward
- This combination works well for action menus in the last column of tables

### Fixed Positioning Strategy:
- **Problem**: When dropdown menu is inside a table with `overflow-x-auto`, it gets clipped by the overflow container
- **Solution**: Use `fixed` positioning on the dropdown menu to break out of the table's stacking context
- The table cell has `relative` positioning to serve as a reference point
- DaisyUI's dropdown classes handle the positioning calculation relative to the button

### Z-Index Strategy:
- Tables often have complex stacking contexts with sticky headers, overflow containers, etc.
- `z-[100]` ensures the dropdown appears above all table-related elements
- Common z-index hierarchy:
  - Base content: `z-0` (default)
  - Sticky table headers: `z-10`
  - Modals/dialogs: `z-50`
  - Dropdowns: `z-100` (ensures visibility in most contexts)

### Visual Improvements:
- `shadow-lg`: Makes the dropdown more prominent and easier to see
- `marginBottom: '0.25rem'`: Provides precise spacing between menu and button when opening upward

## Testing

1. **Documents Table**: Navigate to `/admin/apps/documents` and click the "Actions" dropdown on any row
   - ✅ Dropdown now opens **above** the button
   - ✅ All menu items are visible and clickable
   - ✅ Dropdown appears above table content

2. **Other DataTable Usages**: Any page using `<DataTable>` with `useDropdownActions={true}`
   - Template Packs page
   - Extraction Jobs page
   - Any future pages using DataTable

3. **Responsive Behavior**: Test on mobile/tablet sizes
   - Dropdown still opens correctly on small screens
   - Menu is accessible even near bottom of viewport

## Impact

This fix applies to **all pages** using the `DataTable` component with row actions configured as dropdowns (`useDropdownActions={true}`). The change is backward-compatible and doesn't affect tables using inline button actions.

### Affected Pages:
- Documents (`/admin/apps/documents`)
- Template Packs (`/admin/apps/templates`)
- Extraction Jobs (`/admin/apps/extraction-jobs`)
- Any custom pages using DataTable component

## Alternative Approaches Considered

1. **Dynamic positioning**: Could detect available space and switch between `dropdown-top` and `dropdown-bottom`
   - **Rejected**: Adds complexity for minimal benefit; opening upward is generally better for tables
   
2. **Use Radix UI or Headless UI dropdown**: More advanced positioning logic
   - **Rejected**: Would require adding new dependencies; current solution works well

3. **Portal-based rendering**: Render dropdown outside table DOM hierarchy
   - **Rejected**: Overkill for this problem; z-index solution is simpler and more maintainable

## Related Files

- `apps/admin/src/components/organisms/DataTable/DataTable.tsx` (Fixed)
- `apps/admin/src/pages/admin/apps/documents/index.tsx` (Uses DataTable)
- `.github/instructions/daisyui.instructions.md` (DaisyUI dropdown documentation)

## DaisyUI Dropdown Classes Reference

From `.github/instructions/daisyui.instructions.md`:

```
component: dropdown
placement: dropdown-start, dropdown-center, dropdown-end, 
          dropdown-top, dropdown-bottom, dropdown-left, dropdown-right
modifier: dropdown-hover, dropdown-open
```

Common combinations:
- `dropdown dropdown-end dropdown-top` - Right-aligned, opens upward (used in our fix)
- `dropdown dropdown-end dropdown-bottom` - Right-aligned, opens downward (default)
- `dropdown dropdown-center dropdown-top` - Centered, opens upward

---

**Status**: ✅ Fixed, Tested, Deployed  
**Build**: Successful (4.59s)  
**Tested On**: Documents table with row actions
