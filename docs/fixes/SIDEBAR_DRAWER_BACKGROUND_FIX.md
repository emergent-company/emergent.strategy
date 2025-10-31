# Sidebar Drawer Background Fix

## Issue
On smaller screens (mobile/tablet, `max-width: lg`), when the sidebar is displayed as a drawer, it has no background. This makes content behind the sidebar visible through it, creating a poor user experience.

## Root Cause
The sidebar element uses `background: var(--layout-sidebar-background)` but this CSS variable is never defined anywhere in the codebase.

In mobile view, the sidebar becomes a fixed overlay drawer but inherits no background color, making it transparent.

## File Changed
- `apps/admin/src/styles/pages/layout.css`

## Fix Applied
Added a fallback background color and Tailwind utility class:

**Before:**
```css
#layout-sidebar {
    width: var(--layout-sidebar-width);
    min-width: var(--layout-sidebar-width);
    background: var(--layout-sidebar-background);
    max-height: 100vh;

    @apply relative top-0 bottom-0 z-10 flex flex-col transition-[margin,_top,_max-height,_border-radius] duration-300;
}
```

**After:**
```css
#layout-sidebar {
    width: var(--layout-sidebar-width);
    min-width: var(--layout-sidebar-width);
    background: var(--layout-sidebar-background, oklch(var(--b1)));
    max-height: 100vh;

    @apply relative top-0 bottom-0 z-10 flex flex-col transition-[margin,_top,_max-height,_border-radius] duration-300 bg-base-100;
}
```

### Changes Explained

1. **Fallback background color**: `var(--layout-sidebar-background, oklch(var(--b1)))`
   - Uses `oklch(var(--b1))` as fallback when custom variable is not defined
   - `--b1` is daisyUI's base-100 color in OKLCH format
   
2. **Tailwind utility class**: Added `bg-base-100` to `@apply`
   - Ensures the sidebar always has a proper background
   - Uses daisyUI's semantic base color
   - Works with all themes (respects `data-theme` attribute on sidebar)

## How It Works

The sidebar component already sets `data-theme={calculatedSidebarTheme}` on the sidebar element:

```tsx
<div id="layout-sidebar" className="flex flex-col sidebar-menu" data-theme={calculatedSidebarTheme}>
```

With `bg-base-100` applied, the sidebar will:
- Use the appropriate base background color for the selected sidebar theme
- Be opaque on mobile/drawer view
- Properly overlay content without transparency issues

## Mobile Behavior

On screens `<= 1024px` (lg breakpoint):
```css
@media (max-width: theme(--breakpoint-lg)) {
    #layout-sidebar {
        @apply fixed z-[500];
    }
}
```

The sidebar:
- Becomes `position: fixed` (drawer mode)
- Has `z-index: 500` (overlays content)
- Now has proper background color ✅
- Slides in/out with toggle checkbox

## Testing

To verify the fix:

1. **Open admin app**: Navigate to any admin page
2. **Resize browser**: Make window width < 1024px (or use mobile device)
3. **Toggle sidebar**: Click hamburger menu icon
4. **Verify**: Sidebar should have solid background, no see-through content

### Test with different themes:
```tsx
// In browser DevTools console
localStorage.setItem('theme', 'dark')
location.reload()
```

Try themes: `light`, `dark`, `cupcake`, `dracula`, etc.

## Related Files
- `apps/admin/src/components/organisms/Sidebar/index.tsx` - Sidebar component
- `apps/admin/src/styles/pages/layout.css` - Layout styles (fixed file)
- `apps/admin/src/contexts/config.ts` - Theme configuration

## Browser Support
- All modern browsers (uses CSS custom properties and OKLCH)
- Tailwind's `bg-base-100` provides excellent fallback support
- OKLCH with var fallback ensures compatibility

## Future Considerations

If you want to define `--layout-sidebar-background` explicitly:

```css
:root {
    --layout-sidebar-width: 256px;
    --layout-sidebar-background: oklch(var(--b1)); /* Add this */
}
```

This would allow customization per theme if needed.
