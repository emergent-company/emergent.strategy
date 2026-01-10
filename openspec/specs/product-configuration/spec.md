# product-configuration Specification

## Purpose
TBD - created by archiving change add-emergent-product-hierarchy. Update Purpose after archive.
## Requirements
### Requirement: Value Proposition Documentation

The system SHALL maintain comprehensive value proposition documents for each product that follow a features-first approach, mapping technical capabilities to user benefits.

#### Scenario: Value proposition document structure

- **GIVEN** a product is being defined (Emergent Core, Personal Assistant, or Product Framework)
- **WHEN** the product team creates the value proposition document
- **THEN** the document SHALL be created at `openspec/specs/products/<product-name>/value-proposition.md`
- **AND** the document SHALL include the following sections in order:
  1. Features Inventory - Complete list of technical capabilities
  2. Feature → Value Mapping - How each feature translates to user benefits
  3. Core Value Proposition - Primary benefit statement (1-2 sentences)
  4. Value Dimensions - Breakdown of value categories (efficiency, intelligence, automation, etc.)
  5. Use Case Value - How value manifests in specific scenarios
  6. Differentiation - What makes this unique compared to alternatives

#### Scenario: Features inventory documentation

- **GIVEN** a value proposition document is being created
- **WHEN** the team documents the features inventory
- **THEN** the inventory SHALL list all technical capabilities with:
  - Feature name and description
  - Underlying technologies or mechanisms
  - Current implementation status
  - Related system components
- **AND** features SHALL be grouped by category (data ingestion, search, AI, visualization, etc.)

#### Scenario: Feature-to-value mapping

- **GIVEN** features have been documented in the inventory
- **WHEN** the team creates the feature-to-value mapping
- **THEN** each feature SHALL have a corresponding value statement that answers:
  - "Why does this feature matter?"
  - "What problem does it solve?"
  - "What outcome does it enable for users?"
- **AND** the mapping SHALL be explicit and traceable (feature name → value statement)

#### Scenario: Core value proposition synthesis

- **GIVEN** feature-to-value mappings are complete
- **WHEN** the team synthesizes the core value proposition
- **THEN** the value proposition SHALL be expressed in 1-2 sentences
- **AND** the value proposition SHALL focus on outcomes, not features
- **AND** the value proposition SHALL reference the general Emergent value: "up-to-date, accessible, intelligent knowledge base for artifact production and action execution"
- **AND** the value proposition SHALL be tailored to the specific product's target audience

#### Scenario: Generating artifacts from value propositions

- **GIVEN** a complete value proposition document exists
- **WHEN** marketing materials need to be created (landing pages, presentations, pitch decks)
- **THEN** the document SHALL contain sufficient content to generate these artifacts
- **AND** AI agents SHALL be able to extract and format content for different artifact types
- **AND** generated artifacts SHALL maintain consistency with the source value proposition

### Requirement: Product Specification Documents

The system SHALL maintain comprehensive product specification documents in `openspec/specs/products/` that serve as the authoritative "product bible" for each Emergent product offering.

#### Scenario: Product specification structure

- **GIVEN** a new product is being defined (e.g., Personal Assistant, Product Framework)
- **WHEN** the product team creates the product specification
- **THEN** the specification SHALL be created in `openspec/specs/products/<product-name>/`
- **AND** the specification SHALL include at minimum: `value-proposition.md` (primary), `spec.md` (product definition), `features.md` (detailed features), `use-cases.md` (target scenarios), and `template-pack.md` (configuration)

#### Scenario: Product definition content

- **GIVEN** a product specification document exists
- **WHEN** team members or AI agents read the product definition (`spec.md`)
- **THEN** the document SHALL include:
  - Product name and tagline
  - Reference to value proposition document
  - Target audience and use cases
  - Core features and capabilities (referencing detailed features.md)
  - Differentiation from other products
  - Product roadmap and evolution plans
- **AND** the document SHALL be written in structured markdown format
- **AND** the document SHALL be version controlled in Git

#### Scenario: Generating marketing artifacts from specs

