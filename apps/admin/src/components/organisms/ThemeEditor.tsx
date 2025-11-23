import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';

interface ThemeVariable {
  name: string;
  value: string;
  category: 'base' | 'action' | 'semantic' | 'geometry' | 'effects';
  description: string;
}

interface ThemeConfig {
  name: string;
  variables: ThemeVariable[];
}

const defaultTheme: ThemeConfig = {
  name: 'space-asteroid-belt',
  variables: [
    // Base colors
    {
      name: '--color-base-100',
      value: 'oklch(15% 0 0)',
      category: 'base',
      description: 'Main background - Very dark gray',
    },
    {
      name: '--color-base-200',
      value: 'oklch(25% 0 0)',
      category: 'base',
      description: 'Elevated surfaces - Dark gray',
    },
    {
      name: '--color-base-300',
      value: 'oklch(35% 0 0)',
      category: 'base',
      description: 'Borders/dividers - Medium dark',
    },
    {
      name: '--color-base-content',
      value: 'oklch(85% 0 0)',
      category: 'base',
      description: 'Text on backgrounds - Light gray',
    },

    // Action colors
    {
      name: '--color-primary',
      value: 'oklch(70% 0.02 240)',
      category: 'action',
      description: 'Primary actions - Cool steel gray',
    },
    {
      name: '--color-primary-content',
      value: 'oklch(15% 0 0)',
      category: 'action',
      description: 'Text on primary',
    },
    {
      name: '--color-secondary',
      value: 'oklch(50% 0.02 60)',
      category: 'action',
      description: 'Secondary actions - Warm charcoal',
    },
    {
      name: '--color-secondary-content',
      value: 'oklch(95% 0 0)',
      category: 'action',
      description: 'Text on secondary',
    },
    {
      name: '--color-accent',
      value: 'oklch(65% 0.15 75)',
      category: 'action',
      description: 'Accent highlights - Bronze/gold',
    },
    {
      name: '--color-accent-content',
      value: 'oklch(15% 0 0)',
      category: 'action',
      description: 'Text on accent',
    },
    {
      name: '--color-neutral',
      value: 'oklch(28% 0 0)',
      category: 'action',
      description: 'Neutral elements - Very dark',
    },
    {
      name: '--color-neutral-content',
      value: 'oklch(85% 0 0)',
      category: 'action',
      description: 'Text on neutral',
    },

    // Semantic colors
    {
      name: '--color-info',
      value: 'oklch(65% 0.12 230)',
      category: 'semantic',
      description: 'Info messages - Steel blue-gray',
    },
    {
      name: '--color-info-content',
      value: 'oklch(15% 0 0)',
      category: 'semantic',
      description: 'Text on info',
    },
    {
      name: '--color-success',
      value: 'oklch(60% 0.12 145)',
      category: 'semantic',
      description: 'Success messages - Military green',
    },
    {
      name: '--color-success-content',
      value: 'oklch(15% 0 0)',
      category: 'semantic',
      description: 'Text on success',
    },
    {
      name: '--color-warning',
      value: 'oklch(75% 0.15 65)',
      category: 'semantic',
      description: 'Warning messages - Amber gold',
    },
    {
      name: '--color-warning-content',
      value: 'oklch(15% 0 0)',
      category: 'semantic',
      description: 'Text on warning',
    },
    {
      name: '--color-error',
      value: 'oklch(58% 0.18 20)',
      category: 'semantic',
      description: 'Error messages - Rust red',
    },
    {
      name: '--color-error-content',
      value: 'oklch(95% 0 0)',
      category: 'semantic',
      description: 'Text on error',
    },

    // Geometry
    {
      name: '--radius-box',
      value: '0.375rem',
      category: 'geometry',
      description: 'Border radius for cards, modals, alerts',
    },
    {
      name: '--radius-field',
      value: '0.25rem',
      category: 'geometry',
      description: 'Border radius for inputs, buttons',
    },
    {
      name: '--radius-selector',
      value: '0.25rem',
      category: 'geometry',
      description: 'Border radius for checkboxes, badges',
    },
    {
      name: '--size-field',
      value: '0.25rem',
      category: 'geometry',
      description: 'Size multiplier for input fields',
    },
    {
      name: '--size-selector',
      value: '0.25rem',
      category: 'geometry',
      description: 'Size multiplier for selectors',
    },

    // Effects
    {
      name: '--border',
      value: '1px',
      category: 'effects',
      description: 'Border width',
    },
    {
      name: '--depth',
      value: '0.5',
      category: 'effects',
      description: '3D depth effect (0-1)',
    },
    {
      name: '--noise',
      value: '0',
      category: 'effects',
      description: 'Noise pattern (0-1)',
    },
  ],
};

