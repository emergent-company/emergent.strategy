# Emergent: Executive Summary

**Investment Opportunity**  
**Date**: December 30, 2025  
**Stage**: Seed Round ($1-2M)  

---

## The Opportunity in One Paragraph

Emergent is building the intelligence layer that makes AI understand organizations. While 85% of developers now use AI coding assistants (Cursor, Copilot, Claude), these tools are context-blind—they don't understand your product strategy, architecture decisions, or domain knowledge. Emergent connects strategy, documentation, and code into a unified knowledge graph that AI agents can reason over through the Model Context Protocol (MCP). We're targeting technical product teams (5-50 engineers) in a $15B+ AI knowledge infrastructure market, with a developer-led growth model and capital-efficient unit economics (LTV:CAC >10:1).

---

## Problem: AI Assistants Are Powerful But Context-Blind

### Market Shift
- **85% of developers** now use AI coding assistants (up from 20% in 2023)
- **40% time savings** reported on routine coding tasks
- **AI pair programming** becoming the default workflow

### The Critical Gap

AI tools see code syntax but don't understand:
- ❌ Why architectural decisions were made
- ❌ Product strategy and business goals
- ❌ Domain-specific knowledge and terminology
- ❌ Past discussions and decision context
- ❌ Relationships between concepts

### Consequences

**For Developers**:
- AI suggests code that violates architecture patterns → requires manual review and rework
- Context-switching to Notion/Confluence breaks flow state → 20+ minutes of productivity lost per switch
- Tribal knowledge trapped in senior engineers' heads → onboarding takes weeks instead of days

**For Organizations**:
- Knowledge silos prevent scaling → can't hire fast enough because ramping takes too long
- Critical decisions lost when people leave → institutional memory evaporates
- Strategic documents sit unused → PDFs and slide decks aren't machine-readable

### Existing Solutions Fall Short

| Solution | Limitation |
|----------|------------|
| **Notion/Confluence AI** | Siloed within platform; no knowledge graph; no API for AI agents |
| **Google NotebookLM** | Consumer-focused; no self-hosting; no configurability; manual upload only |
| **DIY RAG** | Requires AI/ML expertise; months of infrastructure work; ongoing maintenance |
| **Enterprise Search (Glean)** | Enterprise-sales-first; not built for developers; proprietary lock-in |

**What's needed**: Infrastructure purpose-built for making organizational knowledge AI-accessible—cross-platform, API-first, with configurable extraction and knowledge graphs.

---

## Solution: AI Knowledge Infrastructure

### Core Product: Emergent Core

Transform scattered documents into connected, queryable knowledge:

**1. Document Intelligence**
- Ingest from PDFs, markdown, URLs, integrations (ClickUp, GDrive)
- Chunk intelligently at semantic boundaries
- Extract structured entities with configurable rules (KB Purpose + Template Packs)

**2. Knowledge Graph**
- Typed entities: people, concepts, features, decisions
- Typed relationships: depends_on, implements, relates_to
- Configurable schema for domain-specific modeling

**3. Hybrid Search**
- Vector search (semantic similarity)
- Keyword search (exact matches)
- Graph traversal (connection-based discovery)

**4. AI Agent Integration (MCP)**
- Model Context Protocol server for Claude, GPT, custom agents
- Schema-aware queries during AI conversations
- Real-time knowledge access with citations

**5. Multi-Tenant SaaS**
- Organization → Project hierarchy
- Role-based access control
- Self-service signup and onboarding

### The Emergent Ecosystem

Core is the "brain" of a three-product ecosystem:

**Emergent Core (The Brain)**: Intelligence and memory—what we're fundraising for  
**EPF-Runtime (The Nervous System)**: Orchestrates AI-assisted strategic planning *(separate repo)*  
**Emergent Tools (The Circulatory System)**: Connectors to external systems *(roadmap)*  

This ecosystem creates compounding value: strategy artifacts (EPF) live in Core, Runtime executes workflows autonomously, Tools bridge to external systems (Git, Slack, deployment tracking). No competitor connects the complete loop from strategy to code to production to user feedback.

