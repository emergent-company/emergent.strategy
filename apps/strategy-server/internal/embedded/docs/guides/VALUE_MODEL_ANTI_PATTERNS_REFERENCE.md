# Value Model Anti-Patterns Quick Reference

> **Last updated**: EPF v1.13.0 | **Status**: Current

**Purpose:** Fast lookup table for converting technical terms to business language during value model creation.

**Usage:** When writing component names or UVPs, check this table first. If the term appears in the "❌ Avoid" column, use the "✅ Use Instead" abstraction.

---

## Component Name Patterns

### Protocols & APIs

| ❌ Avoid | ✅ Use Instead | Why |
|---------|---------------|-----|
| FIXAPIConnections | ExchangeConnectivity | FIX is protocol implementation detail |
| GraphQLAPI | RealTimeOperationsInterface | GraphQL is API architecture choice |
| RESTfulAPI | DataAccessService | REST is protocol pattern |
| WebSocketFeed | LiveMarketUpdates | WebSocket is transport mechanism |
| HTTPEndpoint | ServiceInterface | HTTP is network protocol |
| APIGateway | ServiceAccessControl | API is technical term |

### DevOps & Deployment Patterns

| ❌ Avoid | ✅ Use Instead | Why |
|---------|---------------|-----|
| BlueGreenDeployment | SafePlatformUpdates | Deployment pattern is technical |
| CanaryDeployment | GradualRolloutValidation | Canary is DevOps term |
| RollingDeployment | ContinuousServiceUpdates | Rolling is deployment strategy |
| CICDPipeline | AutomatedQualityAssurance | CI/CD is process acronym |
| MLOpsPipeline | ContinuousAlgorithmLearning | MLOps is technical domain |
| DevOpsPlatform | OperationsAutomation | DevOps is technical term |
| FeatureFlags | ControlledFeatureActivation | Flags is technical implementation |

### Infrastructure & Tools

| ❌ Avoid | ✅ Use Instead | Why |
|---------|---------------|-----|
| DockerContainers | PortableServicePackaging | Docker is vendor tool |
| KubernetesOrchestration | ScalableServiceManagement | Kubernetes is infrastructure choice |
| HashiCorpVault | SecureCredentialManagement | Vault is tool name |
| PostgreSQLDatabase | PersistentDataStorage | PostgreSQL is vendor choice |
| RedisCache | HighSpeedDataAccess | Redis is tool name |
| KafkaStreaming | EventDistribution | Kafka is tool name |
| ElasticsearchIndex | FastSearchCapability | Elasticsearch is tool name |

### Acronyms & Technical Jargon

| ❌ Avoid | ✅ Use Instead | Why |
|---------|---------------|-----|
| API | Interface, Service, Connection | Acronym is technical |
| DB | Database, Data Storage | Acronym is technical |
| K8s | Service Orchestration | Acronym is technical |
| JSON | Data Format (if needed) | Technical format detail |
| XML | Data Format (if needed) | Technical format detail |
| TCP/IP | Network Communication | Protocol stack detail |

---

## UVP Language Patterns

### Protocol References

| ❌ Technical UVP | ✅ Business-Focused UVP |
|-----------------|------------------------|
| "Execute orders via FIX API to EEX through ABN AMRO" | "Enable reliable high-speed trade execution on European power exchanges" |
| "GraphQL API provides real-time queries for staff" | "Provide instant access to trading operations data for staff team" |
| "Multi-source data feeds normalized via REST APIs" | "Deliver comprehensive market intelligence from 3+ exchanges" |
| "WebSocket feed pushes live market updates" | "Provide continuous real-time market price updates" |

### DevOps Pattern References

| ❌ Technical UVP | ✅ Business-Focused UVP |
|-----------------|------------------------|
| "Blue-green deployment runs new version in parallel environment" | "Update platform safely with instant rollback capability if issues arise" |
| "Canary deployment tests new versions on 5% live capital" | "Validate algorithm improvements safely before full capital deployment" |
| "CI/CD pipeline automates testing and deployment" | "Ensure platform quality through automated validation before release" |
| "MLOps pipeline automates daily model retraining" | "Enable continuous algorithm learning from market patterns" |

### Infrastructure References

| ❌ Technical UVP | ✅ Business-Focused UVP |
|-----------------|------------------------|
| "Docker containers ensure consistent deployment" | "Deploy services consistently across all environments" |
| "Kubernetes orchestrates microservices at scale" | "Manage service capacity dynamically based on demand" |
| "HashiCorp Vault stores encrypted credentials" | "Protect sensitive credentials with enterprise-grade encryption" |
| "PostgreSQL database provides ACID transactions" | "Ensure data consistency and reliability for all transactions" |

---

## Context Tag Usage Patterns

**Rule:** Move technical details to context tags prefixed with "Technical:"

### Example 1: Service Component

**❌ Bad (Technical Pollution):**
```yaml
component_name: FIXAPIConnections
uvp: "Execute orders via FIX API to EEX through ABN AMRO Clearing."
```

