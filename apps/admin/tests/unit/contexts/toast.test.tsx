import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import React from 'react';
import { ToastProvider, useToast } from '@/contexts/toast';

describe('ToastContext', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <ToastProvider>{children}</ToastProvider>
  );

  it('should throw error when useToast is used outside provider', () => {
    // Suppress console.error for this test
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});

    expect(() => {
      renderHook(() => useToast());
    }).toThrow('useToast must be used within ToastProvider');

    consoleError.mockRestore();
  });

  it('should add a toast to state when showToast is called', () => {
    const { result } = renderHook(() => useToast(), { wrapper });

    act(() => {
      result.current.showToast({
        message: 'Test message',
        variant: 'success',
      });
    });

    expect(result.current.toasts).toHaveLength(1);
    expect(result.current.toasts[0]).toMatchObject({
      message: 'Test message',
      variant: 'success',
      duration: 5000,
    });
    expect(result.current.toasts[0].id).toBeDefined();
    expect(result.current.toasts[0].createdAt).toBeDefined();
  });

  it('should generate unique IDs for toasts', () => {
    const { result } = renderHook(() => useToast(), { wrapper });

    act(() => {
      const id1 = result.current.showToast({
        message: 'First toast',
        variant: 'info',
      });
      const id2 = result.current.showToast({
        message: 'Second toast',
        variant: 'info',
      });

      expect(id1).not.toBe(id2);
    });

    expect(result.current.toasts).toHaveLength(2);
  });

  it('should dismiss a toast when dismissToast is called', () => {
    const { result } = renderHook(() => useToast(), { wrapper });

    let toastId: string;

    act(() => {
      toastId = result.current.showToast({
        message: 'Test toast',
        variant: 'success',
      });
    });

    expect(result.current.toasts).toHaveLength(1);

    act(() => {
      result.current.dismissToast(toastId);
    });

    expect(result.current.toasts).toHaveLength(0);
  });

  it('should auto-dismiss toast after duration', async () => {
    const { result } = renderHook(() => useToast(), { wrapper });

    act(() => {
      result.current.showToast({
        message: 'Auto-dismiss test',
        variant: 'success',
        duration: 3000,
      });
    });

    expect(result.current.toasts).toHaveLength(1);

    // Advance timers and wait for state update
    await act(async () => {
      vi.advanceTimersByTime(3000);
      await Promise.resolve(); // Allow microtasks to complete
    });

    expect(result.current.toasts).toHaveLength(0);
  });

  it('should not auto-dismiss toast when duration is null', () => {
    const { result } = renderHook(() => useToast(), { wrapper });

    act(() => {
      result.current.showToast({
        message: 'Manual dismiss only',
        variant: 'error',
        duration: null,
      });
    });

    expect(result.current.toasts).toHaveLength(1);

    act(() => {
      vi.advanceTimersByTime(10000);
    });

    expect(result.current.toasts).toHaveLength(1);
  });

  it('should enforce maximum of 5 toasts (FIFO)', () => {
    const { result } = renderHook(() => useToast(), { wrapper });

    act(() => {
      for (let i = 1; i <= 7; i++) {
        result.current.showToast({
          message: `Toast ${i}`,
          variant: 'info',
          duration: null,
        });
      }
    });

    expect(result.current.toasts).toHaveLength(5);
    // First two toasts should be removed (FIFO)
    expect(result.current.toasts[0].message).toBe('Toast 3');
    expect(result.current.toasts[4].message).toBe('Toast 7');
  });

  it('should remove oldest toast when stack is full', () => {
    const { result } = renderHook(() => useToast(), { wrapper });

    const ids: string[] = [];

    act(() => {
      for (let i = 1; i <= 5; i++) {
        ids.push(
          result.current.showToast({
            message: `Toast ${i}`,
            variant: 'info',
            duration: null,
          })
        );
      }
    });

    const firstId = ids[0];
    expect(result.current.toasts).toHaveLength(5);
    expect(result.current.toasts.some((t) => t.id === firstId)).toBe(true);

    act(() => {
      result.current.showToast({
        message: 'Toast 6',
        variant: 'info',
        duration: null,
      });
    });

    expect(result.current.toasts).toHaveLength(5);
    // First toast should be removed
    expect(result.current.toasts.some((t) => t.id === firstId)).toBe(false);
    expect(result.current.toasts[4].message).toBe('Toast 6');
  });

  it('should use default duration of 5000ms when not specified', () => {
    const { result } = renderHook(() => useToast(), { wrapper });

    act(() => {
      result.current.showToast({
        message: 'Default duration',
        variant: 'success',
      });
    });

    expect(result.current.toasts[0].duration).toBe(5000);
  });

  it('should support custom duration', () => {
    const { result } = renderHook(() => useToast(), { wrapper });

    act(() => {
      result.current.showToast({
        message: 'Custom duration',
        variant: 'warning',
        duration: 10000,
      });
    });

    expect(result.current.toasts[0].duration).toBe(10000);
  });

  it('should support action buttons', () => {
    const { result } = renderHook(() => useToast(), { wrapper });
    const mockAction = vi.fn();

    act(() => {
      result.current.showToast({
        message: 'Toast with action',
        variant: 'warning',
        actions: [
          { label: 'Undo', onClick: mockAction },
          { label: 'View', onClick: vi.fn() },
        ],
      });
    });

    expect(result.current.toasts[0].actions).toHaveLength(2);
    expect(result.current.toasts[0].actions?.[0].label).toBe('Undo');
  });
});
