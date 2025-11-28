import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useSwitcherPanel } from '@/contexts/switcher-panel';

export type LogoFont =
  | 'inter'
  | 'poppins'
  | 'space-grotesk'
  | 'work-sans'
  | 'manrope'
  | 'montserrat'
  | 'oswald'
  | 'bebas-neue'
  | 'raleway'
  | 'orbitron'
  | 'exo-2'
  | 'rajdhani'
  | 'audiowide'
  | 'lexend'
  | 'dm-sans'
  | 'plus-jakarta-sans'
  | 'rubik'
  | 'ubuntu'
  | 'archivo-black'
  | 'anton'
  | 'barlow'
  | 'russo-one'
  | 'saira'
  | 'share-tech-mono'
  | 'electrolize'
  | 'titillium-web';

export type LogoTextTransform =
  | 'uppercase'
  | 'lowercase'
  | 'capitalize'
  | 'none';

interface Font {
  id: LogoFont;
  name: string;
  description: string;
  fontFamily: string;
  category: 'geometric' | 'bold' | 'tech' | 'minimal';
  weight: number;
}

const fonts: Font[] = [
  // Modern Geometric Sans-Serif
  {
    id: 'inter',
    name: 'Inter',
    description: 'Modern tech standard, highly legible',
    fontFamily: 'Inter, sans-serif',
    category: 'geometric',
    weight: 700,
  },
  {
    id: 'poppins',
    name: 'Poppins',
    description: 'Geometric, clean, friendly yet professional',
    fontFamily: 'Poppins, sans-serif',
    category: 'geometric',
    weight: 700,
  },
  {
    id: 'space-grotesk',
    name: 'Space Grotesk',
    description: 'Futuristic, tech-forward, unique',
    fontFamily: '"Space Grotesk", sans-serif',
    category: 'geometric',
    weight: 700,
  },
  {
    id: 'work-sans',
    name: 'Work Sans',
    description: 'Balanced, professional, excellent readability',
    fontFamily: '"Work Sans", sans-serif',
    category: 'geometric',
    weight: 700,
  },
  {
    id: 'manrope',
    name: 'Manrope',
    description: 'Rounded geometric, modern, approachable',
    fontFamily: 'Manrope, sans-serif',
    category: 'geometric',
    weight: 700,
  },
  {
    id: 'rubik',
    name: 'Rubik',
    description: 'Friendly rounded, playful, modern',
    fontFamily: 'Rubik, sans-serif',
    category: 'geometric',
    weight: 700,
  },
  {
    id: 'ubuntu',
    name: 'Ubuntu',
    description: 'Humanist, warm, professional',
    fontFamily: 'Ubuntu, sans-serif',
    category: 'geometric',
    weight: 700,
  },
  {
    id: 'barlow',
    name: 'Barlow',
    description: 'Wide, modern, versatile',
    fontFamily: 'Barlow, sans-serif',
    category: 'geometric',
    weight: 700,
  },

  // Bold Display Fonts
  {
    id: 'montserrat',
    name: 'Montserrat',
    description: 'Strong geometric, excellent for logos',
    fontFamily: 'Montserrat, sans-serif',
    category: 'bold',
    weight: 800,
  },
  {
    id: 'oswald',
    name: 'Oswald',
    description: 'Condensed, bold, impactful',
    fontFamily: 'Oswald, sans-serif',
    category: 'bold',
    weight: 700,
  },
  {
    id: 'bebas-neue',
    name: 'Bebas Neue',
    description: 'Ultra-bold, condensed, powerful',
    fontFamily: '"Bebas Neue", sans-serif',
    category: 'bold',
    weight: 400,
  },
  {
    id: 'raleway',
    name: 'Raleway',
    description: 'Elegant geometric, strong presence',
    fontFamily: 'Raleway, sans-serif',
    category: 'bold',
    weight: 800,
  },
  {
    id: 'archivo-black',
    name: 'Archivo Black',
    description: 'Ultra-heavy, commanding, impactful',
    fontFamily: '"Archivo Black", sans-serif',
    category: 'bold',
    weight: 400,
  },
  {
    id: 'anton',
    name: 'Anton',
    description: 'Extra condensed, dramatic, bold',
    fontFamily: 'Anton, sans-serif',
    category: 'bold',
    weight: 400,
  },
  {
    id: 'russo-one',
    name: 'Russo One',
    description: 'Bold, impactful, industrial',
    fontFamily: '"Russo One", sans-serif',
    category: 'bold',
    weight: 400,
  },

  // Tech/Futuristic
  {
    id: 'orbitron',
    name: 'Orbitron',
    description: 'Futuristic, sci-fi aesthetic',
    fontFamily: 'Orbitron, sans-serif',
    category: 'tech',
    weight: 900,
  },
  {
    id: 'exo-2',
    name: 'Exo 2',
    description: 'Technological, modern, geometric',
    fontFamily: '"Exo 2", sans-serif',
    category: 'tech',
    weight: 800,
  },
  {
    id: 'rajdhani',
    name: 'Rajdhani',
    description: 'Angular, tech-inspired',
    fontFamily: 'Rajdhani, sans-serif',
    category: 'tech',
    weight: 700,
  },
  {
    id: 'audiowide',
    name: 'Audiowide',
    description: 'Digital, tech-forward, unique character',
    fontFamily: 'Audiowide, sans-serif',
    category: 'tech',
    weight: 400,
  },
  {
    id: 'share-tech-mono',
    name: 'Share Tech Mono',
    description: 'Monospace, digital, technical',
    fontFamily: '"Share Tech Mono", monospace',
    category: 'tech',
    weight: 400,
  },
  {
    id: 'electrolize',
    name: 'Electrolize',
    description: 'Electronic, digital display, sci-fi',
    fontFamily: 'Electrolize, sans-serif',
    category: 'tech',
    weight: 400,
  },
  {
    id: 'saira',
    name: 'Saira',
    description: 'Semi-condensed, tech, modern',
    fontFamily: 'Saira, sans-serif',
    category: 'tech',
    weight: 700,
  },

  // Clean & Minimal
  {
    id: 'lexend',
    name: 'Lexend',
    description: 'Ultra-readable, clean, modern',
    fontFamily: 'Lexend, sans-serif',
    category: 'minimal',
    weight: 700,
  },
  {
    id: 'dm-sans',
    name: 'DM Sans',
    description: 'Minimalist, balanced, professional',
    fontFamily: '"DM Sans", sans-serif',
    category: 'minimal',
    weight: 700,
  },
  {
    id: 'plus-jakarta-sans',
    name: 'Plus Jakarta Sans',
    description: 'Clean, geometric, friendly',
    fontFamily: '"Plus Jakarta Sans", sans-serif',
    category: 'minimal',
    weight: 700,
  },
  {
    id: 'titillium-web',
    name: 'Titillium Web',
    description: 'Clean, technical, minimal',
    fontFamily: '"Titillium Web", sans-serif',
    category: 'minimal',
    weight: 700,
  },
];

