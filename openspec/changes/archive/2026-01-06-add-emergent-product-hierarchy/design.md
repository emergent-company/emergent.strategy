# Design: Emergent Product Hierarchy

## Context

Emergent is transitioning from a single-product knowledge management system to a **platform** that supports multiple specialized product offerings. The core technology (knowledge graph, embeddings, AI chat, MCP) remains the foundation, but we need to support distinct products with:

- Different template packs and configurations
- Product-specific prompts and agent behaviors
- Separate landing pages and marketing positioning
- Isolated or shared data depending on product requirements

This design addresses how to structure the platform to support:

1. **Emergent Core** - The platform technology and APIs
2. **Emergent Personal Assistant** - Pre-configured product for personal life management
3. **Emergent Product Framework** - Pre-configured product for product strategy and planning
4. **Future products** - Built by Emergent or third parties

### Key Stakeholders

- **End users**: Need clear product differentiation and use case alignment
- **Product team**: Need to maintain product definitions and track evolution
- **Marketing**: Need product pages, materials, and messaging artifacts
- **Developers**: Need to build product-specific features and configurations

### Constraints

- Must not break existing functionality or user data
- Should leverage existing template pack and chat systems
- Must maintain security and data isolation for Personal Assistant private data
- Should be extensible for future products

## Goals / Non-Goals

### Goals

- Establish clear product hierarchy in marketing and technical architecture
- Create dedicated landing pages for each product offering
- Define product configuration system for template packs, prompts, and settings
- Enable product specification documents that serve as the "product bible"
- Provide foundation for future product extensibility

### Non-Goals

- Implementing multi-tenancy or product-level data isolation (use existing org/project model)
- Building marketplace or partner ecosystem (future work)
- Implementing subscription/billing system (future work)
- Creating agent orchestration framework (future work, but acknowledged in roadmap)

## Decisions

### Decision 1: Product Pages as Static Frontend Routes

**What**: Create separate React pages for `/personal-assistant` and `/product-framework` with dedicated marketing content, using existing landing page components as templates.

**Why**:

- Fastest time to market
- Leverages existing DaisyUI component library
- No backend changes required initially
- Easy to iterate on messaging and design
- Can migrate to CMS or dynamic system later if needed

**Alternatives Considered**:

- **Dynamic product pages from database**: Over-engineered for current needs, adds complexity
- **Single landing page with sections**: Doesn't provide sufficient focus per product

### Decision 2: Product Definitions as Markdown Specifications

**What**: Store comprehensive product definitions in `openspec/specs/products/<product-name>/` as structured markdown documents including value proposition, features, roadmap, target audience, use cases, and technical specifications.

**Why**:

- Version controlled and trackable alongside code
- Human-readable and AI-parseable
- Can generate marketing artifacts, presentations, and documentation
- Aligns with OpenSpec workflow and conventions
- Provides single source of truth for product strategy

**Alternatives Considered**:

- **Database-stored product metadata**: Harder to version control, requires UI for editing
- **Separate product documentation tool**: Creates fragmentation, additional tool overhead

### Decision 3: Product Configuration via Enhanced Template Packs

**What**: Extend the existing template pack system to support product-level metadata and configurations. Each product maps to a primary template pack with associated prompts and agent settings.

**Why**:

- Reuses existing template pack infrastructure
- Template packs already support object types, relationships, and extensibility
- Natural fit for product-specific data models (e.g., personal tasks vs. product features)
- No new infrastructure required

**Alternatives Considered**:

- **New "product" entity in database**: Adds complexity, unclear benefit over template packs
- **Configuration files in codebase**: Less flexible, requires code changes for new products

### Decision 4: Deferred Agent Configuration System

**What**: Acknowledge that configurable agents (processing data, suggesting changes) are part of the roadmap but NOT implemented in this change. Focus on establishing product structure and pages first.

**Why**:

