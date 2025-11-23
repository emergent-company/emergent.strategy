## ADDED Requirements

### Requirement: Product Hierarchy Landing Page

The landing page SHALL present Emergent as a platform with multiple product offerings, positioning Emergent Core as the foundation technology and showcasing specialized products built on top.

#### Scenario: Landing page shows Core positioning

- **GIVEN** a user visits the main landing page at `/` or `/landing`
- **WHEN** the page loads
- **THEN** the hero section SHALL explain Emergent Core as the platform foundation
- **AND** the page SHALL include a "Products Built on Emergent Core" section
- **AND** the products section SHALL display cards for Emergent Personal Assistant and Emergent Product Framework
- **AND** each product card SHALL include: product name, tagline, 2-3 key benefits, and a link to the product page

#### Scenario: Navigation to product pages

- **GIVEN** a user is viewing the landing page
- **WHEN** the user clicks on a product card or navigation link
- **THEN** the system SHALL navigate to the corresponding product page (`/personal-assistant` or `/product-framework`)
- **AND** the browser history SHALL update with the new URL

#### Scenario: Core platform features section

- **GIVEN** a user is viewing the landing page
- **WHEN** they scroll to the features section
- **THEN** the page SHALL display Core platform capabilities (knowledge graph, semantic embeddings, AI chat, MCP integration, configurable template packs)
- **AND** features SHALL emphasize platform extensibility and foundation capabilities

### Requirement: Personal Assistant Product Page

The system SHALL provide a dedicated product page for Emergent Personal Assistant at `/personal-assistant` that explains the product's value proposition, features, and use cases for personal life management.

#### Scenario: Personal Assistant page structure

- **GIVEN** a user navigates to `/personal-assistant`
- **WHEN** the page loads
- **THEN** the page SHALL display:
  - Hero section with value proposition ("Reclaim your cognitive bandwidth—your life's invisible project manager")
  - Problem statement ("administrative siege" - 19,656 life admin tasks over lifetime causing burnout)
  - Solution overview (cognitive prosthetic for executive function)
  - Key features section (6-8 features drawn from value proposition)
  - Use cases section (3-5 scenarios with problem/solution/outcome/value delivered)
  - How it works section (agentic architecture, local-first privacy)
  - Trust & privacy section (data sovereignty, local processing)
  - Getting started CTA

#### Scenario: Personal Assistant features display

