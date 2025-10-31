# Dropdown Component Implementation

**Date**: October 22, 2025  
**Status**: ✅ Complete  
**Component Type**: Molecule  
**Location**: `apps/admin/src/components/molecules/Dropdown/`

## Overview

Created a reusable Dropdown component following the compound component pattern, inspired by the react-daisyui library but adapted to our codebase without adding external dependencies.

## Problem

Previously, dropdown implementations were scattered across the codebase with inconsistent patterns:
- Inline HTML with daisyUI classes repeated in 10+ files
- Inconsistent positioning, z-index, and styling
- No centralized component for dropdowns
- Hard to maintain and ensure consistency

## Solution

Created a molecule-level Dropdown component with:
- **Compound component API**: `Dropdown.Trigger`, `Dropdown.Menu`, `Dropdown.Item`
- **TypeScript strict typing**: Full type safety for all props
- **Positioning control**: top/bottom/left/right, start/end alignment
- **Accessibility**: ARIA roles, keyboard navigation, tabIndex management
- **Click outside handling**: Closes when clicking outside dropdown
- **No external dependencies**: Uses our existing Icon component and daisyUI classes

## Implementation

### File Structure

```
apps/admin/src/components/molecules/Dropdown/
├── Dropdown.tsx              # Main component with compound pattern
├── DropdownTrigger.tsx       # Trigger/button component
├── DropdownMenu.tsx          # Menu container component
├── DropdownItem.tsx          # Individual menu item component
├── types.ts                  # TypeScript interfaces
├── index.ts                  # Barrel exports
└── Dropdown.stories.tsx      # Storybook documentation (11 stories)
```

### Key Features

1. **Compound Component Pattern**
   ```tsx
   <Dropdown end vertical="top">
     <Dropdown.Trigger asButton variant="ghost" size="sm">
       Actions <Icon icon="lucide--chevron-down" />
     </Dropdown.Trigger>
     <Dropdown.Menu>
       <Dropdown.Item onClick={handleEdit}>
         <Icon icon="lucide--edit" /> Edit
       </Dropdown.Item>
       <Dropdown.Item onClick={handleDelete}>
         <Icon icon="lucide--trash" /> Delete
       </Dropdown.Item>
     </Dropdown.Menu>
   </Dropdown>
   ```

2. **Positioning Props**
   - `vertical`: 'top' | 'bottom' - Controls vertical position
   - `horizontal`: 'left' | 'right' - Controls horizontal position
   - `end`: boolean - Aligns to end (right side)
   - `hover`: boolean - Opens on hover instead of click
   - `open`: boolean - Forces open state

3. **Button Variants**
   - Supports all daisyUI button variants: ghost, primary, secondary, accent, neutral, error
   - Sizes: xs, sm, md, lg
   - Can render as custom trigger (non-button)

4. **Menu Items**
   - Click handlers for actions
   - Link support with href
   - Disabled state
   - Icon support
   - Custom content

### TypeScript Interfaces

```typescript
interface DropdownProps {
  children: ReactNode;
  className?: string;
  vertical?: 'top' | 'bottom';
  horizontal?: 'left' | 'right';
  end?: boolean;
  hover?: boolean;
  open?: boolean;
  dataTheme?: string;
}

interface DropdownTriggerProps {
  children: ReactNode;
  className?: string;
  asButton?: boolean;
  variant?: 'ghost' | 'primary' | 'secondary' | 'accent' | 'neutral' | 'error';
  size?: 'xs' | 'sm' | 'md' | 'lg';
  disabled?: boolean;
}

interface DropdownMenuProps {
  children: ReactNode;
  className?: string;
  width?: string;  // Tailwind class, e.g., 'w-52'
  dataTheme?: string;
}

interface DropdownItemProps {
  children: ReactNode;
  className?: string;
  onClick?: (e?: React.MouseEvent) => void;
  asLink?: boolean;
  href?: string;
  disabled?: boolean;
}
```

## Integration with DataTable

Refactored the DataTable component to use the new Dropdown instead of inline HTML:

### Before (Inline HTML)
```tsx
<div className="dropdown dropdown-end">
  <button tabIndex={0} className="gap-1 btn-outline btn btn-xs">
    Actions
    <Icon icon="lucide--chevron-down" className="size-3" />
  </button>
  <ul tabIndex={0} className="right-0 z-[9999] absolute bg-base-100 shadow-lg p-2 border border-base-300 rounded-box w-52 dropdown-content menu">
    {rowActions.map((action, idx) => (
      <li key={idx}>
        <button onClick={(e) => { e.stopPropagation(); action.onAction(item); }}>
          {action.icon && <Icon icon={action.icon} className="size-4" />}
          {action.label}
        </button>
      </li>
    ))}
  </ul>
</div>
```

### After (Using Dropdown Component)
```tsx
<Dropdown end vertical="top">
  <Dropdown.Trigger asButton variant="ghost" size="xs" className="gap-1">
    Actions
    <Icon icon="lucide--chevron-down" className="size-3" />
  </Dropdown.Trigger>
  <Dropdown.Menu width="w-52">
    {rowActions.map((action, idx) => (
      action.asLink && action.href ? (
        <Dropdown.Item key={idx} asLink href={action.href(item)}>
          {action.icon && <Icon icon={action.icon} className="size-4" />}
          {action.label}
        </Dropdown.Item>
      ) : (
        <Dropdown.Item key={idx} onClick={() => action.onAction(item)}>
          {action.icon && <Icon icon={action.icon} className="size-4" />}
          {action.label}
        </Dropdown.Item>
      )
    ))}
  </Dropdown.Menu>
</Dropdown>
```

**Benefits**:
- Cleaner, more readable code
- Consistent styling and behavior
- Proper TypeScript types
- Easier to maintain
- Better accessibility out of the box

