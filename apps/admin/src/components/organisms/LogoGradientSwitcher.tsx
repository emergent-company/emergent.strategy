import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useLogoVariant, LogoVariant } from '@/hooks/useLogoVariant';
import { useSwitcherPanel } from '@/contexts/switcher-panel';

interface Gradient {
  id: LogoVariant;
  name: string;
  description: string;
  class: string;
  category: 'theme-based' | 'fixed';
}

const gradients: Gradient[] = [
  // Theme-based gradients (adapt to current theme colors)
  {
    id: 'theme-primary-accent',
    name: '🎨 Primary → Accent',
    description: 'Dynamically uses theme primary and accent colors',
    class: 'bg-gradient-to-r from-primary to-accent',
    category: 'theme-based',
  },
  {
    id: 'theme-primary-secondary',
    name: '🎨 Primary → Secondary',
    description: 'Dynamically uses theme primary and secondary colors',
    class: 'bg-gradient-to-r from-primary to-secondary',
    category: 'theme-based',
  },
  {
    id: 'theme-secondary-accent',
    name: '🎨 Secondary → Accent',
    description: 'Dynamically uses theme secondary and accent colors',
    class: 'bg-gradient-to-r from-secondary to-accent',
    category: 'theme-based',
  },
  {
    id: 'theme-full',
    name: '🎨 Full Spectrum',
    description: 'Primary → Secondary → Accent (all theme colors)',
    class: 'bg-gradient-to-r from-primary via-secondary to-accent',
    category: 'theme-based',
  },
  {
    id: 'theme-monochrome',
    name: '🎨 Monochrome',
    description: 'Subtle gradient of theme primary color',
    class: 'bg-gradient-to-r from-primary/100 via-primary/80 to-primary/60',
    category: 'theme-based',
  },
  {
    id: 'theme-monochrome-subtle',
    name: '🎨 Monochrome Subtle',
    description: 'Very subtle gradient of theme primary color',
    class: 'bg-gradient-to-r from-primary/90 via-primary/70 to-primary/50',
    category: 'theme-based',
  },

  // Fixed color gradients (don't change with theme)
  {
    id: 'two-tone-blue',
    name: 'Two-Tone Blue',
    description: 'Modern tech feel, blue to cyan',
    class: 'bg-gradient-to-r from-blue-500 via-cyan-400 to-cyan-300',
    category: 'fixed',
  },
  {
    id: 'ocean',
    name: 'Ocean',
    description: 'Deep blue to teal waves',
    class: 'bg-gradient-to-r from-blue-600 via-cyan-500 to-teal-400',
    category: 'fixed',
  },
  {
    id: 'arctic',
    name: 'Arctic',
    description: 'Cool cyan to indigo frost',
    class: 'bg-gradient-to-r from-cyan-600 via-blue-400 to-indigo-300',
    category: 'fixed',
  },
  {
    id: 'sunset',
    name: 'Sunset',
    description: 'Fiery orange to deep red',
    class: 'bg-gradient-to-r from-orange-400 via-red-500 to-red-600',
    category: 'fixed',
  },
  {
    id: 'fire',
    name: 'Fire',
    description: 'Blazing red to golden yellow',
    class: 'bg-gradient-to-r from-red-600 via-orange-500 to-yellow-400',
    category: 'fixed',
  },
  {
    id: 'verdant',
    name: 'Verdant',
    description: 'Lush emerald to teal',
    class: 'bg-gradient-to-r from-emerald-400 to-teal-500',
    category: 'fixed',
  },
  {
    id: 'forest',
    name: 'Forest',
    description: 'Deep green to vibrant lime',
    class: 'bg-gradient-to-r from-green-700 via-emerald-500 to-lime-400',
    category: 'fixed',
  },
  {
    id: 'blue-purple',
    name: 'Blue & Purple',
    description: 'Classic professional blend',
    class: 'bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-400',
    category: 'fixed',
  },
  {
    id: 'cosmic',
    name: 'Cosmic',
    description: 'Purple to pink galaxy',
    class: 'bg-gradient-to-r from-purple-600 via-pink-500 to-rose-400',
    category: 'fixed',
  },
];

export function LogoGradientSwitcher() {
  const { openPanel, togglePanel } = useSwitcherPanel();
  const isOpen = openPanel === 'logo-gradient';
  const { variant: currentVariant, setLogoVariant } = useLogoVariant();

  const themeBased = gradients.filter((g) => g.category === 'theme-based');
  const fixed = gradients.filter((g) => g.category === 'fixed');

  return (
    <div className="fixed bottom-6 right-24 z-50">
      <motion.button
        onClick={() => togglePanel('logo-gradient')}
        className="btn btn-circle btn-lg bg-base-200 border-base-300 shadow-xl hover:scale-105"
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        title="Logo Gradient Switcher"
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
            d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.5L15.232 5.232z"
          />
        </svg>
      </motion.button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.9 }}
            transition={{ duration: 0.2 }}
            className="absolute bottom-16 right-0 w-96 bg-base-200 border border-base-300 rounded-2xl shadow-2xl p-5"
          >
            <div className="flex justify-between items-center mb-4">
              <div>
                <h3 className="text-md font-bold">Logo Gradients</h3>
                <p className="text-xs text-base-content/60">
                  Customize your brand colors
                </p>
              </div>
              <button
                onClick={() => togglePanel(null)}
                className="btn btn-sm btn-ghost btn-circle"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4 max-h-96 overflow-y-auto">
              {/* Theme-based gradients */}
              <div>
                <h4 className="text-xs font-semibold text-base-content/70 mb-2 uppercase tracking-wider">
                  Theme-Based (Adaptive)
                </h4>
                <div className="space-y-2">
                  {themeBased.map((grad) => (
                    <motion.button
                      key={grad.id}
                      onClick={() => setLogoVariant(grad.id)}
                      className={`w-full p-3 rounded-lg border-2 transition-all text-left ${
                        currentVariant === grad.id
                          ? 'border-primary bg-primary/10'
                          : 'border-base-300 bg-base-100 hover:border-primary/50'
                      }`}
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-sm">
                          {grad.name}
                        </span>
                        {currentVariant === grad.id && (
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
                      <p className="text-xs text-base-content/60 mt-1 mb-2">
                        {grad.description}
                      </p>
                      <div
                        className={`h-6 w-full rounded-md ${grad.class}`}
                      ></div>
                    </motion.button>
                  ))}
                </div>
              </div>

              {/* Fixed color gradients */}
              <div>
                <h4 className="text-xs font-semibold text-base-content/70 mb-2 uppercase tracking-wider">
                  Fixed Colors
                </h4>
                <div className="space-y-2">
                  {fixed.map((grad) => (
                    <motion.button
                      key={grad.id}
                      onClick={() => setLogoVariant(grad.id)}
                      className={`w-full p-3 rounded-lg border-2 transition-all text-left ${
                        currentVariant === grad.id
                          ? 'border-primary bg-primary/10'
                          : 'border-base-300 bg-base-100 hover:border-primary/50'
                      }`}
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-sm">
                          {grad.name}
                        </span>
                        {currentVariant === grad.id && (
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
                      <p className="text-xs text-base-content/60 mt-1 mb-2">
                        {grad.description}
                      </p>
                      <div
                        className={`h-6 w-full rounded-md ${grad.class}`}
                      ></div>
                    </motion.button>
                  ))}
                </div>
              </div>
            </div>

            {/* Footer Info */}
            <div className="mt-4 pt-4 border-t border-base-300">
              <p className="text-xs text-base-content/50">
                💡 Theme-based gradients adapt to your selected color theme
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
