# Emergent Tech Stack: Overview

**Document Type:** Website Content  
**Page URL:** `/tech-stack`  
**Target Audience:** CTOs, Architects, Developers, Platform Engineers  
**Tone:** Technical, precise, capabilities-focused  
**Word Count:** ~900 words

---

## Hero Section

### Headline

**The Foundation for Adaptive Systems**

### Subheadline

Building intelligent, context-aware applications requires fundamentally different architecture. The Emergent Tech Stack provides open, extensible infrastructure that embodies the principles of interconnected context, intelligent agency, and adaptive loops—so you can focus on your domain, not plumbing.

---

## Section 1: Why Different Architecture Matters

### The Traditional Stack Doesn't Scale to Complexity

You've built products on traditional stacks. PostgreSQL for storage. Redis for caching. REST APIs for data access. React for UI. It works—until you try to build something that needs to:

- **Understand context, not just keywords:** Semantic search across documents, not SQL LIKE queries
- **Reason over relationships:** Graph traversal to trace intent → execution → outcomes
- **Synthesize understanding:** AI agents that generate insights, not just retrieve records
- **Adapt continuously:** Systems that learn from interaction and evolve over time

Traditional stacks require you to assemble these capabilities from scratch. Choose a vector database. Integrate an LLM provider. Build RAG pipelines. Design agent frameworks. Handle edge cases. Debug production issues.

**By the time you finish the infrastructure, you're out of runway for the product.**

### What Adaptive Systems Require

Infrastructure that:

1. **Captures context natively:** Knowledge graphs + semantic vectors, not just relational tables
2. **Enables intelligence:** Agent frameworks with tool use, observability, and orchestration built-in
3. **Prioritizes privacy:** Local-first processing, hybrid cloud modes, self-hosting options
4. **Customizes without forking:** Template packs for domain-specific logic, no code changes required
5. **Scales from prototype to production:** Battle-tested components, not research projects

**The Emergent Tech Stack provides this foundation.**

---

## Section 2: The Stack Components

### emergent.core: The Intelligent Knowledge Infrastructure

**Positioning:** The platform for building AI-powered, context-aware applications.

**What It Is:**

A full-stack knowledge platform combining:

- **Knowledge Graph:** Entity-relationship modeling with semantic understanding
- **Vector Search:** Embedded LanceDB for semantic retrieval (on-disk, privacy-first)
- **Unified Search Engine:** 5 fusion strategies (weighted, RRF, interleave, graph-first, text-first) with <300ms p95 latency
- **RAG Pipeline:** Multi-stage retrieval, reranking, source citation
- **Agent Framework:** Configurable AI agents with tool use and multi-agent orchestration
- **MCP Integration:** Model Context Protocol support for extensibility
- **API Token Management:** Dual authentication (OAuth2 + programmatic tokens) with scoped permissions for AI agents and scripts
- **Template Packs:** Domain-specific customization without code changes

**Built on proven technologies:**

- TypeScript end-to-end (type safety across stack)
- NestJS backend (enterprise-ready architecture)
- React + Vercel AI SDK (streaming chat, real-time UX)
- PostgreSQL + TypeORM (relational foundation for graph queries)
- LanceDB (embedded vector database, local-first)
- Zitadel (self-hosted identity and RBAC)

**Why It Matters:**

- **Time to Market:** Launch products in weeks, not months (reuse infrastructure)
- **Privacy Compliance:** GDPR/CCPA-ready with local-first architecture
- **Extensibility:** MCP servers and template packs enable vertical-specific customization
- **Control:** Open-source optionality, self-hosting, no vendor lock-in

> **[Learn More About emergent.core →](/tech-stack/core)**

---

## Section 3: Technical Enablement of Emergent Principles

### How the Stack Realizes the Vision

The Tech Stack isn't just a collection of tools—it's a technical implementation of the three Emergent principles.

#### Interconnected Context

**Knowledge Graph + Semantic Vectors**

- **Graph queries:** Traverse relationships (OKR → RAT → Work Package → Evidence)
- **Semantic search:** Find documents by meaning, not exact keywords (LanceDB embeddings)
- **Hybrid retrieval:** Combine graph traversal + vector similarity + keyword matching
- **Cross-references:** Automatically link related content across documents

**Why It Matters:** Context flows naturally. Query "Why are we building feature X?" and get the full traceability chain from strategic intent to execution.

---

#### Intelligent Agency

**Agent Framework + MCP Integration**

- **Configurable agents:** Define via template packs (prompts, tools, behaviors)
- **Tool use:** Agents execute actions (query databases, call APIs, trigger workflows)
- **Multi-agent orchestration:** Agents call other agents (Pathfinder → Research Assistant)
- **MCP servers:** Connect to external systems (Playwright, Postgres, custom tools)
- **Observability:** LangSmith tracing for every agent interaction

**Real-World Example:**

The Emergent admin UI demonstrates this in production:

1. **Token Setup**: Developer creates API token with `search:read` scope (30 seconds)
2. **MCP Configuration**: Add token to Cursor/Claude MCP settings (1 minute)
3. **Contextual Queries**: AI assistant now queries knowledge graph directly
4. **Activity Tracking**: System learns from queries, surfaces recent items automatically

**Result:** Developer setup time reduced from >30 minutes (OAuth2 flow, troubleshooting) to <5 minutes (token + paste). AI assistants gain organizational context without developers leaving their IDE.

**Why It Matters:** Agents become cognitive partners—synthesize understanding, anticipate needs, execute tedious workflows.

---

#### Adaptive Infrastructure

**Template Packs + Local-First Architecture**

