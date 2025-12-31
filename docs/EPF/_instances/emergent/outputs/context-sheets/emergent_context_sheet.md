# Emergent AI Context Sheet

<!--
Generated: 2025-12-30T17:45:00Z
Generator: Context Sheet Generator v2.1
EPF Version: 2.1.0
Product: emergent

Source Files:
- docs/EPF/_instances/emergent/READY/00_north_star.yaml (last modified: 2025-12-30T16:38:00Z, version: 1.2)
- docs/EPF/_instances/emergent/READY/04_strategy_formula.yaml (last modified: 2025-12-30T16:38:00Z, version: strat-001)
- docs/EPF/_instances/emergent/READY/05_roadmap_recipe.yaml (last modified: 2025-12-30T16:01:00Z, version: roadmap-001)
- docs/EPF/_instances/emergent/FIRE/value_models/product.emergent-core.value_model.yaml (last modified: 2025-12-28T19:43:00Z, version: v1.0)

Validation:
  Schema: docs/EPF/outputs/schemas/context_sheet.schema.json
  Command: bash docs/EPF/outputs/validation/validate-context-sheet.sh docs/EPF/_instances/emergent/outputs/context-sheets/emergent_context_sheet.md

⚠️  This is a DERIVED artifact. EPF source files are the source of truth.
    If data seems outdated, regenerate this file from EPF sources.
-->

## Quick Reference

**Purpose**:
We exist to help knowledge workers and organizations achieve emergent understanding—insights that arise from connections, not just searches. Like emergence in nature, where simple building blocks following clear rules create complexity far greater than the sum of its parts, we build the tools, frameworks, and platforms that transform information chaos into self-organizing intelligence.

**Vision**:
By 2028, the Emergent ecosystem will power thousands of organizations with AI-native tools for knowledge management, product development, and strategic thinking. Our products—from the Core knowledge engine to specialized frameworks and tools—will form the invisible infrastructure that makes organizational intelligence truly emergent: insights that arise from connections, not just searches.

**Target Customer**: Technical product teams (5-50 engineers) building complex software products. Specifically: Teams that are already AI-forward (using Cursor, Copilot, Claude), frustrated that these tools don't understand their product context, and documentation-heavy enough to have a knowledge management problem worth solving.

**Positioning**: For technical product teams who are frustrated that AI coding assistants don't understand their product context, Emergent is the knowledge infrastructure that connects strategy, documentation, and code into a unified context layer that AI agents can reason over—unlike Notion, Confluence, or raw ChatGPT, which treat knowledge as isolated documents rather than connected intelligence.

## Product Overview

### What It Does
Emergent is the intelligence layer that makes AI understand your organization. While AI tools see code, Emergent gives them the context—strategy, decisions, knowledge, and intent—that transforms generic AI into a team member who actually knows your product.

### The Problem We Solve
Organizations drown in unstructured information scattered across documents, URLs, and file systems. Critical knowledge is trapped in PDFs, meeting notes, and wikis—invisible to search, impossible to connect, and lost when people leave. Teams spend hours hunting for information that should be at their fingertips, making decisions on incomplete context, and duplicating work because they can't find what already exists.

Beyond just finding information, teams lack the tools and methodologies to synthesize understanding across disparate sources—to see the emergent patterns that only appear when knowledge is connected and contextualized.

### The Impact We Seek
A world where organizational knowledge is alive—a self-organizing system where simple building blocks (documents, entities, relationships) combine through clear rules (extraction, connection, retrieval) to create understanding greater than the sum of its parts. Where AI assistants truly understand your domain because they reason over connected context. Where emergent insights surface automatically, revealing patterns humans couldn't predict.

## Core Values

1. **Emergence Over Engineering**: Build simple building blocks that follow clear rules, then discover what emerges. Don't over-engineer prematurely—let complexity arise naturally from well-designed foundations.

2. **Transparency Over Magic**: Make the system's reasoning visible and auditable. No black boxes—show sources, explain connections, expose the knowledge graph.

3. **Developer Experience First**: Optimize for developers who build products, not executives who buy software. API-first, Git-native, composable, self-hostable.

