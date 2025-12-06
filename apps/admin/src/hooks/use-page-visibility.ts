import { useState, useEffect } from 'react';

/**
 * Hook to track whether the page is currently visible.
 * Useful for pausing polling and other background tasks when the tab is hidden.
 *
 * @returns boolean - true if the page is visible, false if hidden
 *
 * @example
 * ```tsx
 * const isVisible = usePageVisibility();
 *
 * useEffect(() => {
 *   if (!isVisible) return; // Don't poll when tab is hidden
 *
 *   const interval = setInterval(fetchData, 5000);
 *   return () => clearInterval(interval);
 * }, [isVisible]);
 * ```
 */
export function usePageVisibility(): boolean {
  const [isVisible, setIsVisible] = useState(() => {
    // SSR safety - default to visible
    if (typeof document === 'undefined') return true;
    return document.visibilityState === 'visible';
  });

  useEffect(() => {
    const handleVisibilityChange = () => {
      setIsVisible(document.visibilityState === 'visible');
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  return isVisible;
}
