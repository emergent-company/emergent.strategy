## daisyUI Theme Usage Audit

Date: 2025-09-22

Scope: `apps/admin/src/**/*`

Objective: Verify components use semantic daisyUI theme tokens (e.g. `bg-primary`, `text-base-content`, `badge-success`) and radius tokens (`rounded-box`, `rounded-[var(--radius-*)]`) instead of raw Tailwind palette colors (`bg-blue-500`, `text-gray-600`) or arbitrary values, and document deviations plus remediation plan.

---

### 1. Methodology

Search patterns executed (grep regex):

| Concern | Pattern |
|---------|---------|
| Hard‑coded Tailwind color utilities | `bg-(red|blue|green|yellow|pink|purple|gray|slate|stone|neutral|emerald|teal|cyan|indigo|violet|fuchsia|rose)-[0-9]{2,3}` & `text-(...)` |
| Hex literals | `#[0-9a-fA-F]{3,6}` |
| Arbitrary color / image utilities | `bg-\[[^]]+\]`, `text-\[[^]]+\]`, `border-\[[^]]+\]` |
| Non-token / arbitrary radius | `rounded-\[` and review large custom values (e.g. `sm:rounded-[60px]`) |

Excluded: Legit semantic classes (`bg-primary/10`, `text-base-content/70`, `bg-base-200`) – these are acceptable as they remain theme-resolved.

---

### 2. Findings Summary

Severity scale:

| Level | Definition |
|-------|------------|
| Critical | Direct Tailwind palette color (`bg-blue-500`, `text-green-500`) used where semantic token should be applied. Blocks consistent theming. |
| Moderate | Palette color with opacity suffix (`bg-purple-500/5`, `border-indigo-500/10`) – still hard-coded hue; theming & dark mode drift risk. |
| Minor | Arbitrary background image / decorative gradient utilities; acceptable if purely decorative and not conveying semantic meaning. |
| Advisory | Mixed radius strategy; inconsistent usage of theme radius tokens vs numeric / large custom radii. |

#### 2.1 Files With Critical / Moderate Color Usage

| File | Examples | Severity |
|------|----------|----------|
| `pages/landing/components/CTA.tsx` | `bg-blue-400`, `bg-cyan-400`, `bg-purple-400`, `text-green-500` | Critical |
| `pages/landing/components/BundleOffer.tsx` | `bg-purple-500/5`, `border-purple-500/10`, `text-purple-500` | Moderate/Critical (text) |
| `pages/landing/components/Features.tsx` | `text-blue-500`, `bg-blue-500/5`, `border-violet-500/40`, etc. (pattern repeated for blue, violet, cyan, fuchsia, teal) | Critical/Moderate |
| `pages/landing/components/Showcase.tsx` | `bg-teal-500/5`, `border-teal-500/5`, heart masks `bg-red-400`, `bg-yellow-400`, `bg-green-400` | Critical/Moderate |
| `pages/landing/components/FAQ.tsx` | `bg-purple-500/5`, `border-purple-500/10`, `text-purple-600` | Critical/Moderate |
| `pages/landing/components/Testimonial.tsx` | `text-yellow-500`, `bg-orange-500/5`, `border-orange-500/10` | Critical/Moderate |
| `pages/landing/components/Hero.tsx` | `text-indigo-600` | Critical |
| `pages/landing/components/Topbar.tsx` | (none critical beyond decorative?) | — |
| `components/atoms/SidebarMenuItemBadges/index.tsx` | Uses semantic `bg-primary/10` & `bg-secondary` (OK) | — |

> Note: The landing marketing components show the majority of violations; core admin app surfaces (sidebar, rightbar, chat, etc.) predominantly use semantic tokens (`primary`, `secondary`, `base-*`, `success`, `error`) already.

#### 2.2 Arbitrary Background / Image Utilities (Minor)

| File | Example |
|------|---------|
| `pages/landing/components/Testimonial.tsx` | `bg-[url('/images/landing/testimonial-background.svg')]` |
| `pages/landing/components/Hero.tsx` | `bg-[url(/images/landing/hero-bg-gradient.png)]` + custom background-size/position tokens |
| `pages/landing/components/Showcase.tsx` | `bg-[url(/images/landing/showcase-bg-gradient.png)]` |
| `pages/landing/components/Showcase.tsx` | `bg-[url(/images/landing/showcase-bg-element.png)]` |

These are acceptable as decorative assets; ensure contrast layers overlay with semantic colors where text legibility matters.

#### 2.3 Radius Usage

Patterns:
* Consistent usage of daisyUI semantic radius classes: `rounded-box`, `rounded-full`, `rounded-btn` (good).
* Tokenized radii via CSS vars already present in `Avatar`: `rounded-[var(--radius-box)]`, etc. (good exemplary pattern).
* Outlier: `sm:rounded-[60px]` in `CTA.tsx` – large custom value; consider mapping to a design token (e.g., introduce `--radius-hero` or repurpose `--radius-box` if appropriate) or simplify to existing `rounded-box` for consistency.

No widespread inline `style={{ borderRadius: ... }}` patterns discovered beyond avatar fallback logic.

#### 2.4 Hex / Direct Literal Colors

Only within plugin or comment context:
* `styles/plugins/flatpickr.css` – `color: #fff !important;` (plugin override; acceptable but could switch to `color: oklch(var(--color-base-content))` or `text-base-content` via utility extraction if refactored into markup).
* `styles/pages/landing.css` – comment reference `#FFFFFF` (no action needed).

---

### 3. Impact & Risk