4. **Context Is King**: Information without context is noise. Every fact needs provenance, every insight needs citations, every answer needs traceability.

5. **Open Yet Pragmatic**: Embrace open standards (MCP, OpenAPI) and open-source principles where it creates value. Be pragmatic about business model—open-core, not pure OSS.

## Strategic Positioning

**Category**: Creating a new category: AI Knowledge Infrastructure

**Tagline**: "The intelligence layer for AI-native development"

**Unique Value Proposition**: Emergent is the intelligence layer that makes AI understand your organization. While AI tools see code, Emergent gives them the context—strategy, decisions, knowledge, and intent—that transforms generic AI into a team member who actually knows your product.

### Competitive Advantages

1. **MCP-First Architecture**: Built from day one for AI agent integration via Model Context Protocol. Early mover in MCP ecosystem; implementation know-how compounds.

2. **Knowledge Graph + Vector Hybrid**: Combines vector search with typed entity-relationship graphs. More sophisticated than pure RAG; requires deep domain modeling.

3. **Git-Native Strategy Artifacts (EPF)**: Strategy lives in code repos, not slide decks—machine-readable and versioned. Unique methodology; network effects as EPF adoption grows.

4. **Developer DNA**: Built by developers for developers—API-first, composable, transparent. Cultural alignment with target users; hard for enterprise tools to replicate.

### Key Differentiators

**vs. Notion AI**: Cross-platform knowledge graph; AI agent infrastructure
**vs. Google NotebookLM**: "NotebookLM with the hood open"—same mechanics but configurable and self-hostable
**vs. Glean**: Developer-friendly and API-first vs. enterprise-sales-first
**vs. Microsoft Copilot**: Cross-platform, developer control, open ecosystem
**vs. Dify.ai**: Knowledge graph extraction vs. workflow-focused RAG
**vs. Danswer**: Knowledge graph + configurable extraction vs. flat document search

## Product Architecture

### Emergent Ecosystem (Three Product Lines)

The Emergent ecosystem uses biological metaphors to describe three interconnected product lines:

1. **Emergent Core: The Brain**
   - Intelligence, memory, and reasoning
   - Knowledge management engine
   - Document ingestion, extraction, search
   - Multi-tenant SaaS + self-hostable

2. **EPF-Runtime: The Nervous System**
   - Orchestration and coordination
   - AI-assisted strategic planning framework
   - Git-native, machine-readable strategy artifacts
   - Now maintained as separate repository (github.com/eyedea-io/epf)

3. **Emergent Tools: The Circulatory System**
   - Connectors, bridges, interfaces
   - Integrations with external tools
   - MCP servers, CLI tools, IDE extensions

### Core Capabilities

#### 1. Document Intelligence
- **What**: Ingest, parse, chunk, and extract structured knowledge from unstructured documents
- **Why**: Transform PDFs, markdown, URLs into queryable knowledge
- **How**: Template packs define entity types, extraction rules, and relationship patterns
- **Key Feature**: Configurable extraction with LLM-powered entity recognition

#### 2. Knowledge Graph
- **What**: Typed entity-relationship graph with semantic layering
- **Why**: Enable traversal, connection discovery, and graph-based reasoning
- **How**: Graph objects (typed nodes) + relationships (typed edges) + attributes
- **Key Feature**: Schema-aware graph with validation and consistency rules

#### 3. Vector Search + RAG
- **What**: Semantic search over chunked documents with context retrieval
- **Why**: Find information by meaning, not just keywords
- **How**: Embedding models + vector database (pgvector) + LLM synthesis
- **Key Feature**: Hybrid search (vector + keyword + graph traversal)

#### 4. AI Agent Integration (MCP)
- **What**: Model Context Protocol server exposing knowledge APIs
- **Why**: Let AI agents (Claude, GPT, custom) query organizational knowledge
- **How**: MCP tools for search, document retrieval, graph queries
- **Key Feature**: Schema-aware context provisioning for AI assistants

