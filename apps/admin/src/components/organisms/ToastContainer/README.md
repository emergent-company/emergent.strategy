# ToastContainer Component

A global toast notification system for displaying transient messages with optional action buttons.

## Features

- **Multiple variants:** `success`, `error`, `warning`, `info`
- **Auto-dismiss:** Configurable duration (default 5 seconds) or manual-only dismiss
- **Action buttons:** Support for primary and secondary actions with callbacks
- **Toast stacking:** Maximum 5 toasts displayed simultaneously (FIFO removal)
- **Animations:** Slide-in from right with smooth transitions
- **Accessibility:** ARIA live regions, keyboard navigation, focus management
- **Manual dismiss:** Close button on each toast

## Usage

### Basic Toast

```tsx
import { useToast } from '@/hooks/use-toast';

function MyComponent() {
  const { showToast } = useToast();

  const handleSuccess = () => {
    showToast({
      message: 'Operation completed successfully!',
      variant: 'success',
    });
  };

  return <button onClick={handleSuccess}>Save</button>;
}
```

### Toast with Custom Duration

```tsx
// Auto-dismiss after 10 seconds
showToast({
  message: 'Processing your request...',
  variant: 'info',
  duration: 10000,
});

// Manual dismiss only (no auto-dismiss)
showToast({
  message: 'Important: Review required',
  variant: 'warning',
  duration: null,
});
```

### Toast with Action Buttons

```tsx
import { useNavigate } from 'react-router';

function DocumentUpload() {
  const { showToast } = useToast();
  const navigate = useNavigate();

  const handleUpload = async () => {
    // ... upload logic

    showToast({
      message: 'Document uploaded successfully',
      variant: 'success',
      actions: [
        {
          label: 'View',
          onClick: () => navigate('/documents/123'),
        },
      ],
    });
  };

  return <button onClick={handleUpload}>Upload</button>;
}
```

### Error Handling with Undo Action

```tsx
function DeleteItem() {
  const { showToast } = useToast();

  const handleDelete = (item) => {
    const backup = { ...item };

    // Perform delete
    deleteItemFromAPI(item.id);

    showToast({
      message: 'Item deleted',
      variant: 'error',
      duration: 10000, // Give user time to undo
      actions: [
        {
          label: 'Undo',
          onClick: () => restoreItem(backup),
        },
      ],
    });
  };

  return <button onClick={handleDelete}>Delete</button>;
}
```

## API Reference

### `useToast()` Hook

Returns an object with the following methods:

#### `showToast(options: ToastOptions): string`

Displays a new toast notification.

**Parameters:**

- `options.message: string` - The text content to display
- `options.variant: 'success' | 'error' | 'warning' | 'info'` - Toast style variant
- `options.duration?: number | null` - Auto-dismiss duration in milliseconds (default: 5000, null = manual only)
- `options.actions?: ToastAction[]` - Array of action buttons

**Returns:** Toast ID for programmatic dismissal

**Example:**

```tsx
const toastId = showToast({
  message: 'Processing...',
  variant: 'info',
  duration: null,
});

// Later, dismiss programmatically
dismissToast(toastId);
```

#### `dismissToast(id: string): void`

Manually dismisses a toast by ID.

**Parameters:**

- `id: string` - Toast ID returned from `showToast()`

### `ToastAction` Interface

```tsx
interface ToastAction {
  label: string;
  onClick: () => void;
}
```

### `ToastOptions` Interface

```tsx
interface ToastOptions {
  message: string;
  variant: 'success' | 'error' | 'warning' | 'info';
  duration?: number | null; // milliseconds, null = manual dismiss only
  actions?: ToastAction[];
}
```

## Setup

The toast system requires `ToastProvider` to be mounted at the application root:

```tsx
// apps/admin/src/main.tsx
import { ToastProvider } from '@/contexts/toast';
import { ToastContainer } from '@/components/organisms/ToastContainer';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ToastProvider>
      <App />
      <ToastContainer />
    </ToastProvider>
  </StrictMode>
);
```