**✅ Good (Business + Context):**
```yaml
component_name: ExchangeConnectivity
uvp: "Trade orders are executed reliably on European power exchanges so that fund managers can capture market opportunities, which helps us generate trading revenue."
context: "Technical: Implements FIX API protocol for EEX and EPEX exchanges via ABN AMRO Clearing broker. Includes connection monitoring, retry logic, and order acknowledgment tracking."
```

### Example 2: Infrastructure Component

**❌ Bad (Technical Pollution):**
```yaml
component_name: BlueGreenDeployment
uvp: "Run new version in parallel, switch traffic after validation."
```

**✅ Good (Business + Context):**
```yaml
component_name: SafePlatformUpdates
uvp: "Platform updates are deployed without trading interruptions so that operations can continue reliably, which helps us maintain 99.9% uptime SLA."
context: "Technical: Blue-green deployment pattern with health checks and instant rollback. New version runs in parallel environment, traffic switches only after passing validation tests."
```

### Example 3: Algorithm Component

**❌ Bad (Technical Pollution):**
```yaml
component_name: MLOpsPipeline
uvp: "Automate daily retraining and zero-downtime deployment of 6 expert models."
```

**✅ Good (Business + Context):**
```yaml
component_name: ContinuousAlgorithmLearning
uvp: "Trading algorithms improve daily from market patterns without operational disruption so that performance remains competitive, which helps us maximize returns."
context: "Technical: MLOps pipeline retrains 6 expert models nightly using previous 90 days of market data. Zero-downtime deployment via model versioning and A/B testing framework."
```

---

## Layer-Specific Common Anti-Patterns

### Layer 3 (Service Layer) - Most Common Issues

| Anti-Pattern | Fix |
|--------------|-----|
| Component name contains "API" | Abstract to service capability (DataAccessService, OperationsInterface) |
| UVP mentions protocol name | Focus on data/capability provided, not transport mechanism |
| Sub-component named after data source | Focus on market/region served (GermanMarketData not EEXDataSource) |

**Example:**
- ❌ `GraphQLAPI` → ✅ `RealTimeOperationsInterface`
- ❌ "GraphQL API for staff controls" → ✅ "Trading operations data accessible instantly for staff"

### Layer 4 (Infrastructure) - Highest Risk Issues

| Anti-Pattern | Fix |
|--------------|-----|
| Component name contains deployment pattern | Abstract to outcome (SafeUpdates, GradualRollouts) |
| UVP describes HOW deployment works | Focus on WHY outcome matters (reliability, safety, speed) |
| Sub-component named after tool | Focus on capability delivered (SecureCredentialManagement not HashiCorpVault) |

**Example:**
- ❌ `CanaryDeployment` → ✅ `GradualAlgorithmRollouts`
- ❌ "Deploy to 5% capital first" → ✅ "Validate improvements safely before full deployment"

---

## Quick Validation Questions

Before committing any value model, ask these **5 questions** for EVERY component:

### 1. Non-Technical Investor Test
**Question:** Can an investor without technical knowledge understand what value this delivers?
- ✅ Pass: "Enable reliable trade execution on European exchanges"
- ❌ Fail: "Execute orders via FIX API to EEX"

### 2. Business Development Test
**Question:** Can a BD person explain this to a potential client without technical knowledge?
- ✅ Pass: "Update platform safely with instant rollback if issues arise"
- ❌ Fail: "Blue-green deployment runs new version in parallel"

### 3. Regulatory Understanding Test
**Question:** Can a financial regulator understand what this does and why it's valuable?
- ✅ Pass: "Validate algorithm improvements safely before full capital deployment"
- ❌ Fail: "Canary deployment tests on 5% live capital"

### 4. WHO/WHAT Focus Test
**Question:** Does the UVP describe WHAT value is delivered and WHO benefits (not HOW)?
- ✅ Pass: "Trading algorithms improve daily so that performance remains competitive"
- ❌ Fail: "MLOps pipeline automates model retraining"

### 5. Protocol/Pattern Mention Test
**Question:** Are protocols, DevOps patterns, or technical acronyms absent from component name and UVP?
- ✅ Pass: No mention of FIX, GraphQL, REST, Blue-Green, CI/CD, API, etc.
- ❌ Fail: Any protocol, pattern, or acronym in name or UVP

**If ANY question fails → Refactor to business language immediately.**

---

## Common Sub-Component Naming Fixes

| Layer | ❌ Technical Name | ✅ Business Name | Pattern |
|-------|------------------|-----------------|---------|
| L3 | EEXConnection | GermanMarketAccess | Region/market served |
| L3 | EPEXDataSource | SpotPowerPricing | Data type/purpose |
| L3 | FIXProtocolHandler | OrderExecutionReliability | Capability delivered |
| L4 | DockerRegistry | ServiceImageStorage | Storage purpose |
| L4 | KubernetesCluster | ScalableServiceRuntime | Runtime capability |
| L4 | HashiCorpVaultIntegration | SecureCredentialAccess | Security capability |
| L4 | PrometheusMonitoring | SystemHealthTracking | Monitoring purpose |