const STORAGE_KEY = 'emergent-logo-font';
const TRANSFORM_STORAGE_KEY = 'emergent-logo-transform';

interface TextTransformOption {
  id: LogoTextTransform;
  label: string;
  example: string;
}

const textTransforms: TextTransformOption[] = [
  { id: 'uppercase', label: 'UPPERCASE', example: 'EMERGENT' },
  { id: 'lowercase', label: 'lowercase', example: 'emergent' },
  { id: 'capitalize', label: 'Capitalize', example: 'Emergent' },
  { id: 'none', label: 'None', example: 'EMERGENT' },
];

export function LogoFontSwitcher() {
  const { openPanel, togglePanel } = useSwitcherPanel();
  const isOpen = openPanel === 'logo-font';
  const [currentFont, setCurrentFont] = useState<LogoFont>('orbitron');
  const [currentTransform, setCurrentTransform] =
    useState<LogoTextTransform>('lowercase');

  const handleFontChange = (fontId: LogoFont) => {
    setCurrentFont(fontId);
    localStorage.setItem(STORAGE_KEY, fontId);

    // Apply font to logo globally
    const selectedFont = fonts.find((f) => f.id === fontId);
    if (selectedFont) {
      document.documentElement.style.setProperty(
        '--logo-font-family',
        selectedFont.fontFamily
      );
      document.documentElement.style.setProperty(
        '--logo-font-weight',
        selectedFont.weight.toString()
      );
    }
  };

  const handleTransformChange = (transform: LogoTextTransform) => {
    setCurrentTransform(transform);
    localStorage.setItem(TRANSFORM_STORAGE_KEY, transform);

    // Apply text transform to logo globally
    document.documentElement.style.setProperty(
      '--logo-text-transform',
      transform
    );
  };

  // Initialize font and transform from localStorage
  useState(() => {
    const savedFont = localStorage.getItem(STORAGE_KEY) as LogoFont | null;
    if (savedFont) {
      handleFontChange(savedFont);
    } else {
      // Set default
      handleFontChange('orbitron');
    }

    const savedTransform = localStorage.getItem(
      TRANSFORM_STORAGE_KEY
    ) as LogoTextTransform | null;
    if (savedTransform) {
      handleTransformChange(savedTransform);
    } else {
      // Set default
      handleTransformChange('lowercase');
    }
  });

  const categories = {
    geometric: fonts.filter((f) => f.category === 'geometric'),
    bold: fonts.filter((f) => f.category === 'bold'),
    tech: fonts.filter((f) => f.category === 'tech'),
    minimal: fonts.filter((f) => f.category === 'minimal'),
  };

  // Helper to get preview text with current transform applied
  const getPreviewText = () => 'emergent';

  return (
    <div className="fixed bottom-6 right-[10.5rem] z-50">
      <motion.button
        onClick={() => togglePanel('logo-font')}
        className="btn btn-circle btn-lg bg-base-200 border-base-300 shadow-xl hover:scale-105"
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        title="Logo Font Switcher"
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
            d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"
          />
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9 13h6M9 17h6M9 9h1"
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
            className="absolute bottom-12 right-0 w-96 bg-base-200 border border-base-300 rounded-2xl shadow-2xl p-5"
          >
            <div className="flex justify-between items-center mb-4">
              <div>
                <h3 className="text-md font-bold">Logo Fonts</h3>
                <p className="text-xs text-base-content/60">
                  Choose your typography
                </p>
              </div>
              <button
                onClick={() => togglePanel(null)}
                className="btn btn-sm btn-ghost btn-circle"
              >
                ✕
              </button>
            </div>

            {/* Text Transform Options */}
            <div className="mb-4">
              <h4 className="text-xs font-semibold text-base-content/70 mb-2 uppercase tracking-wider">
                Text Case
              </h4>
              <div className="btn-group w-full grid grid-cols-4 gap-1">
                {textTransforms.map((transform) => (
                  <button
                    key={transform.id}
                    onClick={() => handleTransformChange(transform.id)}
                    className={`btn btn-xs ${
                      currentTransform === transform.id
                        ? 'btn-primary'
                        : 'btn-ghost'
                    }`}
                    title={transform.example}
                  >
                    {transform.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-4 max-h-96 overflow-y-auto">
              {/* Geometric */}
              <div>
                <h4 className="text-xs font-semibold text-base-content/70 mb-2 uppercase tracking-wider">
                  Geometric & Professional
                </h4>
                <div className="space-y-2">
                  {categories.geometric.map((font) => (
                    <motion.button
                      key={font.id}
                      onClick={() => handleFontChange(font.id)}
                      className={`w-full p-3 rounded-lg border-2 transition-all text-left ${
                        currentFont === font.id
                          ? 'border-primary bg-primary/10'
                          : 'border-base-300 bg-base-100 hover:border-primary/50'
                      }`}
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-semibold text-sm">
                          {font.name}
                        </span>
                        {currentFont === font.id && (
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
                      <p className="text-xs text-base-content/60 mb-2">
                        {font.description}
                      </p>
                      <div
                        className="text-lg"
                        style={{
                          fontFamily: font.fontFamily,
                          fontWeight: font.weight,
                          textTransform: currentTransform as any,
                        }}
                      >
                        {getPreviewText()}
                      </div>
                    </motion.button>
                  ))}
                </div>
              </div>

              {/* Bold */}
              <div>
                <h4 className="text-xs font-semibold text-base-content/70 mb-2 uppercase tracking-wider">
                  Bold & Impactful
                </h4>
                <div className="space-y-2">
                  {categories.bold.map((font) => (
                    <motion.button
                      key={font.id}
                      onClick={() => handleFontChange(font.id)}
                      className={`w-full p-3 rounded-lg border-2 transition-all text-left ${
                        currentFont === font.id
                          ? 'border-primary bg-primary/10'
                          : 'border-base-300 bg-base-100 hover:border-primary/50'
                      }`}
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-semibold text-sm">
                          {font.name}
                        </span>
                        {currentFont === font.id && (
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
                      <p className="text-xs text-base-content/60 mb-2">
                        {font.description}
                      </p>
                      <div
                        className="text-lg"
                        style={{
                          fontFamily: font.fontFamily,
                          fontWeight: font.weight,
                          textTransform: currentTransform as any,
                        }}
                      >
                        {getPreviewText()}
                      </div>
                    </motion.button>
                  ))}
                </div>
              </div>

              {/* Tech */}
              <div>
                <h4 className="text-xs font-semibold text-base-content/70 mb-2 uppercase tracking-wider">
                  Tech & Futuristic
                </h4>
                <div className="space-y-2">
                  {categories.tech.map((font) => (
                    <motion.button
                      key={font.id}
                      onClick={() => handleFontChange(font.id)}
                      className={`w-full p-3 rounded-lg border-2 transition-all text-left ${
                        currentFont === font.id
                          ? 'border-primary bg-primary/10'
                          : 'border-base-300 bg-base-100 hover:border-primary/50'
                      }`}
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-semibold text-sm">
                          {font.name}
                        </span>
                        {currentFont === font.id && (
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
                      <p className="text-xs text-base-content/60 mb-2">
                        {font.description}
                      </p>
                      <div
                        className="text-lg"
                        style={{
                          fontFamily: font.fontFamily,
                          fontWeight: font.weight,
                          textTransform: currentTransform as any,
                        }}
                      >
                        {getPreviewText()}
                      </div>
                    </motion.button>
                  ))}
                </div>
              </div>

              {/* Minimal */}
              <div>
                <h4 className="text-xs font-semibold text-base-content/70 mb-2 uppercase tracking-wider">
                  Clean & Minimal
                </h4>
                <div className="space-y-2">
                  {categories.minimal.map((font) => (
                    <motion.button
                      key={font.id}
                      onClick={() => handleFontChange(font.id)}
                      className={`w-full p-3 rounded-lg border-2 transition-all text-left ${
                        currentFont === font.id
                          ? 'border-primary bg-primary/10'
                          : 'border-base-300 bg-base-100 hover:border-primary/50'
                      }`}
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-semibold text-sm">
                          {font.name}
                        </span>
                        {currentFont === font.id && (
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
                      <p className="text-xs text-base-content/60 mb-2">
                        {font.description}
                      </p>
                      <div
                        className="text-lg"
                        style={{
                          fontFamily: font.fontFamily,
                          fontWeight: font.weight,
                          textTransform: currentTransform as any,
                        }}
                      >
                        {getPreviewText()}
                      </div>
                    </motion.button>
                  ))}
                </div>
              </div>
            </div>

            {/* Footer Info */}
            <div className="mt-4 pt-4 border-t border-base-300">
              <p className="text-xs text-base-content/50">
                💡 All fonts loaded from Google Fonts
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