### Key Differentiators

**vs. Google NotebookLM**: "NotebookLM with the hood open"
- ✅ Self-hostable and configurable
- ✅ API access for programmatic use
- ✅ Knowledge graph (not just chat)
- ✅ Enterprise features (multi-tenancy, SSO, audit logs)

**vs. Glean ($200M+ funded)**: Developer-first, not enterprise-sales-first
- ✅ API-first architecture
- ✅ Transparent reasoning (show sources, explain connections)
- ✅ Open ecosystem (MCP, not proprietary)
- ✅ Self-hostable option

**vs. DIY RAG (LangChain + vector DB)**: Product, not infrastructure project
- ✅ Managed service with faster time-to-value
- ✅ Knowledge graph extraction built-in
- ✅ Configurable without coding

### Technology Foundation

- **Backend**: NestJS (TypeScript)—type safety, modularity, AI library ecosystem
- **Database**: PostgreSQL + pgvector—relational + vector in one system
- **Multi-Tenancy**: Row-Level Security (RLS)—database-enforced isolation
- **Auth**: Zitadel (OIDC/OAuth2)—standards-compliant, enterprise-ready
- **Deployment**: Docker + Kubernetes—cloud-agnostic, self-hostable

**Key Technical Decisions**:
- In-database vector search (no separate Pinecone/Weaviate)—simpler architecture, lower costs
- Graph in PostgreSQL (not Neo4j)—avoids polyglot persistence complexity
- MCP-first integration—bet on emerging standard, early adopter advantage

---

## Market Opportunity

### Target Customer

**Primary**: Technical product teams (5-50 engineers) building complex software

**Characteristics**:
- Already AI-forward (using Cursor, Copilot, Claude)
- Documentation-heavy (architecture docs, ADRs, strategy memos)
- Knowledge management pain (scattered across tools)
- Value developer productivity and flow state

**Initial Beachhead**: Software consultancies and product studios
- Work across multiple codebases (knowledge transfer critical)
- Design partners already using Emergent + EPF Framework

### Market Size

- **TAM**: $15B—100K organizations globally with 5-50 engineers each, $150K average spend potential
- **SAM**: $3B—20K AI-forward technical teams with knowledge management budget
- **SOM (Year 3)**: $30M—500 paying customers @ $60K average ARR

### Market Dynamics

**Tailwinds**:
- AI adoption acceleration: 85% of developers use AI assistants (up from 20% in 2023)
- Context quality matters: Teams realizing generic AI isn't enough
- MCP ecosystem growth: Model Context Protocol becoming standard
- Developer empowerment: Bottom-up buying decisions

**Timing**: AI coding assistants now mainstream, but context gap widely recognized. MCP ecosystem maturing. Knowledge infrastructure expected part of AI toolchain by 2027.

---

## Business Model

### Pricing Tiers

| Tier | Price | Limits | Purpose |
|------|-------|--------|---------|
| **Free** | $0/month | 100 docs, 1K queries/mo, 3 users | Evaluation |
| **Team** | $49/month per project | 10K docs, unlimited queries, 10 users | Growing teams |
| **Business** | $199/month per project | Unlimited docs, SSO, priority support | Serious adoption |
| **Enterprise** | Custom | SLA, dedicated support, custom integrations | Large orgs |

### Unit Economics

- **CAC**: <$200 (developer-led growth, content marketing)
- **LTV**: >$2,000 (2-year average retention)
- **LTV:CAC Ratio**: >10:1 (capital efficient)
- **Payback Period**: <6 months
- **Gross Margin**: >75% (standard SaaS)

### Growth Strategy

**Product-Led Growth (Primary 80%)**:
- Free tier → evaluate → convert to paid → expand seats
- Self-serve onboarding and upgrades
- In-product upsell prompts

**Developer Advocacy (Secondary 20%)**:
- Content marketing (SEO, blog, conference talks)
- Open-source contributions (EPF Framework, MCP examples)
- Partner channel (AI agent providers, consultancies)

---

## Competitive Landscape

### Positioning

**Category**: Creating "AI Knowledge Infrastructure"—the layer between raw documents and AI applications