| Issue Type | Impact |
|------------|--------|
| Hard-coded palette colors | Blocks adaptive theming (dark mode / future theme variants) & brand re-skins. |
| Alpha variants of palette colors | Creates subtle contrast inconsistencies vs semantic tonal scale; increases maintenance cost. |
| Arbitrary large radius | Visual inconsistency across components; reduces token portability. |
| Plugin hex override | Low – localized; minor theming inconsistency potential. |

---

### 4. Recommended Remediation Strategy

1. Introduce / Leverage Semantic Accent Set:
   * Map each marketing feature color to an existing token: prefer `primary`, `secondary`, `accent`, `info`, `success`, `warning`, `error`, `neutral`. Where unique hues are required simultaneously, extend theme (e.g., create additional semantic surfaces via custom utility classes backed by vars: `feature-blue`, `feature-teal`, etc.).
2. Replace direct palette utilities:
   * `text-blue-500` → `text-primary` (if representing core action) or `text-info` if informational.
   * `bg-purple-500/5 border-purple-500/10` → Use semantic pattern: `bg-primary/10 border border-primary/10` (or create a neutral subtle surface: `bg-base-200/50 border-base-300`).
3. Create helper component for “IconBadge” pattern used across Feature cards to centralize semantic styling.
4. Standardize translucent surfaces:
   * Define utility classes (e.g. `.surface-accent-low` in `components.css`) applying `bg-[color]/10 border-[color]/20` using semantic variables so future hue swaps propagate.
5. Radius alignment:
   * Replace `sm:rounded-[60px]` with token: add `--radius-hero: 3.75rem;` in theme (if truly needed) then use `rounded-[var(--radius-hero)]`. Or reduce to `rounded-box` if visual differentiation not critical.
6. Plugin cleanup (optional, low priority): Replace `#fff` with semantic content color if theming mismatch observed.

Prioritize marketing/landing components first; they are user-facing for branding and more likely to need future theme variants.

---

### 5. Proposed Phased Fix Plan

| Phase | Scope | Actions | Est. Effort |
|-------|-------|---------|-------------|
| 1 | Landing Feature & CTA components | Replace all palette utilities with semantic tokens; introduce temporary mapping constants. | 2–3 hrs |
| 2 | Remaining Landing (Showcase, FAQ, Testimonial, Hero) | Consolidate badge / pill patterns; refactor colors. | 3–4 hrs |
| 3 | Introduce optional extended theme tokens | Update `daisyui.css` with new vars (if needed) & document. | 1 hr |
| 4 | Radius normalization | Add `--radius-hero` (if retained) & replace custom literal. | 0.5 hr |
| 5 | Lint enforcement | Add ESLint rule or stylelint custom regex banning `-[0-9]{2,3}` palette classes outside allowlist. | 1–2 hrs |

---

### 6. Sample Refactor Pattern

Original:

```tsx
<div className="inline-flex items-center bg-purple-500/5 p-2 border border-purple-500/10 rounded-box text-purple-500">
  ...
</div>
```

Refactored (using semantic `accent` token):

```tsx
<div className="inline-flex items-center bg-accent/10 p-2 border border-accent/20 rounded-box text-accent">
  ...
</div>
```

If multiple distinct hues are required simultaneously and existing tokens collide semantically, define extended variables in `daisyui.css`:

```css
@plugin "daisyui" {
  /* existing config ... */
}

/* Extended marketing accents (example) */
:root {
  --color-feature-blue: var(--color-primary); /* or explicit oklch(...) */
  --color-feature-teal: var(--color-accent);
}

.feature-blue   { @apply text-[oklch(var(--color-feature-blue))]; }
.feature-teal   { @apply text-[oklch(var(--color-feature-teal))]; }
```

Then consume via semantic wrappers instead of raw palette classes.

---

### 7. Metrics

| Metric | Count |
|--------|-------|
| Hard-coded palette bg/text matches (critical+moderate) | ~43 occurrences (aggregated from grep) |
| Arbitrary background image utilities | 4 |
| Custom large radius | 1 |
| Hex literals in active CSS (non-comment) | 1 (plugin override) |

> Counts are approximate; implement lint rule to keep future drift measurable.

---

### 8. Tooling & Enforcement Suggestions

1. ESLint custom rule (regex) forbidding `\b(bg|text|border)-(red|blue|green|yellow|purple|indigo|violet|teal|cyan|fuchsia|rose|orange)-[0-9]{2,3}` outside `landing/legacy/` allowlist.
2. Storybook visual regression to catch unintended color regressions after tokenization.
3. Add CI script `scripts/audit-colors.mjs` to fail builds on new violations (greenfield after Phase 2 cleanup).

---

### 9. Action Items (Next Sprint Candidates)

| ID | Action | Owner | Status |
|----|--------|-------|--------|
| A1 | Refactor `CTA.tsx` colors to semantic tokens | FE | Pending |
| A2 | Create `IconBadge` molecule using semantic color prop | FE | Pending |
| A3 | Replace palette colors in `Features.tsx` with semantic or extended tokens | FE | Pending |
| A4 | Normalize `sm:rounded-[60px]` radius | FE | Pending |
| A5 | Implement lint rule for palette color ban | FE | Pending |

---

### 10. Conclusion

Core application surfaces already align well with daisyUI semantics. Marketing/landing components currently rely on raw Tailwind palette hues, representing the primary theming risk. A focused, phased refactor (≤ 1 day effort) plus lightweight lint automation will achieve full semantic alignment and future-proof brand theming.

---

Prepared by: Automated audit via AI assistant.
