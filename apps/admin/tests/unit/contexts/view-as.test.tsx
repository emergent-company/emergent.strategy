import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import React from 'react';
import {
  ViewAsProvider,
  useViewAs,
  useViewAsOptional,
  getViewAsUserId,
  type ViewAsUser,
} from '@/contexts/view-as';

const mockSessionStorage: Record<string, string> = {};
const sessionStorageMock = {
  getItem: (key: string) => mockSessionStorage[key] || null,
  setItem: (key: string, value: string) => {
    mockSessionStorage[key] = value;
  },
  removeItem: (key: string) => {
    delete mockSessionStorage[key];
  },
  clear: () => {
    Object.keys(mockSessionStorage).forEach(
      (key) => delete mockSessionStorage[key]
    );
  },
};

Object.defineProperty(window, 'sessionStorage', {
  value: sessionStorageMock,
  writable: true,
});

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <ViewAsProvider>{children}</ViewAsProvider>
);

const testUser: ViewAsUser = {
  id: 'user-123',
  displayName: 'Test User',
  email: 'test@example.com',
};

describe('ViewAsContext', () => {
  beforeEach(() => {
    sessionStorageMock.clear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('useViewAs', () => {
    it('should throw when used outside provider', () => {
      expect(() => {
        renderHook(() => useViewAs());
      }).toThrow('useViewAs must be used within a ViewAsProvider');
    });

    it('should start with no impersonation', () => {
      const { result } = renderHook(() => useViewAs(), { wrapper });

      expect(result.current.viewAsUser).toBeNull();
      expect(result.current.isViewingAs).toBe(false);
    });
  });

  describe('useViewAsOptional', () => {
    it('should return null when used outside provider', () => {
      const { result } = renderHook(() => useViewAsOptional());
      expect(result.current).toBeNull();
    });

    it('should return context when used inside provider', () => {
      const { result } = renderHook(() => useViewAsOptional(), { wrapper });
      expect(result.current).not.toBeNull();
      expect(result.current?.isViewingAs).toBe(false);
    });
  });

  describe('startViewAs', () => {
    it('should set the impersonated user', () => {
      const { result } = renderHook(() => useViewAs(), { wrapper });

      act(() => {
        result.current.startViewAs(testUser);
      });

      expect(result.current.viewAsUser).toEqual(testUser);
      expect(result.current.isViewingAs).toBe(true);
    });

    it('should persist to sessionStorage', () => {
      const { result } = renderHook(() => useViewAs(), { wrapper });

      act(() => {
        result.current.startViewAs(testUser);
      });

      const stored = sessionStorageMock.getItem('spec-server-view-as');
      expect(stored).toBeTruthy();
      expect(JSON.parse(stored!)).toEqual(testUser);
    });

    it('should allow changing impersonated user', () => {
      const { result } = renderHook(() => useViewAs(), { wrapper });
      const secondUser: ViewAsUser = {
        id: 'user-456',
        displayName: 'Another User',
      };

      act(() => {
        result.current.startViewAs(testUser);
      });

      expect(result.current.viewAsUser?.id).toBe('user-123');

      act(() => {
        result.current.startViewAs(secondUser);
      });

      expect(result.current.viewAsUser?.id).toBe('user-456');
      expect(result.current.viewAsUser?.email).toBeUndefined();
    });
  });

  describe('stopViewAs', () => {
    it('should clear the impersonated user', () => {
      const { result } = renderHook(() => useViewAs(), { wrapper });

      act(() => {
        result.current.startViewAs(testUser);
      });

      expect(result.current.isViewingAs).toBe(true);

      act(() => {
        result.current.stopViewAs();
      });

      expect(result.current.viewAsUser).toBeNull();
      expect(result.current.isViewingAs).toBe(false);
    });

    it('should remove from sessionStorage', () => {
      const { result } = renderHook(() => useViewAs(), { wrapper });

      act(() => {
        result.current.startViewAs(testUser);
      });

      expect(sessionStorageMock.getItem('spec-server-view-as')).toBeTruthy();

      act(() => {
        result.current.stopViewAs();
      });

      expect(sessionStorageMock.getItem('spec-server-view-as')).toBeNull();
    });

    it('should work when not currently viewing as anyone', () => {
      const { result } = renderHook(() => useViewAs(), { wrapper });

      act(() => {
        result.current.stopViewAs();
      });

      expect(result.current.viewAsUser).toBeNull();
      expect(result.current.isViewingAs).toBe(false);
    });
  });

  describe('session hydration', () => {
    it('should hydrate from sessionStorage on mount', () => {
      sessionStorageMock.setItem(
        'spec-server-view-as',
        JSON.stringify(testUser)
      );

      const { result } = renderHook(() => useViewAs(), { wrapper });

      expect(result.current.viewAsUser).toEqual(testUser);
      expect(result.current.isViewingAs).toBe(true);
    });

    it('should handle invalid JSON in sessionStorage', () => {
      sessionStorageMock.setItem('spec-server-view-as', 'invalid-json');

      const { result } = renderHook(() => useViewAs(), { wrapper });

      expect(result.current.viewAsUser).toBeNull();
      expect(result.current.isViewingAs).toBe(false);
    });

    it('should handle empty sessionStorage', () => {
      const { result } = renderHook(() => useViewAs(), { wrapper });

      expect(result.current.viewAsUser).toBeNull();
    });
  });

  describe('getViewAsUserId', () => {
    it('should return user id from sessionStorage', () => {
      sessionStorageMock.setItem(
        'spec-server-view-as',
        JSON.stringify(testUser)
      );

      expect(getViewAsUserId()).toBe('user-123');
    });

    it('should return null when no user is impersonated', () => {
      expect(getViewAsUserId()).toBeNull();
    });

    it('should return null on invalid JSON', () => {
      sessionStorageMock.setItem('spec-server-view-as', 'invalid');

      expect(getViewAsUserId()).toBeNull();
    });
  });

  describe('context stability', () => {
    it('should have stable function references', () => {
      const { result, rerender } = renderHook(() => useViewAs(), { wrapper });

      const firstStartViewAs = result.current.startViewAs;
      const firstStopViewAs = result.current.stopViewAs;

      rerender();

      expect(result.current.startViewAs).toBe(firstStartViewAs);
      expect(result.current.stopViewAs).toBe(firstStopViewAs);
    });
  });
});