- **GIVEN** a user is viewing the Personal Assistant product page
- **WHEN** they view the features section
- **THEN** the page SHALL list features including:
  - **Restore Executive Function**: External prefrontal cortex that scaffolds task initiation and reduces paralysis
  - **Eliminate Financial Waste**: Prevents $500-1000/year in subscription waste, late fees, missed warranty claims
  - **Prevent Relationship Damage**: Never forget important dates; maintain social bonds without mental load
  - **Semantic Document Search**: Find any document in seconds by asking questions ("When does warranty expire?")
  - **Proactive Monitoring**: Background surveillance of expirations, renewals, and obligations (doesn't wait for prompts)
  - **Email Paralysis Breaker**: Draft generation to overcome communication anxiety and Wall of Awful
  - **Privacy-First Architecture**: Local processing; sensitive data never leaves your device
  - **Subscription Defense**: Automated cancellation of forgotten subscriptions; fights dark patterns
- **AND** each feature SHALL include a feature → value mapping explaining the user benefit

#### Scenario: Personal Assistant use cases

- **GIVEN** a user is viewing the Personal Assistant product page
- **WHEN** they view the use cases section
- **THEN** the page SHALL display 3-5 scenarios drawn from research such as:
  - **The Forgotten Car Insurance Renewal**: How AI discovers expiration, gathers comparison data, and presents top 3 options → $630 saved, zero cognitive load
  - **The Wall of Awful Email Inbox**: How AI drafts responses to break communication paralysis → job opportunity captured, friendship preserved
  - **The Subscription Graveyard**: How AI detects unused recurring charges and handles cancellation → $1,007/year recovered
  - **Mom's 70th Birthday**: How AI provides 2-week notice with gift ideas and relationship context → thoughtful gift, relationship strengthened
  - **The Lost Vaccine Record Crisis**: How AI searches emails/documents to compile proof → $300 saved, enrollment deadline met
- **AND** each use case SHALL follow the format: User profile → Problem (with quantified impact) → With Personal Assistant (step-by-step) → Value Delivered (time, money, relationships saved)

#### Scenario: Data privacy and cognitive prosthetic explanation

- **GIVEN** a user is viewing the Personal Assistant product page
- **WHEN** they look for privacy information and product positioning
- **THEN** the page SHALL clearly state:
  - **Privacy Architecture**: "Your sensitive data never leaves your device. Personal Assistant runs locally using on-device processing and embedded vector search."
  - **Data Sovereignty**: "You maintain physical control of bank statements, medical records, and private documents. No cloud upload required."
  - **Cognitive Prosthetic Framing**: "Personal Assistant is not a chatbot—it's an external executive function that restores cognitive bandwidth by fighting the 'administrative siege' of modern life."
  - **Proactive vs. Reactive**: "Unlike assistants that wait for commands, Personal Assistant monitors your life 24/7 and discovers tasks autonomously."
- **AND** the page SHALL mention local-first architecture (LanceDB, on-device NPU/CPU processing)
- **AND** the page SHALL explain the research foundation (e.g., "Based on research into the 19,656 life admin tasks burdening individuals over a lifetime")

### Requirement: Product Framework Product Page

The system SHALL provide a dedicated product page for Emergent Product Framework at `/product-framework` that explains the product's value for product strategy, planning, and definition work.

#### Scenario: Product Framework page structure

- **GIVEN** a user navigates to `/product-framework`
- **WHEN** the page loads
- **THEN** the page SHALL display:
  - Hero section with value proposition ("Build better products with strategic clarity")
  - Problem statement (product strategy is complex and disconnected)
  - Solution overview (AI-powered framework for product definition)
  - Key features section (4-6 features)
  - Use cases section (2-3 scenarios)
  - How it works section
  - Getting started CTA

#### Scenario: Product Framework features display

- **GIVEN** a user is viewing the Product Framework product page
- **WHEN** they view the features section
- **THEN** the page SHALL list features including:
  - Strategic planning tools and frameworks
  - Value proposition development
  - Go-to-market strategy and tactics
  - Product roadmap visualization
  - AI-powered insights and recommendations
  - Living product definition ("product bible")

#### Scenario: Product Framework use cases

- **GIVEN** a user is viewing the Product Framework product page
- **WHEN** they view the use cases section
- **THEN** the page SHALL display 2-3 scenarios such as:
  - Solo founder building product strategy from scratch
  - Product leader maintaining product roadmap and vision
  - Team aligning on product definition and strategy
- **AND** each use case SHALL explain the problem, solution, and outcome

#### Scenario: Product bible explanation

- **GIVEN** a user is viewing the Product Framework product page
- **WHEN** they read about the "product bible" feature
- **THEN** the page SHALL explain that Product Framework creates a comprehensive, living product definition
- **AND** the page SHALL mention generating artifacts like marketing materials, presentations, and documentation from the product definition

### Requirement: Product Page Navigation

The system SHALL provide consistent navigation between the main landing page and product pages.

#### Scenario: Top navigation with product links

- **GIVEN** a user is on any public page (landing, personal-assistant, product-framework)
- **WHEN** they view the top navigation bar
- **THEN** the navigation SHALL include:
  - "Emergent" or "Core" link to landing page
  - "Products" dropdown or section with links to Personal Assistant and Product Framework
  - "Get Started" CTA button

#### Scenario: Footer navigation

- **GIVEN** a user scrolls to the footer on any public page
- **WHEN** they view the footer links
- **THEN** the footer SHALL include links to:
  - All product pages (Core, Personal Assistant, Product Framework)
  - Documentation
  - API/Developer access
  - Company information

#### Scenario: Breadcrumb navigation

- **GIVEN** a user is on a product page (`/personal-assistant` or `/product-framework`)
- **WHEN** they want to navigate back
- **THEN** the page MAY include breadcrumb navigation showing: Home > [Product Name]

### Requirement: Responsive Product Pages

All product pages SHALL be fully responsive and accessible on mobile, tablet, and desktop devices.

#### Scenario: Mobile-optimized layout

- **GIVEN** a user accesses any product page on a mobile device (viewport width < 768px)
- **WHEN** the page loads
- **THEN** the layout SHALL adapt to single-column display
- **AND** images and cards SHALL resize appropriately
- **AND** navigation SHALL collapse into a mobile menu
- **AND** text SHALL remain readable without horizontal scrolling

#### Scenario: Tablet and desktop layouts

- **GIVEN** a user accesses any product page on tablet (768px-1024px) or desktop (>1024px)
- **WHEN** the page loads
- **THEN** the layout SHALL use multi-column grids for features and use cases
- **AND** hero sections SHALL use optimal aspect ratios
- **AND** whitespace SHALL be appropriate for readability

### Requirement: Product Page Performance

Product pages SHALL load quickly and provide a smooth user experience.

#### Scenario: Initial page load

- **GIVEN** a user navigates to any product page
- **WHEN** the page begins loading
- **THEN** the page SHALL display visible content within 2 seconds (First Contentful Paint)
- **AND** the page SHALL be fully interactive within 4 seconds (Time to Interactive)
- **AND** images SHALL use lazy loading for below-the-fold content

#### Scenario: Navigation between product pages

- **GIVEN** a user is on one product page
- **WHEN** they navigate to another product page
- **THEN** the navigation SHALL be near-instantaneous (client-side routing)
- **AND** the page SHALL not require full page reload
