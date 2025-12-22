import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from 'react';

export type ViewAsUser = {
  id: string;
  displayName: string;
  email?: string;
};

export type ViewAsContextType = {
  /** The user we're currently impersonating, or null if not impersonating */
  viewAsUser: ViewAsUser | null;
  /** Whether we're currently viewing as another user */
  isViewingAs: boolean;
  /** Start impersonating a user */
  startViewAs: (user: ViewAsUser) => void;
  /** Stop impersonating and return to normal view */
  stopViewAs: () => void;
};

const ViewAsContext = createContext<ViewAsContextType | undefined>(undefined);

const VIEW_AS_STORAGE_KEY = 'spec-server-view-as';

export const ViewAsProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [viewAsUser, setViewAsUser] = useState<ViewAsUser | null>(() => {
    // Hydrate from sessionStorage (not localStorage - we want this to clear on tab close)
    try {
      const raw = sessionStorage.getItem(VIEW_AS_STORAGE_KEY);
      if (raw) {
        return JSON.parse(raw) as ViewAsUser;
      }
    } catch {
      // ignore
    }
    return null;
  });

  const startViewAs = useCallback((user: ViewAsUser) => {
    setViewAsUser(user);
    try {
      sessionStorage.setItem(VIEW_AS_STORAGE_KEY, JSON.stringify(user));
    } catch {
      // ignore storage errors
    }
  }, []);

  const stopViewAs = useCallback(() => {
    setViewAsUser(null);
    try {
      sessionStorage.removeItem(VIEW_AS_STORAGE_KEY);
    } catch {
      // ignore storage errors
    }
  }, []);

  const value = useMemo<ViewAsContextType>(
    () => ({
      viewAsUser,
      isViewingAs: viewAsUser !== null,
      startViewAs,
      stopViewAs,
    }),
    [viewAsUser, startViewAs, stopViewAs]
  );

  return (
    <ViewAsContext.Provider value={value}>{children}</ViewAsContext.Provider>
  );
};

export function useViewAs(): ViewAsContextType {
  const ctx = useContext(ViewAsContext);
  if (!ctx) {
    throw new Error('useViewAs must be used within a ViewAsProvider');
  }
  return ctx;
}

export function useViewAsOptional(): ViewAsContextType | null {
  return useContext(ViewAsContext) ?? null;
}

export function getViewAsUserId(): string | null {
  try {
    const raw = sessionStorage.getItem(VIEW_AS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as ViewAsUser;
      return parsed.id;
    }
  } catch {
    // ignore
  }
  return null;
}
