import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { AuthProvider } from '@/contexts/auth';
import { useAuth } from '@/contexts/useAuth';
import React from 'react';

// Mock the OIDC module
vi.mock('../auth/oidc', () => ({
  startAuth: vi.fn(),
  exchangeCodeForTokens: vi.fn(),
}));

// Mock window.location.assign to prevent actual navigation in tests
const mockAssign = vi.fn();
Object.defineProperty(window, 'location', {
  value: {
    ...window.location,
    assign: mockAssign,
  },
  writable: true,
});

describe('AuthContext logout', () => {
  beforeEach(() => {
    // Clear localStorage before each test
    localStorage.clear();
    mockAssign.mockClear();
  });

  it('should clear auth tokens from localStorage on logout', () => {
    // Setup: Add auth tokens to localStorage
    localStorage.setItem(
      '__nexus_auth_v1__',
      JSON.stringify({ accessToken: 'legacy-token' })
    );
    localStorage.setItem(
      'spec-server-auth',
      JSON.stringify({ accessToken: 'current-token' })
    );

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <AuthProvider>{children}</AuthProvider>
    );

    const { result } = renderHook(() => useAuth(), { wrapper });

    // Execute logout
    act(() => {
      result.current.logout();
    });

    // Verify auth tokens are removed
    expect(localStorage.getItem('__nexus_auth_v1__')).toBeNull();
    expect(localStorage.getItem('spec-server-auth')).toBeNull();
  });

  it('should clear user-scoped config from spec-server key on logout', () => {
    // Setup: Add config with user-scoped data
    const config = {
      theme: 'dark',
      direction: 'ltr',
      fontFamily: 'default',
      sidebarTheme: 'light',
      fullscreen: false,
      activeOrgId: 'org-123',
      activeOrgName: 'Test Org',
      activeProjectId: 'proj-456',
      activeProjectName: 'Test Project',
    };
    localStorage.setItem('spec-server', JSON.stringify(config));

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <AuthProvider>{children}</AuthProvider>
    );

    const { result } = renderHook(() => useAuth(), { wrapper });

    // Execute logout
    act(() => {
      result.current.logout();
    });

    // Verify user-scoped fields are cleared
    const updatedConfig = JSON.parse(
      localStorage.getItem('spec-server') || '{}'
    );
    expect(updatedConfig.activeOrgId).toBeUndefined();
    expect(updatedConfig.activeOrgName).toBeUndefined();
    expect(updatedConfig.activeProjectId).toBeUndefined();
    expect(updatedConfig.activeProjectName).toBeUndefined();
  });

  it('should preserve UI preferences on logout', () => {
    // Setup: Add config with UI preferences
    const config = {
      theme: 'dark',
      direction: 'rtl',
      fontFamily: 'dm-sans',
      sidebarTheme: 'dark',
      fullscreen: true,
      activeOrgId: 'org-123',
      activeProjectId: 'proj-456',
    };
    localStorage.setItem('spec-server', JSON.stringify(config));

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <AuthProvider>{children}</AuthProvider>
    );

    const { result } = renderHook(() => useAuth(), { wrapper });

    // Execute logout
    act(() => {
      result.current.logout();
    });

    // Verify UI preferences are preserved
    const updatedConfig = JSON.parse(
      localStorage.getItem('spec-server') || '{}'
    );
    expect(updatedConfig.theme).toBe('dark');
    expect(updatedConfig.direction).toBe('rtl');
    expect(updatedConfig.fontFamily).toBe('dm-sans');
    expect(updatedConfig.sidebarTheme).toBe('dark');
    expect(updatedConfig.fullscreen).toBe(true);
  });

  it('should handle missing spec-server config gracefully on logout', () => {
    // Setup: No spec-server key in localStorage
    localStorage.setItem(
      '__nexus_auth_v1__',
      JSON.stringify({ accessToken: 'token' })
    );

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <AuthProvider>{children}</AuthProvider>
    );

    const { result } = renderHook(() => useAuth(), { wrapper });

    // Execute logout - should not throw
    expect(() => {
      act(() => {
        result.current.logout();
      });
    }).not.toThrow();

    // Verify auth token is still removed
    expect(localStorage.getItem('__nexus_auth_v1__')).toBeNull();
  });

  it('should handle corrupted spec-server config on logout', () => {
    // Setup: Corrupted JSON in spec-server key
    localStorage.setItem('spec-server', 'invalid-json{');
    localStorage.setItem(
      '__nexus_auth_v1__',
      JSON.stringify({ accessToken: 'token' })
    );

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <AuthProvider>{children}</AuthProvider>
    );

    const { result } = renderHook(() => useAuth(), { wrapper });

    // Execute logout - should fallback to removing entire spec-server key
    act(() => {
      result.current.logout();
    });

    // Verify corrupted config is removed for safety
    expect(localStorage.getItem('spec-server')).toBeNull();
    expect(localStorage.getItem('__nexus_auth_v1__')).toBeNull();
  });

  it('should redirect to post-logout URI on logout', () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <AuthProvider>{children}</AuthProvider>
    );

    const { result } = renderHook(() => useAuth(), { wrapper });

    // Execute logout
    act(() => {
      result.current.logout();
    });

    // Verify redirect was called
    expect(mockAssign).toHaveBeenCalled();
  });

  it('should clear auth state in memory on logout', () => {
    // Setup: Add auth data to localStorage so it gets hydrated
    const authData = {
      accessToken: 'test-token',
      idToken: 'test-id-token',
      expiresAt: Date.now() + 3600000,
      user: { sub: 'user-123', email: 'test@example.com' },
    };
    localStorage.setItem('spec-server-auth', JSON.stringify(authData));

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <AuthProvider>{children}</AuthProvider>
    );

    const { result } = renderHook(() => useAuth(), { wrapper });

    // Verify user is initially authenticated
    expect(result.current.isAuthenticated).toBe(true);
    expect(result.current.user).toBeDefined();

    // Execute logout
    act(() => {
      result.current.logout();
    });

    // Verify auth state is cleared
    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.user).toBeUndefined();
  });
});