## Styling

The component uses DaisyUI's toast and alert classes:

- `toast-top toast-end` - Positioned in top-right corner
- `alert-success`, `alert-error`, `alert-warning`, `alert-info` - Variant styles
- `animate-slide-in-right` - Custom slide-in animation

### Custom Animation

The slide-in animation is defined in `apps/admin/src/styles/core/animation.css`:

```css
@keyframes slide-in-right {
  0% {
    transform: translateX(100%);
    opacity: 0;
  }
  100% {
    transform: translateX(0);
    opacity: 1;
  }
}
```

## Accessibility

- **ARIA live region:** `aria-live="polite"` announces new toasts to screen readers
- **Role alert:** Each toast has `role="alert"` for semantic meaning
- **Keyboard support:** Press `Escape` to dismiss focused toast
- **Focus management:** Action buttons and dismiss button are keyboard accessible
- **Tab order:** Natural tab order through action buttons

## Testing

```bash
# Run toast tests
nx run admin:test toast

# Run all tests
nx run admin:test
```

### Test Coverage

- ✅ Context state management (11 tests)
- ✅ Component rendering (17 tests)
- ✅ Auto-dismiss timing
- ✅ Toast stacking behavior
- ✅ Action button callbacks
- ✅ Manual dismiss
- ✅ Keyboard interactions

## Storybook

Interactive examples available in Storybook:

```bash
# Start Storybook (if configured)
npm run storybook
```

Stories include:

- Success toast
- Error toast
- Warning toast
- Info toast
- Toast with single action
- Toast with multiple actions
- Manual dismiss toast
- Stacked toasts

## Performance Considerations

- **Maximum stack size:** Limited to 5 toasts to prevent UI clutter
- **FIFO removal:** Oldest toast is automatically removed when limit is reached
- **Auto-dismiss timers:** Properly cleaned up on unmount to prevent memory leaks
- **Animation performance:** Uses CSS transforms for hardware acceleration

## Common Patterns

### Loading State with Toast

```tsx
const handleAsyncOperation = async () => {
  const loadingToastId = showToast({
    message: 'Processing...',
    variant: 'info',
    duration: null, // Don't auto-dismiss
  });

  try {
    await performOperation();
    dismissToast(loadingToastId);
    showToast({
      message: 'Success!',
      variant: 'success',
    });
  } catch (error) {
    dismissToast(loadingToastId);
    showToast({
      message: error.message,
      variant: 'error',
    });
  }
};
```

### Confirmation with Undo

```tsx
const handleBulkDelete = (items) => {
  const backup = [...items];

  deleteItems(items);

  showToast({
    message: `${items.length} items deleted`,
    variant: 'success',
    duration: 8000,
    actions: [
      {
        label: 'Undo',
        onClick: () => {
          restoreItems(backup);
          showToast({
            message: 'Items restored',
            variant: 'info',
          });
        },
      },
    ],
  });
};
```

## Troubleshooting

### Toast not appearing

1. Ensure `ToastProvider` wraps your app in `main.tsx`
2. Verify `ToastContainer` is rendered inside the provider
3. Check that DaisyUI is properly configured in Tailwind
4. Verify toast duration hasn't already elapsed (default is 5 seconds)

### Toasts dismissing too quickly

Increase the duration:

```tsx
showToast({
  message: 'Read this carefully',
  variant: 'warning',
  duration: 10000, // 10 seconds
});
```

### Toasts not stacking properly

The system limits toasts to 5 maximum. If you need more, older toasts are automatically dismissed (FIFO).

## Related

- [DaisyUI Toast Documentation](https://daisyui.com/components/toast/)
- [DaisyUI Alert Documentation](https://daisyui.com/components/alert/)
- React Context API
- ARIA Live Regions
