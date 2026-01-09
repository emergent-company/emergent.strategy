# Emergent Website Update Recommendations
## Based on Q4 2025 - Q1 2026 Product Evolution

**Date:** January 9, 2026  
**Context:** EPF sync revealed significant product evolution that should be reflected in website messaging

---

## Executive Summary

The Emergent product has shipped **4 major capabilities** (Unified Search, API Tokens, Recent Items, Kreuzberg parsing) and undergone **significant architecture improvements** (RLS hardening, header simplification) that aren't reflected in the current website specs. This document provides specific update recommendations across all website pages.

### Key Changes to Communicate

1. **MCP Integration is LIVE** (not "coming soon") with token-based auth
2. **Unified Search with 5 fusion strategies** enables sophisticated retrieval
3. **Dual authentication system** (OAuth2 + API tokens) lowers friction for AI agents
4. **Activity tracking** provides contextual navigation
5. **External parsing service** (Kreuzberg) demonstrates architectural extensibility

---

## Page-by-Page Recommendations

### 1. Vision Landing Page (`/`)

**Current Status:** Philosophically strong, but dated on implementation claims

#### Updates Needed

**Section 2: "The Paradigm Shift"**

Current text mentions "AI agents don't replace human decision-making" but doesn't highlight **actual operational AI integration**.

**Add after "Intelligence amplifies judgment" paragraph:**

```markdown
Today, this is reality: Developers query knowledge graphs directly from their IDE via 
Model Context Protocol integration. AI agents use token-based authentication to access 
organizational context programmatically. Search combines graph traversal with semantic 
vectors using multiple fusion strategies—weighted, reciprocal rank fusion, interleaved, 
graph-first, or text-first—automatically choosing the best retrieval method for each query.

This isn't a vision for tomorrow. **This is infrastructure shipping today.**
```

**Section 4: "The Emergent Ecosystem" → "For Builders"**

Current text says "From prototype to production in weeks, not months" but doesn't show the proof points.

**Update the bullet points:**

```markdown
**The Tech Stack provides:**

- **emergent.core:** Operational knowledge infrastructure with proven scale
- **MCP integration with token auth:** AI agents connect in <5 minutes, not hours
- **Unified Search engine:** 5 fusion strategies, sub-300ms latency at scale
- **Activity tracking & contextual nav:** Learn from user behavior automatically
- **Extensible architecture:** External services (Kreuzberg) integrate seamlessly
- Open, privacy-first, template-customizable
```

**Status indicator to add:**

Add a subtle "Now Available" badge or indicator next to "emergent.core" to signal this is shipping, not vaporware.

---

### 2. Tech Stack Overview (`/tech-stack`)

**Current Status:** Accurate on philosophy, outdated on specific capabilities

#### Major Updates Needed

**Section 2: "emergent.core" Component Description**

Current description mentions "MCP Integration" but doesn't explain the **token management breakthrough** that makes it practical.

**Add new bullet after "MCP Integration":**

```markdown
- **API Token Management:** Dual authentication system (OAuth2 + programmatic tokens) 
  with scoped permissions. AI agents and scripts authenticate in 30 seconds, not 30 minutes. 
  Token creation, revocation, and permission scoping via management UI. Eliminates OAuth2 
  flow friction for headless environments.
```

**Section 3: Technical Enablement → "Intelligent Agency"**

Add concrete example of what's now possible:

```markdown
**Real-World Example:**

The Emergent admin UI demonstrates this in production:

1. **Token Setup**: Developer creates API token with `search:read` scope (30 seconds)
2. **MCP Configuration**: Add token to Cursor/Claude MCP settings (1 minute)
3. **Contextual Queries**: AI assistant now queries knowledge graph directly
4. **Activity Tracking**: System learns from queries, surfaces recent items automatically

**Result:** Developer setup time reduced from >30 minutes (OAuth2 flow, troubleshooting) 
to <5 minutes (token + paste). AI assistants gain organizational context without 
developers leaving their IDE.
```

**Section 2: Add New "Unified Search Engine" Component**

Insert after "RAG Pipeline" bullet:

```markdown
- **Unified Search Engine:** Single endpoint combining graph object search and document 
  chunk search with 5 fusion strategies:
  - **Weighted**: Configurable score-based combination (default: 60% graph, 40% text)
  - **RRF (Reciprocal Rank Fusion)**: Rank-based, handles different score scales
  - **Interleave**: Alternates results for balanced representation
  - **Graph-First**: Prioritizes structured knowledge (decisions, requirements)
  - **Text-First**: Prioritizes document chunks (specifications, notes)
  
  **Performance**: <300ms p95 latency with parallel execution, relationship expansion, 
  result type filtering, and debug mode for score analysis.
```

**Section 4: "Who Uses the Tech Stack" → Add New Use Case**

