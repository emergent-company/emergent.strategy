# Value Model Business Language Guide

> **Last updated**: EPF v1.13.0 | **Status**: Current

**Version:** 1.0  
**Last Updated:** 30 December 2025  
**Purpose:** Ensure value models focus on business outcomes and user value, not technical implementation details

---

## ⭐ The Value Model's Foundational Role

**Critical principle:** The value model is **more fundamental** than feature definitions in EPF's information architecture.

### The WHY-HOW-WHAT Continuum

EPF uses Simon Sinek's WHY-HOW-WHAT framework. Each level contains overlapping WHY-HOW-WHAT elements. The WHAT from one level becomes context for the next level's HOW decisions. This tight coupling ensures emergence—the complete solution emerges from overlapping, interconnected pieces.

**"In a well-functioning organism, the parts cannot be too loosely coupled."**

### The Hierarchy

EPF is **outcome-oriented**. The value model comes first, features follow, implementation follows features.

```
1. VALUE MODEL (Foundation) - EPF CORE
   ↓ WHY: "Why do we exist?" (purpose, value drivers)
   ↓ HOW: "How does value flow?" (capabilities, logical structure)
   ↓ WHAT: High-level components (minimal)
   ↓ Common vocabulary for entire organization
   ↓ Persistent, changes infrequently
   ↓
2. FEATURE DEFINITION (Strategic Specification) - EPF CORE
   ↓ WHY: Inherited from value model (via contributes_to)
   ↓ HOW: "How do users achieve outcomes?" (scenarios, workflows)
   ↓ WHAT: "What value is delivered?" (contexts, outcomes, criteria - strategic, non-implementation)
   ↓ Personas, scenarios, acceptance criteria
   ↓ Changes more frequently (quarterly)
   ↓ ▼▼▼ HANDOFF POINT ▼▼▼
   ↓ The WHAT from Level 2 becomes the WHY for Level 3
   ↓
3. FEATURE IMPLEMENTATION SPEC (Technical Specification) - OUTSIDE EPF
   ↓ WHY: Inherited acceptance criteria become requirements
   ↓ HOW: "How to technically build it?" (architecture, APIs)
   ↓ WHAT: "What technologies to use?" (endpoints, schemas)
   ↓ Technical design, contracts, diagrams
   ↓ Changes frequently (monthly)
   ↓
4. IMPLEMENTED FEATURE (Code) - OUTSIDE EPF
   ↓ WHY: Inherited requirements (minimal)
   ↓ HOW: Algorithms, functions
   ↓ WHAT: "The actual running software" (dominant)
   ↓ Source code, tests, deployment
   ↓ Changes continuously (daily/weekly)
```

**Critical distinctions:**

| Level | WHY-HOW-WHAT | Answers | EPF Scope? | Owner |
|-------|--------------|---------|------------|-------|
| Value model | WHY + HOW (strategic) | "Why do we exist? How does value flow?" | ✅ YES | Product team |
| Feature definition | HOW + WHAT (tactical/strategic) | "How do users achieve outcomes? What value delivered?" | ✅ YES | Product team |
| Implementation spec | HOW + WHAT (technical) | "How to build? What technologies?" | ❌ NO | Engineering team |
| Code | WHAT (concrete) | "The actual software" | ❌ NO | Engineering team |

### Why Value Model Comes First

**The value model defines "WHY we exist + HOW value flows":**
- **WHY (Purpose):** Value drivers - The outcomes users care about
- **HOW (Capabilities):** Value layers - The capabilities that deliver those outcomes
- **WHAT (Components):** High-level components (minimal)
- **Common vocabulary:** Terms everyone in the organization uses

**Feature definitions specify "HOW users achieve outcomes + WHAT value delivered (strategic)":**
- **WHY:** Inherited from value model (explicit `contributes_to` mapping)
- **HOW (dominant):** Personas achieve outcomes through scenarios and workflows
- **WHAT (strategic, non-implementation):** Contexts, jobs-to-be-done, acceptance criteria
  - Example: "Alert within 30 seconds" (outcome) NOT "WebSocket /ws/alerts" (technical)
- Changes more frequently than value model