export function ThemeEditor() {
  const [isOpen, setIsOpen] = useState(false);
  const [theme, setTheme] = useState<ThemeConfig>(defaultTheme);
  const [activeCategory, setActiveCategory] = useState<
    'all' | ThemeVariable['category']
  >('all');
  const [editingVar, setEditingVar] = useState<string | null>(null);

  useEffect(() => {
    // Load theme from localStorage
    const savedTheme = localStorage.getItem('theme-editor-config');
    if (savedTheme) {
      try {
        setTheme(JSON.parse(savedTheme));
      } catch (e) {
        console.error('Failed to parse saved theme', e);
      }
    }
  }, []);

  const handleVariableChange = (name: string, value: string) => {
    const updatedVariables = theme.variables.map((v) =>
      v.name === name ? { ...v, value } : v
    );
    const updatedTheme = { ...theme, variables: updatedVariables };
    setTheme(updatedTheme);

    // Apply to document immediately
    document.documentElement.style.setProperty(name, value);

    // Save to localStorage
    localStorage.setItem('theme-editor-config', JSON.stringify(updatedTheme));
  };

  const handleReset = () => {
    setTheme(defaultTheme);
    localStorage.removeItem('theme-editor-config');

    // Reset all CSS variables
    defaultTheme.variables.forEach((v) => {
      document.documentElement.style.setProperty(v.name, v.value);
    });
  };

  const handleExport = () => {
    const css = `/* ${theme.name} Theme */

@plugin "daisyui/theme" {
  name: "${theme.name}";
  prefersdark: true;
  color-scheme: dark;

${theme.variables
  .map((v) => `  ${v.name}: ${v.value}; /* ${v.description} */`)
  .join('\n')}
}
`;

    // Copy to clipboard
    navigator.clipboard.writeText(css);
    alert('Theme CSS copied to clipboard!');
  };

  const filteredVariables =
    activeCategory === 'all'
      ? theme.variables
      : theme.variables.filter((v) => v.category === activeCategory);

  const categories = [
    { id: 'all' as const, name: 'All', icon: '🎨' },
    { id: 'base' as const, name: 'Base', icon: '🖼️' },
    { id: 'action' as const, name: 'Actions', icon: '⚡' },
    { id: 'semantic' as const, name: 'Semantic', icon: '🚦' },
    { id: 'geometry' as const, name: 'Geometry', icon: '📐' },
    { id: 'effects' as const, name: 'Effects', icon: '✨' },
  ];

  return (
    <div className="fixed bottom-6 left-6 z-50">
      {/* Toggle Button */}
      <motion.button
        onClick={() => setIsOpen(!isOpen)}
        className="btn btn-circle btn-lg bg-accent text-accent-content border-accent shadow-xl hover:scale-105"
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        title="Theme Editor"
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
            d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4"
          />
        </svg>
      </motion.button>

      {/* Editor Panel */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, x: -20, scale: 0.9 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: -20, scale: 0.9 }}
            transition={{ duration: 0.2 }}
            className="absolute bottom-20 left-0 w-[48rem] bg-base-200 border border-base-300 rounded-2xl shadow-2xl"
          >
            {/* Header */}
            <div className="flex justify-between items-center p-6 border-b border-base-300">
              <div>
                <h3 className="text-xl font-bold flex items-center gap-2">
                  🎨 Theme Editor
                </h3>
                <p className="text-sm text-base-content/60">
                  Edit and preview theme variables in real-time
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleExport}
                  className="btn btn-sm btn-accent"
                  title="Export theme CSS"
                >
                  📋 Export
                </button>
                <button
                  onClick={handleReset}
                  className="btn btn-sm btn-warning"
                  title="Reset to default"
                >
                  ↺ Reset
                </button>
                <button
                  onClick={() => setIsOpen(false)}
                  className="btn btn-sm btn-ghost btn-circle"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Category Tabs */}
            <div className="flex gap-2 p-4 border-b border-base-300 overflow-x-auto">
              {categories.map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => setActiveCategory(cat.id)}
                  className={`btn btn-sm ${
                    activeCategory === cat.id ? 'btn-primary' : 'btn-ghost'
                  }`}
                >
                  {cat.icon} {cat.name}
                </button>
              ))}
            </div>

            {/* Variables List */}
            <div className="p-6 space-y-4 max-h-96 overflow-y-auto">
              {filteredVariables.map((variable) => (
                <div
                  key={variable.name}
                  className="bg-base-100 p-4 rounded-xl border border-base-300"
                >
                  <div className="flex items-start justify-between gap-4">
                    {/* Variable Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <code className="text-sm font-mono text-primary">
                          {variable.name}
                        </code>
                        {variable.category === 'action' && (
                          <span className="badge badge-sm badge-primary">
                            Action
                          </span>
                        )}
                        {variable.category === 'semantic' && (
                          <span className="badge badge-sm badge-secondary">
                            Semantic
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-base-content/60 mb-2">
                        {variable.description}
                      </p>

                      {/* Value Input */}
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={variable.value}
                          onChange={(e) =>
                            handleVariableChange(variable.name, e.target.value)
                          }
                          onFocus={() => setEditingVar(variable.name)}
                          onBlur={() => setEditingVar(null)}
                          className={`input input-sm input-bordered flex-1 font-mono text-xs ${
                            editingVar === variable.name ? 'input-accent' : ''
                          }`}
                          placeholder="oklch(L% C H)"
                        />

                        {/* Color Preview (only for color variables) */}
                        {variable.name.includes('color') && (
                          <div
                            className="w-10 h-10 rounded-lg shadow-sm border-2 border-base-300 shrink-0"
                            style={{ backgroundColor: variable.value }}
                            title={variable.value}
                          />
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Preview Section */}
            <div className="p-6 border-t border-base-300 bg-base-100">
              <h4 className="text-sm font-bold mb-3">Live Preview</h4>
              <div className="flex flex-wrap gap-2">
                <button className="btn btn-primary btn-sm">Primary</button>
                <button className="btn btn-secondary btn-sm">Secondary</button>
                <button className="btn btn-accent btn-sm">Accent</button>
                <button className="btn btn-neutral btn-sm">Neutral</button>
                <button className="btn btn-info btn-sm">Info</button>
                <button className="btn btn-success btn-sm">Success</button>
                <button className="btn btn-warning btn-sm">Warning</button>
                <button className="btn btn-error btn-sm">Error</button>
              </div>

              <div className="mt-3 flex gap-2">
                <div className="alert alert-info py-2 flex-1">
                  <span className="text-xs">ℹ️ Info alert</span>
                </div>
                <div className="alert alert-success py-2 flex-1">
                  <span className="text-xs">✓ Success</span>
                </div>
                <div className="alert alert-warning py-2 flex-1">
                  <span className="text-xs">⚠ Warning</span>
                </div>
                <div className="alert alert-error py-2 flex-1">
                  <span className="text-xs">✕ Error</span>
                </div>
              </div>
            </div>

            {/* Footer Info */}
            <div className="p-4 border-t border-base-300 bg-base-200">
              <div className="text-xs text-base-content/50 space-y-1">
                <p>
                  💡 Changes are saved to localStorage and applied immediately
                </p>
                <p>📋 Use Export to copy the theme CSS to your clipboard</p>
                <p>
                  🎨 OKLCH format: oklch(Lightness% Chroma Hue) - e.g.,
                  oklch(70% 0.12 240)
                </p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
