# Implementation Tasks

## 1. Content Strategy & Copy

- [ ] 1.1 Draft hero headline and value proposition
- [ ] 1.2 Write feature descriptions (6 features: ingestion, embeddings, graph, chat, search, projects)
- [ ] 1.3 Write FAQ questions and answers (5-6 common questions)
- [ ] 1.4 Update meta tags (title, description, OG tags)
- [ ] 1.5 Review copy for clarity and accessibility
- [ ] 1.6 Get stakeholder approval on messaging

## 2. Logo Design & Assets

- [ ] 2.1 Define logo design requirements (style, concept, colors)
- [ ] 2.2 Create or commission Emergent logo design
- [ ] 2.3 Generate logo variants (light, dark, icon-only, full)
- [ ] 2.4 Export logo in multiple formats (SVG, PNG)
- [ ] 2.5 Generate favicons (32x32, 192x192, 512x512, apple-touch-icon)
- [ ] 2.6 Store assets in `apps/admin/public/images/logo/`
- [ ] 2.7 Update `Logo.tsx` component to use new assets

## 3. Component Updates

### 3.1 Hero Component

- [ ] 3.1.1 Update headline text to Emergent value prop
- [ ] 3.1.2 Update description text
- [ ] 3.1.3 Remove technology stack badge carousel/swiper
- [ ] 3.1.4 Update CTA button copy ("Open Dashboard")
- [ ] 3.1.5 Remove or update secondary CTA
- [ ] 3.1.6 Remove decorative widgets if not relevant

### 3.2 Features Component

- [ ] 3.2.1 Replace all 8 feature items with 6 product features
- [ ] 3.2.2 Update feature icons (Lucide icons via Iconify)
- [ ] 3.2.3 Update feature titles and descriptions
- [ ] 3.2.4 Ensure IconBadge colors are semantic (primary, secondary, accent, info, success, warning)
- [ ] 3.2.5 Update section heading and subheading

### 3.3 Showcase Component

- [ ] 3.3.1 Decide on content: screenshots, diagram, or remove
- [ ] 3.3.2 If keeping: replace all template screenshots with product screenshots
- [ ] 3.3.3 If removing: delete component and remove from landing page index
- [ ] 3.3.4 Update section heading to match Emergent context

### 3.4 Topbar Component

- [ ] 3.4.1 Update Logo component usage (use new Emergent logo)
- [ ] 3.4.2 Remove "Buy Now" button entirely
- [ ] 3.4.3 Keep "Dashboard" navigation link
- [ ] 3.4.4 Update mobile drawer menu items
- [ ] 3.4.5 Verify theme toggle still works

### 3.5 Testimonial Component

- [ ] 3.5.1 Remove testimonial section entirely OR
- [ ] 3.5.2 Replace with use case examples (if keeping)
- [ ] 3.5.3 Update component import in landing page index

### 3.6 FAQ Component

- [ ] 3.6.1 Replace all FAQ questions with product-specific questions
- [ ] 3.6.2 Write clear, concise answers
- [ ] 3.6.3 Update section heading

### 3.7 Bundle Offer Component

- [ ] 3.7.1 Remove component entirely
- [ ] 3.7.2 Remove import from landing page index
- [ ] 3.7.3 Delete component file

### 3.8 Footer Component

- [ ] 3.8.1 Update copyright to "Emergent"
- [ ] 3.8.2 Update footer links (GitHub, docs, etc.)
- [ ] 3.8.3 Remove template marketplace links
- [ ] 3.8.4 Update social media links (if applicable)

### 3.9 CTA Component

- [ ] 3.9.1 Update CTA heading and text for Emergent
- [ ] 3.9.2 Ensure button links to `/admin`
- [ ] 3.9.3 Simplify design if needed

## 4. Asset Management

- [ ] 4.1 Remove unused template images from `apps/admin/public/images/landing/`
- [ ] 4.2 Add new Emergent logo files
- [ ] 4.3 Add product screenshots (if applicable)
- [ ] 4.4 Optimize all images (compression, WebP format where supported)
- [ ] 4.5 Update image alt text for accessibility
- [ ] 4.6 Update favicon files in `apps/admin/public/`

## 5. Meta Tags & SEO

- [ ] 5.1 Update `apps/admin/index.html` title tag
- [ ] 5.2 Update meta description
- [ ] 5.3 Update Open Graph tags (og:title, og:description, og:image)
- [ ] 5.4 Update Twitter card tags
- [ ] 5.5 Add or update structured data (JSON-LD) if applicable
- [ ] 5.6 Verify favicon references are correct

## 6. Testing & Validation

- [ ] 6.1 Visual review: light theme
- [ ] 6.2 Visual review: dark theme
- [ ] 6.3 Mobile responsive testing (< 768px)
- [ ] 6.4 Tablet responsive testing (768px - 1024px)
- [ ] 6.5 Desktop testing (> 1024px)
- [ ] 6.6 Keyboard navigation testing
- [ ] 6.7 Screen reader testing (basic)
- [ ] 6.8 Test all links and CTAs work
- [ ] 6.9 Verify no console errors
- [ ] 6.10 Run accessibility audit (Lighthouse)
- [ ] 6.11 Verify no template content remains
- [ ] 6.12 Cross-browser testing (Chrome, Firefox, Safari)

## 7. Documentation

- [ ] 7.1 Update `docs/spec/02-requirements.md` landing page section
- [ ] 7.2 Document logo usage guidelines (if needed)
- [ ] 7.3 Update any references to landing page in other docs
- [ ] 7.4 Add screenshots to documentation (optional)

## 8. Cleanup

- [ ] 8.1 Remove unused component files
- [ ] 8.2 Remove unused image files
- [ ] 8.3 Run linter and fix any issues
- [ ] 8.4 Run Prettier to format all modified files
- [ ] 8.5 Remove unused imports
- [ ] 8.6 Verify build succeeds (`nx build admin`)

## Dependencies

- Logo design (Task 2) should be completed or at least specified before starting component updates (Task 3)
- Content copy (Task 1) should be drafted before updating components
- Tasks 3.1-3.9 can be done in parallel after Tasks 1 and 2
- Testing (Task 6) requires all component updates to be complete

## Notes

- Keep existing DaisyUI component structure and styling patterns
- No custom CSS unless absolutely necessary
- Use semantic DaisyUI colors (primary, secondary, etc.) instead of hard-coded values
- Maintain current responsive breakpoints and spacing
- Ensure all changes are accessible (WCAG AA minimum)