**Feature implementation specs define "HOW to build technically + WHAT technologies":**
- **WHY:** Inherited acceptance criteria become requirements
- **HOW (dominant):** API contracts, data models, architecture
- **WHAT (technical):** Specific technologies, endpoints, schemas
- **Outside EPF scope** - engineering team's responsibility
- Changes even more frequently (technology evolution)

**Implemented features are "the actual WHAT (running software)":**
- **WHAT (dominant):** Source code, tests, deployment
- **HOW:** Algorithms, functions
- **WHY:** Inherited requirements (minimal)
- **Outside EPF scope** - standard engineering practices
- Changes continuously

### Persistence vs Flexibility

| Artifact | WHY-HOW-WHAT Emphasis | Changes | Why | EPF Scope |
|----------|-----------------------|---------|-----|-----------|
| **Value model** | WHY + HOW (strategic) | Infrequently (annually or major pivots) | Core value proposition should be stable | ✅ YES |
| **Feature definitions** | HOW + WHAT (tactical/strategic) | Quarterly or less | Personas, scenarios evolve with product | ✅ YES |
| **Implementation specs** | HOW + WHAT (technical) | Monthly | Technology and architecture evolve | ❌ NO |
| **Code** | WHAT (concrete) | Continuously (daily/weekly) | Engineering iteration | ❌ NO |

**If your value model changes frequently, you don't have product-market fit.**

### Cross-Organizational Language

The value model is the **common vocabulary** for everyone in the product organization:

| Audience | Uses Value Model For |
|----------|---------------------|
| **Executives** | Strategic discussions, investor pitches, roadmap priorities |
| **Product Managers** | Feature planning, value mapping, cross-team alignment |
| **Engineering** | Understanding business context for technical decisions |
| **Sales/BD** | Articulating value proposition to customers |
| **Customer Success** | Helping customers maximize value from product |

**Everyone should know the value drivers (WHY). Not everyone needs to know every feature detail (HOW/WHAT).**

### When Value Model Changes (Rare)

- **Pivot to new market segment** - Value drivers change (different outcomes matter)
- **Discover new core value** - Add layers (new capabilities)
- **Sunset a capability** - Deprecate layers (no longer offered)

### When Features Change (Common)

- **Better UX** - Improved interaction patterns for same capability
- **New technology** - Better implementation of same value driver
- **User feedback** - Iteration based on usage data
- **Competitive response** - Feature parity for strategic reasons

**The value model provides strategic stability (WHY + HOW) while features provide tactical flexibility (HOW + WHAT).**

---

## The Bridge Document Purpose

Value models serve **two audiences simultaneously**:

1. **Business Stakeholders** (investors, executives, BD, regulators)
   - Must understand the value proposition without technical knowledge
   - Need to evaluate ROI, market positioning, competitive advantage
   - Should be able to explain the product to clients

2. **Engineering Teams** (developers, architects, DevOps)
   - Need implementation context to make informed technical decisions
   - Require understanding of how business value maps to system components
   - Use the document as a living PRD structure

### The Balance

- **Main Content (UVPs, Component Names, Sub-components):** Business-focused language describing WHAT value is delivered and WHO benefits
- **Context Tags:** Technical implementation details prefixed with `Technical:` for engineering team reference

**Rule:** If a non-technical investor or BD person can't understand the main content, it needs abstraction.

---

## Forbidden Technical Terms

### Component Names - NEVER Use These Patterns

| ❌ Avoid | ✅ Use Instead | Reason |
|---------|---------------|--------|
| FIX API Connections | Exchange Connectivity | Protocol is implementation detail |
| GraphQL API | Real-time Operations Interface | API architecture is technical |
| RESTful API | Data Access Service | REST is a protocol, not value |
| WebSocket Feed | Live Market Updates | Transport mechanism is technical |
| Blue-Green Deployment | Safe Platform Updates | DevOps pattern is implementation |
| Canary Deployment | Gradual Rollout Validation | Deployment strategy is technical |
| CI/CD Pipeline | Automated Quality Assurance | Process automation is internal |
| MLOps Pipeline | Continuous Algorithm Learning | MLOps is technical domain |
| Docker Containers | Portable Service Packaging | Container tech is implementation |
| Kubernetes Orchestration | Scalable Service Management | K8s is infrastructure choice |
| HashiCorp Vault | Secure Credential Management | Tool vendor is implementation |
| PostgreSQL Database | Persistent Data Storage | Database vendor is technical |

