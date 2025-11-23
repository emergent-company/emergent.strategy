# Emergent Logo Design Specification

## Overview

This document provides specifications for the Emergent logo design. The logo should be simple, modern, and represent the concept of emergent knowledge—data rising from structure to become intelligent, AI-ready information.

---

## Design Concept

### Core Metaphor: Emergence

The logo should visually represent the concept of **emergence**: simple elements combining to create something greater. This aligns with Emergent's purpose—transforming scattered documents into structured, intelligent knowledge.

### Recommended Concepts

1. **Graph Nodes Connecting**: Circles/dots forming a network pattern, suggesting knowledge graph relationships
2. **Ascending Shape**: Geometric shapes rising or building upward, representing growth and emergence
3. **Abstract "E" Letterform**: Stylized letter E with connection lines or nodes integrated into the design
4. **Data to Knowledge Flow**: Visual progression from scattered elements to organized structure

---

## Design Requirements

### Style

- **Minimal**: Clean, uncluttered design
- **Geometric**: Use simple shapes (circles, lines, triangles)
- **Modern**: Contemporary aesthetic, not dated
- **Scalable**: Must work at all sizes (16px to 512px)
- **Distinctive**: Recognizable and memorable

### Format & Variants

#### Required Files

1. **Logo Variants**:

   - Full logo (icon + "Emergent" text)
   - Logomark only (icon without text)
   - Logotype only (text without icon)
   - Stacked version (icon above text, for narrow spaces)

2. **Theme Variants**:

   - Light mode version
   - Dark mode version
   - (Both should work on their respective backgrounds)

3. **File Formats**:
   - SVG (primary, scalable)
   - PNG (fallback): 32x32, 192x192, 512x512 for favicons
   - ICO (for browser favicon)

#### Naming Convention

```
emergent-logo-light.svg
emergent-logo-dark.svg
emergent-icon-light.svg
emergent-icon-dark.svg
emergent-text-light.svg
emergent-text-dark.svg
favicon-32x32.png
favicon-192x192.png
favicon-512x512.png
apple-touch-icon.png (180x180)
favicon.ico (multi-size: 16x16, 32x32, 48x48)
```

---

## Color Specifications

### Primary Color Approach

Use **semantic DaisyUI theme colors** for maximum flexibility:

- `hsl(var(--p))` for primary color
- `hsl(var(--s))` for secondary/accent
- `hsl(var(--bc))` for base content (text color)

### Recommended Palette

Since DaisyUI themes are customizable, design the logo to work with a range of colors:

- **Suggested primary**: Blue/teal spectrum (trust, intelligence, technology)
- **Accent options**: Purple, cyan, or gradient from blue to purple
- **Neutral version**: Should work in single color (black or white)

### Color Usage

- **Maximum 2 colors** (primary + secondary or gradient)
- **Single-color version** must also work (for monochrome contexts)
- **Avoid hard-coded hex values** in SVG (use CSS variables where possible)

### Light vs. Dark Mode

- **Light mode**: Logo should be visible on light backgrounds (use darker colors)
- **Dark mode**: Logo should be visible on dark backgrounds (use lighter colors)
- Test contrast ratio: minimum 3:1 for logos (WCAG AA)

---

## Size & Usage

### Logo Sizes

1. **Topbar**: 32-40px height (current standard)
2. **Sidebar**: 24-32px height (compact)
3. **Landing Hero**: 48-64px height (prominent)
4. **Favicon**: 16x16, 32x32, 48x48 (ICO multi-size)
5. **Apple Touch Icon**: 180x180px
6. **PWA Icons**: 192x192, 512x512

### Clear Space

- Minimum clear space: 0.5x logo height on all sides
- Don't place logo too close to other elements
- Ensure readability at small sizes

### Minimum Size

- **Icon only**: 16x16px (must be recognizable)
- **Full logo**: 80px width minimum for text readability

---

## Typography (for Logotype)

### Font Recommendations

If designing text as part of logo:

- **Sans-serif**: Modern, clean, geometric
- **Weight**: Medium to Bold (500-700)
- **Style**: Upright (not italic), clean letterforms
- **Letter spacing**: Slightly open for readability

### Fallback Approach

Use **system font stack** for consistency with app:

