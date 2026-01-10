# Change: Add Emergent Product Hierarchy

## Why

The primary goal is to **create comprehensive value proposition documents** for Emergent as a platform and its product offerings. These value propositions will serve as the foundation for all marketing materials, product positioning, and strategic decisions.

**Core Problem**: We need to articulate the value of Emergent Core and its product offerings in a way that:

1. Starts with features and capabilities (what the system does)
2. Translates features into value propositions (what users gain)
3. Creates reusable, versioned documentation that drives all product communications
4. Enables AI agents to generate marketing artifacts, presentations, and product materials

**The General Value Proposition** (applies to all Emergent products):

> **An up-to-date, accessible, and intelligent knowledge base that can be used to produce artifacts and execute actions.**

This translates into:

- **Up-to-date**: Real-time synchronization, automatic updates, living knowledge
- **Accessible**: Semantic search, AI chat, intuitive navigation
- **Intelligent**: AI-powered insights, proactive suggestions, context-aware recommendations
- **Produce artifacts**: Generate documents, presentations, reports from structured knowledge
- **Execute actions**: Trigger workflows, automate tasks, integrate with external systems

**Why This Matters Now**:

- Emergent needs clear product differentiation (Core vs. Personal Assistant vs. Product Framework)
- Value propositions must be documented as "product bibles" that can evolve over time
- Marketing materials, landing pages, and presentations should be generated from these specs
- Each product offering needs its own tailored value proposition based on specific features

Currently, we lack structured value proposition documents that:

- Define features → value mappings
- Enable artifact generation from specs
- Provide a single source of truth for product positioning
- Support versioning and evolution tracking

## What Changes

### 1. Value Proposition Documents (Primary Deliverable)

**Create comprehensive value proposition documents** for each product in `openspec/specs/products/<product-name>/`:

Each value proposition document SHALL include:

1. **Features Inventory** - Detailed list of capabilities (what the system does)
2. **Feature → Value Mapping** - How each feature translates to user benefits
3. **Core Value Proposition** - The primary benefit statement (1-2 sentences)
4. **Value Breakdown** - Detailed explanation of value dimensions (efficiency, intelligence, automation, etc.)
5. **Use Case Value** - How value manifests in specific scenarios
6. **Artifact Templates** - Reusable content for generating marketing materials

**Approach**:

- Start with features (technical capabilities)
- Frame value propositions based on these features (user benefits)
- Document in structured, AI-parseable format
- Enable generation of landing pages, presentations, pitch decks from specs

**Three-tier Product Structure**:

- **Emergent Core** (Platform/Foundation)

  - **Core Features**: Knowledge graph, semantic embeddings, AI chat with MCP, configurable template packs, agent framework, API/SDK
  - **Core Value**: "An up-to-date, accessible, and intelligent knowledge base that enables artifact production and action execution"
  - **Platform Narrative**: Foundation technology that others can build upon