### UVP Language - Abstract These Concepts

| Technical Concept | Business Abstraction |
|-------------------|---------------------|
| "Execute orders via FIX API to EEX" | "Enable reliable high-speed trade execution on European exchanges" |
| "GraphQL API for real-time queries" | "Provide instant access to trading operations data" |
| "Multi-source data feeds normalized into unified platform" | "Deliver comprehensive market intelligence from 3+ exchanges" |
| "Automate daily retraining and zero-downtime deployment" | "Enable continuous algorithm learning without trading interruptions" |
| "Canary deployment tests new versions on 5% live capital" | "Validate improvements safely before full capital deployment" |
| "Blue-green deployment runs new version in parallel" | "Update platform safely with instant rollback capability" |
| "CI/CD pipeline automates testing and deployment" | "Ensure platform quality through automated validation" |
| "MLOps pipeline manages model lifecycle" | "Maintain algorithm performance through continuous monitoring" |

### Acronyms and Technical Jargon to Avoid

| ❌ Avoid | ✅ Use Instead |
|---------|---------------|
| API | Interface, Service, Connection |
| CI/CD | Automated Quality Assurance |
| MLOps | Algorithm Management |
| DevOps | Operations Automation |
| K8s | Service Orchestration |
| DB | Data Storage |
| JSON/XML | Data Format (if needed) |
| HTTP/HTTPS | Network Protocol (if needed) |
| TCP/IP | Network Communication (if needed) |

---

## Context Tags Pattern

Use context tags to provide technical details for engineering teams **without polluting business language**.

### Format

```yaml
component_name: SafePlatformUpdates
uvp: "Platform updates are deployed safely so that trading operations can continue uninterrupted, which helps us maintain 99.9% uptime."
context: "Technical: Implements blue-green deployment pattern with instant rollback capability. New version runs in parallel environment, traffic switches after validation."
```

### Rules

1. **Main UVP:** Business outcome only (WHAT value, WHO benefits)
2. **Context Tag:** Prefixed with `Technical:` for engineering clarity
3. **Context Content:** Implementation patterns, protocols, tools, architecture decisions
4. **Optional:** Context tags only needed when engineering needs implementation guidance

### Examples

**Good:**
```yaml
# Layer 3 - Service Layer
component_name: ExchangeConnectivity
uvp: "Trade orders are executed reliably on European power exchanges so that fund managers can capture market opportunities, which helps us generate trading revenue."
context: "Technical: Implements FIX API protocol for EEX and EPEX exchanges via ABN AMRO Clearing. Includes retry logic, connection monitoring, and failover handling."
```

**Bad (Technical Pollution):**
```yaml
component_name: FIXAPIConnections
uvp: "Execute orders via FIX API to EEX through ABN AMRO Clearing."
```

---

## Layer-Specific Guidance

### Layer 1 & 2: User-Facing (Usually Clean)

**Focus:** User experience, business outcomes, stakeholder value

**Example:**
```yaml
# Layer 1 - Investor App
component_name: PortfolioMonitoring
uvp: "Real-time portfolio performance is displayed so that investors can track returns, which helps us provide transparency and build trust."
```

**Validation:** Ask "Can an investor understand this?" → Yes ✅

---

### Layer 3: Service Layer (High Risk for Technical Drift)

**Focus:** Service capabilities, business functions, data flows

**Common Mistakes:**
- ❌ Mentioning protocols (FIX, GraphQL, REST, WebSocket)
- ❌ Mentioning API architecture
- ❌ Describing data transformation logic