- **Template packs:** Vertical customization via YAML config (schemas, agents, prompts, UI)
- **Incremental updates:** Detect changes, re-process only deltas → graph updates in real-time
- **Local-first mode:** LanceDB on-disk, Ollama for local LLMs → privacy-first processing
- **Hybrid mode:** Sensitive data local, generic queries cloud → adapt to context automatically
- **Version control:** Git-like history for knowledge evolution → understand how thinking changed

**Why It Matters:** Systems evolve with use. New data formats? Deploy template pack. Privacy regulation? Switch to local mode. No code changes required.

---

## Section 4: Who Uses the Tech Stack

### Primary Use Cases

**Internal Knowledge Bases**

- Replace Notion, Confluence, enterprise search
- AI chat interface over company documentation
- Self-hosted for compliance
- **Example:** 500-person company, 100K documents, $900K/year productivity gains

**Specialized Research Tools**

- Academic literature review platforms
- Legal case law search
- Market research synthesis
- **Example:** PhD student synthesizes 500 papers in 2 weeks vs. 6-12 months manual

**Developer Platforms**

- Documentation search with semantic understanding
- Code knowledge graphs (trace dependencies, understand architecture)
- Internal tool discovery
- **Example:** Engineering teams onboard new devs in days, not weeks

**Custom Vertical Solutions**

- Healthcare records (local-first for HIPAA)
- Financial analysis (private data processing)
- Compliance tracking (audit trails, version history)
- **Example:** Build domain-specific SaaS in 8 weeks vs. 6 months

---

## Section 5: Getting Started

### Three Paths to Adoption

#### 1. Explore emergent.core

**For:** Product builders, solo developers, early-stage startups

**Start here:**

- Read the documentation
- Review example implementations
- Explore on GitHub
- Deploy locally with Docker Compose

> **[Explore emergent.core →](/tech-stack/core)**

---

#### 2. Build Custom Solutions

**For:** Platform teams, internal tool builders, consultants

**What you'll do:**

- Deploy emergent.core on your infrastructure
- Create template packs for your domain
- Customize agents, schemas, workflows
- Self-host for full control

> **[Read the Docs](https://docs.emergent.ai) | [View on GitHub](https://github.com/emergent)**

---

#### 3. Evaluate for Enterprise

**For:** CTOs, enterprise architects, platform leads

**What we'll cover:**

- Self-hosted deployment options (Docker, Kubernetes, Coolify)
- Security and compliance (SSO, RBAC, audit trails, data residency)
- Customization and extensibility (template packs, MCP servers)
- Support and SLAs

> **[Contact Sales](mailto:sales@emergent.ai)**

---

## Section 6: Why Open and Extensible Matters

### No Vendor Lock-In

- **Open-source components:** TypeORM, LanceDB, React, NestJS
- **Self-hosting option:** Deploy on your infrastructure
- **Swap providers:** OpenAI → local LLMs, PostgreSQL → your database
- **MIT/Apache 2.0 licensing:** Use commercially, modify as needed

### Ecosystem-Ready

- **MCP integration:** Connect to any tool that speaks Model Context Protocol
- **Template Pack Marketplace:** Share and monetize domain-specific packs
- **API-first design:** Integrate with existing systems (CRM, project management, BI)
- **OpenAPI documentation:** Auto-generated, always up-to-date

### Community-Driven

- Active GitHub repository
- Documentation contributions welcome
- Template pack creators share revenue (80/20 split)
- Real-world examples and case studies

---

## Call-to-Action Section

### Ready to Build?

<div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 1.5rem;">

<div style="padding: 1.5rem; border: 1px solid #e5e7eb; border-radius: 8px;">

#### Documentation

Comprehensive guides, API reference, and tutorials.

[Read the Docs →](https://docs.emergent.ai)

</div>

<div style="padding: 1.5rem; border: 1px solid #e5e7eb; border-radius: 8px;">

#### GitHub

Explore the codebase, review examples, contribute.

[View on GitHub →](https://github.com/emergent)

</div>

<div style="padding: 1.5rem; border: 1px solid #e5e7eb; border-radius: 8px;">

#### emergent.core

Deep dive into the intelligent knowledge infrastructure.

[Learn More →](/tech-stack/core)

</div>

</div>

---

## Visual Design Notes

### Hero Section

- **Visual:** Architectural diagram showing stack layers (UI → API → Graph + Vectors → Storage)
- **Style:** Technical, clean, diagrammatic (not abstract)
- **Color scheme:** Blues and grays, technical aesthetic

### Component Diagrams

- **emergent.core architecture:** High-level block diagram
- **Data flow:** Request → Embedding → Search → Rerank → Context → LLM → Response
- **Template pack system:** How config customizes behavior without code changes

### Code Snippets

- **Example agent definition** (YAML)
- **Example MCP server integration** (TypeScript)
- **Example knowledge graph query** (TypeORM + graph traversal)

### Typography

- **Headlines:** 32-36px, bold, technical font
- **Body:** 16-18px, code-friendly font (Inter, system-ui)
- **Code blocks:** Syntax-highlighted, copy button

---

## Metadata

**Page Title:** Emergent Tech Stack - Build Adaptive Systems on Proven Infrastructure  
**Meta Description:** Operational AI infrastructure: Knowledge graphs + semantic search + MCP + token auth. Sub-300ms unified search with 5 fusion strategies. Ship intelligent applications in weeks, not months.  
**Open Graph Image:** Architecture diagram of emergent.core stack layers  
**Canonical URL:** https://emergent.ai/tech-stack

---

**Status:** Ready for Design & Implementation  
**Next Steps:**

1. Create architecture diagrams
2. Write code snippet examples
3. Implement component in React
4. Link to emergent.core detail page

**Dependencies:**

- emergent.core detail page (for deep dive link)
- Documentation site (for external link)
- GitHub repository (for external link)
