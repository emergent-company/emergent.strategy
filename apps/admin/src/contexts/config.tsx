import {
  ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
} from 'react';

import { useLocalStorage } from '@/hooks/use-local-storage';

export const themes = [
  'light',
  'contrast',
  'material',
  'dark',
  'dim',
  'material-dark',
  'system',
] as const;

export type ITheme = (typeof themes)[number];

export type IConfig = {
  theme: ITheme;
  direction: 'ltr' | 'rtl';
  sidebarTheme: 'light' | 'dark';
  fontFamily: 'default' | 'dm-sans' | 'inclusive' | 'ar-one' | 'wix';
  fullscreen: boolean;
  activeOrgId?: string;
  activeOrgName?: string;
  activeProjectId?: string;
  activeProjectName?: string;
};

const defaultConfig: IConfig = {
  theme: 'system',
  direction: 'ltr',
  fontFamily: 'default',
  sidebarTheme: 'light',
  fullscreen: false,
};

const useHook = () => {
  // Migrate old 'spec-server' localStorage key to 'emergent'
  const migrateOldConfig = () => {
    const oldConfig = localStorage.getItem('spec-server');
    const newConfig = localStorage.getItem('emergent');

    if (oldConfig && !newConfig) {
      // Migrate old config to new key
      localStorage.setItem('emergent', oldConfig);
      localStorage.removeItem('spec-server');
    }
  };

  // Run migration before initializing
  migrateOldConfig();

  const [config, setConfig] = useLocalStorage<IConfig>(
    'emergent',
    defaultConfig
  );
  const htmlRef = useMemo(
    () => typeof window !== 'undefined' && document.documentElement,
    []
  );

  const updateConfig = useCallback(
    (changes: Partial<IConfig>) => {
      setConfig((config) => ({ ...config, ...changes }));
    },
    [setConfig]
  );

  const changeTheme = useCallback(
    (theme: IConfig['theme']) => {
      // Clear custom theme when using the normal theme switcher
      localStorage.removeItem('emergent-theme');
      // Clear theme configurator inline styles so CSS themes can take effect
      localStorage.removeItem('theme-configurator-values');

      // Immediately apply the theme to ensure it takes effect
      if (htmlRef) {
        // Remove any inline style overrides that would take precedence over CSS themes
        const themeVars = [
          '--color-base-100',
          '--color-base-200',
          '--color-base-300',
          '--color-base-content',
          '--color-primary',
          '--color-primary-content',
          '--color-secondary',
          '--color-secondary-content',
          '--color-accent',
          '--color-accent-content',
          '--color-neutral',
          '--color-neutral-content',
          '--color-info',
          '--color-info-content',
          '--color-success',
          '--color-success-content',
          '--color-warning',
          '--color-warning-content',
          '--color-error',
          '--color-error-content',
          '--radius-selector',
          '--radius-field',
          '--radius-box',
          '--size-selector',
          '--size-field',
          '--border',
          '--depth',
          '--noise',
        ];
        themeVars.forEach((varName) => {
          htmlRef.style.removeProperty(varName);
        });

        if (theme === 'system') {
          const prefersDark = window.matchMedia(
            '(prefers-color-scheme: dark)'
          ).matches;
          htmlRef.setAttribute(
            'data-theme',
            prefersDark ? 'space-asteroid-belt' : 'space-asteroid-belt-light'
          );
        } else if (theme === 'light') {
          htmlRef.setAttribute('data-theme', 'space-asteroid-belt-light');
        } else if (theme === 'dark') {
          htmlRef.setAttribute('data-theme', 'space-asteroid-belt');
        } else {
          htmlRef.setAttribute('data-theme', theme);
        }
      }

      updateConfig({ theme });
    },
    [updateConfig, htmlRef]
  );
  const setActiveOrg = useCallback(
    (id: string | undefined, name?: string) => {
      // Use functional update to avoid stale closure
      setConfig((prevConfig) => {
        if (
          prevConfig.activeOrgId === id &&
          prevConfig.activeOrgName === name
        ) {
          return prevConfig;
        }
        return {
          ...prevConfig,
          activeOrgId: id,
          activeOrgName: name,
          activeProjectId: undefined,
          activeProjectName: undefined,
        };
      });
    },
    [setConfig]
  );

  const setActiveProject = useCallback(
    (id: string | undefined, name?: string) => {
      // Use functional update to avoid stale closure
      setConfig((prevConfig) => {
        if (
          prevConfig.activeProjectId === id &&
          prevConfig.activeProjectName === name
        ) {
          return prevConfig;
        }
        return { ...prevConfig, activeProjectId: id, activeProjectName: name };
      });
    },
    [setConfig]
  );

  const changeSidebarTheme = (sidebarTheme: IConfig['sidebarTheme']) => {
    updateConfig({ sidebarTheme });
  };
  const changeFontFamily = (fontFamily: IConfig['fontFamily']) => {
    updateConfig({ fontFamily });
  };

  const changeDirection = (direction: IConfig['direction']) => {
    updateConfig({ direction });
  };

  const toggleTheme = () => {
    if (['system', 'light', 'contrast', 'material'].includes(config.theme)) {
      changeTheme('dark');
    } else {
      changeTheme('light');
    }
  };

  const toggleFullscreen = () => {
    if (document.fullscreenElement != null) {
      document.exitFullscreen();
    } else if (htmlRef) {
      htmlRef.requestFullscreen();
    }
    updateConfig({ fullscreen: !config.fullscreen });
  };

  const reset = () => {
    setConfig(defaultConfig);
    if (document.fullscreenElement != null) {
      document.exitFullscreen();
    }
  };

  const calculatedSidebarTheme = useMemo(() => {
    return config.sidebarTheme == 'dark' &&
      ['light', 'contrast'].includes(config.theme)
      ? 'dark'
      : undefined;
  }, [config.sidebarTheme, config.theme]);

  useEffect(() => {
    const fullscreenMedia = window.matchMedia('(display-mode: fullscreen)');
    const fullscreenListener = () => {
      updateConfig({ fullscreen: fullscreenMedia.matches });
    };
    fullscreenMedia.addEventListener('change', fullscreenListener);

    // Listen for system theme changes when in system mode
    const darkModeMedia = window.matchMedia('(prefers-color-scheme: dark)');
    const darkModeListener = () => {
      if (config.theme === 'system' && htmlRef) {
        const prefersDark = darkModeMedia.matches;
        htmlRef.setAttribute(
          'data-theme',
          prefersDark ? 'space-asteroid-belt' : 'space-asteroid-belt-light'
        );
      }
    };
    darkModeMedia.addEventListener('change', darkModeListener);

    return () => {
      fullscreenMedia.removeEventListener('change', fullscreenListener);
      darkModeMedia.removeEventListener('change', darkModeListener);
    };
    // subscribe once on mount; updateConfig is stable via useCallback
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.theme, htmlRef]);

  useEffect(() => {
    if (!htmlRef) return;

    // Check if a custom theme is active (from ColorSwitcher)
    const customTheme = localStorage.getItem('emergent-theme');

    // Only update data-theme if no custom theme is set
    if (!customTheme) {
      if (config.theme == 'system') {
        // For system, detect OS preference and use asteroid belt variants
        const prefersDark = window.matchMedia(
          '(prefers-color-scheme: dark)'
        ).matches;
        htmlRef.setAttribute(
          'data-theme',
          prefersDark ? 'space-asteroid-belt' : 'space-asteroid-belt-light'
        );
      } else if (config.theme == 'light') {
        // Light mode = asteroid belt light
        htmlRef.setAttribute('data-theme', 'space-asteroid-belt-light');
      } else if (config.theme == 'dark') {
        // Dark mode = asteroid belt dark
        htmlRef.setAttribute('data-theme', 'space-asteroid-belt');
      } else {
        // Fallback for other theme names (if any)
        htmlRef.setAttribute('data-theme', config.theme);
      }
    }

    if (config.fullscreen) {
      htmlRef.setAttribute('data-fullscreen', '');
    } else {
      htmlRef.removeAttribute('data-fullscreen');
    }
    if (config.sidebarTheme) {
      htmlRef.setAttribute('data-sidebar-theme', config.sidebarTheme);
    }
    if (JSON.stringify(config) !== JSON.stringify(defaultConfig)) {
      htmlRef.setAttribute('data-changed', '');
    } else {
      htmlRef.removeAttribute('data-changed');
    }
    if (config.fontFamily !== 'default') {
      htmlRef.setAttribute('data-font-family', config.fontFamily);
    } else {
      htmlRef.removeAttribute('data-font-family');
    }
    if (config.direction) {
      htmlRef.dir = config.direction;
    }
  }, [config, htmlRef]);

  return {
    config,
    calculatedSidebarTheme,
    toggleTheme,
    reset,
    changeSidebarTheme,
    changeFontFamily,
    changeTheme,
    changeDirection,
    toggleFullscreen,
    setActiveOrg,
    setActiveProject,
  };
};

const ConfigContext = createContext({} as ReturnType<typeof useHook>);

export const ConfigProvider = ({ children }: { children: ReactNode }) => {
  const value = useHook();
  return (
    <ConfigContext.Provider value={value}>{children}</ConfigContext.Provider>
  );
};

export const useConfig = () => {
  return useContext(ConfigContext);
};