**Good Pattern:**
```yaml
# Layer 3 - Application Hosting API
component_name: MarketDataAggregation
uvp: "Comprehensive European power market data is provided so that trading algorithms can make informed decisions, which helps us optimize trading performance."
context: "Technical: Aggregates data from EEX, EPEX, and Nordpool exchanges via their respective APIs. Normalizes into unified schema for consumption by ML models and UI."

sub_components:
  - name: GermanMarketData
    uvp: "EEX and EPEX market data is collected so that algorithms can trade German power markets, which helps us access the largest European power exchange."
    context: "Technical: Polls EEX API every 15 seconds for spot and day-ahead prices. EPEX data via WebSocket for real-time updates."
```

**Validation:** Ask "Can a BD person explain this to a client?" → Yes ✅

---

### Layer 4: Infrastructure/Operations Layer (Highest Risk)

**Focus:** Operational outcomes, reliability, safety, efficiency

**Common Mistakes:**
- ❌ Naming deployment patterns (Blue-Green, Canary, Rolling)
- ❌ Mentioning CI/CD, MLOps, DevOps
- ❌ Naming infrastructure tools (Docker, Kubernetes, Vault)
- ❌ Describing technical processes instead of outcomes

**Good Pattern:**
```yaml
# Layer 4 - Cloud Security & Operations
component_name: SafePlatformUpdates
uvp: "Platform updates are deployed without trading interruptions so that operations can continue reliably, which helps us maintain 99.9% uptime SLA."
context: "Technical: Blue-green deployment pattern with health checks and instant rollback. New version deployed to parallel environment, traffic switched after validation."

sub_components:
  - name: GradualAlgorithmRollouts
    uvp: "Algorithm improvements are validated with limited capital before full deployment so that fund can avoid costly errors, which helps us protect investor capital."
    context: "Technical: Canary deployment strategy - new model version deployed to 5% of capital for 24 hours. Automatic rollback if performance degrades."
    
  - name: ContinuousAlgorithmLearning
    uvp: "Trading algorithms improve daily from market patterns without operational disruption so that performance remains competitive, which helps us maximize returns."
    context: "Technical: MLOps pipeline retrains 6 expert models nightly using previous 90 days of data. Zero-downtime deployment via model versioning and A/B testing."
```

**Validation:** Ask "Can a regulator understand the business value?" → Yes ✅

---

### Layer Solution Steps (Optional Enhancement)

**Purpose**: Document HOW each layer delivers value through a sequence of implementation actions and their resulting capabilities.

**When to Use**:
- Complex layers with multiple activation stages
- Infrastructure/operations layers with technical implementation sequences
- Layers where implementation order matters
- When bridging strategic intent to architectural execution

**Pattern**: Each solution step has two parts:
- **step**: Action-oriented implementation approach (30-150 chars)
  - Use action verbs: Implement, Build, Enable, Provide, Configure, Deploy
  - Focus on capabilities being created, not technical details
  - Keep layer-appropriate scope (broader than component-level details)
- **outcome**: Resulting capability or value unlocked (30-200 chars)
  - Answers "So that..." - what becomes possible after this step?
  - Focus on user/business benefits, not technical specifications

**Business Language Requirement**: Solution steps MUST follow same business language rules as component names and UVPs:
- ❌ NO technical protocols (FIX, GraphQL, REST, WebSocket)
- ❌ NO DevOps patterns (Blue-Green, Canary, CI/CD, MLOps)
- ❌ NO technical acronyms (API, DB, K8s, JSON)
- ✅ YES capabilities and outcomes (what becomes possible)
- ✅ YES beneficiaries (who gains capability)

**Examples**:

Layer 1 (User Experience):
```yaml
solution_steps:
  - step: "Implement responsive design supporting mobile and web platforms"
    outcome: "Investors can access portfolio information from any device, improving engagement"
  - step: "Provide real-time data synchronization across all client platforms"
    outcome: "Users see consistent information regardless of access point"
```

Layer 4 (Infrastructure):
```yaml
solution_steps:
  - step: "Implement zero-downtime deployment strategy"
    outcome: "Trading operations continue uninterrupted during system updates"
  - step: "Deploy comprehensive monitoring and alerting"
    outcome: "Operations team detects issues instantly before users impacted"
```