- Reduces scope and complexity of initial change
- Allows product positioning and marketing to launch quickly
- Agent system requires significant design work (not ready yet)
- Can add agent configuration later without breaking current architecture

**Implementation Note**: When agents are ready, they will:

- Operate on graph objects within a product's template pack
- Be configured per product with specific prompts and actions
- Be installable/selectable by users within each product context

### Decision 5: Personal Assistant Data Privacy via Existing Access Controls

**What**: Use existing organization/project access controls and document-level permissions for Personal Assistant private data. Document privacy considerations but don't implement new access control system yet.

**Why**:

- Existing RLS (Row Level Security) and scope-based auth already supports data isolation
- Personal Assistant users likely operate within their own organization/project
- Avoids building premature infrastructure
- Can enhance with product-specific access rules later if needed

**Security Notes**:

- Document that Personal Assistant handles sensitive personal data
- Recommend users create dedicated organization for personal use
- Plan for future: encrypted fields, additional access scopes, data residency controls

## Architecture

### Frontend Structure

```
apps/admin/src/pages/
├── landing/                    # Emergent Core landing page (existing, updated)
│   ├── index.tsx
│   └── components/
│       ├── Hero.tsx           # Update to Core positioning
│       ├── Features.tsx       # Core platform features
│       ├── ProductShowcase.tsx # NEW: Show Personal Assistant + Product Framework
│       └── ...
├── personal-assistant/         # NEW: Personal Assistant product page
│   ├── index.tsx
│   └── components/
│       ├── Hero.tsx
│       ├── Features.tsx
│       ├── UseCases.tsx
│       └── HowItWorks.tsx
└── product-framework/          # NEW: Product Framework product page
    ├── index.tsx
    └── components/
        ├── Hero.tsx
        ├── Features.tsx
        ├── UseCases.tsx
        └── HowItWorks.tsx
```

### Product Specifications Structure

```
openspec/specs/products/
├── emergent-core/
│   ├── spec.md                 # Core platform capabilities
│   ├── roadmap.md              # Platform roadmap
│   └── api-reference.md        # API docs for developers
├── personal-assistant/
│   ├── spec.md                 # Product definition
│   ├── features.md             # Detailed feature specs
│   ├── use-cases.md            # Target use cases
│   └── template-pack.md        # Template pack configuration
└── product-framework/
    ├── spec.md                 # Product definition
    ├── features.md             # Detailed feature specs
    ├── use-cases.md            # Target use cases
    └── template-pack.md        # Template pack configuration
```

### Template Pack Extensions (Future)

```typescript
// Conceptual structure (not implemented yet)
interface ProductConfig {
  id: string; // 'personal-assistant' | 'product-framework'
  name: string; // 'Emergent Personal Assistant'
  templatePackId: string; // Primary template pack ID
  defaultPrompts: string[]; // Prompt IDs for this product
  agentConfigs?: AgentConfig[]; // Future: agent definitions
  features: string[]; // Enabled feature flags
}
```

## Risks / Trade-offs

### Risk: Product Pages Diverge from Reality

**Impact**: Marketing promises features not yet built or misrepresents capabilities

**Mitigation**:

- Keep product specs (openspec/specs/products/) in sync with implementations
- Review product pages during feature development
- Use OpenSpec validation to track spec vs. implementation gaps

### Risk: Template Pack System Insufficient for Product Configuration

**Impact**: May need dedicated product config system later, requiring migration

**Mitigation**:

- Document product→template pack mapping clearly
- Design template packs with product use cases in mind
- Be ready to extract product config into separate system if needed

### Risk: Data Privacy Not Sufficient for Personal Assistant

**Impact**: Users may not trust storing sensitive personal data

**Mitigation**:

- Document current privacy controls clearly on product page
- Add security roadmap items (encryption, enhanced access controls)
- Allow self-hosted deployments for privacy-conscious users
- Consider explicit "personal data" classification and handling

