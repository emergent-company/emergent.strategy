import { useState, useEffect } from 'react';
import { Icon } from '@/components/atoms/Icon';
import { Button } from '@/components/atoms/Button';
import { useSwitcherPanel } from '@/contexts/switcher-panel';

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

  return `#${r.toString(16).padStart(2, '0')}${g
    .toString(16)
    .padStart(2, '0')}${bl.toString(16).padStart(2, '0')}`;
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

  const fx =
    x / xn > 0.008856 ? (x / xn) ** (1 / 3) : 7.787 * (x / xn) + 16 / 116;
  const fy =
    y / yn > 0.008856 ? (y / yn) ** (1 / 3) : 7.787 * (y / yn) + 16 / 116;
  const fz =
    z / zn > 0.008856 ? (z / zn) ** (1 / 3) : 7.787 * (z / zn) + 16 / 116;

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

interface ThemeConfig {
  name: string;
  default: boolean;
  prefersdark: boolean;
  colorScheme: 'light' | 'dark';
}

/**
 * Parse DaisyUI theme wizard CSS format
 * Example input:
 * @plugin "daisyui/theme" {
 *   name: "my-theme";
 *   prefersdark: true;
 *   color-scheme: "dark";
 *   --color-base-100: oklch(15% 0 0);
 *   ...
 * }
 */
function parseThemeWizardCSS(css: string): {
  config: Partial<ThemeConfig>;
  variables: Record<string, string>;
} | null {
  // Match the @plugin "daisyui/theme" { ... } block
  const pluginMatch = css.match(/@plugin\s+"daisyui\/theme"\s*\{([^}]+)\}/s);
  if (!pluginMatch) {
    // Try alternative format without quotes
    const altMatch = css.match(/@plugin\s+'daisyui\/theme'\s*\{([^}]+)\}/s);
    if (!altMatch) return null;
    return parseThemeContent(altMatch[1]);
  }
  return parseThemeContent(pluginMatch[1]);
}

function parseThemeContent(content: string): {
  config: Partial<ThemeConfig>;
  variables: Record<string, string>;
} {
  const config: Partial<ThemeConfig> = {};
  const variables: Record<string, string> = {};

  // Split by lines and parse each property
  const lines = content.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('//')) continue;

    // Match property: value; format
    const match = trimmed.match(/^([\w-]+):\s*(.+?);?\s*$/);
    if (!match) continue;

    const [, key, rawValue] = match;
    // Remove quotes from value if present
    const value = rawValue.replace(/^["']|["']$/g, '').trim();

    // Handle config properties
    switch (key) {
      case 'name':
        config.name = value;
        break;
      case 'default':
        config.default = value === 'true';
        break;
      case 'prefersdark':
        config.prefersdark = value === 'true';
        break;
      case 'color-scheme':
        config.colorScheme = value as 'light' | 'dark';
        break;
      default:
        // Handle CSS variables (--color-*, --radius-*, etc.)
        if (key.startsWith('--')) {
          variables[key] = value;
        }
        break;
    }
  }

  return { config, variables };
}

type EditingMode = 'dark' | 'light';