**Validation Checklist** (add to existing 5-Question checklist):
- [ ] Each step uses action verb and describes capability being created
- [ ] Each outcome describes what becomes possible (not how it's done)
- [ ] Steps build upon each other in logical sequence
- [ ] Solution steps use business language (no protocols, patterns, acronyms)
- [ ] Non-technical stakeholder can understand value progression

---

## Validation Checklist

Before committing a value model, validate with these **5 questions**:

### 1. Non-Technical Investor Test
**Question:** "Can a non-technical investor read this and understand what value the product delivers?"

**Pass Criteria:**
- ✅ Component names describe business capabilities
- ✅ UVPs explain WHO benefits and WHY
- ✅ No protocols, patterns, or acronyms in main content

**Fail Examples:**
- ❌ "FIXAPIConnections executes orders via FIX protocol"
- ❌ "MLOps pipeline automates model deployment"

### 2. Business Development Test
**Question:** "Can a BD person explain this component to a potential client without technical knowledge?"

**Pass Criteria:**
- ✅ Focuses on business outcomes and benefits
- ✅ Client can understand competitive advantage
- ✅ Value proposition is clear without engineering context

**Fail Examples:**
- ❌ "Blue-green deployment reduces downtime"
- ❌ "GraphQL API provides flexible querying"

### 3. Regulatory Understanding Test
**Question:** "Can a financial regulator understand what this component does and why it's valuable?"

**Pass Criteria:**
- ✅ Describes risk management or compliance benefits clearly
- ✅ No technical jargon obscuring purpose
- ✅ Safety and reliability outcomes explicit

**Fail Examples:**
- ❌ "Kubernetes orchestration ensures high availability"
- ❌ "CI/CD pipeline automates testing"

### 4. WHO/WHAT Focus Test
**Question:** "Does the UVP describe WHAT value is delivered and WHO benefits, not HOW it's implemented?"

**Pass Criteria:**
- ✅ UVP pattern: "{Deliverable} is produced so that {beneficiary} can {capability}, which helps us {progress}"
- ✅ Beneficiary is clear (investor, staff, fund, market)
- ✅ Capability is business outcome

**Fail Examples:**
- ❌ "System uses REST API to fetch data" (HOW)
- ✅ "Market data is provided so that algorithms can trade effectively" (WHAT/WHO)

### 5. Protocol/Pattern Mention Test
**Question:** "Are protocols, DevOps patterns, or technical acronyms mentioned in component names or UVPs?"

**Pass Criteria:**
- ✅ No mentions of: FIX, GraphQL, REST, WebSocket, HTTP, TCP
- ✅ No mentions of: Blue-Green, Canary, Rolling, CI/CD, MLOps, DevOps
- ✅ No mentions of: Docker, Kubernetes, K8s, API, DB
- ✅ Technical details relegated to context tags

**Fail Examples:**
- ❌ Any component name containing "API", "Pipeline", "Deployment"
- ❌ Any UVP mentioning protocols or patterns

### 6. Solution Steps Validation (If Present)
**Question:** "Do solution steps describe capabilities being created (not technical implementation)?"

**Pass Criteria:**
- ✅ Each step uses action verb (Implement, Build, Enable, Provide, Configure)
- ✅ Each outcome describes capability unlocked (what becomes possible)
- ✅ Steps build upon each other in logical sequence
- ✅ Business language (no protocols, patterns, acronyms)
- ✅ Non-technical stakeholder can understand value progression

**Pass Examples:**
- ✅ "Deploy comprehensive monitoring and alerting" → "Operations team detects issues instantly"
- ✅ "Implement workspace isolation with row-level security" → "Multiple product lines operate independently"

**Fail Examples:**
- ❌ "Configure Kubernetes cluster with Helm charts" → "K8s pods auto-scale"
- ❌ "Implement REST API with GraphQL federation" → "Microservices communicate efficiently"

---

## Refactoring Decision Tree

When you encounter technical language in a value model:

```
┌─────────────────────────────────────┐
│ Technical term in component name or │
│ UVP? (protocol, pattern, acronym)   │
└──────────────┬──────────────────────┘
               │
               ▼
        ┌──────┴──────┐
        │   Yes       │
        └──────┬──────┘
               │
               ▼
┌──────────────────────────────────────┐
│ 1. Identify business outcome          │
│    - WHO benefits?                     │
│    - WHAT capability is provided?      │
│    - WHY is it valuable?               │
└──────────────┬───────────────────────┘
               │
               ▼
┌──────────────────────────────────────┐
│ 2. Abstract to business language      │
│    - Replace protocol → capability    │
│    - Replace pattern → outcome        │
│    - Replace acronym → spelled out    │
└──────────────┬───────────────────────┘
               │
               ▼
┌──────────────────────────────────────┐
│ 3. Move technical details to context  │
│    - Add context tag prefixed         │
│      "Technical: ..."                 │
│    - Include implementation details   │
│      for engineering team             │
└──────────────┬───────────────────────┘
               │
               ▼
┌──────────────────────────────────────┐
│ 4. Validate with 5-question checklist │
│    - Run all 5 validation questions   │
│    - If any fail, iterate step 2-3    │
└───────────────────────────────────────┘
```

---

## Before/After Examples

### Example 1: Service Layer Component

**Before (Technical):**
```yaml
component_name: FIXAPIConnections
uvp: "Execute orders via FIX API to EEX and EPEX exchanges through ABN AMRO Clearing."
sub_components:
  - name: EEXConnection
    uvp: "Maintain FIX session to EEX for spot and futures trading."
```

**After (Business-Focused):**
```yaml
component_name: ExchangeConnectivity
uvp: "Trade orders are executed reliably on European power exchanges so that fund managers can capture market opportunities, which helps us generate trading revenue."
context: "Technical: Implements FIX API protocol for EEX and EPEX exchanges via ABN AMRO Clearing broker. Includes connection monitoring, automatic reconnection, and order acknowledgment tracking."
sub_components:
  - name: GermanMarketAccess
    uvp: "German power market orders are executed so that fund can trade the largest European power exchange, which helps us maximize liquidity and trading opportunities."
    context: "Technical: FIX 4.4 connection to EEX for spot and day-ahead futures. Handles order entry, modification, cancellation, and execution reports."
```

### Example 2: Infrastructure Component

**Before (Technical):**
```yaml
component_name: BlueGreenDeployment
uvp: "Run new version in parallel environment, switch traffic after validation."
sub_components:
  - name: CanaryDeployment
    uvp: "Test new expert versions on 5% live capital before full rollout."
  - name: MLOpsPipeline
    uvp: "Automate daily model retraining and zero-downtime deployment."
```

**After (Business-Focused):**
```yaml
component_name: SafePlatformUpdates
uvp: "Platform updates are deployed without trading interruptions so that operations can continue reliably, which helps us maintain 99.9% uptime SLA."
context: "Technical: Blue-green deployment pattern with health checks and instant rollback capability. New version runs in parallel environment, traffic switches only after validation."
sub_components:
  - name: GradualAlgorithmRollouts
    uvp: "Algorithm improvements are validated with limited capital before full deployment so that fund can avoid costly errors, which helps us protect investor capital."
    context: "Technical: Canary deployment - new model version deployed to 5% of capital for 24-hour observation period. Automatic rollback if performance metrics degrade."
    
  - name: ContinuousAlgorithmLearning
    uvp: "Trading algorithms improve daily from market patterns without operational disruption so that performance remains competitive, which helps us maximize returns."
    context: "Technical: MLOps pipeline retrains 6 expert models nightly using previous 90 days of data. Zero-downtime deployment via model versioning."
```

### Example 3: API Component

**Before (Technical):**
```yaml
component_name: GraphQLAPI
uvp: "GraphQL API for Staff App providing expert controls and trade blotter."
```

**After (Business-Focused):**
```yaml
component_name: RealTimeOperationsInterface
uvp: "Trading operations data is accessible instantly so that staff can monitor and control algorithms effectively, which helps us respond quickly to market conditions."
context: "Technical: GraphQL API serving Staff App with real-time subscriptions for trade blotter, expert status, and control commands. Implements authentication and role-based access control."
```

---

## Common Patterns Reference

### Protocol Abstractions

| Protocol | Business Abstraction | Example Component Name |
|----------|---------------------|------------------------|
| FIX API | Exchange connectivity, Order execution | ExchangeConnectivity, OrderRouting |
| GraphQL | Real-time data access, Operations interface | RealTimeOperationsInterface, DataAccessService |
| REST API | Data service, Information access | MarketDataService, AccountInformationAccess |
| WebSocket | Live updates, Real-time feed | LiveMarketUpdates, RealTimeNotifications |
| HTTP/HTTPS | Network communication | (Usually too low-level to mention) |

### DevOps Pattern Abstractions

| Pattern | Business Abstraction | Example Component Name |
|---------|---------------------|------------------------|
| Blue-Green Deployment | Safe updates, Zero-downtime updates | SafePlatformUpdates, RiskMinimizedUpdates |
| Canary Deployment | Gradual rollout, Validation before scale | GradualAlgorithmRollouts, SafeFeatureRollouts |
| Rolling Deployment | Continuous updates | OngoingPlatformImprovements |
| CI/CD Pipeline | Automated quality assurance, Safe releases | AutomatedQualityAssurance, ContinuousValidation |
| Feature Flags | Controlled feature activation | SelectiveFeatureActivation, ControlledRollouts |

### Infrastructure Tool Abstractions

| Tool/Technology | Business Abstraction | Example Component Name |
|-----------------|---------------------|------------------------|
| Docker Containers | Portable services, Consistent deployment | PortableServicePackaging, ConsistentDeployment |
| Kubernetes | Service orchestration, Scalable infrastructure | ScalableServiceManagement, AutomatedResourceManagement |
| HashiCorp Vault | Secure credential management | SecureCredentialManagement, ProtectedSecretsStorage |
| PostgreSQL | Persistent data storage, Relational database | PersistentDataStorage, StructuredDataManagement |
| Redis | Fast data caching, Session storage | HighSpeedDataAccess, TemporaryDataStorage |
| Kafka | Event streaming, Message queue | EventDistribution, AsynchronousMessaging |

### Operational Concept Abstractions

| Technical Concept | Business Abstraction | Example Component Name |
|-------------------|---------------------|------------------------|
| MLOps Pipeline | Continuous algorithm learning, Model management | ContinuousAlgorithmLearning, AlgorithmPerformanceManagement |
| Monitoring & Alerting | Performance tracking, Issue detection | SystemHealthMonitoring, ProactiveIssueDetection |
| Load Balancing | Traffic distribution, High availability | EfficientRequestDistribution, ReliableServiceAccess |
| Auto-scaling | Demand-responsive capacity | DynamicCapacityManagement, CostEfficientScaling |
| Backup & Recovery | Data protection, Business continuity | DataProtectionAndRecovery, BusinessContinuityAssurance |

---

## Summary Checklist

Before committing any value model, ensure:

- [ ] **No technical terms in component names** (no API, Pipeline, Deployment, etc.)
- [ ] **No protocols in UVPs** (no FIX, GraphQL, REST, WebSocket, HTTP, etc.)
- [ ] **No DevOps patterns in UVPs** (no Blue-Green, Canary, CI/CD, MLOps, etc.)
- [ ] **No technical acronyms in main content** (API, DB, K8s, etc. relegated to context)
- [ ] **All UVPs follow pattern:** "{Deliverable} so that {beneficiary} can {capability}, which helps us {progress}"
- [ ] **Context tags used for technical details** (prefixed with "Technical:")
- [ ] **Layer 3-4 components focus on outcomes** (not implementation methods)
- [ ] **Passed 5 validation questions** (investor, BD, regulator, WHO/WHAT, protocol tests)

---

## Related Resources

- **Schema**: [value_model_schema.json](../../schemas/value_model_schema.json) - Validation schema for value model structure
- **Anti-Patterns**: [VALUE_MODEL_ANTI_PATTERNS_REFERENCE.md](./VALUE_MODEL_ANTI_PATTERNS_REFERENCE.md) - Common mistakes to avoid in value model documentation
- **Guide**: [PRODUCT_PORTFOLIO_GUIDE.md](./PRODUCT_PORTFOLIO_GUIDE.md) - Managing multiple product lines with distinct value models
- **Wizard**: [product_architect.agent_prompt.md](../../wizards/product_architect.agent_prompt.md) - Step-by-step guidance for value model creation
