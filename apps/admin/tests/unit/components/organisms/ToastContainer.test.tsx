import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import '@testing-library/jest-dom';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { ToastContainer } from '@/components/organisms/ToastContainer';
import { ToastProvider, useToast } from '@/contexts/toast';

// Mock the Icon component
vi.mock('@/components/atoms/Icon', () => ({
  Icon: ({ icon, className }: { icon: string; className?: string }) => (
    <span data-testid={`icon-${icon}`} className={className} />
  ),
}));

describe('ToastContainer', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  describe('Rendering', () => {
    it('should render nothing when there are no toasts', () => {
      const { container } = render(
        <ToastProvider>
          <ToastContainer />
        </ToastProvider>
      );

      expect(container.querySelector('.toast')).not.toBeInTheDocument();
    });

    it('should render success toast with correct styles', () => {
      const { container } = render(
        <ToastProvider>
          <TestComponent
            message="Success message"
            variant="success"
            duration={null}
          />
          <ToastContainer />
        </ToastProvider>
      );

      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(screen.getByText('Success message')).toBeInTheDocument();
      expect(container.querySelector('.alert-success')).toBeInTheDocument();
      expect(
        screen.getByTestId('icon-lucide--check-circle')
      ).toBeInTheDocument();
    });

    it('should render error toast with correct styles', () => {
      const { container } = render(
        <ToastProvider>
          <TestComponent
            message="Error message"
            variant="error"
            duration={null}
          />
          <ToastContainer />
        </ToastProvider>
      );

      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(screen.getByText('Error message')).toBeInTheDocument();
      expect(container.querySelector('.alert-error')).toBeInTheDocument();
      expect(
        screen.getByTestId('icon-lucide--alert-circle')
      ).toBeInTheDocument();
    });

    it('should render warning toast with correct styles', () => {
      const { container } = render(
        <ToastProvider>
          <TestComponent
            message="Warning message"
            variant="warning"
            duration={null}
          />
          <ToastContainer />
        </ToastProvider>
      );

      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(screen.getByText('Warning message')).toBeInTheDocument();
      expect(container.querySelector('.alert-warning')).toBeInTheDocument();
      expect(
        screen.getByTestId('icon-lucide--alert-triangle')
      ).toBeInTheDocument();
    });

    it('should render info toast with correct styles', () => {
      const { container } = render(
        <ToastProvider>
          <TestComponent
            message="Info message"
            variant="info"
            duration={null}
          />
          <ToastContainer />
        </ToastProvider>
      );

      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(screen.getByText('Info message')).toBeInTheDocument();
      expect(container.querySelector('.alert-info')).toBeInTheDocument();
      expect(screen.getByTestId('icon-lucide--info')).toBeInTheDocument();
    });

    it('should render multiple toasts', () => {
      render(
        <ToastProvider>
          <TestComponent
            message="First toast"
            variant="success"
            duration={null}
          />
          <TestComponent
            message="Second toast"
            variant="error"
            duration={null}
          />
          <TestComponent
            message="Third toast"
            variant="warning"
            duration={null}
          />
          <ToastContainer />
        </ToastProvider>
      );

      expect(screen.getAllByRole('alert')).toHaveLength(3);
      expect(screen.getByText('First toast')).toBeInTheDocument();
      expect(screen.getByText('Second toast')).toBeInTheDocument();
      expect(screen.getByText('Third toast')).toBeInTheDocument();
    });

    it('should apply slide-in animation class', () => {
      const { container } = render(
        <ToastProvider>
          <TestComponent
            message="Animated toast"
            variant="info"
            duration={null}
          />
          <ToastContainer />
        </ToastProvider>
      );

      const toast = container.querySelector('.alert');
      expect(toast).toHaveClass('animate-slide-in-right');
    });
  });

  describe('Action Buttons', () => {
    it('should render action buttons when provided', () => {
      const mockAction1 = vi.fn();
      const mockAction2 = vi.fn();

      render(
        <ToastProvider>
          <TestComponent
            message="Toast with actions"
            variant="warning"
            duration={null}
            actions={[
              { label: 'Undo', onClick: mockAction1 },
              { label: 'View', onClick: mockAction2 },
            ]}
          />
          <ToastContainer />
        </ToastProvider>
      );

      expect(screen.getByLabelText('Undo')).toBeInTheDocument();
      expect(screen.getByLabelText('View')).toBeInTheDocument();
    });

    it('should call action callback and dismiss toast when action button is clicked', async () => {
      vi.useRealTimers(); // Use real timers for user interactions
      const user = userEvent.setup();
      const mockAction = vi.fn();

      render(
        <ToastProvider>
          <TestComponent
            message="Toast with action"
            variant="info"
            duration={null}
            actions={[{ label: 'Action', onClick: mockAction }]}
          />
          <ToastContainer />
        </ToastProvider>
      );

      const actionButton = screen.getByLabelText('Action');
      await user.click(actionButton);

      expect(mockAction).toHaveBeenCalledTimes(1);
      // Toast should be dismissed after action
      await waitFor(() => {
        expect(screen.queryByText('Toast with action')).not.toBeInTheDocument();
      });

      vi.useFakeTimers(); // Restore fake timers
    });

    it('should dismiss toast even if action callback throws error', async () => {
      vi.useRealTimers(); // Use real timers for user interactions
      const user = userEvent.setup();
      const mockAction = vi.fn(() => {
        throw new Error('Action failed');
      });
      const consoleError = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      render(
        <ToastProvider>
          <TestComponent
            message="Toast with failing action"
            variant="error"
            duration={null}
            actions={[{ label: 'Fail', onClick: mockAction }]}
          />
          <ToastContainer />
        </ToastProvider>
      );

      const actionButton = screen.getByLabelText('Fail');
      await user.click(actionButton);

      expect(mockAction).toHaveBeenCalledTimes(1);
      expect(consoleError).toHaveBeenCalled();
      // Toast should still be dismissed
      await waitFor(() => {
        expect(
          screen.queryByText('Toast with failing action')
        ).not.toBeInTheDocument();
      });

      consoleError.mockRestore();
      vi.useFakeTimers(); // Restore fake timers
    });
  });

  describe('Dismiss Functionality', () => {
    it('should render dismiss button', () => {
      render(
        <ToastProvider>
          <TestComponent
            message="Dismissible toast"
            variant="success"
            duration={null}
          />
          <ToastContainer />
        </ToastProvider>
      );

      expect(screen.getByLabelText('Dismiss notification')).toBeInTheDocument();
    });

    it('should dismiss toast when dismiss button is clicked', async () => {
      vi.useRealTimers(); // Use real timers for user interactions
      const user = userEvent.setup();

      render(
        <ToastProvider>
          <TestComponent
            message="Dismissible toast"
            variant="success"
            duration={null}
          />
          <ToastContainer />
        </ToastProvider>
      );

      const dismissButton = screen.getByLabelText('Dismiss notification');
      await user.click(dismissButton);

      await waitFor(() => {
        expect(screen.queryByText('Dismissible toast')).not.toBeInTheDocument();
      });

      vi.useFakeTimers(); // Restore fake timers
    });

    it('should dismiss toast when Escape key is pressed', async () => {
      vi.useRealTimers(); // Use real timers for user interactions
      const user = userEvent.setup();

      render(
        <ToastProvider>
          <TestComponent
            message="Keyboard dismissible"
            variant="info"
            duration={null}
          />
          <ToastContainer />
        </ToastProvider>
      );

      const toast = screen.getByRole('alert');
      toast.focus();
      await user.keyboard('{Escape}');

      await waitFor(() => {
        expect(
          screen.queryByText('Keyboard dismissible')
        ).not.toBeInTheDocument();
      });

      vi.useFakeTimers(); // Restore fake timers
    });

    it('should auto-dismiss after duration', async () => {
      vi.useRealTimers(); // Use real timers for this test

      render(
        <ToastProvider>
          <TestComponent
            message="Auto-dismiss toast"
            variant="success"
            duration={100} // Use shorter duration for test
          />
          <ToastContainer />
        </ToastProvider>
      );

      expect(screen.getByText('Auto-dismiss toast')).toBeInTheDocument();

      // Wait for auto-dismiss
      await waitFor(
        () => {
          expect(
            screen.queryByText('Auto-dismiss toast')
          ).not.toBeInTheDocument();
        },
        { timeout: 500 }
      );

      vi.useFakeTimers(); // Restore fake timers
    });
  });

  describe('Accessibility', () => {
    it('should have ARIA live region', () => {
      const { container } = render(
        <ToastProvider>
          <TestComponent
            message="Accessible toast"
            variant="info"
            duration={null}
          />
          <ToastContainer />
        </ToastProvider>
      );

      const toastContainer = container.querySelector('.toast');
      expect(toastContainer).toHaveAttribute('aria-live', 'polite');
      expect(toastContainer).toHaveAttribute('aria-atomic', 'false');
    });

    it('should have role="alert" on each toast', () => {
      render(
        <ToastProvider>
          <TestComponent
            message="Alert toast"
            variant="warning"
            duration={null}
          />
          <ToastContainer />
        </ToastProvider>
      );

      expect(screen.getByRole('alert')).toBeInTheDocument();
    });

    it('should be keyboard focusable', () => {
      const { container } = render(
        <ToastProvider>
          <TestComponent
            message="Focusable toast"
            variant="info"
            duration={null}
          />
          <ToastContainer />
        </ToastProvider>
      );

      const toast = container.querySelector('.alert');
      expect(toast).toHaveAttribute('tabIndex', '0');
    });
  });
});

// Helper component to trigger toasts
function TestComponent({
  message,
  variant,
  duration,
  actions,
}: {
  message: string;
  variant: 'success' | 'error' | 'warning' | 'info';
  duration: number | null;
  actions?: Array<{ label: string; onClick: () => void }>;
}) {
  const { showToast } = useToast();

  React.useEffect(() => {
    showToast({ message, variant, duration, actions });
  }, [message, variant, duration, actions, showToast]);

  return null;
}
