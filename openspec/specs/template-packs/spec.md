# template-packs Specification

## Purpose
TBD - created by archiving change add-emergent-product-hierarchy. Update Purpose after archive.
## Requirements
### Requirement: Personal Assistant Template Pack

The system SHALL provide a template pack specifically designed for Emergent Personal Assistant that includes object types and relationships for managing personal life tasks, events, and documents.

#### Scenario: Personal Assistant object types

- **GIVEN** the Personal Assistant template pack is installed
- **WHEN** a user views available object types
- **THEN** the system SHALL provide the following object types:
  - **Personal Task**: Everyday tasks (pay bills, schedule maintenance)
  - **Life Event**: Important personal dates (birthdays, anniversaries, appointments)
  - **Personal Document**: Private documents (insurance policies, contracts, receipts)
  - **Contact**: People in user's personal network
  - **Recurring Item**: Repeated tasks or events (monthly bills, annual renewals)
- **AND** each object type SHALL have appropriate properties (title, description, due_date, priority, status, etc.)

#### Scenario: Personal Assistant relationships

- **GIVEN** the Personal Assistant template pack is installed
- **WHEN** users create objects and relationships
- **THEN** the system SHALL support relationships such as:
  - Task `related_to` Life Event (e.g., "Buy gift" related to "Mom's birthday")
  - Document `supports` Task (e.g., "Insurance policy" supports "File claim")
  - Contact `associated_with` Life Event (e.g., "Mom" associated with "Mom's birthday")
  - Recurring Item `generates` Task (e.g., "Monthly rent" generates task instances)
- **AND** relationships SHALL be queryable and displayed in the knowledge graph

#### Scenario: Template pack installation for Personal Assistant

- **GIVEN** a user activates Emergent Personal Assistant
- **WHEN** they install the Personal Assistant template pack
- **THEN** the system SHALL create the object type definitions in the database
- **AND** the system SHALL optionally create sample data (e.g., example tasks and events)
- **AND** the system SHALL configure default prompts for personal assistance use cases

### Requirement: Product Framework Template Pack

The system SHALL provide a template pack specifically designed for Emergent Product Framework that includes object types and relationships for product strategy, planning, and definition.

#### Scenario: Product Framework object types

- **GIVEN** the Product Framework template pack is installed
- **WHEN** a user views available object types
- **THEN** the system SHALL provide the following object types:
  - **Product Feature**: Capabilities and features of the product
  - **Strategic Goal**: High-level objectives and outcomes
  - **Value Proposition**: Core value statements and differentiation
  - **Go-to-Market Tactic**: Marketing and sales strategies
  - **User Persona**: Target audience segments
  - **Success Metric**: KPIs and measurement criteria
  - **Product Requirement**: Detailed specifications and acceptance criteria
- **AND** each object type SHALL have appropriate properties (title, description, status, priority, target_date, etc.)

#### Scenario: Product Framework relationships

- **GIVEN** the Product Framework template pack is installed
- **WHEN** users create objects and relationships
- **THEN** the system SHALL support relationships such as:
  - Feature `supports` Strategic Goal
  - Value Proposition `targets` User Persona
  - Go-to-Market Tactic `delivers` Value Proposition
  - Feature `requires` Product Requirement
  - Success Metric `measures` Strategic Goal
  - Feature `depends_on` Feature (dependencies)
- **AND** relationships SHALL enable graph traversal for impact analysis and dependency tracking

#### Scenario: Template pack installation for Product Framework

- **GIVEN** a user activates Emergent Product Framework
- **WHEN** they install the Product Framework template pack
- **THEN** the system SHALL create the object type definitions in the database
- **AND** the system SHALL optionally create sample data (e.g., example features and goals)
- **AND** the system SHALL configure default prompts for product strategy use cases

### Requirement: Product-specific AI Prompts

Each product template pack SHALL include pre-configured AI prompts optimized for the product's domain and use cases.

#### Scenario: Personal Assistant prompts

- **GIVEN** the Personal Assistant template pack is installed
- **WHEN** a user interacts with AI chat in the Personal Assistant context
- **THEN** the system SHALL use prompts such as:
  - "You are a personal life assistant helping with everyday tasks and life events."
  - "Suggest reminders and proactive insights based on upcoming life events."
  - "Help organize personal documents and track important dates."
- **AND** prompts SHALL be stored in the database and associated with the product configuration

#### Scenario: Product Framework prompts

- **GIVEN** the Product Framework template pack is installed
- **WHEN** a user interacts with AI chat in the Product Framework context
- **THEN** the system SHALL use prompts such as:
  - "You are a product strategy advisor helping define and plan products."
  - "Analyze product features and suggest strategic alignments."
  - "Help generate value propositions and go-to-market strategies."
- **AND** prompts SHALL be stored in the database and associated with the product configuration

#### Scenario: Prompt customization

- **GIVEN** a product has default prompts installed
- **WHEN** a user or administrator wants to customize prompts
- **THEN** the system SHALL allow editing of prompt text and parameters
- **AND** customizations SHALL be saved per user or per project
- **AND** users SHALL be able to reset to default product prompts

### Requirement: Template Pack Discoverability

Users SHALL be able to discover and install product-specific template packs easily.

#### Scenario: Template pack catalog

- **GIVEN** a user is logged into Emergent
- **WHEN** they navigate to the template pack catalog or marketplace
- **THEN** the system SHALL display available template packs grouped by product
- **AND** each template pack SHALL show: product name, description, included object types, and installation status

#### Scenario: Product page links to template pack

- **GIVEN** a user is viewing a product page (Personal Assistant or Product Framework)
- **WHEN** they click "Get Started" or a similar CTA
- **THEN** the system SHALL guide them to install the product's template pack
- **AND** the system SHALL explain what the template pack includes
- **AND** the system SHALL show a preview of object types and relationships

#### Scenario: Template pack installation confirmation

- **GIVEN** a user initiates template pack installation
- **WHEN** the installation completes successfully
- **THEN** the system SHALL display a confirmation message
- **AND** the system SHALL show next steps (create first object, explore features)
- **AND** the installed template pack SHALL appear in the user's project settings

### Requirement: Template Pack Metadata Enhancement

Template packs SHALL include enhanced metadata to support product hierarchy and configuration.

#### Scenario: Product association metadata

- **GIVEN** a template pack is defined in the database
- **WHEN** the template pack is associated with a specific product
- **THEN** the template pack metadata SHALL include a `product_id` field (e.g., 'personal-assistant', 'product-framework', or null for generic packs)
- **AND** the metadata SHALL include a `product_name` field for display purposes
- **AND** the metadata SHALL indicate if the pack is the primary pack for a product

#### Scenario: Template pack versioning

- **GIVEN** a template pack is updated with new object types or relationships
- **WHEN** the pack version is incremented
- **THEN** the system SHALL track version history
- **AND** users SHALL be notified of available updates to installed packs
- **AND** users SHALL be able to upgrade template packs without losing data

#### Scenario: Template pack dependencies

- **GIVEN** a template pack may depend on or extend another pack
- **WHEN** the pack is installed
- **THEN** the system SHALL check for and install dependencies automatically
- **AND** the system SHALL warn users if there are conflicts with existing packs
- **AND** dependency information SHALL be documented in the template pack metadata