#### 5. Multi-Tenant SaaS
- **What**: Organization → Project hierarchy with role-based access
- **Why**: Support team collaboration and knowledge isolation
- **How**: PostgreSQL RLS, Zitadel OIDC auth, API scopes
- **Key Feature**: Self-service org/project creation with granular permissions

#### 6. Integrations
- **What**: Bi-directional sync with external tools (ClickUp, Google Drive, etc.)
- **Why**: Meet users where they work; reduce friction
- **How**: OAuth flows + webhook listeners + sync jobs
- **Key Feature**: Incremental sync with conflict resolution

## Current Focus (2025 Q1)

### Discovery Wizard & Knowledge Graph Extraction
**Goal**: Make it trivial to go from "empty project" to "queryable knowledge base" in minutes

**Key Deliverables**:
- Discovery Wizard UI (guided onboarding flow)
- Template Pack library (pre-built extraction rules)
- KB Purpose configuration (guides extraction focus)
- Real-time extraction feedback

### MCP Server Hardening
**Goal**: Production-ready MCP integration for Claude Desktop and custom AI agents

**Key Deliverables**:
- Schema-aware knowledge queries
- Document retrieval with citations
- Graph traversal tools
- Performance optimization (response time <2s)

### Self-Service Multi-Tenancy
**Goal**: Allow teams to sign up and start using Emergent without sales calls

**Key Deliverables**:
- Org/Project creation flows
- User invitation system
- Role-based permissions
- Usage analytics dashboard

## Jobs-to-be-Done (Top 5)

1. **When** I'm coding and need to understand a product decision or strategy, **I want to** ask an AI that knows our docs, **so I can** stay in flow instead of context-switching to Notion/Confluence.

2. **When** onboarding a new team member or contractor, **I want to** give them an AI assistant pre-loaded with our product context, **so they** can ramp up faster without bothering senior engineers.

3. **When** planning a feature, **I want to** see what existing knowledge (decisions, discussions, related features) exists, **so I can** avoid duplicating work or contradicting past decisions.

4. **When** an AI coding assistant (Cursor, Copilot) suggests code that violates our architecture or strategy, **I want to** give it additional context about why we do things differently, **so it** generates code that aligns with our approach.

5. **When** writing documentation or specs, **I want to** find and cite existing related content automatically, **so I can** build on what exists instead of creating knowledge silos.

## Active Features

### 1. Document Management
- Upload documents (PDF, MD, TXT, DOCX)
- URL imports (scrape web pages)
- Organization into projects/folders
- Metadata management (tags, descriptions)
- Version tracking

### 2. Knowledge Extraction
- Configurable entity extraction (people, concepts, locations, etc.)
- Relationship detection
- Template packs for domain-specific extraction
- LLM-powered extraction jobs
- Manual entity editing

### 3. Search & Retrieval
- Semantic search (vector-based)
- Keyword search
- Combined hybrid search
- Faceted filtering (by entity type, date, project)
- Search history

### 4. AI Chat Interface
- Conversational Q&A over knowledge base
- Source citations with document links
- Follow-up questions
- Conversation history
- Export conversations

### 5. Integrations (Alpha)
- ClickUp: Bi-directional sync (tasks, docs, folders)
- Google Drive: Import documents
- Webhooks: Real-time updates
- API: Full REST API with OpenAPI spec

### 6. MCP Server (Beta)
- Claude Desktop integration
- Custom tool definitions
- Schema-aware queries
- Real-time knowledge access

### 7. Multi-Tenant Admin
- Organization management
- Project creation/settings
- User invitations
- Role management (admin, member, viewer)
- API key generation

## Premium/Roadmap Features

### Near-Term (Q1-Q2 2025)
- **Discovery Wizard**: Guided onboarding with template selection
- **Template Pack Marketplace**: Community-contributed extraction templates
- **Advanced Graph Queries**: Cypher-like query language
- **Collaboration Features**: Comments, annotations, shared views
- **Usage Analytics**: Token usage, extraction metrics, search patterns