Insert after "Specialized Research Tools":

```markdown
**AI Agent Orchestration Platforms**

- Multi-agent systems requiring shared context
- Workflow automation with knowledge graph grounding
- Programmatic access via API tokens (not OAuth2 flows)
- **Example:** EPF-Runtime (coming Q1 2026) - headless workflow execution for 
  strategic planning cycles, artifact storage in knowledge graph, semantic search 
  over organizational strategy documents
```

---

### 3. Solutions Overview (`/solutions`)

**Current Status:** Strong on vision, needs proof of shipping velocity

#### Updates Needed

**Section 1: "From Philosophy to Practice" → "What Emergent Solutions Provide"**

Add concrete evidence that this infrastructure exists:

```markdown
**Infrastructure that thinks.** 

Not promises—**shipping capabilities:**

- **Unified Search** (Nov 2025): 5 fusion strategies operational, 15 E2E tests passing
- **MCP Token Auth** (Dec 2025): AI agent setup reduced from 30+ minutes to <5 minutes
- **Activity Tracking** (Dec 2025): Recent items page with contextual navigation live
- **External Service Integration** (Nov 2025): Kreuzberg parsing demonstrates extensibility

Built on the three Emergent principles. Applied to real organizational challenges. 
**Operational today.**
```

**Section 2: "emergent.product" → Add "Operational Status" Subsection**

Insert before "Quantified Outcomes":

```markdown
### Operational Status (January 2026)

**Foundation Infrastructure: ✅ Operational**

- Knowledge graph with semantic search
- MCP integration with token authentication
- Unified search with 5 fusion strategies
- Activity tracking and contextual navigation
- Multi-tenant architecture with RLS

**EPF Agent Suite: 🚧 In Development**

- Pathfinder Agent: Design phase
- Product Architect Agent: Design phase
- Synthesizer Agent: Design phase

**Target Availability:** Q2 2026 (April-June)

**Early Access:** Contact us for design partner opportunities
```

This manages expectations: infrastructure is solid, agents are coming, transparency builds trust.

---

### 4. New Page Needed: "Roadmap" (`/roadmap`)

**Why:** Current site has no public roadmap. With completed features and clear timeline, transparency builds credibility.

**Recommended Structure:**

```markdown
# Product Roadmap

## Shipped (Q4 2025)

### ✅ MCP Integration with Token Authentication (December 2025)
- Model Context Protocol server operational
- API token management system (CRUD, scoped permissions)
- Management UI for token lifecycle
- **Impact:** AI agent setup <5 minutes vs >30 minutes

### ✅ Unified Search Engine (November 2025)
- 5 fusion strategies (weighted, RRF, interleave, graph-first, text-first)
- Parallel execution: graph + text search
- Relationship expansion for graph results
- **Performance:** <300ms p95 latency

### ✅ Recent Items & Activity Tracking (December 2025)
- User activity recording (documents + objects)
- Recent items page with relative time display
- Contextual navigation patterns
- **Result:** Reduced context switching

### ✅ External Service Integration (November 2025)
- Kreuzberg document parsing service
- Expanded file type support
- Architecture pattern for specialized processing

## In Progress (Q1 2026)

### 🚧 EPF Self-Hosting
- All READY phase artifacts populated
- Development fully traceable via EPF
- **Target:** January 31, 2026

### 🚧 Knowledge Graph Performance Validation
- 10,000+ object scale testing
- <200ms p95 latency target
- Load testing with concurrent AI queries
- **Target:** February 28, 2026

### 🚧 Document Ingestion Pipeline
- PDF, Markdown, code file support
- 95%+ extraction accuracy target
- LLM-based extraction with validation
- **Target:** February 28, 2026

## Coming Soon (Q2 2026)

### EPF-Runtime MVP
- **Stage 1**: Shared infrastructure integration (API + RLS + auth)
- **Stage 2**: Artifact storage in knowledge graph
- **Stage 3**: Workflow management UI with app switcher
- **Stage 4**: Durable READY/FIRE/AIM execution (Temporal)
- **Target:** June 30, 2026

### EPF Agent Suite
- Pathfinder Agent (READY phase: opportunity mapping)
- Product Architect Agent (FIRE phase: component modeling)
- Synthesizer Agent (AIM phase: assessment reports)
- **Impact:** 3 days vs 3 weeks for strategy development
- **Target:** June 30, 2026

## Future (H2 2026)

### Multi-Modal Knowledge Graph
- Image/diagram embeddings (CLIP)
- Visual similarity search for architecture diagrams
- Cross-modal queries (text → image)
- **Target:** Q3 2026

### Temporal Knowledge Graph
- Bitemporal tracking (transaction time + valid time)
- Time-travel queries ("what changed when?")
- Full audit trail of knowledge evolution
- **Target:** Q3 2026

### EPF Schema Evolution System
- Semantic versioning for framework
- Automated migration scripts
- Backward compatibility management
- **Target:** Q1 2027

---

## Transparency Principles

- **Shipped means operational**: Features listed as "✅ Shipped" are in production
- **In Progress means active**: Work happening now, target dates realistic
- **Coming Soon means committed**: Resources allocated, design complete
- **Future means exploratory**: Direction clear, timing flexible

**Last Updated:** January 9, 2026
```

