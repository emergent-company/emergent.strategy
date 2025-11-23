# Rebrand to Emergent - Change Proposal Summary

## Status: Ready for Review

This change proposal provides a comprehensive plan to rebrand the landing page from generic template content to "Emergent" branding with accurate product messaging.

---

## Key Documents

1. **proposal.md** - Overview of why, what, and impact
2. **design.md** - Detailed design decisions, alternatives, and migration plan
3. **tasks.md** - Complete implementation checklist (87 tasks organized in 8 phases)
4. **specs/landing-page/spec.md** - Requirements with scenarios for validation
5. **CONTENT_DRAFT.md** - Draft copy for all landing page sections (hero, features, FAQ, meta tags)
6. **LOGO_SPECIFICATION.md** - Detailed logo design requirements and deliverables

---

## What We're Building

### Core Value Proposition

**"Effortless Mastery of Your Domain"**

Emergent structures data with semantic embeddings, graph relationships, and intelligent search—but more importantly, it **proactively surfaces insights before you even ask**. It's not just a knowledge base; it's an intelligent system that works 24/7 to keep you ahead of your domain.

### Key Features to Highlight

1. **Understands Your Domain Automatically** - No manual tagging or organization
2. **Connects the Dots for You** - Relationships form naturally based on meaning
3. **Evolves as You Work** - Real-time updates, always current
4. **Surfaces Insights Before You Ask** - Proactive intelligence, not just reactive search
5. **Keeps Your Team Aligned** - Shared knowledge base with no silos
6. **Grows as Your Organization Grows** - Scales with your domain

### What's Being Removed

- Technology stack badges (React, Tailwind, etc.)
- E-commerce/CRM/dashboard template screenshots
- "Buy Now" buttons and marketplace links
- Generic testimonials and bundle offers
- Template branding ("Scalo")

---

## Open Questions for Stakeholder

Before implementation begins, please clarify:

### 1. Logo Design Approach

- **Option A**: Commission professional designer (timeline: 1-2 weeks)
- **Option B**: Create in-house with design tools (timeline: 3-5 days)
- **Option C**: Start with text-only placeholder, design logo later (timeline: immediate)

**Recommendation**: Option C for phase 1 (text-only "EMERGENT" logo), then Option A or B for phase 2.

### 2. Content Tone

Who is the primary audience?

- **Technical**: Developers, data engineers (more technical language OK)
- **Business**: Product managers, knowledge workers (simpler language)
- **Mixed**: Both audiences (balance technical accuracy with accessibility)

**Current draft assumes**: Mixed audience with slight technical lean.

### 3. Showcase Section

What should replace the template dashboard screenshots?

- **Option A**: Product screenshots (Documents page, Chat interface, Graph view)
- **Option B**: Simple architecture diagram (Upload → Process → Embed → Graph → MCP)
- **Option C**: Remove entirely for simplicity

**Recommendation**: Option C (remove) for phase 1, add Option A or B in phase 2 when assets ready.

### 4. Footer Links

What should the footer link to?

- GitHub repository URL? (public or private?)
- Documentation site URL? (if available)
- Contact email or form?
- Social media? (Twitter, LinkedIn, etc.)

**Current draft**: Placeholder links, need real URLs.

### 5. FAQ Questions

Are the 6 proposed FAQ questions appropriate?

1. What is Emergent?
2. How does semantic search work?
3. What is the Model Context Protocol (MCP)?
4. Can I organize data by project?
5. What file formats are supported?
6. How is data stored?

**Alternative**: Focus more on use cases and benefits vs. technical explanations.

---

## Implementation Timeline

### Phase 1: Content & Structure (2-3 days)

- Draft and approve copy (hero, features, FAQ)
- Remove template content
- Update component structure
- Use text-only placeholder logo

### Phase 2: Logo & Assets (1-2 weeks, parallel)

- Design Emergent logo
- Generate favicon variants
- Create or capture product screenshots (optional)

### Phase 3: Polish & Test (1-2 days)

- Implement logo
- Add screenshots/diagrams (if ready)
- Accessibility and responsive testing
- Cross-browser validation

**Total Estimated Timeline**: 1-3 weeks depending on logo design approach

---

## Next Steps

1. **Review this proposal** and all supporting documents
2. **Answer open questions** (logo approach, tone, showcase content, links, FAQ)
3. **Approve content draft** or provide revisions (see CONTENT_DRAFT.md)
4. **Approve logo specification** or provide design preferences (see LOGO_SPECIFICATION.md)
5. **Prioritize implementation** - which phase should start first?

---

## Validation

✅ Proposal validated with `openspec validate rebrand-to-emergent --strict`
✅ All requirements have scenarios
✅ Tasks are organized and dependencies noted
✅ Design decisions documented with alternatives

---

## Questions or Feedback?

Please review the proposal and provide feedback on:

- Content messaging and tone (CONTENT_DRAFT.md)
- Logo design direction (LOGO_SPECIFICATION.md)
- Feature prioritization (which sections are most important?)
- Timeline expectations (urgent vs. can wait?)
- Any other concerns or suggestions

**Once approved, we can begin implementation immediately.**
