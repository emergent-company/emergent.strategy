import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useSwitcherPanel } from '@/contexts/switcher-panel';

interface Theme {
  id: string;
  name: string;
  description: string;
  colors: {
    primary: string;
    secondary: string;
    accent: string;
  };
}

const themes: Theme[] = [
  {
    id: 'dark',
    name: 'Current (Dark)',
    description: 'Original purple-heavy theme',
    colors: {
      primary: 'oklch(60% 0.20 300)', // violet
      secondary: 'oklch(62% 0.18 190)', // teal
      accent: 'oklch(65% 0.23 350)', // magenta
    },
  },
  {
    id: 'eyedea',
    name: 'Eyedea',
    description: 'A unique theme with a dirty green base and vibrant accents',
    colors: {
      primary: 'oklch(55% 0.18 165)', // vibrant green
      secondary: 'oklch(68% 0.12 195)', // cyan blue
      accent: 'oklch(70% 0.15 60)', // warm orange
    },
  },
  {
    id: 'emergent-balanced',
    name: 'Emergent Balanced',
    description: 'Reduced purple, more blue',
    colors: {
      primary: 'oklch(62% 0.18 270)', // blue-violet
      secondary: 'oklch(68% 0.16 200)', // cyan
      accent: 'oklch(68% 0.15 285)', // soft purple
    },
  },
  {
    id: 'tokyo-night-storm',
    name: 'Tokyo Night Storm',
    description: 'Navy blue with cyan accents',
    colors: {
      primary: 'oklch(68% 0.15 250)', // bright blue
      secondary: 'oklch(70% 0.15 290)', // purple (minimal)
      accent: 'oklch(72% 0.12 200)', // cyan
    },
  },
  {
    id: 'catppuccin-mocha',
    name: 'Catppuccin Mocha',
    description: 'Soft pastels, balanced colors',
    colors: {
      primary: 'oklch(75% 0.12 250)', // lavender blue
      secondary: 'oklch(76% 0.12 300)', // mauve
      accent: 'oklch(80% 0.12 210)', // sky blue
    },
  },
  {
    id: 'blue-cyan-modern',
    name: 'Blue-Cyan Modern',
    description: 'Professional, minimal purple',
    colors: {
      primary: 'oklch(55% 0.20 260)', // deep blue
      secondary: 'oklch(70% 0.15 200)', // bright cyan
      accent: 'oklch(65% 0.13 180)', // teal
    },
  },
  {
    id: 'gruvbox-dark',
    name: 'Gruvbox Dark',
    description: 'Retro groove, warm and cozy',
    colors: {
      primary: 'oklch(75% 0.15 85)', // yellow
      secondary: 'oklch(70% 0.12 180)', // aqua
      accent: 'oklch(70% 0.15 140)', // green
    },
  },
  {
    id: 'solarized-dark',
    name: 'Solarized Dark',
    description: 'Precision colors, balanced contrast',
    colors: {
      primary: 'oklch(60% 0.15 240)', // blue
      secondary: 'oklch(65% 0.12 190)', // cyan
      accent: 'oklch(70% 0.15 90)', // yellow
    },
  },
  {
    id: 'nord',
    name: 'Nord',
    description: 'An arctic, north-bluish palette',
    colors: {
      primary: 'oklch(65% 0.12 240)', // frosty blue
      secondary: 'oklch(60% 0.15 250)', // another blue
      accent: 'oklch(70% 0.15 145)', // aurora green
    },
  },
  {
    id: 'dracula',
    name: 'Dracula',
    description: 'A dark theme for night owls',
    colors: {
      primary: 'oklch(70% 0.20 330)', // pink
      secondary: 'oklch(70% 0.18 290)', // purple
      accent: 'oklch(75% 0.15 200)', // cyan
    },
  },
  {
    id: 'monokai-pro',
    name: 'Monokai Pro',
    description: 'Beautiful functionality, vibrant',
    colors: {
      primary: 'oklch(70% 0.22 340)', // pink
      secondary: 'oklch(80% 0.18 90)', // yellow
      accent: 'oklch(75% 0.20 150)', // green
    },
  },
  {
    id: 'one-dark-pro',
    name: 'One Dark Pro',
    description: "Atom's iconic theme for VS Code",
    colors: {
      primary: 'oklch(65% 0.15 250)', // blue
      secondary: 'oklch(70% 0.15 150)', // green
      accent: 'oklch(75% 0.18 90)', // yellow
    },
  },
  {
    id: 'veeam-green',
    name: 'Veeam Green',
    description: 'Official Veeam brand colors',
    colors: {
      primary: 'oklch(70% 0.25 145)', // veeam green
      secondary: 'oklch(65% 0.15 240)', // light blue
      accent: 'oklch(80% 0.20 90)', // yellow
    },
  },
  {
    id: 'apple-light',
    name: 'Apple Light',
    description: 'Clean, spacious, and highly legible',
    colors: {
      primary: 'oklch(60% 0.18 250)', // system blue
      secondary: 'oklch(55% 0.15 250)', // darker blue
      accent: 'oklch(65% 0.20 150)', // system green
    },
  },
  {
    id: 'sunset-dream',
    name: 'Sunset Dream',
    description: 'Vibrant and enchanting sunset gradients',
    colors: {
      primary: 'oklch(70% 0.20 50)', // warm orange
      secondary: 'oklch(75% 0.18 340)', // soft pink
      accent: 'oklch(85% 0.20 90)', // bright yellow
    },
  },
  {
    id: 'retro-pop',
    name: 'Retro Pop',
    description: 'Bold, high-energy 90s aesthetic',
    colors: {
      primary: 'oklch(70% 0.3 330)', // magenta
      secondary: 'oklch(80% 0.25 190)', // cyan
      accent: 'oklch(90% 0.25 100)', // yellow
    },
  },
  {
    id: 'colorhunt-midnight',
    name: 'Midnight',
    description: 'A calm, moody, and modern dark theme',
    colors: {
      primary: 'oklch(65% 0.15 240)', // soft blue
      secondary: 'oklch(60% 0.1 190)', // muted teal
      accent: 'oklch(75% 0.1 280)', // pale lavender
    },
  },
  {
    id: 'colorhunt-earthy',
    name: 'Earthy',
    description: 'A warm, natural, and inviting dark theme',
    colors: {
      primary: 'oklch(65% 0.15 60)', // soft terracotta
      secondary: 'oklch(60% 0.1 140)', // sage green
      accent: 'oklch(80% 0.05 90)', // beige
    },
  },
  {
    id: 'colorhunt-crimson',
    name: 'Crimson',
    description: 'A bold, high-contrast, and dramatic theme',
    colors: {
      primary: 'oklch(55% 0.25 20)', // crimson
      secondary: 'oklch(50% 0.15 260)', // dark blue
      accent: 'oklch(85% 0.02 270)', // off-white
    },
  },
  {
    id: 'charcoal-lime',
    name: 'Charcoal & Lime',
    description: 'A high-contrast dark theme with a vibrant lime green accent',
    colors: {
      primary: 'oklch(80% 0.25 145)', // lime green
      secondary: 'oklch(60% 0.15 150)', // muted green
      accent: 'oklch(95% 0.01 250)', // white
    },
  },
  {
    id: 'mocha-orange',
    name: 'Mocha & Orange',
    description: 'A warm, coffee-toned dark theme with a burnt orange accent',
    colors: {
      primary: 'oklch(70% 0.20 60)', // burnt orange
      secondary: 'oklch(80% 0.05 90)', // creamy beige
      accent: 'oklch(75% 0.15 90)', // muted gold
    },
  },
  {
    id: 'gunmetal-red',
    name: 'Gunmetal & Red',
    description: 'A strong, high-contrast theme with a bold red accent',
    colors: {
      primary: 'oklch(65% 0.25 25)', // bold red
      secondary: 'oklch(55% 0.22 25)', // darker red
      accent: 'oklch(80% 0.20 90)', // warm yellow
    },
  },
  {
    id: 'space-deep-space',
    name: 'Deep Space',
    description: 'A very dark, almost black theme with a deep blue accent',
    colors: {
      primary: 'oklch(50% 0.18 260)', // deep blue
      secondary: 'oklch(65% 0.15 250)', // lighter blue
      accent: 'oklch(95% 0.01 250)', // white
    },
  },
  {
    id: 'space-nebula',
    name: 'Nebula',
    description: 'A purple and pink focused theme, inspired by nebula clouds',
    colors: {
      primary: 'oklch(70% 0.22 330)', // bright pink
      secondary: 'oklch(60% 0.20 290)', // deep purple
      accent: 'oklch(75% 0.18 200)', // cyan
    },
  },
  {
    id: 'space-supernova',
    name: 'Supernova',
    description: 'A bright, fiery theme with orange and yellow accents',
    colors: {
      primary: 'oklch(70% 0.25 50)', // fiery orange
      secondary: 'oklch(85% 0.22 90)', // bright yellow
      accent: 'oklch(60% 0.25 25)', // deep red
    },
  },
  {
    id: 'space-galactic',
    name: 'Galactic',
    description: 'A theme with a mix of deep blues and teals',
    colors: {
      primary: 'oklch(65% 0.15 190)', // deep teal
      secondary: 'oklch(70% 0.18 210)', // brighter cyan/blue
      accent: 'oklch(65% 0.12 160)', // muted green
    },
  },
  {
    id: 'space-cosmic',
    name: 'Cosmic',
    description: 'A playful theme with a mix of pink, purple, and blue',
    colors: {
      primary: 'oklch(70% 0.25 340)', // bright pink
      secondary: 'oklch(68% 0.20 250)', // bright blue
      accent: 'oklch(65% 0.22 290)', // bright purple
    },
  },
  {
    id: 'space-red-giant',
    name: 'Red Giant',
    description: 'A fiery theme of deep reds and oranges, avoiding blues',
    colors: {
      primary: 'oklch(60% 0.25 30)', // deep red
      secondary: 'oklch(70% 0.22 55)', // fiery orange
      accent: 'oklch(88% 0.20 90)', // hot yellow
    },
  },
  {
    id: 'space-cosmic-dust',
    name: 'Cosmic Dust',
    description: 'A warm, dusty palette of browns and beiges',
    colors: {
      primary: 'oklch(65% 0.08 70)', // dusty brown
      secondary: 'oklch(80% 0.05 90)', // sandy beige
      accent: 'oklch(60% 0.15 50)', // terracotta
    },
  },
  {
    id: 'space-asteroid-belt',
    name: 'Asteroid Belt (Dark)',
    description:
      'A monochromatic grey theme with a metallic accent - Dark mode',
    colors: {
      primary: 'oklch(70% 0.02 240)', // cool steel
      secondary: 'oklch(50% 0.02 60)', // warm gray
      accent: 'oklch(65% 0.15 75)', // bronze/gold
    },
  },
  {
    id: 'space-asteroid-belt-light',
    name: 'Asteroid Belt (Light)',
    description:
      'A monochromatic grey theme with a metallic accent - Light mode',
    colors: {
      primary: 'oklch(40% 0.02 240)', // darker cool steel
      secondary: 'oklch(45% 0.02 60)', // darker warm gray
      accent: 'oklch(55% 0.15 75)', // darker bronze/gold
    },
  },
  {
    id: 'colorhunt-dusk-fire',
    name: 'Dusk Fire',
    description: 'A dark, moody theme with a fiery accent',
    colors: {
      primary: 'oklch(40% 0.25 310)', // deep purple/magenta
      secondary: 'oklch(60% 0.25 10)', // bright pink/red
      accent: 'oklch(70% 0.15 60)', // soft orange
    },
  },
  {
    id: 'colorhunt-dusty-rose',
    name: 'Dusty Rose',
    description: 'A muted, sophisticated theme with dusty rose accents',
    colors: {
      primary: 'oklch(45% 0.08 270)', // muted blue/purple
      secondary: 'oklch(55% 0.15 10)', // dusty rose
      accent: 'oklch(85% 0.03 350)', // pale pink
    },
  },
  {
    id: 'colorhunt-galaxy-flame',
    name: 'Galaxy Flame',
    description: 'A vibrant, high-energy theme with a fiery gradient',
    colors: {
      primary: 'oklch(40% 0.22 290)', // vibrant purple
      secondary: 'oklch(60% 0.25 350)', // bright pink
      accent: 'oklch(70% 0.20 50)', // vivid orange
    },
  },
  {
    id: 'colorhunt-teal-fire',
    name: 'Teal Fire',
    description: 'A unique theme with a teal base and fiery accents',
    colors: {
      primary: 'oklch(75% 0.2 80)', // bright orange
      secondary: 'oklch(65% 0.22 45)', // red-orange
      accent: 'oklch(55% 0.25 25)', // bold red
    },
  },
  {
    id: 'colorhunt-indigo-flame',
    name: 'Indigo Flame',
    description: 'A deep indigo theme with a bright orange flame accent',
    colors: {
      primary: 'oklch(50% 0.1 270)', // muted purple/blue
      secondary: 'oklch(75% 0.2 70)', // bright orange
      accent: 'oklch(98% 0.01 90)', // off-white
    },
  },
  {
    id: 'colorhunt-ocean-flare',
    name: 'Ocean Flare',
    description: 'A deep ocean blue theme with a bright reddish-pink flare',
    colors: {
      primary: 'oklch(40% 0.15 250)', // medium blue
      secondary: 'oklch(65% 0.22 20)', // bright pink/red
      accent: 'oklch(50% 0.15 250)', // lighter blue
    },
  },
];

