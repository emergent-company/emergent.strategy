# Implementation Tasks

## 1. Core Toast System

- [x] 1.1 Create ToastContext with state management (contexts/toast.tsx)
- [x] 1.2 Implement useToast hook with showToast, dismissToast methods (hooks/use-toast.ts)
- [x] 1.3 Add toast type definitions (ToastVariant, ToastAction, ToastOptions)
- [x] 1.4 Implement auto-dismiss timer logic with cleanup
- [x] 1.5 Add toast stacking logic (max 5, FIFO removal)

## 2. UI Components

- [x] 2.1 Create ToastContainer component with DaisyUI base styles
- [x] 2.2 Add Toast component with variant styles (success, error, warning, info)
- [x] 2.3 Implement action buttons (primary and secondary) with callbacks
- [x] 2.4 Add dismiss button (X icon) with manual close
- [x] 2.5 Add toast enter/exit animations (slide-in from right)

## 3. Integration

- [x] 3.1 Add ToastProvider to App.tsx root
- [x] 3.2 Migrate DocumentsPage upload success/error to use useToast hook
- [x] 3.3 Migrate TopbarProfileMenu to use useToast hook
- [x] 3.4 Migrate KBPurposeEditor to use useToast hook
- [x] 3.5 Remove old toast implementations (direct DOM manipulation, uploadSuccess state)

## 4. Testing

- [x] 4.1 Write unit tests for ToastContext state management
- [x] 4.2 Write unit tests for useToast hook
- [x] 4.3 Write component tests for Toast rendering
- [x] 4.4 Write component tests for action button callbacks
- [x] 4.5 Write integration tests for auto-dismiss timing (covered in toast.test.tsx)
- [x] 4.6 Write integration tests for toast stacking (covered in toast.test.tsx)
- [x] 4.7 Add Storybook stories for ToastContainer with variants

## 5. Documentation

- [x] 5.1 Add JSDoc comments to ToastContext and useToast hook
- [x] 5.2 Add usage examples in code comments
- [ ] 5.3 Update component documentation

## 6. Validation

- [ ] 6.1 Manual test: document upload toast (success + list reload confirmation)
- [ ] 6.2 Manual test: document upload error toast
- [ ] 6.3 Manual test: extraction job creation toast with navigation
- [ ] 6.4 Manual test: org switching toast
- [ ] 6.5 Manual test: KB purpose save toast
- [ ] 6.6 Manual test: action button navigation
- [ ] 6.7 Manual test: multiple rapid toasts stacking
- [ ] 6.8 Manual test: manual dismiss vs auto-dismiss
- [ ] 6.9 Run all existing E2E tests to ensure no regressions