export function FloatingThemeConfigurator() {
  const { openPanel, togglePanel } = useSwitcherPanel();
  const isOpen = openPanel === 'theme-config';
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
  const [themeConfig, setThemeConfig] = useState<ThemeConfig>({
    name: 'space-asteroid-belt',
    default: false,
    prefersdark: true,
    colorScheme: 'dark',
  });
  const [showImportModal, setShowImportModal] = useState(false);
  const [importText, setImportText] = useState('');
  const [editingMode, setEditingMode] = useState<EditingMode>('dark');
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  // Theme file paths for reference
  const themeFiles = {
    dark: 'src/styles/themes/space-asteroid-belt.css',
    light: 'src/styles/themes/space-asteroid-belt-light.css',
  };

  // Load current theme values from computed styles
  const loadFromCurrentTheme = () => {
    const root = document.documentElement;
    const computedStyle = getComputedStyle(root);
    const loadedVars: Record<string, string> = {};

    THEME_VARIABLES.forEach((v) => {
      const value = computedStyle.getPropertyValue(v.name).trim();
      if (value) {
        loadedVars[v.name] = value;
      }
    });

    setVariables(loadedVars);
    setHasUnsavedChanges(false);

    // Update config based on current mode
    const currentTheme = root.getAttribute('data-theme') || '';
    const isDark = !currentTheme.includes('-light');
    setThemeConfig((prev) => ({
      ...prev,
      name: isDark ? 'space-asteroid-belt' : 'space-asteroid-belt-light',
      prefersdark: isDark,
      colorScheme: isDark ? 'dark' : 'light',
    }));
    setEditingMode(isDark ? 'dark' : 'light');
  };

  // Switch between editing dark/light variants
  const switchEditingMode = (mode: EditingMode) => {
    if (hasUnsavedChanges) {
      if (
        !confirm(
          'You have unsaved changes. Switch anyway? (Changes will be lost)'
        )
      ) {
        return;
      }
    }

    // Clear inline styles first
    const root = document.documentElement;
    THEME_VARIABLES.forEach((v) => {
      root.style.removeProperty(v.name);
    });

    // Switch the actual theme
    if (mode === 'dark') {
      root.setAttribute('data-theme', 'space-asteroid-belt');
      setThemeConfig({
        name: 'space-asteroid-belt',
        default: false,
        prefersdark: true,
        colorScheme: 'dark',
      });
    } else {
      root.setAttribute('data-theme', 'space-asteroid-belt-light');
      setThemeConfig({
        name: 'space-asteroid-belt-light',
        default: false,
        prefersdark: false,
        colorScheme: 'light',
      });
    }

    setEditingMode(mode);
    setVariables({});
    setHasUnsavedChanges(false);

    // Load values from the new theme after a brief delay
    setTimeout(loadFromCurrentTheme, 50);
  };

  // Load saved theme on mount (only if user was previously editing)
  useEffect(() => {
    const saved = localStorage.getItem('theme-configurator-values');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed.mode && parsed.variables) {
          setEditingMode(parsed.mode);
          setVariables(parsed.variables);
          setHasUnsavedChanges(false);
        }
      } catch {
        // On parse error, don't apply anything
        setVariables({});
      }
    }
  }, []);

  // Apply theme variables to document when editing
  useEffect(() => {
    if (Object.keys(variables).length === 0) return;

    const root = document.documentElement;
    Object.entries(variables).forEach(([name, value]) => {
      root.style.setProperty(name, value);
    });
  }, [variables]);

  const updateVariable = (name: string, value: string) => {
    const updated = { ...variables, [name]: value };
    setVariables(updated);
    setHasUnsavedChanges(true);
    // Save editing state
    localStorage.setItem(
      'theme-configurator-values',
      JSON.stringify({ mode: editingMode, variables: updated })
    );
  };

  const resetToDefaults = () => {
    if (confirm('Discard changes and reload from CSS theme?')) {
      // Clear inline styles
      const root = document.documentElement;
      THEME_VARIABLES.forEach((v) => {
        root.style.removeProperty(v.name);
      });
      setVariables({});
      setHasUnsavedChanges(false);
      localStorage.removeItem('theme-configurator-values');
      // Reload from current theme
      setTimeout(loadFromCurrentTheme, 50);
    }
  };

  const exportCSS = () => {
    // Build the @plugin "daisyui/theme" format with helpful comment
    const lines: string[] = [];
    const themeDescription =
      editingMode === 'dark'
        ? 'A monochromatic grey theme with a metallic accent.\n   Stark, minimal, and industrial.'
        : 'A monochromatic light grey theme with a metallic accent.\n   Clean, minimal, and industrial.';

    lines.push(
      `/* ${themeConfig.name
        .replace('space-', '')
        .replace(/-/g, ' ')
        .replace(/\b\w/g, (c) => c.toUpperCase())} Theme`
    );
    lines.push(`   ${themeDescription} */`);
    lines.push('');
    lines.push('@plugin "daisyui/theme" {');
    lines.push(`  name: '${themeConfig.name}';`);
    lines.push(`  prefersdark: ${themeConfig.prefersdark};`);
    lines.push(`  color-scheme: ${themeConfig.colorScheme};`);
    lines.push('');

    // Add base colors with comments
    lines.push('  /* Base colors */');
    const baseVars = THEME_VARIABLES.filter((v) => v.category === 'base');
    baseVars.forEach((v) => {
      const value = variables[v.name] || v.value;
      lines.push(`  ${v.name}: ${value};`);
    });
    lines.push('');

    // Add action colors
    lines.push('  /* Action colors */');
    const actionVars = THEME_VARIABLES.filter((v) => v.category === 'action');
    actionVars.forEach((v) => {
      const value = variables[v.name] || v.value;
      lines.push(`  ${v.name}: ${value};`);
    });
    lines.push('');

    // Add semantic colors
    lines.push('  /* Semantic colors */');
    const semanticVars = THEME_VARIABLES.filter(
      (v) => v.category === 'semantic'
    );
    semanticVars.forEach((v) => {
      const value = variables[v.name] || v.value;
      lines.push(`  ${v.name}: ${value};`);
    });
    lines.push('');

    // Add geometry variables
    lines.push('  /* Geometry */');
    const geometryVars = THEME_VARIABLES.filter(
      (v) => v.category === 'geometry'
    );
    geometryVars.forEach((v) => {
      const value = variables[v.name] || v.value;
      lines.push(`  ${v.name}: ${value};`);
    });
    lines.push('');

    // Add effect variables
    lines.push('  /* Effects */');
    const effectVars = THEME_VARIABLES.filter((v) => v.category === 'effect');
    effectVars.forEach((v) => {
      const value = variables[v.name] || v.value;
      lines.push(`  ${v.name}: ${value};`);
    });

    lines.push('}');

    const fullCSS = lines.join('\n');

    navigator.clipboard.writeText(fullCSS);
    alert(`CSS copied! Paste into:\n${themeFiles[editingMode]}`);
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
          if (
            !prev ||
            prev.element !== target ||
            prev.variables.length !== varsArray.length ||
            !prev.variables.every((v, i) => varsArray[i] === v)
          ) {
            console.log(
              'Detected variables for',
              target.tagName,
              target.className,
              ':',
              varsArray
            );
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
        onClick={() => togglePanel('theme-config')}
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
          {hasUnsavedChanges && (
            <span className="badge badge-warning badge-sm">Unsaved</span>
          )}
          {hoverMode && (
            <span className="badge badge-primary badge-sm">Hover Mode</span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            className={`btn btn-xs ${
              hoverMode ? 'btn-primary' : 'btn-ghost'
            } btn-square`}
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
            onClick={() => togglePanel(null)}
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
          {/* Mode Toggle + File Path */}
          <div className="p-3 border-b border-base-300 bg-base-200/50 flex-shrink-0">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-base-content/70">
                  Editing:
                </span>
                <div className="join">
                  <button
                    className={`join-item btn btn-xs ${
                      editingMode === 'dark' ? 'btn-primary' : 'btn-ghost'
                    }`}
                    onClick={() => switchEditingMode('dark')}
                  >
                    <Icon icon="lucide--moon" className="size-3" />
                    Dark
                  </button>
                  <button
                    className={`join-item btn btn-xs ${
                      editingMode === 'light' ? 'btn-primary' : 'btn-ghost'
                    }`}
                    onClick={() => switchEditingMode('light')}
                  >
                    <Icon icon="lucide--sun" className="size-3" />
                    Light
                  </button>
                </div>
              </div>
              <button
                className="btn btn-xs btn-ghost gap-1"
                onClick={loadFromCurrentTheme}
                title="Load current CSS theme values"
              >
                <Icon icon="lucide--refresh-cw" className="size-3" />
                Load CSS
              </button>
            </div>
            <div className="mt-2 text-xs text-base-content/50 font-mono truncate">
              {themeFiles[editingMode]}
            </div>
          </div>

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
                {hoveredElement.element.className &&
                  ` .${hoveredElement.element.className.split(' ')[0]}`}
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
                            onClick={() =>
                              updateVariable(variable.name, variable.value)
                            }
                            className="btn btn-xs btn-ghost btn-square"
                            title="Reset to default"
                          >
                            <Icon
                              icon="lucide--rotate-ccw"
                              className="size-3"
                            />
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Export Section */}
          <div className="p-3 border-t border-base-300 bg-base-200/50 theme-configurator-panel">
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs font-semibold text-base-content/70">
                Export to:{' '}
                <span className="font-mono">{themeFiles[editingMode]}</span>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="col-span-2 flex items-center gap-2">
                <label className="text-xs text-base-content/60 whitespace-nowrap">
                  Name:
                </label>
                <input
                  type="text"
                  value={themeConfig.name}
                  onChange={(e) =>
                    setThemeConfig({ ...themeConfig, name: e.target.value })
                  }
                  className="input input-xs input-bordered flex-1 font-mono"
                  placeholder="space-asteroid-belt"
                />
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="p-4 border-t border-base-300 flex gap-2 flex-wrap theme-configurator-panel">
            <button
              className="btn btn-xs btn-outline gap-1"
              onClick={resetToDefaults}
            >
              <Icon icon="lucide--rotate-ccw" className="size-3" />
              Discard
            </button>
            <button
              className="btn btn-xs btn-outline gap-1"
              onClick={() => setShowImportModal(true)}
            >
              <Icon icon="lucide--download" className="size-3" />
              Import
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

      {/* Import CSS Modal */}
      {showImportModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[10000]">
          <div className="bg-base-100 rounded-lg shadow-2xl border border-base-300 w-[500px] max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-base-300">
              <h3 className="font-bold text-sm flex items-center gap-2">
                <Icon icon="lucide--download" className="size-4" />
                Import Theme CSS
              </h3>
              <button
                className="btn btn-xs btn-ghost btn-square"
                onClick={() => {
                  setShowImportModal(false);
                  setImportText('');
                }}
              >
                <Icon icon="lucide--x" className="size-4" />
              </button>
            </div>
            <div className="p-4 flex-1 overflow-hidden flex flex-col gap-3">
              <p className="text-xs text-base-content/70">
                Paste DaisyUI theme wizard CSS (the{' '}
                <code className="bg-base-200 px-1 rounded">
                  @plugin "daisyui/theme"
                </code>{' '}
                block):
              </p>
              <textarea
                value={importText}
                onChange={(e) => setImportText(e.target.value)}
                className="textarea textarea-bordered flex-1 font-mono text-xs min-h-[200px]"
                placeholder={`@plugin "daisyui/theme" {
  name: "my-theme";
  prefersdark: true;
  color-scheme: "dark";
  --color-base-100: oklch(15% 0 0);
  --color-primary: oklch(70% 0.15 240);
  ...
}`}
              />
            </div>
            <div className="p-4 border-t border-base-300 flex justify-end gap-2">
              <button
                className="btn btn-xs btn-ghost"
                onClick={() => {
                  setShowImportModal(false);
                  setImportText('');
                }}
              >
                Cancel
              </button>
              <button
                className="btn btn-xs btn-primary gap-1"
                onClick={() => {
                  const parsed = parseThemeWizardCSS(importText);
                  if (!parsed) {
                    alert(
                      'Could not parse theme CSS. Make sure it\'s in the @plugin "daisyui/theme" { ... } format.'
                    );
                    return;
                  }

                  // Apply parsed config
                  if (parsed.config.name) {
                    setThemeConfig((prev) => ({
                      ...prev,
                      name: parsed.config.name!,
                    }));
                  }
                  if (parsed.config.prefersdark !== undefined) {
                    setThemeConfig((prev) => ({
                      ...prev,
                      prefersdark: parsed.config.prefersdark!,
                    }));
                  }
                  if (parsed.config.colorScheme) {
                    setThemeConfig((prev) => ({
                      ...prev,
                      colorScheme: parsed.config.colorScheme!,
                    }));
                  }
                  if (parsed.config.default !== undefined) {
                    setThemeConfig((prev) => ({
                      ...prev,
                      default: parsed.config.default!,
                    }));
                  }

                  // Apply parsed variables
                  const newVariables = { ...variables };
                  Object.entries(parsed.variables).forEach(([key, value]) => {
                    newVariables[key] = value;
                  });
                  setVariables(newVariables);
                  localStorage.setItem(
                    'theme-configurator-values',
                    JSON.stringify(newVariables)
                  );

                  // Close modal
                  setShowImportModal(false);
                  setImportText('');

                  // Show success feedback
                  const varCount = Object.keys(parsed.variables).length;
                  alert(
                    `Imported theme "${
                      parsed.config.name || 'unnamed'
                    }" with ${varCount} variables!`
                  );
                }}
              >
                <Icon icon="lucide--check" className="size-3" />
                Import Theme
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
