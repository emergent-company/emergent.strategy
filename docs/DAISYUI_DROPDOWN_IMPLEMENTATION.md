# DaisyUI Dropdown Implementation Pattern

## Overview
This document explains how to properly implement dropdowns using daisyUI CSS classes (without react-daisyui library dependency). The pattern is based on react-daisyui's source code but implemented directly with React and daisyUI CSS.

**Date**: October 20, 2025  
**Reference**: ObjectBrowser type filter dropdown

## Why Not Use react-daisyui?
We chose to implement dropdown patterns ourselves rather than adding react-daisyui as a dependency to:
- Keep bundle size smaller
- Have full control over component behavior
- Avoid additional dependency maintenance
- Learn from their patterns and adapt to our needs

## The Pattern

### 1. Core daisyUI Classes
```tsx
// Container with state-controlled class
<div className={`dropdown ${isOpen ? 'dropdown-open' : ''}`}>
  {/* Trigger element (label or button) */}
  <label tabIndex={0} onClick={() => setIsOpen(!isOpen)}>
    Click me
  </label>
  
  {/* Content - always rendered, visibility controlled by CSS */}
  <ul tabIndex={0} className="dropdown-content menu bg-base-100 rounded-box z-[1] w-52 p-2 shadow">
    <li><a>Item 1</a></li>
    <li><a>Item 2</a></li>
  </ul>
</div>
```

### 2. Key Principles

#### A. Use `dropdown-open` class for state
The `dropdown-open` class is how you control visibility:
```tsx
const [isOpen, setIsOpen] = useState(false);

// Apply class conditionally
className={`dropdown ${isOpen ? 'dropdown-open' : ''}`}
```

**Why this works**: DaisyUI's CSS shows/hides `.dropdown-content` based on:
- Parent has `.dropdown-open` class, OR
- Parent has `:focus-within` pseudo-class

#### B. Use `<label>` not `<button>` for trigger
React-daisyui uses `<label tabIndex={0}>` as the trigger element:
```tsx
// ✅ Correct (works with daisyUI CSS)
<label 
  tabIndex={0}
  onClick={() => setIsOpen(!isOpen)}
>
  Click me
</label>

// ❌ Wrong (may not work with all daisyUI states)
<button onClick={() => setIsOpen(!isOpen)}>
  Click me
</button>
```

**Why**: DaisyUI's dropdown CSS is optimized for `<label>` elements with `tabIndex={0}`.

#### C. Always render content (don't conditionally render)
```tsx
// ✅ Correct - content always in DOM, CSS controls visibility
<ul className="dropdown-content menu ...">
  {items.map(...)}
</ul>

// ❌ Wrong - breaks daisyUI's CSS-based show/hide
{isOpen && (
  <ul className="dropdown-content menu ...">
    {items.map(...)}
  </ul>
)}
```

**Why**: DaisyUI relies on CSS transitions and DOM presence for smooth animations.

#### D. Use proper z-index
```tsx
className="dropdown-content menu ... z-[1]"
```

Use `z-[1]` (not `z-10` or `z-[100]`) - this is daisyUI's standard dropdown z-index.

### 3. Complete Working Example

```tsx
import { useState, useRef, useEffect } from 'react';

export const FilterDropdown = ({ types, selectedTypes, onTypeToggle }) => {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownOpen(false);
      }
    };

    if (dropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
  }, [dropdownOpen]);

  return (
    <div 
      className={`dropdown ${dropdownOpen ? 'dropdown-open' : ''}`} 
      ref={dropdownRef}
    >
      <label
        tabIndex={0}
        className="btn btn-sm btn-ghost"
        onClick={(e) => {
          e.preventDefault();
          setDropdownOpen(!dropdownOpen);
        }}
      >
        Filter by Type
      </label>
      
      <ul
        tabIndex={0}
        className="dropdown-content menu bg-base-100 rounded-box z-[1] w-64 p-2 shadow-lg border border-base-300"
      >
        {types.map(type => (
          <li key={type}>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                className="checkbox checkbox-sm"
                checked={selectedTypes.includes(type)}
                onChange={() => onTypeToggle(type)}
              />
              <span>{type}</span>
            </label>
          </li>
        ))}
      </ul>
    </div>
  );
};
```

## DaisyUI Dropdown Modifiers

### Positioning
```tsx
// Horizontal alignment
className="dropdown dropdown-end"   // Right-aligned
className="dropdown dropdown-start" // Left-aligned (default)

// Vertical position
className="dropdown dropdown-top"    // Opens upward
className="dropdown dropdown-bottom" // Opens downward (default)
```