- **GIVEN** a comprehensive product specification exists (including value proposition)
- **WHEN** the team needs to create marketing materials (landing pages, presentations, brochures)
- **THEN** the product specification SHALL contain sufficient detail to generate these artifacts
- **AND** the specification SHALL include pre-written value propositions, feature descriptions, and use case narratives
- **AND** AI agents SHALL be able to parse and extract content from the specifications

#### Scenario: Tracking product evolution

- **GIVEN** a product specification is maintained over time
- **WHEN** features are added, modified, or removed
- **THEN** changes SHALL be tracked through Git commits and OpenSpec change proposals
- **AND** the specification SHALL reflect the current state of the product
- **AND** historical versions SHALL be accessible through Git history
- **AND** the value proposition SHALL be updated when features significantly change

### Requirement: Product Configuration Metadata

Each product SHALL define configuration metadata that specifies template packs, prompts, and settings specific to that product.

#### Scenario: Template pack association

- **GIVEN** a product specification document
- **WHEN** the product requires specific data models (object types and relationships)
- **THEN** the specification SHALL identify the primary template pack ID for the product
- **AND** the template pack SHALL define object types relevant to the product (e.g., Tasks, Events, Documents for Personal Assistant; Features, Strategies, Goals for Product Framework)
- **AND** the specification SHALL document how to install and activate the template pack

#### Scenario: Product-specific prompts

- **GIVEN** a product uses AI chat functionality
- **WHEN** users interact with the chat in the context of that product
- **THEN** the product configuration SHALL specify default prompts optimized for the product's use cases
- **AND** prompts SHALL be stored in the database or configuration files
- **AND** prompts SHALL be referenced by ID in the product specification

#### Scenario: Product feature flags

- **GIVEN** different products may enable or disable certain platform features
- **WHEN** a user is working within a specific product context
- **THEN** the product configuration SHALL specify which features are enabled (e.g., private data access for Personal Assistant)
- **AND** feature flags SHALL control UI visibility and API access
- **AND** feature flags SHALL be documented in the product specification

### Requirement: Product Onboarding Configuration

Each product SHALL define an onboarding flow that helps users get started with product-specific features and template packs.

#### Scenario: Product-specific setup wizard

- **GIVEN** a new user selects a product (Personal Assistant or Product Framework)
- **WHEN** they complete initial signup and onboarding
- **THEN** the system SHALL guide them through product-specific setup steps
- **AND** setup SHALL include installing the product's template pack
- **AND** setup SHALL explain key product features and use cases
- **AND** setup SHALL create sample data or templates appropriate for the product

#### Scenario: Template pack installation during onboarding

- **GIVEN** a user is onboarding to a specific product
- **WHEN** the onboarding flow reaches the template pack installation step
- **THEN** the system SHALL automatically install the product's primary template pack
- **AND** the system SHALL explain what object types and relationships are included
- **AND** the user SHALL be able to skip or customize the installation if desired

### Requirement: Multi-product Support

Users SHALL be able to use multiple Emergent products within the same account, with configurations isolated or shared as appropriate.

#### Scenario: User activates multiple products

- **GIVEN** a user has an Emergent account
- **WHEN** they want to use both Personal Assistant and Product Framework
- **THEN** the system SHALL allow them to activate both products
- **AND** each product's template pack SHALL be installable independently
- **AND** the user SHALL be able to organize data by creating separate projects per product or combining them in one project

#### Scenario: Product context switching

- **GIVEN** a user has multiple products activated
- **WHEN** they switch between products (e.g., from Personal Assistant to Product Framework)
- **THEN** the UI SHALL adapt to show product-specific features and navigation
- **AND** AI chat prompts SHALL be adjusted to the active product context
- **AND** the user's data SHALL remain accessible across products (shared knowledge graph)

#### Scenario: Template pack coexistence

- **GIVEN** a user has installed template packs for multiple products
- **WHEN** they view their knowledge graph
- **THEN** objects from all installed template packs SHALL coexist in the same graph
- **AND** objects SHALL be tagged or associated with their source template pack
- **AND** users SHALL be able to create relationships between objects from different products if desired