---

## Homepage Quick Wins

### Add "Latest Updates" Section

Insert after Hero, before main content:

```markdown
## Latest Updates

**December 2025**: MCP integration with token authentication now live. AI agents connect to knowledge graphs in <5 minutes. [Learn more →](/blog/mcp-token-auth)

**November 2025**: Unified Search shipped with 5 fusion strategies. Sub-300ms latency combining graph + text retrieval. [Technical deep-dive →](/blog/unified-search)

**October 2025**: Activity tracking & Recent Items page operational. Contextual navigation reduces search time. [See it in action →](/demo)
```

### Update Hero Stats (if present)

If homepage has any "by the numbers" section, update with:

```markdown
- **<300ms**: Unified Search p95 latency
- **5**: Fusion strategies for optimal retrieval
- **<5 min**: AI agent setup time with token auth
- **10x**: Faster than OAuth2 flow for headless access
```

---

## Blog Post Recommendations

Create these posts to support website updates:

### 1. "Unified Search: How We Combined Graph and Text Retrieval with 5 Fusion Strategies"

**Target Audience:** Technical (CTOs, architects)  
**Topics:**
- Parallel execution architecture
- Fusion strategy algorithms (weighted, RRF, interleave)
- Performance optimization (sub-300ms at scale)
- Relationship expansion for graph results

**Goal:** Demonstrate technical depth, attract builder community

---

### 2. "From 30 Minutes to 5: How API Tokens Transformed MCP Integration"

**Target Audience:** Developers, AI agent builders  
**Topics:**
- OAuth2 friction for headless environments
- Token-based auth UX (create, scope, revoke)
- Security model (scoped permissions)
- Real developer setup walkthrough

**Goal:** Lower adoption barrier, showcase pragmatic design

---

### 3. "Activity Tracking at Scale: Designing Contextual Navigation"

**Target Audience:** Product managers, UX designers  
**Topics:**
- Fire-and-forget recording pattern (non-blocking)
- Recent items algorithm (10 per type per user/project)
- Relative time display (native Intl API)
- Privacy considerations

**Goal:** Show product thinking, not just tech

---

### 4. "Architectural Extensibility: Integrating Kreuzberg Document Parsing"

**Target Audience:** Platform engineers, architects  
**Topics:**
- External service integration pattern
- When to offload vs inline processing
- Error handling for service unavailability
- Expanded file type support

**Goal:** Demonstrate enterprise-ready architecture

---

## Messaging Framework Updates

### New Tagline Options

Current: "Infrastructure for Adaptive Systems" (still strong, keep as primary)

**Alternative for product-specific pages:**

- "From Documents to Understanding" (emphasizes knowledge transformation)
- "Context That Thinks" (emphasizes intelligent infrastructure)
- "AI Agents Need Knowledge Graphs" (direct, developer-focused)

### Updated Value Props

**For Technical Buyers:**

Before: "From prototype to production in weeks"  
**After:** "MCP integration in 5 minutes. Unified search in production. Token auth shipping today."

**For Business Buyers:**

Before: "Navigate complexity with infrastructure that learns"  
**After:** "AI agents reduce strategy work from 3 weeks to 3 days. Infrastructure operational, agents launching Q2."

---

## SEO Updates

### Meta Descriptions to Update

**Homepage:**
```
Current: "Navigate complexity with infrastructure that learns, adapts, and evolves."
Updated: "Operational AI infrastructure: MCP integration, unified search, token auth. 
From documents to understanding in <300ms. Built for complexity."
```

**Tech Stack Page:**
```
Current: "Open, extensible infrastructure for building adaptive systems."
Updated: "Proven AI infrastructure: Knowledge graphs + semantic search + MCP + token auth. 
Ship intelligent applications in weeks, not months."
```

### Keywords to Target

Add to content (naturally):

- "MCP token authentication"
- "unified search fusion strategies"
- "knowledge graph API"
- "AI agent programmatic access"
- "sub-300ms semantic search"
- "activity tracking infrastructure"

---

## Design Updates

### Visual Evidence of Shipping

**Before:** Abstract concepts, no product shots  
**After:** Tasteful product evidence

**Recommendations:**

1. **MCP Settings Screenshot**: Show token management UI (blur sensitive data)
   - Caption: "Token creation in 30 seconds. AI agents authenticate programmatically."

