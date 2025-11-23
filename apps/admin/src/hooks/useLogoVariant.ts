import { useState, useEffect } from 'react';

export type LogoVariant =
  // Fixed color gradients
  | 'two-tone-blue'
  | 'blue-purple'
  | 'sunset'
  | 'verdant'
  | 'ocean'
  | 'fire'
  | 'forest'
  | 'cosmic'
  | 'arctic'
  // Theme-based gradients (adapt to current theme colors)
  | 'theme-primary-accent'
  | 'theme-primary-secondary'
  | 'theme-secondary-accent'
  | 'theme-full'
  | 'theme-monochrome'
  | 'theme-monochrome-subtle'
  // Legacy variants (backward compatibility)
  | 'primary-accent'
  | 'monochrome'
  | 'original';

const STORAGE_KEY = 'emergent-logo-variant';

export function useLogoVariant() {
  const [variant, setVariant] = useState<LogoVariant>('theme-primary-accent');

  useEffect(() => {
    // Load saved variant from localStorage on initial mount
    const savedVariant = localStorage.getItem(
      STORAGE_KEY
    ) as LogoVariant | null;
    if (savedVariant) {
      setVariant(savedVariant);
    }

    // Listen for changes from other tabs/windows
    const handleStorageChange = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY && event.newValue) {
        setVariant(event.newValue as LogoVariant);
      }
    };

    window.addEventListener('storage', handleStorageChange);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
    };
  }, []);

  const updateVariant = (newVariant: LogoVariant) => {
    setVariant(newVariant);
    localStorage.setItem(STORAGE_KEY, newVariant);
    // Dispatch a custom event to notify other components in the same tab
    window.dispatchEvent(
      new StorageEvent('storage', { key: STORAGE_KEY, newValue: newVariant })
    );
  };

  return { variant, setLogoVariant: updateVariant };
}