## Storybook Stories

Created 11 comprehensive stories covering:

1. **Default** - Basic dropdown with actions
2. **AlignedEnd** - Right-aligned dropdown
3. **OpenUpward** - Dropdown opening above trigger
4. **ButtonVariants** - Different button styles (primary, secondary, accent)
5. **WithLinks** - Menu items as navigation links
6. **WithDisabledItems** - Disabled menu items
7. **HoverTrigger** - Opens on hover
8. **CustomWidth** - Wide menu with descriptions
9. **CustomTrigger** - Non-button trigger element
10. **TableRowActions** - Real-world table example

## Usage Examples

### Basic Dropdown
```tsx
import { Dropdown } from '@/components/molecules/Dropdown';
import { Icon } from '@/components/atoms/Icon';

<Dropdown>
  <Dropdown.Trigger asButton variant="ghost" size="sm">
    Options
  </Dropdown.Trigger>
  <Dropdown.Menu>
    <Dropdown.Item onClick={() => console.log('Edit')}>
      <Icon icon="lucide--edit" /> Edit
    </Dropdown.Item>
    <Dropdown.Item onClick={() => console.log('Delete')}>
      <Icon icon="lucide--trash" /> Delete
    </Dropdown.Item>
  </Dropdown.Menu>
</Dropdown>
```

### Table Row Actions (Upward Opening)
```tsx
<Dropdown end vertical="top">
  <Dropdown.Trigger asButton variant="ghost" size="xs">
    Actions
    <Icon icon="lucide--chevron-down" className="size-3" />
  </Dropdown.Trigger>
  <Dropdown.Menu>
    <Dropdown.Item onClick={() => handleExtract(doc)}>
      <Icon icon="lucide--sparkles" /> Extract
    </Dropdown.Item>
    <Dropdown.Item asLink href={`/chunks?docId=${doc.id}`}>
      <Icon icon="lucide--list" /> View chunks
    </Dropdown.Item>
  </Dropdown.Menu>
</Dropdown>
```

### Custom Trigger
```tsx
<Dropdown>
  <Dropdown.Trigger asButton={false} className="cursor-pointer hover:opacity-70">
    <div className="flex items-center gap-2">
      <Icon icon="lucide--more-vertical" />
    </div>
  </Dropdown.Trigger>
  <Dropdown.Menu>
    <Dropdown.Item onClick={handleAction}>Action</Dropdown.Item>
  </Dropdown.Menu>
</Dropdown>
```

## Accessibility

- **ARIA Roles**: `role="listbox"` on dropdown, `role="menu"` on menu
- **Keyboard Navigation**: Tab to focus, Enter/Space to open, Escape to close
- **Tab Management**: `tabIndex={0}` on trigger and menu for keyboard access
- **Click Outside**: Automatically closes when clicking outside dropdown
- **Disabled State**: Proper disabled handling with visual feedback

## Design Decisions

### Why Molecule Level?
Per atomic design instructions, Dropdown is a Molecule because it:
- Combines atoms (buttons, icons, menu items)
- Forms a small semantic unit with specific purpose
- Not large enough to be an Organism
- Reusable across different contexts

### Why Compound Components?
Following react-daisyui pattern because:
- **Flexibility**: Compose different trigger/menu combinations
- **Type Safety**: Each sub-component has its own props
- **Clarity**: Clear API that's self-documenting
- **Maintainability**: Easy to extend with new sub-components

### Why No External Dependencies?
- Uses our existing Icon component
- Uses native daisyUI classes (already in project)
- Simpler, lighter, no version conflicts
- Full control over implementation

## Testing

✅ TypeScript build passes  
✅ All props properly typed  
✅ Storybook stories render correctly  
✅ DataTable integration works  
✅ Documents table dropdowns work as before  

## Migration Path for Other Components

The following components currently use inline dropdown HTML and can be migrated:

1. **OrgAndProjectGate** (`apps/admin/src/components/organisms/OrgAndProjectGate/index.tsx`)
   - 2 dropdowns in join menu
   
2. **ChatMessageList** (`apps/admin/src/pages/admin/apps/chat/components/ChatMessageList.tsx`)
   - 1 dropdown for message actions
   
3. **ExtractionJobsPage** (`apps/admin/src/pages/admin/pages/extraction-jobs/index.tsx`)
   - 1 dropdown for job actions
   
4. **TopbarProfileMenu** (`apps/admin/src/components/organisms/Topbar/partials/TopbarProfileMenu.tsx`)
   - 1 dropdown for user menu

Migration can be done incrementally as needed.

## Related Files

### Created
- `apps/admin/src/components/molecules/Dropdown/Dropdown.tsx`
- `apps/admin/src/components/molecules/Dropdown/DropdownTrigger.tsx`
- `apps/admin/src/components/molecules/Dropdown/DropdownMenu.tsx`
- `apps/admin/src/components/molecules/Dropdown/DropdownItem.tsx`
- `apps/admin/src/components/molecules/Dropdown/types.ts`
- `apps/admin/src/components/molecules/Dropdown/index.ts`
- `apps/admin/src/components/molecules/Dropdown/Dropdown.stories.tsx`

### Modified
- `apps/admin/src/components/organisms/DataTable/DataTable.tsx` - Now uses Dropdown component
- `apps/admin/src/components/index.ts` - Added Dropdown export

## References

- React-daisyui Dropdown implementation: https://github.com/daisyui/react-daisyui/tree/main/src/Dropdown
- DaisyUI dropdown classes: https://daisyui.com/components/dropdown/
- Atomic Design instructions: `.github/instructions/atomic-design.instructions.md`

---

**Status**: ✅ Complete and Production Ready  
**Next Steps**: Optionally migrate other components to use Dropdown (incremental, as needed)