---

## Refactoring Workflow

When you encounter technical language:

1. **Identify business outcome**
   - WHO benefits? (investor, staff, fund, client, regulator)
   - WHAT capability is provided? (trade execution, data access, safe updates)
   - WHY is it valuable? (revenue, reliability, safety, compliance)

2. **Abstract to business language**
   - Replace protocol → capability (FIX API → Exchange Connectivity)
   - Replace pattern → outcome (Blue-Green → Safe Updates)
   - Replace acronym → spelled out capability (CI/CD → Automated Quality Assurance)

3. **Move technical details to context**
   - Add context tag prefixed "Technical:"
   - Include implementation details for engineering team
   - Keep protocols, patterns, tools in context only

4. **Validate with 5 questions**
   - Run all 5 validation questions
   - If any fail, iterate steps 1-3
   - Commit only when all pass

---

## Solution Steps Anti-Patterns (If Present)

Solution steps explain HOW a layer delivers value. They must follow business language rules.

### Technical Implementation (Bad)

| ❌ Avoid | ✅ Use Instead | Why |
|---------|---------------|-----|
| Configure Kubernetes cluster with Helm charts | Deploy scalable container orchestration | Kubernetes/Helm are tools |
| Implement REST API with GraphQL federation | Expose flexible data query interface | REST/GraphQL are protocols |
| Set up Blue-Green deployment pipeline | Implement zero-downtime deployment strategy | Blue-Green is DevOps pattern |
| Configure Redis cache with TTL policies | Enable high-speed data access with expiration | Redis/TTL are technical details |
| Deploy MLOps pipeline with model versioning | Enable continuous algorithm improvement | MLOps is technical domain |

### Tool-Focused (Bad)

| ❌ Avoid | ✅ Use Instead | Why |
|---------|---------------|-----|
| Install Docker containers on AWS ECS | Deploy portable services to cloud infrastructure | Docker/ECS are tools |
| Configure Vault for secret management | Implement secure credential storage | Vault is tool name |
| Set up Kafka for event streaming | Enable real-time event distribution | Kafka is tool name |
| Deploy Elasticsearch for search | Provide fast search across all content | Elasticsearch is tool name |

### Missing Outcomes (Bad)

| ❌ Avoid (no outcome) | ✅ Use Instead (with outcome) | Why |
|----------------------|------------------------------|-----|
| Implement monitoring system | Deploy comprehensive monitoring → Operations team detects issues instantly | Must explain what becomes possible |
| Build API gateway | Establish service access control → External partners integrate securely | Must describe capability unlocked |
| Configure database replication | Implement data redundancy → System survives infrastructure failures | Must show value delivered |

### Good Solution Steps Pattern

**Pattern**: Action verb + capability focus → Outcome describing what becomes possible

**Examples**:
- ✅ "Deploy comprehensive monitoring and alerting" → "Operations team detects issues instantly before users impacted"
- ✅ "Implement workspace isolation with row-level security" → "Multiple product lines operate independently without data leakage"
- ✅ "Establish secure connections to power exchanges" → "Fund can execute trades on major markets with regulatory compliance"

---

## Summary Checklist

Before committing, verify:

- [ ] **Component names:** No API, Pipeline, Deployment, Protocol, Tool names
- [ ] **UVPs:** No FIX, GraphQL, REST, WebSocket, HTTP, TCP
- [ ] **UVPs:** No Blue-Green, Canary, CI/CD, MLOps, DevOps
- [ ] **UVPs:** No acronyms (API, DB, K8s) in main content
- [ ] **UVP pattern:** "{Deliverable} so that {beneficiary} can {capability}, which helps us {progress}"
- [ ] **Context tags:** Technical details prefixed "Technical:"
- [ ] **Layer 3-4:** Focus on outcomes not implementation
- [ ] **Solution steps (if present):** Use action verbs, focus on capabilities, include outcomes
- [ ] **Solution steps (if present):** No protocols, DevOps patterns, or tool names
- [ ] **5 questions:** All pass (investor, BD, regulator, WHO/WHAT, protocol tests)

**For complete guidance, see:** `docs/guides/VALUE_MODEL_BUSINESS_LANGUAGE_GUIDE.md`

## Related Resources

- **Guide**: [VALUE_MODEL_BUSINESS_LANGUAGE_GUIDE.md](./VALUE_MODEL_BUSINESS_LANGUAGE_GUIDE.md) - Comprehensive guide to business-focused value model language
- **Schema**: [value_model_schema.json](../../schemas/value_model_schema.json) - Validation schema for value model structure
- **Wizard**: [product_architect.agent_prompt.md](../../wizards/product_architect.agent_prompt.md) - Interactive guidance for creating value models