### Mid-Term (Q3-Q4 2025)
- **Slack Integration**: Answer questions in Slack channels
- **IDE Extensions**: VS Code + JetBrains plugins
- **Custom Workflows**: Zapier-style automation builder
- **Advanced Embedding Models**: Multi-modal (text + images), fine-tuned models
- **Knowledge Graph Visualization**: Interactive graph explorer

### Long-Term (2026+)
- **Federated Knowledge**: Query across multiple Emergent instances
- **Real-Time Collaboration**: Live editing, presence indicators
- **Mobile Apps**: iOS + Android native apps
- **On-Premise Enterprise**: Kubernetes-based self-hosting
- **Audit Logging**: Compliance-grade activity logs

## Technical Architecture Summary

**Backend**: NestJS (Node.js/TypeScript)
**Frontend**: React 19 + Vite + TailwindCSS + daisyUI
**Database**: PostgreSQL 16 + pgvector extension
**Auth**: Zitadel (OIDC/OAuth2)
**Orchestration**: Docker Compose (dev) + Kubernetes (prod)
**AI/ML**: Vertex AI (Google Cloud) + configurable embedding providers
**APIs**: REST + GraphQL + MCP
**Testing**: Vitest + Playwright + Jest

### Key Technical Decisions
- **Multi-tenancy**: PostgreSQL Row-Level Security (RLS)
- **Vector Search**: pgvector (in-database, no separate service)
- **Graph Storage**: PostgreSQL JSONB + foreign keys (no Neo4j)
- **Auth**: Delegated to Zitadel (no custom auth)
- **Deployment**: Docker-first, cloud-agnostic

## Getting Started (For AI Assistants)

When helping users with Emergent:

1. **Understand their use case first**: Are they building features, debugging, deploying, or using the product?

2. **Check the EPF sources**: This context sheet is derived from EPF. For detailed specs, refer to:
   - `/docs/EPF/_instances/emergent/READY/00_north_star.yaml` (purpose, vision)
   - `/docs/EPF/_instances/emergent/READY/04_strategy_formula.yaml` (positioning, competition)
   - `/docs/EPF/_instances/emergent/READY/05_roadmap_recipe.yaml` (current priorities)
   - `/docs/EPF/_instances/emergent/FIRE/value_models/*.yaml` (feature specs)

3. **Key architectural principles**:
   - Emergence over engineering (simple building blocks, clear rules)
   - Transparency over magic (show sources, explain connections)
   - Developer experience first (API-first, Git-native)
   - Context is king (provenance, citations, traceability)

4. **Common patterns**:
   - Knowledge flows: Documents → Chunks → Embeddings → Search
   - Extraction flows: Documents → Extraction Jobs → Graph Objects → Relationships
   - Query flows: User Query → Vector Search → Context Retrieval → LLM Synthesis
   - Auth flows: User → Zitadel → JWT → Scopes → API Access

5. **When in doubt**: Ask the user for clarification, check the codebase structure, or refer to the EPF sources for strategic context.

## Tone and Voice Guidelines

**Core Beliefs that Inform Our Voice**:
- **Simple Building Blocks, Clear Rules**: Communicate clearly and directly. Avoid jargon unless necessary.
- **Emergence as Design Philosophy**: Use "Design by Emergence" framing—invent the rules, discover the consequences.
- **Show, Don't Tell**: Use examples, demos, and visual explanations. Make the system's reasoning transparent.
- **Developer Respect**: Assume technical competence. Don't over-explain basics; provide depth when needed.
- **Pragmatic, Not Dogmatic**: Acknowledge trade-offs. Be honest about limitations and roadmap.

**Do**:
- Use biological metaphors (brain, nervous system, circulatory system)
- Reference emergence in nature (flocking, ant colonies, neural networks)
- Show concrete examples with real data
- Cite sources and provide evidence
- Be specific about timelines and constraints

**Don't**:
- Use enterprise buzzwords ("synergy," "leverage," "paradigm shift")
- Overpromise features or timelines
- Hide complexity when it matters
- Talk down to developers
- Pretend problems don't exist

---

**Last Updated**: 2025-12-30  
**Next Review**: 2026-01-30  
**Regenerate After**: Significant EPF updates, product pivots, or quarterly reviews
