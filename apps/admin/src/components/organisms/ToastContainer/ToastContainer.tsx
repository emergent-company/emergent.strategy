import React, { useCallback, useEffect, useRef } from 'react';
import { Icon } from '@/components/atoms/Icon';
import { useToast, type Toast } from '@/contexts/toast';

interface ToastItemProps {
  toast: Toast;
  onDismiss: (id: string) => void;
}

/**
 * Individual toast notification component
 *
 * Renders a single toast with:
 * - Variant styling (success, error, warning, info)
 * - Action buttons with callbacks
 * - Dismiss button
 * - Keyboard support (Escape to dismiss)
 * - Slide-in animation
 */
const ToastItem: React.FC<ToastItemProps> = ({ toast, onDismiss }) => {
  const toastRef = useRef<HTMLDivElement>(null);

  // Get variant icon
  const getIcon = () => {
    switch (toast.variant) {
      case 'success':
        return 'lucide--check-circle';
      case 'error':
        return 'lucide--alert-circle';
      case 'warning':
        return 'lucide--alert-triangle';
      case 'info':
        return 'lucide--info';
      default:
        return 'lucide--info';
    }
  };

  // Handle action button click
  const handleActionClick = useCallback(
    (action: { label: string; onClick: () => void }) => {
      try {
        action.onClick();
        // Dismiss toast after action executes successfully
        onDismiss(toast.id);
      } catch (error) {
        console.error('Toast action failed:', error);
        // Show error toast if action fails
        // Note: This will be handled by the parent component to avoid circular dependency
        onDismiss(toast.id);
      }
    },
    [onDismiss, toast.id]
  );

  // Handle keyboard dismiss (Escape key)
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        event.key === 'Escape' &&
        toastRef.current?.contains(document.activeElement)
      ) {
        onDismiss(toast.id);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [onDismiss, toast.id]);

  return (
    <div
      ref={toastRef}
      role="alert"
      className={`alert alert-${toast.variant} shadow-lg animate-slide-in-right`}
      tabIndex={0}
    >
      <Icon icon={getIcon()} className="size-5" aria-hidden />
      <span className="flex-1">{toast.message}</span>

      {/* Action buttons */}
      {toast.actions && toast.actions.length > 0 && (
        <div className="flex gap-2">
          {toast.actions.map((action, index) => (
            <button
              key={index}
              className="btn btn-sm btn-ghost"
              onClick={() => handleActionClick(action)}
              aria-label={action.label}
            >
              {action.label}
            </button>
          ))}
        </div>
      )}

      {/* Dismiss button */}
      <button
        className="btn btn-sm btn-circle btn-ghost"
        onClick={() => onDismiss(toast.id)}
        aria-label="Dismiss notification"
      >
        <Icon icon="lucide--x" className="size-4" />
      </button>
    </div>
  );
};

/**
 * ToastContainer renders all active toast notifications
 *
 * Features:
 * - Fixed top-right positioning
 * - Vertical stacking
 * - ARIA live region for accessibility
 * - Auto-dismiss and manual dismiss support
 *
 * @example
 * ```tsx
 * <ToastProvider>
 *   <App />
 *   <ToastContainer />
 * </ToastProvider>
 * ```
 */
export const ToastContainer: React.FC = () => {
  const { toasts, dismissToast } = useToast();

  if (toasts.length === 0) {
    return null;
  }

  return (
    <div
      className="toast toast-top toast-end z-50"
      aria-live="polite"
      aria-atomic="false"
    >
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onDismiss={dismissToast} />
      ))}
    </div>
  );
};

export default ToastContainer;
