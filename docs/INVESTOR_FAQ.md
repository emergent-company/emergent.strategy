# Emergent: Investor FAQ
**Frequently Asked Questions for Potential Investors**

---

## Product & Technology

### Q: What exactly does Emergent do?
**A**: Emergent is the intelligence layer that makes AI understand organizational knowledge. We provide three integrated products:
- **Emergent Core**: Knowledge engine with semantic search, knowledge graphs, and AI chat
- **Emergent Frameworks**: Methodologies (like EPF) that structure strategy in machine-readable formats
- **Emergent Tools**: MCP integration that exposes context to AI agents like Cursor and Claude

The result: AI agents can reason about your organization's strategy, decisions, and knowledge—not just code.

### Q: How is this different from ChatGPT or Claude?
**A**: Generic AI tools don't know your organization. Emergent provides the **context layer** that makes AI useful for your specific work:
- ChatGPT: Generic knowledge, no organizational context
- Emergent + AI: Organization-specific knowledge with source citations and strategic context

Think of it as "memory and context" for your AI tools.

### Q: Why not just use Notion AI or Confluence?
**A**: Traditional tools treat documents as isolated content. Emergent builds **connected intelligence**:
- Notion AI: Searches your Notion pages
- Emergent: Builds knowledge graphs across ALL sources (Notion, Drive, Confluence, URLs, code) and exposes them to ALL your AI tools via MCP

We're cross-platform infrastructure, not another silo.

### Q: What's MCP and why does it matter?
**A**: Model Context Protocol (MCP) is Anthropic's emerging standard for how AI agents access external knowledge. Being **MCP-first** positions us as:
- Infrastructure for AI agents (not just another AI app)
- Compatible with any MCP-enabled AI tool (Cursor, Claude Desktop, etc.)
- Early mover in the AI agent ecosystem

### Q: Is the technology proven or experimental?
**A**: **Proven**. We're using production-ready tech:
- PostgreSQL + pgvector for vector search (battle-tested)
- LLM APIs from Google Gemini (commodity infrastructure)
- NestJS + React (standard enterprise stack)
- MCP protocol (Anthropic-backed standard)

Our innovation is in the **combination** and **product design**, not experimental research.

### Q: What's a "knowledge graph" and why does it matter?
**A**: Traditional search is flat: just document matching. Knowledge graphs represent **entities and relationships**:
- Flat: "This document mentions Project X"
- Graph: "Project X uses Architecture Y, decided by Person Z in Document D, because of Business Goal G"

Graphs enable AI to **reason about connections**, not just match keywords.

---

## Market & Competition

### Q: Isn't this market crowded with AI tools?
**A**: The market is crowded with AI **applications** (search, chat, generation). We're building AI **infrastructure**—the context layer that makes applications useful.

No one else connects strategy → knowledge → code for AI agents. We're creating a new category: **AI Knowledge Infrastructure**.

### Q: What about Microsoft Copilot? Won't they crush you?
**A**: Microsoft will win for teams locked into M365. We win everywhere else:
- **Cross-platform**: Works with Notion, Drive, Confluence, GitHub, etc.
- **Developer control**: API-first, self-hostable, transparent
- **Ecosystem**: Works with Cursor, Claude, any MCP-enabled tool

We're the **Switzerland of AI knowledge**—vendor-neutral infrastructure.

### Q: How do you compete with well-funded startups like Glean?
**A**: Glean targets enterprise with sales-led motion. We target developers with product-led growth:
- Glean: $200M+ funding, enterprise sales team, black-box AI
- Emergent: Capital efficient, self-serve, transparent API-first

We win on **developer experience**, not enterprise sales muscle.

### Q: What about Google NotebookLM? It seems similar.
**A**: NotebookLM is magic for consumers. We're "NotebookLM with the hood open" for teams:
- NotebookLM: Manual upload, no API, personal only
- Emergent: Integrations, full API, multi-tenant, configurable

They validate the concept. We build the enterprise infrastructure.

### Q: Why can't teams just build this themselves with LangChain?
**A**: They can (and some do). But:
- Building is expensive (engineering time + maintenance)
- Quality matters (extraction, chunking, graph building are hard)
- Infrastructure overhead (auth, multi-tenancy, scale)
- Ecosystem value (EPF methodology, MCP integration, templates)

We're **GraphRAG as a Service** + ecosystem—faster time-to-value than DIY.

---

## Business Model & Economics

### Q: How do you make money?
**A**: **Usage-based SaaS** with four tiers:
- Free: $0 (evaluation)
- Team: $49/mo (growing teams)
- Business: $199/mo (security needs)
- Enterprise: Custom (large orgs)

Revenue scales with usage (documents, queries, seats).

### Q: Why is CAC so low (<$200)?
**A**: **Product-led growth**:
- Free tier for evaluation (no sales call needed)
- Self-serve signup and onboarding
- Developer-led adoption (bottom-up)
- Content marketing and word-of-mouth

We avoid expensive enterprise sales in Phase 1.