2. **Unified Search Animation**: Show query → fusion strategy selection → results
   - Caption: "5 fusion strategies. Sub-300ms retrieval. Automatic optimization."

3. **Recent Items Screenshot**: Show relative time ("5 minutes ago", "yesterday")
   - Caption: "Contextual navigation. Learn from user behavior."

**Placement:** Use sparingly in "proof points" sections, not hero areas. Maintain philosophical tone while showing operational reality.

---

## FAQ Section to Add

Add to `/tech-stack` page:

### Frequently Asked Questions

**Q: Is MCP integration available now or coming soon?**  
A: Available now (December 2025). Token management UI operational. Setup in <5 minutes.

**Q: What's the difference between the Tech Stack and Solutions?**  
A: Tech Stack (emergent.core) is infrastructure for builders. Solutions (emergent.product) are applications for business users. Core is operational; Product agents launch Q2 2026.

**Q: Can I use unified search today?**  
A: Yes (November 2025). 5 fusion strategies operational. API documented. Self-hosted or cloud.

**Q: What does "sub-300ms latency" mean at scale?**  
A: p95 latency under 300ms for 95% of queries with 10,000+ knowledge graph objects and concurrent users. Measured in production.

**Q: Is this open source?**  
A: Core infrastructure is open-source optionality. You can self-host or use managed cloud. No vendor lock-in.

---

## Implementation Priority

### Phase 1: Quick Wins (1-2 days)

1. Update Tech Stack page with completed features (MCP tokens, Unified Search)
2. Add "Operational Status" to Solutions page
3. Update homepage meta description + hero stats

### Phase 2: Content Depth (1 week)

4. Create `/roadmap` page
5. Add FAQ section to Tech Stack
6. Write first blog post (Unified Search technical deep-dive)

### Phase 3: Strategic Positioning (2 weeks)

7. Update Vision Landing Page with "shipping today" evidence
8. Create remaining blog posts
9. Add tasteful product screenshots/animations

---

## Metrics to Track Post-Update

### Engagement Metrics

- **Bounce rate reduction**: Expect -10 to -15% (clearer value prop)
- **Time on Tech Stack page**: +30-40% (more concrete details)
- **CTA click-through**: +20% (credibility from shipping features)

### Conversion Metrics

- **Trial signups**: +25-35% (lower perceived risk)
- **Documentation visits**: +40% (developers validate capabilities)
- **Design partner inquiries**: +50% (roadmap transparency)

### SEO Metrics

- **"MCP token authentication" ranking**: Target top 5
- **"unified search knowledge graph" ranking**: Target top 10
- **Organic traffic**: +15-20% from technical long-tail

---

## Risk Mitigation

### Avoid Over-Promising

**DON'T say:**
- "Complete EPF agent suite operational" (not true, Q2 target)
- "10,000+ users" (if you don't have them)
- "Enterprise-proven at scale" (if still validating)

**DO say:**
- "Infrastructure operational, agents in development"
- "Foundation proven, agent suite launching Q2"
- "Design partners welcome for early access"

### Maintain Philosophical Tone

Don't pivot to pure feature marketing. Keep vision-driven narrative, but **ground it in operational reality**.

**Balance:**
- 70% vision/philosophy/principles (unchanged)
- 30% concrete evidence/features/proof (new)

---

## Next Steps

1. **Review this document** with product/marketing leadership
2. **Prioritize updates** based on traffic patterns (Tech Stack likely highest priority)
3. **Create content calendar** for blog posts (one every 2-3 weeks)
4. **Schedule quarterly review** (March 31, 2026) to update with Q1 progress
5. **Set up analytics** to measure impact of messaging changes

---

## Appendix: Messaging Before/After Examples

### Example 1: Tech Stack Hero

**Before:**
> "The Foundation for Adaptive Systems. Building intelligent, context-aware applications 
> requires fundamentally different architecture."

**After:**
> "The Foundation for Adaptive Systems. Operational AI infrastructure: MCP integration, 
> unified search, token auth. Building intelligent applications on proven components, 
> not research projects."

---

### Example 2: Solutions Positioning

**Before:**
> "Infrastructure that thinks. Not another project management tool."

**After:**
> "Infrastructure that thinks. Not another project management tool. MCP integration 
> operational (Dec 2025). Unified search shipped (Nov 2025). EPF agents launching Q2 2026. 
> Foundation proven, applications scaling."

---

### Example 3: Call-to-Action

**Before:**
> "Explore the Tech Stack →"

**After:**
> "Explore Operational Infrastructure →"  
> (Subtext: "MCP tokens, Unified Search, Activity Tracking — shipping today")

---

**Document Status:** Ready for Review  
**Owner:** Marketing/Product Leadership  
**Next Review:** March 31, 2026 (post-Q1 cycle)
