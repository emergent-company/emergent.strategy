# Theme System Documentation

This document describes the theme system used in the Emergent admin application.

## Production Themes

The app uses two production themes based on **Space Asteroid Belt**:

| Theme Name                  | Mode  | File                                              |
| --------------------------- | ----- | ------------------------------------------------- |
| `space-asteroid-belt`       | Dark  | `src/styles/themes/space-asteroid-belt.css`       |
| `space-asteroid-belt-light` | Light | `src/styles/themes/space-asteroid-belt-light.css` |

These are the ONLY themes loaded in production builds.

### Theme Settings

Both themes use consistent radius values for a unified look:

```css
--radius-selector: 0.5rem;
--radius-field: 0.5rem;
--radius-box: 0.5rem;
```

## Theme Switching

The navbar toggle switches between `light` and `dark` modes:

- **Dark mode** → `space-asteroid-belt` theme
- **Light mode** → `space-asteroid-belt-light` theme
- **System mode** → Auto-detects OS preference

### LocalStorage Keys

| Key                         | Purpose                                                              |
| --------------------------- | -------------------------------------------------------------------- |
| `emergent`                  | Main config including `theme` preference (`light`, `dark`, `system`) |
| `emergent-theme`            | Custom theme override (dev only, set by ColorSwitcher)               |
| `theme-configurator-values` | Inline CSS variable overrides (dev only)                             |
| `theme-editor-config`       | Theme Editor state (dev only)                                        |

## Experimental Themes (Development Only)

There are 34+ experimental themes in `src/styles/themes/` that are **only loaded in development mode**.

### How It Works

1. **Production builds**: Only load `space-asteroid-belt.css` and `space-asteroid-belt-light.css` via `app.css`

2. **Development builds**: Additionally load all experimental themes via dynamic import in `main.tsx`:

   ```tsx
   if (import.meta.env.DEV) {
     import('./styles/themes-experimental.css');
   }
   ```

3. **Theme UI components** (ColorSwitcher, FloatingThemeConfigurator, etc.) are only rendered in dev mode via `import.meta.env.DEV` checks

4. **Theme Editor route** (`/admin/theme-test`) is only registered in dev mode

### File Structure

```
src/styles/
├── app.css                    # Main styles (imports production themes only)
├── daisyui.css                # DaisyUI plugin config
├── themes-experimental.css    # All experimental theme imports (dev only)
└── themes/
    ├── space-asteroid-belt.css       # Production dark theme
    ├── space-asteroid-belt-light.css # Production light theme
    └── ... (34+ experimental themes)
```

## Adding a New Production Theme

1. Create the theme file in `src/styles/themes/`
2. Add the import to `src/styles/app.css`
3. Update the theme mapping in `src/contexts/config.tsx`
4. Update this documentation

## Adding an Experimental Theme

1. Create the theme file in `src/styles/themes/`
2. Add the import to `src/styles/themes-experimental.css`

The theme will automatically appear in the ColorSwitcher dropdown in development mode.

## Theme File Format

Themes use the DaisyUI 5 `@plugin` syntax:

```css
@plugin "daisyui/theme" {
  name: 'my-theme';
  prefersdark: true; /* or false for light themes */
  color-scheme: dark; /* or light */

  /* Base colors */
  --color-base-100: oklch(...);
  --color-base-200: oklch(...);
  --color-base-300: oklch(...);
  --color-base-content: oklch(...);

  /* Semantic colors */
  --color-primary: oklch(...);
  --color-primary-content: oklch(...);
  /* ... secondary, accent, neutral, info, success, warning, error */

  /* Radii */
  --radius-selector: 0.5rem;
  --radius-field: 0.5rem;
  --radius-box: 0.5rem;

  /* Other settings */
  --size-selector: 0.25rem;
  --size-field: 0.25rem;
  --border: 1px;
  --depth: 1;
  --noise: 0;
}
```

## Dev-Only Components

The following components are wrapped with `import.meta.env.DEV` checks:

| Component                   | Location      |
| --------------------------- | ------------- |
| `ColorSwitcher`             | Landing pages |
| `FloatingThemeConfigurator` | Landing pages |
| `LogoGradientSwitcher`      | Landing pages |
| `LogoFontSwitcher`          | Landing pages |
| Theme Editor nav item       | Admin sidebar |
| `/admin/theme-test` route   | Router        |

## Troubleshooting

### Theme not applying?

1. Check if a custom theme is stored in `emergent-theme` localStorage key
2. Clear `theme-configurator-values` localStorage key to remove inline overrides
3. Check browser DevTools for the `data-theme` attribute on `<html>`

### Experimental themes not showing in ColorSwitcher?

- Ensure you're running in development mode (`npm run dev`)
- Check that the theme is imported in `themes-experimental.css`

### Radius/styling inconsistent?

- Verify both `space-asteroid-belt.css` and `space-asteroid-belt-light.css` have matching values
- Check for inline style overrides in localStorage