### Q: What's your conversion rate assumption?
**A**: Conservative estimates for Phase 1:
- Free → Team: 20% (industry standard for dev tools)
- Team → Business: 50% (security/scale needs)
- Business → Enterprise: 20% (custom requirements)

Validated through design partner conversations.

### Q: How do you justify >10:1 LTV:CAC?
**A**: 
- **Low CAC**: $200 (product-led, no sales team)
- **High LTV**: $2,000+ (2-year retention, $49-199/mo ARPU)
- **Strong retention**: Knowledge lock-in (switching = data loss)

Industry benchmark for dev tools: 3-5:1. We target 10:1 due to PLG efficiency.

### Q: What's your churn assumption?
**A**: 
- **Monthly churn**: ~3-5% (SaaS standard)
- **Annual retention**: ~80-85%
- **Retention drivers**: Knowledge accumulation (switching cost), integration depth, methodology adoption (EPF)

Design partner program validates retention assumptions.

---

## Traction & Validation

### Q: Do you have any customers yet?
**A**: Currently in **design partner phase** (Q1 2025):
- 3 external teams planned for Q1
- Internal dogfooding validated (Emergent builds Emergent)
- 40%+ AI improvement metric confirmed internally

Seed funding accelerates design partner → paid customer transition.

### Q: What's the 40% AI improvement metric?
**A**: **Validated internally**: When AI coding assistants (Cursor, Claude) have access to Emergent's knowledge graph and EPF strategy artifacts, they complete tasks 40%+ more successfully compared to context-blind AI.

Measurement: Task completion rate on real development work (feature implementation, architecture decisions, bug investigation).

### Q: Why should I believe the market will pay for this?
**A**: Evidence of willingness to pay:
1. **Proxy**: Teams already pay for Notion ($10/seat), Confluence ($5-30/seat), AI tools ($20/seat)
2. **Problem severity**: 70% of developers cite context-switching as #1 productivity killer
3. **User research**: "We'd pay for AI that actually understands our product" (consistent feedback from 12 founder interviews)
4. **Comparable**: Glean charges $1,000+/year per user; we're 1/5th the price

### Q: How many LOIs or commitments do you have?
**A**: **Q1 2025 goal**: 3 design partners → 2+ expressing purchase intent.

Current state (Dec 2025): Outreach pipeline of 15 warm leads from TwentyFirst/Eyedea network. Seed funding accelerates conversion to design partnerships.

---

## Team & Execution

### Q: What's your team size?
**A**: **Current**: Core engineering team from Eyedea/TwentyFirst
- Deep AI/ML expertise (production LLM systems, RAG, embeddings)
- Modern architecture (multi-tenant, API-first)
- Proven delivery (multiple AI projects for clients)

**Seed funding adds**: 4 key hires (engineer, DevRel, designer, CS lead)

### Q: Why are you the right team to build this?
**A**: Three key advantages:
1. **Domain expertise**: We've built this tech for clients; now productizing our own
2. **Dogfooding**: We use Emergent to build Emergent (recursive validation)
3. **Developer DNA**: We ARE the target customer—developers building AI-native products

### Q: What's your biggest execution risk?
**A**: **Small team executing ambitious vision**. Mitigation:
- Ruthless focus on Phase 1 beachhead (100 teams, not 10,000)
- Strategic hiring for leverage (DevRel scales adoption, not just engineers)
- AI tools multiply output (using our own product)
- Design partners validate before scaling

### Q: Why not just join a bigger company or get acquihired?
**A**: This is a **category creation opportunity**:
- Market window: 18-24 months before incumbents respond
- Unique positioning: Only solution connecting strategy → knowledge → code
- Ecosystem potential: EPF + MCP + knowledge graphs create compounding value

Bigger companies lack our developer focus and move slower on emerging protocols like MCP.

---

## Strategic & Risk

### Q: What's your moat?
**A**: Four defensible advantages:
1. **MCP-first**: Early mover in AI agent protocol (implementation know-how)
2. **Knowledge graphs**: Richer than pure RAG (requires deep domain modeling)
3. **EPF methodology**: Network effects as teams adopt (switching = methodology loss)
4. **Developer DNA**: Cultural fit hard to replicate for enterprise tools

### Q: What if big tech bundles this for free?
**A**: **Likely scenario**. Our response:
- **Cross-platform**: We work with everyone; they lock you in
- **Developer control**: Transparent, API-first, self-hostable
- **Depth**: We go deeper in AI-native workflows than bundled features
- **Speed**: We move faster on MCP and agent architectures

Think **Stripe** (bundled payments exist, but dev experience won).

### Q: What's your biggest threat?
**A**: **Technology commoditization**—basic RAG becomes too easy to build. Mitigation:
1. **Quality**: Extraction and graph building are hard; quality matters
2. **Ecosystem**: EPF + MCP + templates create value beyond tech
3. **Managed service**: Infrastructure overhead (auth, scale, multi-tenancy)
4. **Consider open-source**: Capture DIY builders, monetize managed service