export function ColorSwitcher() {
  const { openPanel, togglePanel } = useSwitcherPanel();
  const isOpen = openPanel === 'color';

  const [currentTheme, setCurrentTheme] = useState<string>(() => {
    // Initialize from actual DOM state
    return document.documentElement.getAttribute('data-theme') || 'dark';
  });

  useEffect(() => {
    // Sync state with actual applied theme on mount
    const actualTheme =
      document.documentElement.getAttribute('data-theme') || 'dark';
    setCurrentTheme(actualTheme);

    // Optional: Watch for external theme changes (e.g., from other components)
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (
          mutation.type === 'attributes' &&
          mutation.attributeName === 'data-theme'
        ) {
          const newTheme =
            document.documentElement.getAttribute('data-theme') || 'dark';
          setCurrentTheme(newTheme);
        }
      });
    });

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });

    return () => observer.disconnect();
  }, []);

  const handleThemeChange = (themeId: string) => {
    setCurrentTheme(themeId);
    document.documentElement.setAttribute('data-theme', themeId);
    localStorage.setItem('emergent-theme', themeId);
  };

  return (
    <div className="fixed bottom-6 right-6 z-50">
      {/* Toggle Button */}
      <motion.button
        onClick={() => togglePanel('color')}
        className="btn btn-circle btn-lg bg-base-200 border-base-300 shadow-xl hover:scale-105"
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        title="Theme Switcher"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="h-6 w-6"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01"
          />
        </svg>
      </motion.button>

      {/* Theme Panel */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.9 }}
            transition={{ duration: 0.2 }}
            className="absolute bottom-20 right-0 w-[420px] bg-base-200 border border-base-300 rounded-2xl shadow-2xl p-6"
          >
            {/* Header */}
            <div className="flex justify-between items-center mb-4">
              <div>
                <h3 className="text-lg font-bold">Theme Switcher</h3>
                <p className="text-xs text-base-content/60">
                  Choose your color theme
                </p>
              </div>
              <button
                onClick={() => togglePanel(null)}
                className="btn btn-sm btn-ghost btn-circle"
              >
                ✕
              </button>
            </div>

            {/* Theme Options */}
            <div className="space-y-3 max-h-96 overflow-y-auto px-3 py-3 -mx-3 -my-3">
              {themes.map((theme) => (
                <motion.button
                  key={theme.id}
                  onClick={() => handleThemeChange(theme.id)}
                  className={`w-full p-4 rounded-xl border-2 transition-all text-left ${
                    currentTheme === theme.id
                      ? 'border-primary bg-primary/10'
                      : 'border-base-300 bg-base-100 hover:border-primary/50'
                  }`}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                >
                  {/* Theme Name */}
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-semibold">{theme.name}</span>
                    {currentTheme === theme.id && (
                      <svg
                        className="w-5 h-5 text-primary"
                        fill="currentColor"
                        viewBox="0 0 20 20"
                      >
                        <path
                          fillRule="evenodd"
                          d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                          clipRule="evenodd"
                        />
                      </svg>
                    )}
                  </div>

                  {/* Theme Description */}
                  <p className="text-xs text-base-content/60 mb-3">
                    {theme.description}
                  </p>

                  {/* Color Preview Swatches */}
                  <div className="flex gap-2">
                    <div
                      className="w-8 h-8 rounded-lg shadow-sm border border-base-300"
                      style={{ backgroundColor: theme.colors.primary }}
                      title="Primary"
                    />
                    <div
                      className="w-8 h-8 rounded-lg shadow-sm border border-base-300"
                      style={{ backgroundColor: theme.colors.secondary }}
                      title="Secondary"
                    />
                    <div
                      className="w-8 h-8 rounded-lg shadow-sm border border-base-300"
                      style={{ backgroundColor: theme.colors.accent }}
                      title="Accent"
                    />
                  </div>
                </motion.button>
              ))}
            </div>

            {/* Footer Info */}
            <div className="mt-4 pt-4 border-t border-base-300">
              <p className="text-xs text-base-content/50">
                💡 Theme selection is saved to localStorage and persists across
                sessions
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