### Trade-off: Static Pages vs. Dynamic CMS

**Decision**: Use static React pages initially

**Pros**: Fast to build, easy to version control, no additional infrastructure  
**Cons**: Requires code changes to update content, not marketer-friendly

**Future Path**: Can migrate to headless CMS later without changing URLs

## Migration Plan

### Phase 1: Product Structure & Specifications (Weeks 1-2)

1. Create product specification documents in `openspec/specs/products/`
2. Define value propositions, features, and use cases for each product
3. Write product page content (copy, CTAs, messaging)
4. Review and approve with stakeholders

### Phase 2: Frontend Implementation (Weeks 2-3)

1. Update landing page to Core positioning with product showcase
2. Create `/personal-assistant` product page with components
3. Create `/product-framework` product page with components
4. Add routing and navigation for new pages
5. Implement responsive design and accessibility

### Phase 3: Template Packs & Configuration (Weeks 3-4)

1. Design Personal Assistant template pack (object types: Tasks, Events, Documents, Contacts)
2. Design Product Framework template pack (object types: Features, Strategies, Goals, Metrics)
3. Create initial template pack seed data/migrations
4. Document template pack installation and usage

### Phase 4: Testing & Launch (Week 5)

1. E2E tests for product page navigation and content
2. Review product specifications for completeness
3. Verify product page messaging aligns with actual capabilities
4. Deploy to production and announce new product structure

### Rollback Plan

If issues arise:

- Product pages can be removed by reverting route additions
- No database changes in Phase 1-2, so easy rollback
- Template packs are opt-in installations, don't affect existing data

## Open Questions

### 1. Product Access & Onboarding

**Question**: How do users "activate" or subscribe to Personal Assistant vs. Product Framework?

**Options**:

- A) Free access to all products, differentiated by template pack installation
- B) Subscription tiers with product access controls
- C) Single sign-up, user chooses product during onboarding

**Decision**: Start with option A (free access, template pack differentiation). Add subscription model later if needed.

### 2. Agent Orchestration Roadmap

**Question**: When and how will configurable agents be implemented?

**Context**: This is mentioned as a future capability but not designed yet.

**Next Steps**: Create separate OpenSpec change proposal for agent system when ready.

### 3. Third-party Product Development

**Question**: Will external developers be able to build and publish products on Emergent Core?

**Decision**: Not in scope for this change. Acknowledge as long-term vision, revisit after core products are established.

### 4. Product Isolation

**Question**: Should products have completely separate data models or share the same knowledge graph?

**Decision**: Products share the same underlying knowledge graph infrastructure but use different template packs for organization. Users may choose to create separate projects per product or combine them.

### 5. Personal Assistant Data Sources

**Question**: How will Personal Assistant connect to external data (email, calendar, financial accounts)?

**Decision**: Future work. Phase 1 focuses on manual entry and document upload. Integration capabilities can be added in subsequent changes.

## Success Metrics

**User Understanding**:

- Users can articulate the difference between Core, Personal Assistant, and Product Framework
- Bounce rate on product pages < 50%
- Average time on product pages > 2 minutes

**Product Adoption**:

- Track template pack installations per product
- Monitor user project creation by product type
- Measure conversion from product page to signup/onboarding

**Developer Experience**:

- Product specifications are comprehensive enough to generate marketing materials
- Development team refers to product specs during feature planning
- Product roadmap is visible and trackable

## Next Steps After This Change

1. **Agent Configuration System**: Design and implement configurable agents per product
2. **Product Marketplace**: Enable third-party product development and distribution
3. **Enhanced Privacy Controls**: Implement encryption and enhanced access controls for Personal Assistant
4. **Integration Framework**: Build connectors for external data sources (email, calendar, etc.)
5. **Subscription/Billing**: Add product-level access controls and subscription tiers
6. **Product Analytics**: Track product-specific usage and engagement metrics
