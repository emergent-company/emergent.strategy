# Change: Rebrand Landing Page to "Emergent"

## Why

The current landing page uses generic template content (dashboard examples, e-commerce, CRM) and branding ("Scalo") that doesn't represent our actual product. We need to rebrand to "Emergent" and clearly communicate the core value proposition: **a knowledge management platform that structures data for AI consumption through intelligent database processing, semantic embeddings, and graph-based relationships**.

Users need to immediately understand what Emergent does: transform unstructured documents into AI-ready knowledge through PostgreSQL + pgvector, semantic search, and Model Context Protocol (MCP) integration.

## What Changes

- Rebrand all references from generic template to "Emergent"
- Create/specify an Emergent logo (simple, clean design)
- Replace template content with product-focused messaging:
  - **Hero**: Clear value proposition about AI-ready knowledge management
  - **Features**: Highlight document ingestion, semantic embeddings, graph relationships, MCP integration, and schema-aware chat
  - **Use Cases**: Practical scenarios (documentation systems, knowledge bases, AI-powered search)
  - **CTA**: Direct users to the dashboard with clear onboarding
- Remove irrelevant content:
  - Technology stack badges (React, Next.js, Tailwind, etc.)
  - E-commerce/CRM/dashboard showcase images
  - "Buy Now" buttons and template marketplace links
  - Generic testimonials and bundle offers
- Keep simple, clean design with focus on clarity over marketing fluff

**Affected Components:**

- Hero section: New headline, value prop, description
- Features section: Replace 8 template features with 6 product-specific features
- Showcase section: Replace with product screenshots or simplified architecture diagram
- Testimonial section: Remove or replace with use case examples
- FAQ section: Product-specific questions
- Topbar: Update logo, remove "Buy Now", keep dashboard link
- Footer: Update branding, links

## Impact

- Affected specs: `landing-page` (new spec)
- Affected code:
  - `apps/admin/src/pages/landing/` - All landing page components
  - `apps/admin/src/components/Logo.tsx` - Logo component
  - `apps/admin/public/images/landing/` - Landing page assets
  - `apps/admin/index.html` - Meta tags (title, description, OG tags)
- Breaking changes: None (cosmetic only)
- User impact: Positive - clearer product understanding, better first impression
- Developer impact: None - no API or architecture changes