- **Emergent Personal Assistant** (Product offering #1)

  - **Features**: Personal task management, life event tracking, private data access (emails, documents, calendars), everyday task automation (bills, insurance, maintenance), AI-powered reminders
  - **Value**: "Effortless personal life management with proactive intelligence"
  - **Target**: Individuals managing personal responsibilities and life events

- **Emergent Product Framework** (Product offering #2)
  - **Features**: Strategic planning frameworks, value proposition development tools, go-to-market strategy templates, product roadmap visualization, AI-powered product insights, "product bible" documentation
  - **Value**: "Strategic clarity for product leaders from conception to execution"
  - **Target**: Solo founders, product managers, product leaders building or evolving products

### 2. Website Structure Changes

**Main Landing Page** (`/` or `/core`):

- Positions Emergent Core as the platform foundation
- Shows "Products Built on Emergent Core" section with cards for Personal Assistant and Product Framework
- Explains platform capabilities and extensibility
- CTA: "Explore Products" or "Get Started with Core"

**Product Sub-pages**:

- `/personal-assistant` - Dedicated page for Personal Assistant product
- `/product-framework` - Dedicated page for Product Framework product
- Each page includes: value proposition, features, use cases, pricing/access info, CTA

**Navigation**:

- Top-level: Emergent Core (home)
- Products dropdown: Personal Assistant, Product Framework
- Footer: Links to all product pages, documentation, API access

### 3. Technical Changes

**New Capabilities**:

- **Product Configuration System**: Define and manage product-specific configurations (template packs, prompts, agent settings)
- **Template Pack Management**: Enhanced system for creating, installing, and managing template packs per product
- **Product Metadata**: Store product definitions, descriptions, and configuration in database or config files

**Landing Page Enhancement**:

- Update existing landing page components to present Core positioning
- Create new product showcase section
- Add routing for `/personal-assistant` and `/product-framework` pages
- Create reusable product page template/layout

**Product Specification System** (The "Product Bible"):

- Create comprehensive product definition documents that serve as the authoritative source of truth
- **Structure**: Features → Value Propositions → Use Cases → Roadmap → Marketing Artifacts
- **Format**: Structured markdown in `openspec/specs/products/` (version controlled, AI-parseable)
- **Purpose**:
  - Single source of truth for product strategy and positioning
  - Generate marketing materials (landing pages, presentations, pitch decks)
  - Track product evolution and strategic decisions over time
  - Enable AI agents to answer product questions and create artifacts
  - Guide feature development and prioritization

**Content Generation from Specs**:

- Landing page content derived from value proposition specs
- Feature descriptions pulled from feature inventory
- Use case scenarios based on documented use cases
- Presentations and pitch decks generated from product bible
- Consistent messaging across all channels

### 4. Value Proposition Development Process

**For each product, follow this process**:

1. **Features Inventory** - List all capabilities and technical features

   - What does the system do?
   - What technologies enable it?
   - What are the core mechanisms?

2. **Feature → Value Translation** - Map each feature to user benefits

   - Why does this feature matter?
   - What problem does it solve?
   - What outcome does it enable?

3. **Value Proposition Synthesis** - Distill into core value statement

   - Primary benefit (1-2 sentences)
   - Supporting benefits (3-5 key points)
   - Differentiation (what makes this unique?)

4. **Use Case Validation** - Test value prop against real scenarios

   - Does the value prop resonate with target users?
   - Are the benefits compelling and believable?
   - Does it differentiate from alternatives?

5. **Artifact Creation** - Generate marketing materials from specs
   - Landing page content
   - Feature descriptions
   - Use case narratives
   - Pitch deck slides
   - Product one-pagers

**Example: Personal Assistant Value Proposition Development**

**Features**:

- Private data ingestion (emails, documents, calendar events)
- Life event object type with date tracking
- Recurring task generation
- AI chat with personal context
- Proactive reminders based on graph relationships

**Feature → Value**:

- Private data ingestion → "Never lose track of important personal information"
- Life event tracking → "Automatically remember birthdays, anniversaries, appointments"
- Recurring tasks → "Never miss bill payments or maintenance schedules"
- AI chat with context → "Get answers about your personal life instantly"
- Proactive reminders → "Be reminded before you need to act, not after"

**Core Value Proposition**:

> "Effortless personal life management. Let AI handle the mental load of tracking tasks, events, and personal information so you can focus on what matters."

**Supporting Benefits**:

1. Never miss important personal dates or deadlines
2. Organize private documents securely and accessibly
3. Automate recurring tasks (bills, maintenance, renewals)
4. Get proactive reminders before things slip through the cracks
5. Keep your personal knowledge base up-to-date automatically

### 5. Data Privacy & Access Controls

For Personal Assistant specifically:

- Define access controls for private data sources
- Document data privacy and security measures
- Specify encryption and storage requirements for sensitive personal data
- Create user consent and data access permission flows

## Impact

**Affected Specs**:

- `landing-page` (NEW) - Main landing page and product hierarchy
- `product-configuration` (NEW) - Product-specific configuration system
- `template-packs` (MODIFIED) - Enhanced template pack management for products

**Affected Code**:

- `apps/admin/src/pages/landing/` - Update to Core positioning
- `apps/admin/src/pages/personal-assistant/` (NEW) - Personal Assistant product page
- `apps/admin/src/pages/product-framework/` (NEW) - Product Framework product page
- `apps/admin/src/router/register.tsx` - Add new routes
- `apps/admin/src/components/` - Shared product page components
- `apps/server/src/modules/products/` (NEW) - Product configuration API (future)
- `openspec/specs/products/` (NEW) - Product definition specifications

**Dependencies**:

- Builds upon `rebrand-to-emergent` change (coordinate messaging and branding)
- May inform future work on agent configuration and custom template packs

**Breaking Changes**: None

**User Impact**:

- Positive: Clearer product understanding and use case alignment
- Users can quickly identify which product matches their needs
- Sets expectations for platform extensibility

**Developer Impact**:

- Provides framework for adding new products in the future
- Establishes patterns for product-specific configuration
- Creates product specification system for tracking product evolution

**Business Impact**:

- Enables multiple revenue streams (different products/subscriptions)
- Positions Emergent as a platform, not just a tool
- Creates foundation for partner/developer ecosystem
