import { useState, useEffect } from 'react';
import { Icon } from '@/components/atoms/Icon';
import { Button } from '@/components/atoms/Button';

/**
 * Floating Theme Configurator
 *
 * A draggable, collapsible overlay that allows real-time theme editing
 * on top of the actual application UI. No sample components - just pure
 * variable editing with live preview on the real interface.
 */

// Helper functions for OKLCH <-> Hex conversion
function oklchToHex(oklch: string): string {
  // Parse oklch(L% C H) format
  const match = oklch.match(/oklch\(([\d.]+%?)\s+([\d.]+)\s+([\d.]+)\)/);
  if (!match) return '#000000';

  let l = parseFloat(match[1]);
  const c = parseFloat(match[2]);
  const h = parseFloat(match[3]);

  // Convert percentage to decimal if needed
  if (match[1].includes('%')) {
    l = l / 100;
  }

  // Convert OKLCH to sRGB via Lab
  // This is a simplified conversion - in production you'd use a proper color library
  const a = c * Math.cos((h * Math.PI) / 180);
  const b = c * Math.sin((h * Math.PI) / 180);

  // OKLCH L is already in the right range (0-1)
  // Convert to XYZ
  const fy = (l + 0.16) / 1.16;
  const fx = fy + a / 5;
  const fz = fy - b / 2;

  const xn = 0.9505;
  const yn = 1.0;
  const zn = 1.089;

  const fx3 = fx ** 3;
  const fy3 = fy ** 3;
  const fz3 = fz ** 3;

  const x = xn * (fx3 > 0.008856 ? fx3 : (fx - 16 / 116) / 7.787);
  const y = yn * (fy3 > 0.008856 ? fy3 : (fy - 16 / 116) / 7.787);
  const z = zn * (fz3 > 0.008856 ? fz3 : (fz - 16 / 116) / 7.787);

  // XYZ to sRGB
  let r = x * 3.2406 + y * -1.5372 + z * -0.4986;
  let g = x * -0.9689 + y * 1.8758 + z * 0.0415;
  let bl = x * 0.0557 + y * -0.204 + z * 1.057;

  // Apply gamma correction
  r = r > 0.0031308 ? 1.055 * r ** (1 / 2.4) - 0.055 : 12.92 * r;
  g = g > 0.0031308 ? 1.055 * g ** (1 / 2.4) - 0.055 : 12.92 * g;
  bl = bl > 0.0031308 ? 1.055 * bl ** (1 / 2.4) - 0.055 : 12.92 * bl;

  // Clamp and convert to hex
  r = Math.max(0, Math.min(255, Math.round(r * 255)));
  g = Math.max(0, Math.min(255, Math.round(g * 255)));
  bl = Math.max(0, Math.min(255, Math.round(bl * 255)));

  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${bl.toString(16).padStart(2, '0')}`;
}

function hexToOklch(hex: string): string {
  // Parse hex color
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;

  // sRGB to linear RGB
  const rLin = r > 0.04045 ? ((r + 0.055) / 1.055) ** 2.4 : r / 12.92;
  const gLin = g > 0.04045 ? ((g + 0.055) / 1.055) ** 2.4 : g / 12.92;
  const bLin = b > 0.04045 ? ((b + 0.055) / 1.055) ** 2.4 : b / 12.92;

  // Linear RGB to XYZ
  const x = rLin * 0.4124 + gLin * 0.3576 + bLin * 0.1805;
  const y = rLin * 0.2126 + gLin * 0.7152 + bLin * 0.0722;
  const z = rLin * 0.0193 + gLin * 0.1192 + bLin * 0.9505;

  // XYZ to Lab
  const xn = 0.9505;
  const yn = 1.0;
  const zn = 1.089;

  const fx = x / xn > 0.008856 ? (x / xn) ** (1 / 3) : 7.787 * (x / xn) + 16 / 116;
  const fy = y / yn > 0.008856 ? (y / yn) ** (1 / 3) : 7.787 * (y / yn) + 16 / 116;
  const fz = z / zn > 0.008856 ? (z / zn) ** (1 / 3) : 7.787 * (z / zn) + 16 / 116;

  // Convert to OKLCH
  const l = 1.16 * fy - 0.16;
  const a = 5 * (fx - fy);
  const bVal = 2 * (fy - fz);

  const c = Math.sqrt(a * a + bVal * bVal);
  let h = (Math.atan2(bVal, a) * 180) / Math.PI;
  if (h < 0) h += 360;

  // Format as oklch() with 2 decimal places
  return `oklch(${(l * 100).toFixed(0)}% ${c.toFixed(2)} ${h.toFixed(0)})`;
}

interface ThemeVariable {
  name: string;
  value: string;
  category: 'base' | 'action' | 'semantic' | 'geometry' | 'effect';
  description: string;
}

const THEME_VARIABLES: ThemeVariable[] = [
  // Base colors (4 required variables)
  {
    name: '--color-base-100',
    value: 'oklch(15% 0 0)',
    category: 'base',
    description: 'Base surface color of page',
  },
  {
    name: '--color-base-200',
    value: 'oklch(25% 0 0)',
    category: 'base',
    description: 'Base darker shade for elevation',
  },
  {
    name: '--color-base-300',
    value: 'oklch(35% 0 0)',
    category: 'base',
    description: 'Base even darker for elevation',
  },
  {
    name: '--color-base-content',
    value: 'oklch(85% 0 0)',
    category: 'base',
    description: 'Foreground content on base',
  },

  // Action colors (8 required variables)
  {
    name: '--color-primary',
    value: 'oklch(70% 0.02 240)',
    category: 'action',
    description: 'Primary action',
  },
  {
    name: '--color-primary-content',
    value: 'oklch(15% 0 0)',
    category: 'action',
    description: 'Foreground on primary',
  },
  {
    name: '--color-secondary',
    value: 'oklch(50% 0.02 60)',
    category: 'action',
    description: 'Secondary brand color',
  },
  {
    name: '--color-secondary-content',
    value: 'oklch(95% 0 0)',
    category: 'action',
    description: 'Foreground on secondary',
  },
  {
    name: '--color-accent',
    value: 'oklch(65% 0.15 75)',
    category: 'action',
    description: 'Accent brand color',
  },
  {
    name: '--color-accent-content',
    value: 'oklch(15% 0 0)',
    category: 'action',
    description: 'Foreground on accent',
  },
  {
    name: '--color-neutral',
    value: 'oklch(28% 0 0)',
    category: 'action',
    description: 'Neutral dark color',
  },
  {
    name: '--color-neutral-content',
    value: 'oklch(85% 0 0)',
    category: 'action',
    description: 'Foreground on neutral',
  },

  // Semantic colors (8 required variables)
  {
    name: '--color-info',
    value: 'oklch(65% 0.12 230)',
    category: 'semantic',
    description: 'Info color',
  },
  {
    name: '--color-info-content',
    value: 'oklch(15% 0 0)',
    category: 'semantic',
    description: 'Foreground on info',
  },
  {
    name: '--color-success',
    value: 'oklch(60% 0.12 145)',
    category: 'semantic',
    description: 'Success color',
  },
  {
    name: '--color-success-content',
    value: 'oklch(15% 0 0)',
    category: 'semantic',
    description: 'Foreground on success',
  },
  {
    name: '--color-warning',
    value: 'oklch(75% 0.15 65)',
    category: 'semantic',
    description: 'Warning color',
  },
  {
    name: '--color-warning-content',
    value: 'oklch(15% 0 0)',
    category: 'semantic',
    description: 'Foreground on warning',
  },
  {
    name: '--color-error',
    value: 'oklch(58% 0.18 20)',
    category: 'semantic',
    description: 'Error color',
  },
  {
    name: '--color-error-content',
    value: 'oklch(95% 0 0)',
    category: 'semantic',
    description: 'Foreground on error',
  },

  // Geometry (5 required variables - daisyUI 5 format)
  {
    name: '--radius-selector',
    value: '0.25rem',
    category: 'geometry',
    description: 'Border radius of selectors (checkbox, toggle, badge)',
  },
  {
    name: '--radius-field',
    value: '0.25rem',
    category: 'geometry',
    description: 'Border radius of fields (button, input, select, tab)',
  },
  {
    name: '--radius-box',
    value: '0.375rem',
    category: 'geometry',
    description: 'Border radius of boxes (card, modal, alert)',
  },
  {
    name: '--size-selector',
    value: '0.25rem',
    category: 'geometry',
    description: 'Base size of selectors (must be 0.25rem)',
  },
  {
    name: '--size-field',
    value: '0.25rem',
    category: 'geometry',
    description: 'Base size of fields (must be 0.25rem)',
  },

  // Effects (3 required variables - daisyUI 5 format)
  {
    name: '--border',
    value: '1px',
    category: 'effect',
    description: 'Border size (must be 1px)',
  },
  {
    name: '--depth',
    value: '0.5',
    category: 'effect',
    description: 'Shadow and 3D depth effect (0 or 1)',
  },
  {
    name: '--noise',
    value: '0',
    category: 'effect',
    description: 'Noise grain effect (0 or 1)',
  },
];

export function FloatingThemeConfigurator() {
  const [isOpen, setIsOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [variables, setVariables] = useState<Record<string, string>>({});
  const [activeCategory, setActiveCategory] = useState<
    'all' | 'base' | 'action' | 'semantic' | 'geometry' | 'effect'
  >('all');
  const [position, setPosition] = useState({ x: 20, y: 100 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [hoverMode, setHoverMode] = useState(false);
  const [hoveredElement, setHoveredElement] = useState<{
    element: HTMLElement;
    variables: string[];
  } | null>(null);

  // Load saved theme or defaults
  useEffect(() => {
    const saved = localStorage.getItem('theme-configurator-values');
    if (saved) {
      try {
        setVariables(JSON.parse(saved));
      } catch {
        initializeDefaults();
      }
    } else {
      initializeDefaults();
    }
  }, []);

  const initializeDefaults = () => {
    const defaults: Record<string, string> = {};
    THEME_VARIABLES.forEach((v) => {
      defaults[v.name] = v.value;
    });
    setVariables(defaults);
  };

  // Apply theme variables to document
  useEffect(() => {
    const root = document.documentElement;
    Object.entries(variables).forEach(([name, value]) => {
      root.style.setProperty(name, value);
    });
  }, [variables]);

  const updateVariable = (name: string, value: string) => {
    const updated = { ...variables, [name]: value };
    setVariables(updated);
    localStorage.setItem('theme-configurator-values', JSON.stringify(updated));
  };

  const resetToDefaults = () => {
    if (confirm('Reset all theme variables to defaults?')) {
      initializeDefaults();
      localStorage.removeItem('theme-configurator-values');
    }
  };

  const exportCSS = () => {
    const css = Object.entries(variables)
      .map(([name, value]) => `  ${name}: ${value};`)
      .join('\n');

    const fullCSS = `[data-theme="asteroid-belt"] {\n${css}\n}`;

    navigator.clipboard.writeText(fullCSS);
    alert('CSS copied to clipboard!');
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('.configurator-content')) return;
    setIsDragging(true);
    setDragOffset({
      x: e.clientX - position.x,
      y: e.clientY - position.y,
    });
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      setPosition({
        x: e.clientX - dragOffset.x,
        y: e.clientY - dragOffset.y,
      });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, dragOffset]);

  // Hover mode: detect CSS variables used by hovered elements
  useEffect(() => {
    if (!hoverMode || !isOpen) {
      setHoveredElement(null);
      return;
    }

    const handleHover = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      
      // Skip if hovering over configurator itself
      if (target.closest('.theme-configurator-panel')) {
        setHoveredElement(null);
        return;
      }
      
      const usedVars: Set<string> = new Set();
      
      // Strategy: Check all CSS custom properties defined on the element and ancestors
      // These are the variables that could be affecting the element's appearance
      let currentElement: HTMLElement | null = target;
      
      // Walk up the DOM tree to collect all custom properties
      while (currentElement) {
        const computedStyle = window.getComputedStyle(currentElement);
        
        // Get all custom properties (CSS variables) from computed style
        // This includes properties from :root and inherited values
        for (let i = 0; i < computedStyle.length; i++) {
          const propName = computedStyle[i];
          if (propName.startsWith('--')) {
            // Only include variables that are in our THEME_VARIABLES list
            if (THEME_VARIABLES.some((v) => v.name === propName)) {
              usedVars.add(propName);
            }
          }
        }
        
        // Only check up to documentElement (html), not beyond
        if (currentElement === document.documentElement) break;
        currentElement = currentElement.parentElement;
      }
      
      // Also check the actual CSS rules that apply to this element
      // by inspecting matching stylesheets
      try {
        const sheets = Array.from(document.styleSheets);
        sheets.forEach((sheet) => {
          try {
            const rules = Array.from(sheet.cssRules || []);
            rules.forEach((rule) => {
              if (rule instanceof CSSStyleRule) {
                // Check if this rule applies to the target element
                if (target.matches(rule.selectorText)) {
                  const style = rule.style;
                  // Check all properties in this rule for var() usage
                  for (let i = 0; i < style.length; i++) {
                    const value = style.getPropertyValue(style[i]);
                    if (value) {
                      const varMatches = value.match(/var\((--[\w-]+)/g);
                      if (varMatches) {
                        varMatches.forEach((match) => {
                          const varName = match.replace('var(', '');
                          if (THEME_VARIABLES.some((v) => v.name === varName)) {
                            usedVars.add(varName);
                          }
                        });
                      }
                    }
                  }
                }
              }
            });
          } catch (e) {
            // Cross-origin stylesheet - skip
          }
        });
      } catch (e) {
        console.warn('Error inspecting stylesheets:', e);
      }
      
      // Update state only if variables changed or element changed
      const varsArray = Array.from(usedVars).sort();
      
      if (varsArray.length > 0) {
        setHoveredElement((prev) => {
          // Only update if different element or different variables
          if (!prev || prev.element !== target || 
              prev.variables.length !== varsArray.length ||
              !prev.variables.every((v, i) => varsArray[i] === v)) {
            console.log('Detected variables for', target.tagName, target.className, ':', varsArray);
            return { element: target, variables: varsArray };
          }
          return prev;
        });
      } else {
        setHoveredElement(null);
      }
    };

    document.addEventListener('mousemove', handleHover);
    
    return () => {
      document.removeEventListener('mousemove', handleHover);
    };
  }, [hoverMode, isOpen]);

  const filteredVariables = THEME_VARIABLES.filter(
    (v) => activeCategory === 'all' || v.category === activeCategory
  );

  // Floating toggle button
  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-[15rem] btn btn-primary btn-circle btn-lg shadow-xl z-[9999] hover:scale-110 transition-transform"
        title="Open Theme Configurator"
      >
        <Icon icon="lucide--palette" className="size-6" />
      </button>
    );
  }

  return (
    <div
      className="fixed z-[9998] bg-base-100 rounded-lg shadow-2xl border border-base-300 theme-configurator-panel"
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
        width: isCollapsed ? '320px' : '680px',
        maxHeight: '80vh',
        userSelect: isDragging ? 'none' : 'auto',
      }}
      onMouseDown={handleMouseDown}
    >
      {/* Header - Draggable */}
      <div className="flex items-center justify-between p-4 border-b border-base-300 cursor-move bg-base-200 rounded-t-lg theme-configurator-panel">
        <div className="flex items-center gap-2">
          <Icon icon="lucide--palette" className="size-5" />
          <h3 className="font-bold text-sm">Theme Configurator</h3>
          {hoverMode && (
            <span className="badge badge-primary badge-sm">Hover Mode</span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            className={`btn btn-xs ${hoverMode ? 'btn-primary' : 'btn-ghost'} btn-square`}
            onClick={() => {
              setHoverMode(!hoverMode);
              setHoveredElement(null);
            }}
            title={hoverMode ? 'Disable Hover Mode' : 'Enable Hover Mode'}
          >
            <Icon icon="lucide--scan" className="size-4" />
          </button>
          <button
            className="btn btn-xs btn-ghost btn-square"
            onClick={() => setIsCollapsed(!isCollapsed)}
            title={isCollapsed ? 'Expand' : 'Collapse'}
          >
            <Icon
              icon={isCollapsed ? 'lucide--chevron-down' : 'lucide--chevron-up'}
              className="size-4"
            />
          </button>
          <button
            className="btn btn-xs btn-ghost btn-square"
            onClick={() => setIsOpen(false)}
            title="Close"
          >
            <Icon icon="lucide--x" className="size-4" />
          </button>
        </div>
      </div>

      {/* Content */}
      {!isCollapsed && (
        <div
          className="configurator-content overflow-hidden flex flex-col"
          style={{ maxHeight: 'calc(80vh - 60px)' }}
        >
          {/* Category Tabs */}
          <div className="flex gap-2 p-3 border-b border-base-300 overflow-x-auto overflow-y-hidden bg-base-200 flex-shrink-0">
            {(
              [
                'all',
                'base',
                'action',
                'semantic',
                'geometry',
                'effect',
              ] as const
            ).map((cat) => (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className={`px-4 py-2.5 text-sm font-semibold rounded-md whitespace-nowrap transition-colors flex-shrink-0 inline-flex items-center ${
                  activeCategory === cat
                    ? 'bg-primary text-primary-content shadow-sm'
                    : 'bg-base-100 text-base-content hover:bg-base-300'
                }`}
              >
                {cat.charAt(0).toUpperCase() + cat.slice(1)}
              </button>
            ))}
          </div>

          {/* Hover Info Display */}
          {hoverMode && hoveredElement && (
            <div className="p-3 bg-primary/10 border-t border-primary/20 theme-configurator-panel">
              <div className="text-xs font-semibold text-primary mb-1">
                Hovering: {hoveredElement.element.tagName.toLowerCase()}
                {hoveredElement.element.className && ` .${hoveredElement.element.className.split(' ')[0]}`}
              </div>
              <div className="text-xs text-base-content/70">
                <span className="font-semibold">Using variables:</span>
                <div className="flex flex-wrap gap-1 mt-1">
                  {hoveredElement.variables.map((varName) => (
                    <span
                      key={varName}
                      className="badge badge-sm badge-primary font-mono"
                    >
                      {varName.replace('--color-', '').replace('--', '')}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Variables List */}
          <div className="overflow-y-auto flex-1 p-4 space-y-2">
            {filteredVariables.map((variable) => {
              const isColor = variable.name.includes('color');
              const currentValue = variables[variable.name] || variable.value;
              
              return (
                <div
                  key={variable.name}
                  className="grid grid-cols-[140px_1fr] gap-3 items-center py-2 px-2 rounded hover:bg-base-200"
                  title={variable.description}
                >
                  {/* Column 1: Variable Name */}
                  <label className="text-xs font-mono text-base-content/70 truncate">
                    {variable.name.replace('--color-', '').replace('--', '')}
                  </label>

                  {/* Column 2: Input + Color Preview + Reset */}
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={currentValue}
                      onChange={(e) =>
                        updateVariable(variable.name, e.target.value)
                      }
                      className="input input-bordered input-xs flex-1 font-mono text-xs"
                      placeholder={variable.value}
                    />
                    {isColor && (
                      <>
                        <div className="relative">
                          <input
                            type="color"
                            value={
                              currentValue.startsWith('#')
                                ? currentValue
                                : currentValue.startsWith('oklch')
                                ? oklchToHex(currentValue)
                                : '#000000'
                            }
                            onChange={(e) => {
                              // Convert hex back to OKLCH format
                              const oklchValue = hexToOklch(e.target.value);
                              updateVariable(variable.name, oklchValue);
                            }}
                            className="absolute inset-0 w-8 h-8 opacity-0 cursor-pointer"
                            title="Click to pick color (converts to OKLCH)"
                          />
                          <div
                            className="w-8 h-8 rounded border-2 border-base-300 cursor-pointer hover:border-primary transition-colors"
                            style={{
                              backgroundColor: currentValue,
                            }}
                          />
                        </div>
                        {currentValue !== variable.value && (
                          <button
                            onClick={() => updateVariable(variable.name, variable.value)}
                            className="btn btn-xs btn-ghost btn-square"
                            title="Reset to default"
                          >
                            <Icon icon="lucide--rotate-ccw" className="size-3" />
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Actions */}
          <div className="p-4 border-t border-base-300 flex gap-2 theme-configurator-panel">
            <button
              className="btn btn-xs btn-outline gap-1"
              onClick={resetToDefaults}
            >
              <Icon icon="lucide--rotate-ccw" className="size-3" />
              Reset
            </button>
            <button
              className="btn btn-xs btn-primary gap-1"
              onClick={exportCSS}
            >
              <Icon icon="lucide--copy" className="size-3" />
              Copy CSS
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