### Behavior
```tsx
// Hover to open (no click needed)
className="dropdown dropdown-hover"

// Force open state (for debugging)
className="dropdown dropdown-open"
```

## React-DaisyUI Source Reference

The implementation is based on:
```typescript
// From react-daisyui/src/Dropdown/Dropdown.tsx
export const classesFn = ({
  className,
  horizontal,
  vertical,
  end,
  hover,
  open,
}: DropdownProps) =>
  twMerge(
    'dropdown',
    className,
    clsx({
      'dropdown-left': horizontal === 'left',
      'dropdown-right': horizontal === 'right',
      'dropdown-top': vertical === 'top',
      'dropdown-bottom': vertical === 'bottom',
      'dropdown-end': end,
      'dropdown-hover': hover,
      'dropdown-open': open, // <-- Key class for state control
    })
  )
```

## Common Mistakes to Avoid

### ❌ Mistake 1: Using absolute positioning
```tsx
// Wrong - fighting daisyUI's layout
className="absolute z-[100] ..."
```

DaisyUI already handles positioning. Adding `absolute` breaks the layout.

### ❌ Mistake 2: Conditional rendering of content
```tsx
// Wrong - prevents CSS transitions
{dropdownOpen && <ul className="dropdown-content">...</ul>}
```

### ❌ Mistake 3: Using button without proper setup
```tsx
// May not work correctly
<button onClick={() => setIsOpen(!isOpen)}>Click</button>
```

Use `<label tabIndex={0}>` instead for full daisyUI compatibility.

### ❌ Mistake 4: Not handling click-outside
Users expect dropdowns to close when clicking outside. Always implement this:

```tsx
useEffect(() => {
  const handleClickOutside = (event: MouseEvent) => {
    if (ref.current && !ref.current.contains(event.target as Node)) {
      setIsOpen(false);
    }
  };
  if (isOpen) {
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }
}, [isOpen]);
```

## Testing Checklist

When implementing a dropdown:
- [ ] Dropdown opens when trigger clicked
- [ ] Dropdown closes when clicking outside
- [ ] Dropdown closes when clicking trigger again
- [ ] Content is always in DOM (check DevTools)
- [ ] `dropdown-open` class toggles on container
- [ ] Keyboard navigation works (Tab, Enter)
- [ ] Z-index displays above other content
- [ ] Animations work smoothly
- [ ] No console errors about missing elements

## Performance Notes

### Why Always Render Content?
You might think conditional rendering saves performance:
```tsx
{isOpen && <ul>...</ul>} // Saves render when closed?
```

**Reality**: 
- DaisyUI dropdowns typically have <100 items
- Re-mounting/unmounting has overhead too
- CSS `display: none` is very fast
- CSS transitions require persistent DOM elements

**Best Practice**: Always render, let CSS handle visibility.

## Advanced: Compound Components (Future)

If we need many dropdowns, consider creating compound components:

```tsx
// components/atoms/Dropdown/Dropdown.tsx
export const Dropdown = ({ children, open, onToggle }) => (
  <div className={`dropdown ${open ? 'dropdown-open' : ''}`}>
    {children}
  </div>
);

// components/atoms/Dropdown/DropdownTrigger.tsx
export const DropdownTrigger = ({ children, onClick }) => (
  <label tabIndex={0} onClick={onClick}>
    {children}
  </label>
);

// components/atoms/Dropdown/DropdownContent.tsx
export const DropdownContent = ({ children, className }) => (
  <ul tabIndex={0} className={`dropdown-content menu ${className}`}>
    {children}
  </ul>
);

// Usage:
<Dropdown open={isOpen} onToggle={setIsOpen}>
  <DropdownTrigger>Click me</DropdownTrigger>
  <DropdownContent>
    <li><a>Item 1</a></li>
  </DropdownContent>
</Dropdown>
```

## Related Documentation
- [DaisyUI Dropdown Docs](https://daisyui.com/components/dropdown/)
- [React-DaisyUI Source](https://github.com/daisyui/react-daisyui/blob/main/src/Dropdown/Dropdown.tsx)
- `docs/OBJECT_BROWSER_TYPE_FILTERING.md` - Real implementation example
- `.github/instructions/daisyui.instructions.md` - DaisyUI usage guidelines

## Summary
✅ **Use `dropdown-open` class** to control visibility  
✅ **Use `<label tabIndex={0}>`** as trigger  
✅ **Always render content**, let CSS hide it  
✅ **Use `z-[1]`** for proper stacking  
✅ **Implement click-outside** handler  
✅ **Don't fight daisyUI's CSS** with custom positioning  

This pattern gives you full control while leveraging daisyUI's battle-tested CSS.