### Q: Why now? Why not 2 years ago or 2 years from now?
**A**: **Perfect timing convergence**:
- **2 years ago**: LLMs too immature, RAG frameworks nascent, MCP didn't exist
- **Now**: LLMs commoditized, RAG proven, MCP emerging, AI adoption accelerating
- **2 years from now**: Incumbents will have caught up; window closed

The **18-24 month window** to establish category leadership is NOW.

---

## Financials & Fundraising

### Q: How much are you raising?
**A**: **Seed round: $1-2M** for 18-24 month runway

### Q: What's the post-money valuation target?
**A**: Determined by market conversations, but benchmarks:
- Pre-revenue AI infrastructure: $5-10M typical
- With validated metrics: $10-15M
- Target: **$8-12M post-money** (8-12% dilution for $1M raise)

### Q: What will the funds be used for?
**A**: 
- 40% Product (engineering team, MCP, enterprise features)
- 30% GTM (design partners, content, community)
- 20% Ops (customer success, feedback loops)
- 10% Reserve (contingency)

Focus: Accelerate Phase 1 execution (100 teams by end of 2025).

### Q: When do you expect Series A?
**A**: **Target: Q4 2025 or Q1 2026**, with metrics:
- 100+ active teams
- $50K+ MRR
- Validated product-market fit (NPS >50)
- Clear expansion path to professional services

### Q: What's your exit strategy?
**A**: Three potential paths:
1. **Strategic acquisition**: Microsoft, Google, Atlassian (AI infrastructure layer)
2. **IPO trajectory**: If we hit $100M+ ARR (5-7 years)
3. **Independent SaaS**: Sustainable growth to profitability

Not optimizing for specific exit; optimizing for **category leadership**.

### Q: What ownership % are founders targeting long-term?
**A**: Standard progression:
- Post-seed: 60-70% (depending on seed size)
- Post-Series A: 45-55%
- Post-Series B: 30-40%
- Exit: 20-30% (assuming 2-3 rounds)

Goal: Maintain meaningful ownership while raising sufficient capital to win market.

---

## Comparable Companies & Benchmarks

### Q: What are your comparable companies?
**A**: Different dimensions:

**By Technology**:
- GraphRAG (open-source): Validates technical approach
- Pinecone ($750M valuation): Vector database infrastructure
- LangChain (unicorn trajectory): LLM orchestration framework

**By Market**:
- Glean ($2.2B valuation): Enterprise AI search
- Notion ($10B valuation): Knowledge management + AI
- MongoDB ($20B+ public): Developer-first database

**By GTM**:
- Stripe: API-first, developer-led adoption, PLG
- Twilio: Developer tools, usage-based pricing

### Q: How do valuations compare?
**A**: AI infrastructure benchmarks (2024-2025):
- Pre-revenue seed: $5-10M typical
- Early traction (design partners): $10-20M
- Revenue ($1M ARR): $20-50M (20-50x multiple)
- Growth ($10M ARR): $100-300M (10-30x multiple)

Our ask ($8-12M post-money) is **market rate** for stage.

---

## Closing Questions

### Q: What's the single most important thing to understand about Emergent?
**A**: **We're building infrastructure, not an application.** 

AI apps are commoditizing. AI infrastructure that makes apps useful is where lasting value accrues. We're the **context layer** that every AI tool needs but none provide.

### Q: If you could only fix one problem, what would it be?
**A**: **AI tools are smart but blind.** 

Fix that, and everything else (productivity, decision quality, onboarding, knowledge retention) improves dramatically. The 40%+ task completion improvement proves it.

### Q: What keeps you up at night?
**A**: **Market timing.** We have an 18-24 month window before incumbents respond. Execution speed matters more than perfection. That's why we're raising now—to accelerate.

### Q: What excites you most about this opportunity?
**A**: **Category creation.** 

We're not building another AI search tool. We're creating the **AI Knowledge Infrastructure** category—the layer between raw documents and AI applications. First movers who define categories win outsized returns.

### Q: How can I learn more or get involved?
**A**: 
- **Full memo**: Read INVESTOR_MEMO.md for comprehensive details
- **Demo**: Schedule via emergent.sh
- **Design partner**: If you're a technical team, try Emergent
- **Connect**: Reach out via website or warm intro

---

## Quick Reference

**One-sentence pitch**: The intelligence layer that makes AI understand your organization.

**Market size**: $5-10B SAM, 20-30% growth

**Differentiation**: MCP-first, knowledge graphs, git-native strategy (EPF)

**Traction**: 40%+ AI improvement validated, design partners Q1 2025

**Ask**: $1-2M seed, 18-24 month runway, 4 key hires

**Timeline**: Phase 1 (2025), Phase 2 (2026), Phase 3 (2027+)

**Exit**: Strategic acquisition or IPO trajectory if $100M+ ARR

---

*For more details, see:*
- *INVESTOR_MEMO.md (comprehensive 30+ page deep-dive)*
- *INVESTOR_MEMO_EXECUTIVE_SUMMARY.md (8-page overview)*
- *INVESTOR_MEMO_ONE_PAGE_PITCH.md (single-page snapshot)*

*Version 1.0 | December 11, 2025*
