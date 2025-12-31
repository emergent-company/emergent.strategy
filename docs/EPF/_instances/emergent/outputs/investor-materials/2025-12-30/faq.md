# Emergent: Investor FAQ

**Comprehensive Q&A for Prospective Investors**  
**Date**: December 30, 2025  
**Version**: 1.0

---

## Table of Contents

1. [Product & Technology](#product--technology)
2. [Market & Competition](#market--competition)
3. [Business Model & Economics](#business-model--economics)
4. [Go-To-Market Strategy](#go-to-market-strategy)
5. [Team & Execution](#team--execution)
6. [Fundraising & Use of Funds](#fundraising--use-of-funds)
7. [Risks & Challenges](#risks--challenges)

---

## Product & Technology

### Q: What exactly does Emergent do in simple terms?

Emergent transforms your documentation (PDFs, markdown, URLs, integrations) into a knowledge graph that AI assistants can understand and query. When a developer asks Claude or GPT a question, it can access your organization's context—strategy docs, architecture decisions, domain knowledge—and give informed answers with citations.

### Q: How is this different from NotebookLM?

NotebookLM is consumer-focused and closed. We're enterprise-focused and open:
- **Self-hostable**: Run on your infrastructure
- **API access**: Programmatic integration
- **Knowledge graph**: Not just chat, but typed entities and relationships
- **Configurable**: Template Packs and KB Purpose guide extraction
- **Multi-tenant**: Organization and project hierarchy

### Q: What is MCP and why does it matter?

Model Context Protocol (MCP) is an emerging standard from Anthropic for how AI applications access external context. It's like OAuth for AI context—instead of copying-pasting documents, AI agents can query knowledge sources directly.

**Why it matters**:
- Becoming the standard (Claude Desktop, others adopting)
- Early mover advantage (implementation know-how compounds)
- Opens ecosystem play (any MCP-compatible agent can use Emergent)

### Q: What's a "knowledge graph" and why not just use RAG?

**RAG** (Retrieval-Augmented Generation): Find relevant text chunks, pass to LLM
**Knowledge Graph**: Structured entities with typed relationships

**Example**: "What features depend on the Discovery Wizard?"
- RAG: Finds documents mentioning both, returns text chunks
- Knowledge graph: Follows `depends_on` relationships, returns structured answer

Knowledge graphs enable:
- Traversal queries (find all indirect dependencies)
- Typed filtering (show only "Feature" entities)
- Relationship reasoning (how are concepts connected?)

### Q: How does extraction work? Can I customize it?

**Default Extraction**: Uses LLM prompts to identify entities and relationships from text

**Customization** (via Template Packs + KB Purpose):
- **KB Purpose**: High-level goal ("extract TOGAF concepts from architecture docs")
- **Template Packs**: Pre-built schemas (e.g., "software-architecture" pack with Component, Layer, Pattern entities)
- **Custom Types**: Define your own entity types and relationship types

**Example**: A fintech startup might create a "financial-services" Template Pack with entities like Transaction, Account, Regulation, and relationships like complies_with, processes.

### Q: What databases/infrastructure do you use?

- **PostgreSQL + pgvector**: Single database for relational + vector data
- **NestJS (TypeScript)**: Backend framework
- **React**: Frontend
- **Zitadel**: Authentication (OIDC/OAuth2)
- **Docker + Kubernetes**: Deployment

**Key Decision**: In-database vector search (no separate Pinecone/Weaviate) simplifies architecture and reduces costs.

### Q: How do you handle multi-tenancy and security?

**Multi-Tenancy**: Organization → Projects hierarchy with Row-Level Security (RLS) in PostgreSQL
- RLS enforced at database level (defense in depth)
- Each query scoped to org_id/project_id automatically

**Security**:
- OAuth2/OIDC authentication via Zitadel
- Role-based access control (org admin, project member, viewer)
- Audit logging for compliance
- Self-hosting option for sensitive data

### Q: What integrations do you support?

**Current**:
- File upload (PDF, markdown, text)
- URL scraping
- ClickUp (alpha)

**Roadmap Q1-Q2 2025**:
- Google Drive
- GitHub (issues, discussions, wikis)
- Notion
- Confluence
- Slack (message history)

### Q: Can I self-host Emergent?

Yes. We offer:
- **SaaS**: Managed hosting (primary offering)
- **Self-hosted**: Docker images, Kubernetes manifests (available now)
- **Enterprise**: Dedicated cloud instance or on-premise (custom pricing)

Self-hosting appeals to:
- Regulated industries (healthcare, finance)
- Large enterprises with data sovereignty requirements
- Cost-conscious teams at scale

---

## Market & Competition

### Q: Who is your target customer?

**Primary**: Technical product teams (5-50 engineers) building complex software

**Characteristics**:
- Already AI-forward (using Cursor, Copilot, Claude)
- Documentation-heavy (architecture docs, ADRs, strategy)
- Knowledge management pain (scattered across tools)
- Value developer productivity and flow state

**Initial Beachhead**: Software consultancies and product studios (work across multiple codebases, knowledge transfer critical)

### Q: How big is the market really?

**TAM**: $15B (100K orgs globally × $150K avg spend)
**SAM**: $3B (20K AI-forward teams with budget)
**SOM Year 3**: $30M (500 customers @ $60K ARR)

**Sizing Logic**:
- 100K organizations globally with 5-50 engineers
- Each spends ~$150K/year on developer productivity tools (IDEs, CI/CD, collaboration, etc.)
- 20% are AI-forward with knowledge management budget (SAM)
- We can realistically capture 500 (0.5% of TAM) in Year 3

### Q: What about NotebookLM? Won't Google crush you?

NotebookLM validates the problem but serves consumers/prosumers. We're building the enterprise version:

**NotebookLM Strengths**:
- Beautiful UX
- Free (subsidized by Google)
- Audio synthesis (novel feature)

**Our Advantages**:
- Self-hostable (data sovereignty)
- API access (programmatic use)
- Knowledge graph (not just chat)
- Multi-tenant (teams and orgs)
- Configurable extraction

**Strategic View**: NotebookLM is proof of concept. We're building what enterprises need. Google's consumer focus and closed platform give us an opening.

### Q: What about Glean? They have $200M+ funding.

Glean is enterprise-search-first with traditional enterprise sales motion. We're developer-first with product-led growth:

| Dimension | Glean | Emergent |
|-----------|-------|----------|
| **Buyer** | CIO/VP Engineering | Developers/tech leads |
| **Sales** | Enterprise AEs | Self-serve |
| **Price** | $100K+ enterprise deals | $49/mo → $60K/yr |
| **Positioning** | Search replacement | AI infrastructure |
| **Architecture** | Proprietary | Open (MCP) |

**Strategic View**: Glean serves enterprise buyers top-down. We serve developers bottom-up. Different motions, different cultures. Hard for them to serve both.

### Q: Can't developers just build this themselves with LangChain + vector DB?

**In theory, yes.** In practice:
- Requires AI/ML expertise (embeddings, chunking strategies, retrieval tuning)
- Months of infrastructure work (multi-tenancy, auth, integrations)
- Ongoing maintenance (model updates, scaling, cost optimization)
- No knowledge graph (requires NLP/entity extraction expertise)

**Our Value**:
- Managed service → faster time-to-value
- Knowledge graph extraction built-in
- Configurable without coding (Template Packs)
- Enterprise features (SSO, audit logs, RBAC)

**Analogy**: "Can't you build your own CRM with Django?" Technically yes, but Salesforce exists because DIY has hidden costs.

### Q: What about other open-source alternatives (Dify, Danswer)?

**Dify.ai**: Workflow platform for building AI apps
- **Their Focus**: Visual workflow builder, app marketplace
- **Our Focus**: Knowledge graph extraction, MCP integration
- **Overlap**: Both do RAG, but we go deeper on knowledge structure

**Danswer**: Enterprise Q&A over docs
- **Their Focus**: Search-oriented, Slack integration
- **Our Focus**: AI agent infrastructure, typed relationships
- **Overlap**: Both do document ingestion, but we add graph layer

**Strategic View**: Potential partners, not enemies. We could integrate (Emergent as knowledge layer for Dify workflows). Open-source keeps us honest on pricing.

---

## Business Model & Economics

### Q: Why those pricing tiers ($0/$49/$199/Custom)?

**Free ($0)**: Evaluation and small teams
- 100 docs, 1K queries/mo, 3 users
- Proves concept before committing
- Viral coefficient (free users share)

**Team ($49/mo per project)**: Growing teams
- 10K docs, unlimited queries, 10 users
- Priced for budget approval threshold
- Comparable to other dev tools (Linear $8/user, Notion $10/user)

**Business ($199/mo per project)**: Serious adoption
- Unlimited docs, SSO, priority support
- 4× Team tier = $49 × 4 seats equivalent
- Targets mid-market ($10K-50K/yr)

**Enterprise (Custom)**: Large orgs
- SLA, dedicated support, custom integrations
- Priced based on scale and needs
- Targets $50K+ deals

### Q: How do you get to >10:1 LTV:CAC?

**Low CAC (<$200)**:
- Product-led growth (self-serve signup)
- Content marketing (SEO, blog, conference talks)
- Open-source contributions (EPF Framework visibility)
- No enterprise sales team initially

**High LTV (>$2K)**:
- 2-year average retention (sticky once embedded)
- Expansion revenue (more projects, tier upgrades)
- Low churn (critical infrastructure)

**Math**: $60K average ARR / 2 years = $30K LTV per customer; $30K / $200 CAC = 150:1 (conservative targeting 10:1)

### Q: What's your expansion strategy within accounts?

**Land**: Single project, Team tier ($49/mo)

**Expand**:
1. Add more projects ($49/mo each)
2. Upgrade to Business tier ($199/mo for unlimited)
3. Add seats within projects
4. Enterprise tier for org-wide rollout

**Triggers**:
- Usage-based prompts ("You're at 80% of doc limit")
- Feature gates (SSO only in Business+)
- Success stories (case studies drive upgrades)

**Expansion ARR Potential**: Land at $588/yr (Team), expand to $2,388/yr (Business), then $60K+ (Enterprise) = 100× expansion opportunity

### Q: What about churn? How sticky is this?

**Stickiness Factors**:
- Knowledge graph is moat (accumulated value)
- AI agents depend on it (critical path)
- Template Packs are custom (switching cost)
- Embedded in workflow (daily use)

**Churn Risks**:
- Early stage (customers still evaluating AI tools)
- Competitors offering free (NotebookLM)
- DIY (teams with AI/ML resources)

**Mitigation**:
- Onboarding support (Q1 Discovery Wizard)
- Community building (EPF Framework users)
- Feature velocity (stay ahead of free alternatives)

**Target**: <5% monthly churn by Month 12

### Q: When do you break even?

**Conservative Scenario** (18-month runway on $1.5M seed):
- Month 12: 250 customers @ $30K MRR = $360K ARR
- Burn: ~$85K/month (team of 8)
- Break-even: ~Month 18-20 at 500 customers, $60K MRR

**With Follow-On** (Series A at Month 18):
- Accelerate growth, not survival mode
- Target: $1M ARR by Month 24
- Break-even: Month 30-36 (post-Series A)

---

## Go-To-Market Strategy

### Q: How will you acquire customers?

**Product-Led Growth (80% of pipeline)**:
1. Free tier → Evaluate → Convert to paid
2. Self-serve onboarding (no sales calls)
3. In-product upsell prompts (usage-based)
4. Viral loops (share projects, invite teammates)

**Developer Advocacy (20% of pipeline)**:
1. Content marketing (SEO, blog posts, conference talks)
2. Open-source contributions (EPF Framework, MCP examples)
3. Partner channel (AI agent providers, consultancies)
4. Community building (Discord, office hours)

**Metrics to Track**:
- Free signups (volume)
- Free-to-paid conversion (15% target)
- Time-to-first-value (<15 minutes target)
- Net Promoter Score (>50 target)

### Q: What's your content strategy?

**Technical Depth** (differentiation):
- How-to guides (MCP integration, knowledge graph queries)
- Architecture deep dives (in-database vector search)
- Case studies (customer success stories)

**SEO Targets** (discovery):
- "AI knowledge base for developers"
- "MCP server implementation"
- "RAG vs knowledge graph"
- "NotebookLM alternative for enterprises"

**Distribution**:
- Company blog (SEO primary)
- Dev.to, Medium (syndication)
- HackerNews, Reddit (community engagement)
- Conference talks (visibility, credibility)

### Q: Why not hire sales reps?

**Early Stage**: Product-led growth more capital efficient
- Sales rep: $150K+ fully loaded, 6-month ramp
- Content/product: $50K/year, compounds over time

**Timing**: Add sales when:
- Enterprise deals >$50K/yr materialize (Month 12+)
- Inbound volume exceeds founder bandwidth
- Proven playbook to teach reps

**Strategic View**: Developer tools sold developer-to-developer initially. Sales layer added once product-market fit proven and average deal size justifies.

---

## Team & Execution

### Q: Why is this team capable of executing?

**Domain Expertise**: Experienced the problem firsthand across consultancy projects (scattered docs, knowledge silos, AI context gaps)

**Technical Depth**: Full-stack engineers with AI/ML project experience; capable of building sophisticated knowledge graph extraction and vector search

**B2B SaaS Experience**: 10+ years building and scaling enterprise products; understand developer-led growth and product-market fit discovery

**Dogfooding**: Building Emergent with Emergent (using our own product for strategy docs, architecture decisions, investor materials)

### Q: What roles will you hire first?

**With Seed Funding** (18-month runway):

**Engineering (40% of budget)**:
- 2× Senior Full-Stack Engineers (backend + frontend)
- 1× AI/ML Engineer (extraction quality, embeddings optimization)

**Go-To-Market (30% of budget)**:
- 1× Developer Advocate (content, community, conference talks)
- Marketing contractors (SEO, content production)

**Product/Design (20% of budget)**:
- 1× Product Designer (UX research, design system)
- Usability testing contractors

**Infrastructure (10% of budget)**:
- Cloud costs (compute, storage, bandwidth)
- Tools (monitoring, analytics, support)

### Q: What keeps you up at night?

**Execution Risks**:
- Onboarding friction → customers don't reach "aha" moment
- Extraction quality → varies by document type, hard to guarantee
- MCP adoption → we're betting on emerging standard
- Feature velocity → keeping pace with well-funded competitors

**Mitigations**:
- Q1 Discovery Wizard addresses onboarding (priority #1)
- Template Pack Library + continuous LLM prompt tuning for quality
- Dual bet: MCP + direct API access (hedge)
- Focus on differentiation (knowledge graph) not feature parity

---

## Fundraising & Use of Funds

### Q: Why raise now?

**Product**: MVP launched, design partners paying, product-market fit signals

**Market**: AI assistants mainstream (85% adoption), context gap recognized, MCP ecosystem emerging

**Timing**: Early enough to establish MCP leadership, late enough to have validation

**Team**: Founders ready to commit full-time

### Q: Why this amount ($1-2M)?

**18-Month Runway**:
- 6 months → 100 customers, $10K MRR (validation)
- 12 months → 250 customers, $30K MRR (product-market fit)
- 18 months → 500 customers, $60K MRR (Series A ready)

**Team Size**: 8 people fully loaded (~$85K/month burn)

**Optionality**: Buffer for hiring delays, infrastructure costs, unexpected challenges

### Q: What does success look like in 18 months?

**Quantitative**:
- 500 paying customers
- $60K MRR ($720K ARR)
- <5% monthly churn
- >10:1 LTV:CAC validated
- 20+ enterprise customers (>$10K/yr each)

**Qualitative**:
- Product-market fit demonstrated (NPS >50, retention >95%)
- MCP ecosystem leadership (reference architecture, conference talks)
- Community momentum (EPF Framework adoption, open-source contributions)
- Clear path to $1M+ ARR (Series A readiness)

### Q: What's the exit strategy?

**Scenarios**:

**Strategic Acquisition** ($50M-200M):
- AI platform companies (OpenAI, Anthropic, Microsoft/GitHub)
- Developer tools companies (Atlassian, GitLab, JetBrains)
- Enterprise software companies (Salesforce, ServiceNow)

**Independent Growth** ($500M+ valuation):
- Developer-led SaaS businesses can reach $50M-100M ARR
- Comparable: Notion ($10B), Airtable ($11B), Figma ($20B before acquisition)

**Timeline**: 5-7 years to meaningful exit

---

## Risks & Challenges

### Q: What if Big Tech bundles this into existing products?

**Risk**: Microsoft adds AI knowledge to M365, Google adds to Workspace

**Likelihood**: HIGH (they're already experimenting)

**Impact**: HIGH (distribution advantage)

**Mitigations**:
- Differentiate on cross-platform (not tied to M365/Workspace)
- Differentiate on developer control (self-hostable, configurable)
- Differentiate on open ecosystem (MCP, not proprietary)
- Be the Switzerland of AI knowledge (integrates everywhere)

### Q: What if well-funded competitors (Glean) move downmarket?

**Risk**: Glean drops pricing to compete for SMB/mid-market

**Likelihood**: MEDIUM (enterprise DNA makes serving devs hard)

**Impact**: MEDIUM (we're differentiated, but overlap exists)

**Mitigations**:
- Win on developer experience, not feature count
- Leverage open ecosystem (MCP) vs proprietary
- Build community (EPF Framework) as moat
- Move upmarket ourselves (enterprise features in roadmap)

### Q: What if DIY RAG becomes too easy?

**Risk**: LangChain/LlamaIndex make building RAG trivial

**Likelihood**: MEDIUM (RAG getting easier, knowledge graph still hard)

**Impact**: LOW (our value is extraction quality + managed service)

**Mitigations**:
- Double down on knowledge graph (harder than RAG)
- Emphasize managed service value (time-to-value, no maintenance)
- Consider open-sourcing core (community contributions, network effects)

### Q: What if MCP doesn't become the standard?

**Risk**: MCP adoption stalls, other protocols win

**Likelihood**: LOW (Anthropic backing, early momentum)

**Impact**: MEDIUM (we're betting on MCP-first)

**Mitigations**:
- Maintain direct API access (not MCP-only)
- Support multiple protocols as they emerge
- Worst case: REST API still valuable for programmatic access

### Q: Can this team execute fast enough?

**Risk**: Small team, many competing priorities

**Likelihood**: MEDIUM (common startup risk)

**Impact**: HIGH (velocity determines winner)

**Mitigations**:
- Hire aggressively with seed funding (2-3 engineers immediately)
- Prioritize ruthlessly (Discovery Wizard Q1, then MCP ecosystem Q2)
- Leverage open-source (EPF Framework contributors)
- Fundraise again when runway gets short (Series A at Month 18)

---

## Appendix: Quick Reference

### Key Metrics Summary

| Metric | Current | Month 6 | Month 12 | Month 18 |
|--------|---------|---------|----------|----------|
| Customers | 3 | 100 | 250 | 500 |
| MRR | $2K | $10K | $30K | $60K |
| ARR | $24K | $120K | $360K | $720K |
| Churn | N/A | 8% | 5% | <5% |

### Contact Information

**Email**: [founders@emergent.ai]  
**Founder**: Nikolai | [email] | [LinkedIn] | [GitHub]  
**Website**: [emergent.ai] *(TBD)*  

### Document Versions

- **Comprehensive Memo**: Full 30-40 page deep dive
- **Executive Summary**: 12-15 page overview
- **One-Page Pitch**: 4-6 page quick reference
- **FAQ**: This document (20-30 pages Q&A)

---

*This FAQ is confidential and intended solely for evaluation purposes by prospective investors.*

**Version**: 1.0  
**Last Updated**: 2025-12-30  
**Generated from**: EPF strategic planning artifacts
