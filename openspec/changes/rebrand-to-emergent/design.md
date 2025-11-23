# Design: Emergent Landing Page

## Context

Emergent is a knowledge management platform that bridges the gap between unstructured data and AI consumption. The core technical value lies in:

1. **Intelligent Data Processing**: PostgreSQL + pgvector for semantic embeddings, chunking strategies, full-text search
2. **Graph-Based Knowledge**: Objects, relationships, and template packs for structured information
3. **AI Integration**: Model Context Protocol (MCP) for schema-aware queries, chat with context augmentation
4. **Multi-Tenancy**: Organizations and projects with fine-grained access control

The landing page must communicate this value simply and directly, avoiding technical jargon while conveying sophistication.

## Goals / Non-Goals

### Goals

- Communicate core value: "Turn documents into AI-ready knowledge"
- Highlight key differentiators: semantic search, graph relationships, MCP integration
- Drive users to try the dashboard (primary CTA)
- Professional, clean design that builds trust
- Accessibility and responsive layout (existing standard)

### Non-Goals

- Detailed technical documentation (that's for docs site)
- Pricing/plans (not applicable for self-hosted product)
- Extensive marketing copy (keep it minimal)
- Complex animations or interactive demos (phase 2)
- Logo design implementation (specify requirements only, design separately)

## Decisions

### Content Strategy

**Value Proposition (Hero):**

- Primary headline: "Turn Documents into AI-Ready Knowledge"
- Secondary: "Emergent structures your data with semantic embeddings, graph relationships, and intelligent search—designed for AI consumption."
- CTA: "Open Dashboard" (primary), "Learn More" (secondary scroll/docs link)

**Features (6 core capabilities):**

1. **Document Ingestion** - Upload files or URLs, automatic text extraction and chunking
2. **Semantic Embeddings** - Vector search with Google Gemini for intelligent retrieval
3. **Knowledge Graph** - Objects, relationships, and template packs for structured data
4. **Schema-Aware Chat** - AI assistant with real-time database queries via MCP
5. **Hybrid Search** - Combine semantic and lexical search for best results
6. **Multi-Tenant Projects** - Organize knowledge by organization and project scope

**Showcase Section:**

- Option 1: Replace with 2-3 product screenshots (Documents page, Chat interface, Graph view)
- Option 2: Simple architecture diagram showing data flow: Upload → Process → Embed → Graph → MCP → AI
- Option 3: Minimal - remove entirely for phase 1

**Remove Sections:**

- Testimonials (no customer quotes yet)
- Bundle Offer (not a template marketplace product)
- Technology Stack badges (not user-facing value)

**Keep Sections:**

- FAQ (update with product-specific questions)
- Footer (update branding, add relevant links)

### Logo Design Requirements

**Specifications for designer/developer:**

1. **Style**: Minimal, geometric, modern
2. **Concept Ideas**:
   - Graph nodes connecting (knowledge graph metaphor)
   - Ascending/emerging shape (growth, emergence)
   - Abstract "E" letterform with connection lines
3. **Format**:
   - SVG (scalable, web-optimized)
   - Light and dark variants
   - Logomark (icon) + Logotype (text) versions
   - Standalone icon for favicon
4. **Colors**:
   - Primary: Use DaisyUI primary color (customizable via theme)
   - Neutral: Work in both light and dark modes
   - Single or two-color maximum
5. **Sizing**:
   - Logo component: ~32-40px height (current standard)
   - Favicon: 32x32px, 192x192px, 512x512px
   - Optimized for topbar, sidebar, and landing hero

**Implementation**:

- Store in `apps/admin/public/images/logo/`
- Update `Logo.tsx` component to use new assets
- Generate favicon.ico, apple-touch-icon.png, etc.

### Design Patterns

**Reuse Existing Patterns:**

- DaisyUI components (cards, badges, buttons, hero)
- Tailwind utility classes (no custom CSS)
- Iconify Lucide icons for consistency
- Existing responsive breakpoints and spacing

**Color Scheme:**

- Use semantic DaisyUI colors: primary, secondary, accent, info, success
- Avoid hard-coded palette colors (purple-500, blue-600, etc.)
- IconBadge component for feature icons

**Typography:**

- Existing font stack (system fonts via Tailwind)
- Clear hierarchy: headings, subheadings, body text
- Readable line-height and spacing

## Alternatives Considered

### Alternative 1: Keep Template Content

**Rejected** - Doesn't represent our product, confusing for users

### Alternative 2: Complex Interactive Demo

**Deferred** - Too much effort for phase 1, can add later if needed

### Alternative 3: Detailed Feature Pages

**Deferred** - Landing should be simple, detailed docs go in separate docs site

### Alternative 4: Video Demo on Hero

**Deferred** - No video assets yet, can add in phase 2

## Risks / Trade-offs

| Risk                       | Impact | Likelihood | Mitigation                                                    |
| -------------------------- | ------ | ---------- | ------------------------------------------------------------- |
| Logo design takes too long | High   | Medium     | Start with text-only logo, add icon later                     |
| Content too technical      | Medium | Medium     | User test draft copy with non-technical reviewers             |
| No screenshots ready       | Low    | High       | Use placeholder images or remove showcase section temporarily |
| Unclear value prop         | High   | Low        | Iterate on copy, A/B test headlines if needed                 |

## Migration Plan

**Phase 1: Content & Branding (This Change)**

1. Update all text content (hero, features, FAQ)
2. Specify logo requirements (design separately)
3. Remove template-specific content
4. Update meta tags and SEO

**Phase 2: Visual Assets (Future)**

1. Design and implement Emergent logo
2. Create product screenshots
3. Add architecture diagram (optional)
4. Professional photography/illustrations (optional)

**Phase 3: Enhancement (Future)**

1. Add simple animations (fade-in, parallax)
2. Interactive demo or sandbox environment
3. Customer testimonials (when available)
4. Case studies or use case pages

**Rollback:**

- No data migration needed
- Simple git revert if issues arise
- No impact on core application functionality

## Open Questions

1. **Logo Design**: Should we commission a designer or create in-house? Timeline?
2. **Screenshots**: Which pages showcase best value? (Documents, Chat, Graph, Dashboard)
3. **Tone**: Technical audience (developers) or broader (product managers, knowledge workers)?
4. **Links**: What should Footer links point to? (GitHub repo, docs, contact email?)
5. **FAQ**: What are the top 5-6 questions users ask about Emergent?

**Answers needed before implementation:**

- Logo design approach and timeline
- Screenshot pages to capture
- Target audience clarification for tone/copy
