# Dropdown in Table - Overflow Fix

## Problem
When using the Dropdown component inside a DataTable, the dropdown menu was being clipped by the table's `overflow-x-auto` container. This made dropdowns in the first few rows partially or completely invisible when opening upward.

## Root Cause
The table wrapper uses `overflow-x-auto` for horizontal scrolling, which creates a clipping context. Any absolutely positioned elements (like dropdown menus) that extend beyond the container bounds get clipped.

## Solution
Applied multiple fixes to allow the dropdown to render properly:

### 1. Table Wrapper Overflow
Changed the table wrapper from:
```tsx
<div className="border border-base-300 rounded overflow-x-auto overflow-y-visible">
```

To:
```tsx
<div className="border border-base-300 rounded overflow-x-auto" style={{ overflowY: 'visible' }}>
```

Using inline style `overflowY: 'visible'` ensures vertical overflow is allowed even when horizontal scrolling is enabled.

### 2. Actions Cell Positioning
Added `overflow-visible` to the actions cell:
```tsx
<td onClick={(e) => e.stopPropagation()} className="relative overflow-visible">
```

The `relative` class provides positioning context for the dropdown, while `overflow-visible` allows the dropdown menu to extend beyond the cell bounds.

### 3. Dropdown Menu Z-Index
Set appropriate z-index on the dropdown menu:
```tsx
className="... z-[100] ..."
```

This ensures the dropdown appears above table content and other UI elements.

## How It Works
1. **Table wrapper**: Allows horizontal scrolling (`overflow-x-auto`) but permits vertical overflow (`overflowY: 'visible'`)
2. **Actions cell**: Provides positioning context (`relative`) and allows overflow (`overflow-visible`)
3. **Dropdown menu**: Uses absolute positioning (via daisyUI `dropdown-content`) with proper z-index layering

## Testing
The dropdown now:
- ✅ Opens upward correctly (`vertical="top"`)
- ✅ Aligns to the right (`end` prop)
- ✅ Displays fully even in first row of table
- ✅ Doesn't get clipped by table container
- ✅ Maintains horizontal scrolling for table

## Related Files
- `/apps/admin/src/components/molecules/Dropdown/DropdownMenu.tsx` - Menu component with z-index
- `/apps/admin/src/components/organisms/DataTable/DataTable.tsx` - Table with overflow fix
- `/docs/DROPDOWN_COMPONENT_IMPLEMENTATION.md` - Dropdown component documentation