### Competitive Matrix

| Competitor | Strength | Our Advantage |
|------------|----------|---------------|
| **Google NotebookLM** | Polished UX, free, audio synthesis | Self-hostable, configurable, API access, enterprise features |
| **Glean** | Enterprise sales, $200M+ funding | Developer-friendly, API-first, transparent, open ecosystem |
| **Notion AI** | Huge user base, native to content | Cross-platform knowledge graph, AI agent infrastructure |
| **Microsoft Copilot** | M365 bundle, ecosystem lock-in | Cross-platform, developer control, open standards |
| **Dify.ai (open-source)** | Open-source platform, workflows | Knowledge graph extraction (not just RAG) |
| **Danswer (open-source)** | Enterprise Q&A, good integrations | Configurable extraction, typed relationships |

### Competitive Moats

1. **MCP-First Architecture**: Early mover in emerging standard; implementation know-how compounds
2. **Knowledge Graph + Vector Hybrid**: More sophisticated than pure RAG; requires AI/ML expertise
3. **Git-Native Strategy (EPF)**: Methodology creates network effects as adoption grows
4. **Developer DNA**: API-first, transparent, composable—cultural alignment hard to replicate

### Strategic Risks & Mitigations

**Risk**: Big tech bundling (Microsoft/Google add AI knowledge to existing products)  
**Mitigation**: Differentiate on cross-platform, developer control, open ecosystem; be the Switzerland of AI knowledge

**Risk**: Well-funded competitors (Glean) move downmarket  
**Mitigation**: Win on developer experience, not feature count; enterprise DNA makes serving devs hard

**Risk**: DIY RAG becomes too easy (LangChain + vector DB)  
**Mitigation**: Value in extraction quality, knowledge graph, managed service—not basic RAG; consider open-sourcing core

---

## Traction & Metrics

### Product Milestones
- **Oct 2024**: Emergent Core MVP launched (self-hosted)
- **Nov 2024**: MCP server integration completed
- **Dec 2024**: Multi-tenant SaaS launched, first paying design partners
- **Jan 2025**: ClickUp integration released (alpha)

### Current Metrics *(as of Dec 2024)*

**Product**:
- Documents ingested: 10K+ across all customers
- Knowledge graph entities: 25K+ extracted
- MCP queries: 500+/week (Claude Desktop users)

**Business**:
- Design partners: 3 paying ($500-1K/month each)
- Free tier users: 15 active projects
- MRR: $2K (early stage)

**Community**:
- EPF Framework adopted: 3+ organizations
- Conference talks scheduled: 2 (Q1 2025)

### Key Learnings

**What's Working**:
- MCP integration is killer feature—users see immediate value
- Configurable extraction differentiates from NotebookLM
- Developer-led motion working—get value without sales calls

**What Needs Work**:
- Onboarding friction: Too many steps to first value (addressing in Q1)
- Extraction quality: Varies by document type (improving with Template Packs)
- Pricing clarity: Users unclear when to upgrade (simplifying tiers)

---

## Roadmap & Milestones

### Q1 2025: Discovery & Onboarding
**Goal**: Zero-to-value in <15 minutes

**Features**:
- Discovery Wizard (guided onboarding)
- Template Pack Library (pre-built extraction rules)
- KB Purpose Configuration (guides extraction focus)
- Real-time extraction feedback

**Why Critical**: Reduce time-to-first-value; prove concept before committing

### Q2 2025: MCP Ecosystem
**Goal**: Work with any AI agent

**Features**:
- GPT/Copilot MCP integration
- Advanced graph queries (Cypher-like)
- Streaming responses (token-by-token)
- Performance optimization (<2s response)

**Why Critical**: MCP becoming standard; need to lead ecosystem

### Q3-Q4 2025: Enterprise
**Goal**: Enterprise-ready

**Features**:
- SSO/SAML integration
- Audit logging (compliance-grade)
- Comments & annotations
- Slack integration

**Why Critical**: Unlock $50K+ enterprise deals

### 2026: Platform & Marketplace
**Goal**: Developer platform with network effects