```css
font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI',
  Roboto, 'Helvetica Neue', Arial, sans-serif;
```

Or **custom wordmark** created as graphic (recommended for uniqueness)

---

## Technical Specifications

### SVG Optimization

- Clean paths (no unnecessary points)
- Viewbox: `0 0 [width] [height]` (use aspect ratio of design)
- No embedded fonts (convert text to paths OR use web-safe fonts)
- Optimize file size (< 5KB for icon)
- No raster images embedded in SVG

### React Component Integration

Logo will be used in `Logo.tsx` component:

```tsx
// Example usage
<img
  src="/images/logo/emergent-logo-light.svg"
  alt="Emergent"
  className="h-8 dark:hidden"
/>
<img
  src="/images/logo/emergent-logo-dark.svg"
  alt="Emergent"
  className="h-8 hidden dark:block"
/>
```

### Accessibility

- Always include `alt` text: "Emergent" or "Emergent logo"
- Ensure sufficient contrast in all contexts
- Test with screen readers

---

## Design Process

### Step 1: Concept Exploration (2-3 concepts)

Sketch or design 2-3 logo concepts following the specifications above. Present options for review.

### Step 2: Refinement

Based on feedback, refine chosen concept. Test at various sizes and on light/dark backgrounds.

### Step 3: Finalization

- Export all required file formats
- Create favicon variants (ICO, PNG)
- Test in actual UI (Topbar, Sidebar, Landing page)
- Document usage guidelines

### Step 4: Implementation

- Store files in `apps/admin/public/images/logo/`
- Update `Logo.tsx` component
- Update `apps/admin/index.html` (favicon links)
- Test across browsers and devices

---

## Example Logo Concepts (Verbal Descriptions)

### Concept 1: Network Nodes

- **Icon**: 5-7 circles (nodes) connected by thin lines forming a network pattern
- **Style**: Abstract, geometric, suggests knowledge graph
- **Text**: "Emergent" in clean sans-serif next to icon
- **Color**: Primary blue nodes, secondary lines, or gradient across nodes

### Concept 2: Ascending Triangle

- **Icon**: Three stacked triangles increasing in size, suggesting growth/emergence
- **Style**: Minimal, geometric, upward motion
- **Text**: "Emergent" aligned with icon
- **Color**: Gradient from dark to light (bottom to top) or solid primary

### Concept 3: Abstract "E" with Connections

- **Icon**: Stylized letter "E" with connection points or lines extending from it
- **Style**: Modern letterform + graph metaphor
- **Text**: "Emergent" using same font as the "E"
- **Color**: Single primary color or two-tone (letter + connections)

### Concept 4: Data Points to Structure

- **Icon**: Left side has scattered dots, right side has dots organized in grid/structure
- **Style**: Transformation metaphor, before/after
- **Text**: "Emergent" centered below or beside
- **Color**: Gradient or color shift from scattered to organized

---

## Deliverables Checklist

- [ ] Full logo SVG (light mode)
- [ ] Full logo SVG (dark mode)
- [ ] Icon-only SVG (light mode)
- [ ] Icon-only SVG (dark mode)
- [ ] Logotype SVG (optional, if text is separate)
- [ ] favicon.ico (16x16, 32x32, 48x48)
- [ ] favicon-32x32.png
- [ ] favicon-192x192.png
- [ ] favicon-512x512.png
- [ ] apple-touch-icon.png (180x180)
- [ ] Usage guidelines document (optional)

---

## Timeline Estimate

- **Concept exploration**: 2-4 hours
- **Refinement**: 1-2 hours
- **Export & optimization**: 1 hour
- **Implementation & testing**: 1-2 hours

**Total**: 5-9 hours for complete logo design and implementation

---

## Notes

- Start simple—a basic text-based logo with a minimal icon is perfectly acceptable for phase 1
- Can always refine and enhance the logo later based on brand evolution
- Focus on clarity and scalability over complexity
- Test logo at actual sizes in the UI before finalizing
- Get feedback from team before implementing

---

## Placeholder Approach (Temporary)

If logo design takes time, use a **text-only placeholder**:

- Text: "EMERGENT" in bold, sans-serif
- Color: Primary theme color
- Icon: Simple circle or square with "E" initial
- This allows implementation to proceed while design is finalized
