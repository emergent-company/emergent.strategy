# Dropdown Component - Quick Reference

## Import

```tsx
import { Dropdown } from '@/components/molecules/Dropdown';
import { Icon } from '@/components/atoms/Icon';
```

## Basic Usage

```tsx
<Dropdown>
  <Dropdown.Trigger asButton variant="ghost" size="sm">
    Actions
    <Icon icon="lucide--chevron-down" className="size-3" />
  </Dropdown.Trigger>
  <Dropdown.Menu>
    <Dropdown.Item onClick={() => handleEdit()}>
      <Icon icon="lucide--edit" className="size-4" />
      Edit
    </Dropdown.Item>
    <Dropdown.Item onClick={() => handleDelete()}>
      <Icon icon="lucide--trash" className="size-4" />
      Delete
    </Dropdown.Item>
  </Dropdown.Menu>
</Dropdown>
```

## Props

### Dropdown (Root)
- `vertical?: 'top' | 'bottom'` - Opens upward or downward
- `horizontal?: 'left' | 'right'` - Opens to left or right
- `end?: boolean` - Aligns to end (right side)
- `hover?: boolean` - Opens on hover instead of click
- `open?: boolean` - Force open state

### Dropdown.Trigger
- `asButton?: boolean` - Render as button (default: true)
- `variant?: 'ghost' | 'outline' | 'primary' | 'secondary' | 'accent' | 'neutral' | 'error'`
- `size?: 'xs' | 'sm' | 'md' | 'lg'`
- `disabled?: boolean`

### Dropdown.Menu
- `width?: string` - Tailwind width class (default: 'w-52')

### Dropdown.Item
- `onClick?: (e?: React.MouseEvent) => void` - Click handler
- `asLink?: boolean` - Render as link
- `href?: string` - Link destination (requires asLink)
- `disabled?: boolean`

## Common Patterns

### Table Row Actions (Upward Opening)
```tsx
<Dropdown end vertical="top">
  <Dropdown.Trigger asButton variant="ghost" size="xs">
    Actions
  </Dropdown.Trigger>
  <Dropdown.Menu>
    <Dropdown.Item onClick={() => extract(item)}>Extract</Dropdown.Item>
  </Dropdown.Menu>
</Dropdown>
```

### Navigation Links
```tsx
<Dropdown>
  <Dropdown.Trigger asButton variant="ghost">
    Menu
  </Dropdown.Trigger>
  <Dropdown.Menu>
    <Dropdown.Item asLink href="/documents">Documents</Dropdown.Item>
    <Dropdown.Item asLink href="/settings">Settings</Dropdown.Item>
  </Dropdown.Menu>
</Dropdown>
```

### Custom Trigger
```tsx
<Dropdown>
  <Dropdown.Trigger asButton={false} className="cursor-pointer">
    <Icon icon="lucide--more-vertical" />
  </Dropdown.Trigger>
  <Dropdown.Menu>
    <Dropdown.Item onClick={action}>Action</Dropdown.Item>
  </Dropdown.Menu>
</Dropdown>
```

## Storybook

View all examples in Storybook:
```bash
npm run storybook
```

Navigate to: **Molecules → Dropdown**