**Features**:
- SDK & Plugin System
- Template Marketplace
- Custom workflows
- Federated knowledge

**Why Critical**: Defensibility through network effects

---

## Team

### Founders

**Nikolai Rinas** - CEO & Founder
- 10+ years enterprise B2B SaaS experience across consultancy and product companies
- CEO at eyedea, a software consultancy with 50+ successful client engagements
- Technical background: Full-stack engineer with deep expertise in AI/ML, distributed systems, and developer tooling
- Built Emergent to solve his own problem: enabling AI coding assistants to access organizational knowledge in a structured, context-aware way

**Why This Team**:
- Experienced the problem firsthand across consultancy projects
- Technical depth to build sophisticated AI/ML product
- B2B SaaS go-to-market experience
- Dogfooding: Building Emergent with Emergent

---

## The Ask

### Investment Details

**Amount**: $1-2M seed round  
**Structure**: Equity (priced round or SAFE)  
**Timeline**: Close by Q1 2025  

### Use of Funds (18-month runway)

| Category | Amount | % | Purpose |
|----------|--------|---|---------|
| **Engineering** | $600K | 40% | 2 senior full-stack, 1 AI/ML engineer |
| **Go-To-Market** | $450K | 30% | Developer advocate, content marketing |
| **Product/Design** | $300K | 20% | 1 product designer, UX research |
| **Infrastructure** | $150K | 10% | Cloud costs, tools, contractors |

### Milestones with Funding

- **Month 6**: 100 paying customers, $10K MRR
- **Month 12**: 250 paying customers, $30K MRR, product-market fit validated
- **Month 18**: 500 paying customers, $60K MRR, ready for Series A

### 3-Year Financial Projections

| Metric | Year 1 | Year 2 | Year 3 |
|--------|--------|--------|--------|
| **Customers** | 500 | 2,000 | 5,000 |
| **ARR** | $500K | $3M | $10M |
| **Gross Margin** | 70% | 75% | 78% |
| **Team Size** | 8 | 15 | 30 |

### Why Now

**Market Timing**:
- AI assistants mainstream, context gap recognized
- MCP ecosystem emerging (early adopter advantage)
- Developer-led buying empowered

**Competitive Timing**:
- NotebookLM proves consumer appeal, but lacks enterprise features
- Enterprise players (Glean) haven't moved downmarket
- Open-source alternatives lack knowledge graph sophistication

**Team Timing**:
- Founders ready to commit full-time
- Design partners providing early validation
- Product at inflection point (launch → scale)

---

## Why Emergent Will Win

### 1. Timing Advantage
Early in MCP ecosystem; implementation know-how compounds. NotebookLM validated consumer appeal; we're building enterprise version.

### 2. Technical Depth
Knowledge graph + vector hybrid requires AI/ML expertise. Multi-tenant from day 1 hard to retrofit. Quality of extraction differentiates.

### 3. Developer DNA
API-first, transparent, composable. Cultural alignment with target users. Hard for enterprise tools to replicate.

### 4. Capital Efficiency
Developer-led growth, high LTV:CAC (>10:1), product-led model. Can reach profitability on seed capital.

### 5. Ecosystem Play
Not just Core product—entire ecosystem (Core + Runtime + Tools) creates compounding value and network effects.

---

## Next Steps

1. **Schedule 30-min product demo**: See Emergent in action
2. **Provide live access**: Try the product yourself
3. **Share detailed financial model**: Unit economics, projections, assumptions
4. **Intro to design partners**: Reference checks with paying customers
5. **Discuss term sheet**: Structure, timeline, next steps

**Contact**:
- **Email**: [founders@emergent.ai]
- **Website**: [emergent.ai] *(TBD)*
- **Founder**: Nikolai | [email] | [LinkedIn] | [GitHub]

---

*This executive summary is confidential and intended solely for evaluation purposes by prospective investors.*

**Document Metadata**:
- Version: 1.0
- Last Updated: 2025-12-30
- Full Memo: See `comprehensive_memo.md` for detailed analysis
- Generated from: EPF strategic planning artifacts
