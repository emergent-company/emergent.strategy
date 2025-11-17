import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';

/**
 * Toast variant types for different notification severities
 */
export type ToastVariant = 'success' | 'error' | 'warning' | 'info';

/**
 * Action button configuration for toast notifications
 */
export interface ToastAction {
  label: string;
  onClick: () => void;
}

/**
 * Options for creating a new toast notification
 */
export interface ToastOptions {
  message: string;
  variant: ToastVariant;
  duration?: number | null; // null = manual dismiss only, default 5000ms
  actions?: ToastAction[];
}

/**
 * Internal toast representation with ID and timestamp
 */
export interface Toast extends ToastOptions {
  id: string;
  createdAt: number;
}

interface ToastContextValue {
  toasts: Toast[];
  showToast: (options: ToastOptions) => string;
  dismissToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

const MAX_TOASTS = 5;
const DEFAULT_DURATION = 5000; // 5 seconds

/**
 * ToastProvider manages global toast notification state
 *
 * Features:
 * - Maximum 5 visible toasts (FIFO removal)
 * - Auto-dismiss with configurable duration
 * - Manual dismiss capability
 * - Action buttons with callbacks
 *
 * @example
 * ```tsx
 * <ToastProvider>
 *   <App />
 * </ToastProvider>
 * ```
 */
export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [toasts, setToasts] = useState<Toast[]>([]);

  /**
   * Add a new toast notification
   *
   * @param options - Toast configuration
   * @returns Toast ID for programmatic dismissal
   *
   * @example
   * ```tsx
   * const id = showToast({
   *   message: 'Success!',
   *   variant: 'success',
   *   duration: 5000,
   *   actions: [{ label: 'Undo', onClick: handleUndo }]
   * });
   * ```
   */
  const showToast = useCallback((options: ToastOptions): string => {
    const id = crypto.randomUUID();
    const toast: Toast = {
      ...options,
      id,
      createdAt: Date.now(),
      duration:
        options.duration === null ? null : options.duration ?? DEFAULT_DURATION,
    };

    setToasts((prev) => {
      const newToasts = [...prev, toast];

      // Enforce max stack limit (FIFO)
      if (newToasts.length > MAX_TOASTS) {
        // Remove oldest toast (lowest createdAt)
        const sorted = [...newToasts].sort((a, b) => a.createdAt - b.createdAt);
        const toRemove = sorted[0];
        return newToasts.filter((t) => t.id !== toRemove.id);
      }

      return newToasts;
    });

    return id;
  }, []);

  /**
   * Dismiss a toast notification by ID
   *
   * @param id - Toast ID to dismiss
   *
   * @example
   * ```tsx
   * dismissToast(toastId);
   * ```
   */
  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  // Auto-dismiss timers
  useEffect(() => {
    const timers: NodeJS.Timeout[] = [];

    toasts.forEach((toast) => {
      if (toast.duration !== null && typeof toast.duration === 'number') {
        const timer = setTimeout(() => {
          dismissToast(toast.id);
        }, toast.duration);
        timers.push(timer);
      }
    });

    // Cleanup timers on unmount or toast changes
    return () => {
      timers.forEach((timer) => clearTimeout(timer));
    };
  }, [toasts, dismissToast]);

  const value: ToastContextValue = {
    toasts,
    showToast,
    dismissToast,
  };

  return (
    <ToastContext.Provider value={value}>{children}</ToastContext.Provider>
  );
};

/**
 * Hook to access toast notification system
 *
 * @returns Toast context value with showToast and dismissToast methods
 * @throws Error if used outside ToastProvider
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const { showToast } = useToast();
 *
 *   const handleClick = () => {
 *     showToast({
 *       message: 'Operation successful',
 *       variant: 'success'
 *     });
 *   };
 *
 *   return <button onClick={handleClick}>Click me</button>;
 * }
 * ```
 */
export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within ToastProvider');
  }
  return context;
};
