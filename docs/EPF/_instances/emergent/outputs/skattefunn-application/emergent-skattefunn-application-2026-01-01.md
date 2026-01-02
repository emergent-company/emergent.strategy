# SkatteFUNN - Tax Deduction Scheme Application

**Application Date:** 1 January 2026  
**Status:** Draft  
**Project Period:** 1 August 2025 to 31 December 2027 (29 months)  
**Total Budget:** 3,250,000 NOK

---

## Section 1: Project Owner and Roles

### 1.1 Project Owner

The Project Owner is responsible for running the project in accordance with the contract documents.

| Organisation Name | Organisation Number | Manager |
| --- | --- | --- |
| Eyedea AS | 926 006 985 | Nikolai Fasting |

### 1.2 Roles in the Project

Three mandatory roles required:

| Name | Role | E-mail | Phone | Access Rights |
| --- | --- | --- | --- | --- |
| Nikolai Fasting | **Creator of Application** | nikolai@eyedea.no | +47 123 45 678 | Delete, Submit, Edit, Read, Withdraw, ChangeAccess |
| Nikolai Fasting | **Organisation Representative** | nikolai@eyedea.no | +47 123 45 678 | Edit, Read, Approve |
| Nikolai Fasting | **Project Leader** | nikolai@eyedea.no | +47 123 45 678 | Delete, Submit, Edit, Read, Withdraw, ChangeAccess |

---

## Section 2: About the Project

### 2.1 Project Title

**Title (English):** Development of AI-Native Knowledge Graph System with Context-Aware Agent Integration  
*[91 characters]*

**Title (Norwegian):** Utvikling av AI-Nativt Kunnskapsgraf-System med Kontekst-Bevisste Agenter  
*[85 characters]*

**Short Name:** EMERGENT-KG-RD  
*[15 characters]*

### 2.2 Scientific Classification

**Subject Area:** Natural Sciences and Technology  
**Subject Group:** Computer and Information Sciences  
**Subject Discipline:** Software Engineering and AI Systems

### 2.3 Additional Information

**Area of Use:** Software Development and Knowledge Management  
*(Industry where project results will be applied)*

**Continuation of Previous Project:** No  
**Other Companies Applying for This Project:** No

---

## Section 3: Background and Company Activities

### 3.1 Company Activities

Eyedea AS develops Emergent—an AI-powered knowledge management ecosystem comprising three core products: Emergent Core (knowledge engine with graph-based intelligence), EPF-Runtime (workflow orchestration system), and Emergent Tools (integration connectors). We are a scale-up company building infrastructure that transforms unstructured organizational information into queryable, connected knowledge graphs that AI assistants can reason over. Our customers span software development teams and product organizations requiring systematic knowledge management for AI-assisted workflows.

*[577 characters / 2000 max]*

*Describe your products/services, markets, and company stage (startup/scale-up/established).*

### 3.2 Project Background

Current AI agent architectures (OpenAI Assistants, LangChain agents, Claude) require manual context injection for every interaction, creating scalability bottlenecks. Existing Retrieval-Augmented Generation (RAG) approaches using vector databases capture syntactic similarity but fail to represent semantic relationships between product features, business rules, and temporal evolution. When AI agents query for "related features," vector search returns textually similar documents but misses functional dependencies (Feature A requires Feature B). When agents need historical context (why was this design decision made?), current systems lack temporal relationship modeling. This gap necessitates R&D into metadata architectures enabling autonomous agents to construct context-aware representations from heterogeneous documentation without manual schema definition. The unpredictability stems from balancing expressiveness (capturing complex domain logic) with computability (real-time queries <200ms latency). Traditional knowledge graphs require extensive curation; fully automated extraction produces semantically shallow representations insufficient for agent reasoning.

*[1098 characters / 2000 max]*

*Explain why this project is important for your company's development.*

---

## Section 4: R&D Content

The primary R&D challenges lie in four interconnected domains: (1) **Hybrid Storage Architecture** - whether PostgreSQL+pgvector can match specialized graph databases for mixed semantic/graph queries; performance trade-offs unpredictable (vector index size vs latency, concurrent writes impact, failover behavior); requires systematic empirical testing under realistic load. (2) **Multi-Format Extraction** - LLMs achieve 90-95% accuracy on clean datasets but degrade unpredictably on heterogeneous real-world documents; format-specific failure modes (scanned PDFs, malformed Markdown, code comments); requires systematic preprocessing pipelines and semantic validation beyond syntactic correctness. (3) **Context-Aware Architecture** - no existing methodology quantitatively measures whether AI agents "understand" context correctly; requires novel evaluation frameworks correlating with real-world decision quality; unpredictability from non-deterministic LLM outputs combined with deterministic constraint enforcement. (4) **Durable Orchestration** - Temporal provides theoretical durability but practical application to EPF cycles (READY/FIRE/AIM spanning days/weeks) introduces unpredictable failure modes; categorizing transient vs permanent errors for knowledge work with human approvals; state serialization limits for complex artifacts. Systematic R&D required because analytical determination impossible; requires controlled experiments, A/B testing, load testing, failover scenarios, external adoption studies, security audits.

*[1491 characters / 2000 max]*

*Describe the technical/scientific challenge with no known solution today, why R&D is required, and the systematic method you will use.*

---

## Section 5: Primary Objective and Innovation

### 5.1 Primary Objective

Develop and validate a metadata-driven framework enabling autonomous AI agents to construct accurate, context-aware representations of organizational knowledge from heterogeneous documentation sources (PDF, Markdown, code, URLs) with ≥95% extraction accuracy and <200ms query latency at 10,000+ object scale. Deliver production-ready Emergent Core system combining hybrid storage architecture (PostgreSQL + pgvector), LLM-based extraction pipeline, and Model Context Protocol integration demonstrating measurable improvements in AI agent task completion quality (≥20%) and hallucination reduction (≥30%).

*[581 characters / 1000 max]*

*State concrete, verifiable goals and describe what new or improved goods/services will result.*

### 5.2 Market Differentiation

Current solutions rely on vector databases (Pinecone, Weaviate) for semantic search OR traditional knowledge graphs (Neo4j) for relationship traversal, but not both integrated. Vector databases capture syntactic similarity but miss semantic relationships (cause/effect, dependencies); cannot represent temporal evolution; lack standardized AI agent protocols. Traditional knowledge graphs require extensive manual schema definition; lack semantic search over unstructured content; have limited AI agent integration. Existing RAG systems treat documents as independent chunks, missing cross-document relationships and temporal context. Our hybrid approach uniquely combines vector embeddings (semantic search) with typed relationship graphs (reasoning), systematic temporal tracking (evolution over time), and standardized Model Context Protocol integration. This integration addresses gaps not systematically investigated in literature or commercial products, validated through systematic A/B testing measuring context fidelity in agent interactions.

*[971 characters / 2000 max]*

*Explain how your solution differs from existing products or competitor offerings (state-of-the-art comparison).*

---

## Section 6: Project Summary

This project develops Emergent Core—an AI-native knowledge graph system automatically extracting structured metadata from unstructured organizational documents and exposing it to AI agents via Model Context Protocol. Core innovation: hybrid storage architecture (PostgreSQL + pgvector) maintaining <200ms query latency for mixed semantic/graph queries at production scale, combined with systematic validation frameworks measuring context fidelity in AI agent interactions. R&D outcomes will demonstrate whether general-purpose databases can match specialized graph systems for AI workloads, whether LLM extraction can achieve 95%+ accuracy across heterogeneous formats, and whether explicit context grounding measurably improves agent decision quality. Results transferable through open-source benchmarks, white papers, and reusable architecture patterns.

*[793 characters / 1000 max]*

*Brief summary of background, objectives, challenges, and approach. This will be published publicly if your application is approved.*

---

## Section 7: Work Packages

### Work Package 1: Production-Ready Knowledge Graph with AI-Native Query Capabilities

**Duration:** August 2025 to July 2026 (12 months)  
**R&D Category:** Experimental Development

#### R&D Challenges

Whether PostgreSQL with vector indexing can scale to 10,000+ objects while maintaining AI-agent-acceptable latency (<200ms); whether LLM extraction can maintain 95%+ accuracy across heterogeneous document formats (PDF, Markdown, code); whether Model Context Protocol integration measurably improves AI agent task quality and reduces hallucinations.

*[331 characters / 500 max]*

*Describe the challenge where no solution exists today.*

#### Method and Approach

Build production-scale test environment (10K+ objects); run load tests simulating 10-50 concurrent AI agent queries over 7 days measuring p50/p95/p99 latency; compare PostgreSQL+pgvector vs Neo4j under identical workloads. Build labeled test dataset (200+ documents); implement format-specific extractors using GPT-4 structured outputs; measure precision/recall; iterate on prompt engineering and semantic validation. Implement MCP server exposing knowledge graph; deploy to 5 pilot users; A/B test task completion with/without MCP context over 4 weeks measuring quality, hallucination rate, user satisfaction.

*[584 characters / 1000 max]*

*Describe the systematic process to solve the challenge.*

#### Activities

##### Activity 1: Knowledge Graph Performance Validation (kr-p-001)

*[46 characters / 100 max]*

PostgreSQL+pgvector validation at production scale (10K+ objects, 20+ concurrent users). Hypothesis: maintains <200ms p95 latency. Experiment: Load testing over 7 days with realistic query patterns (semantic search + graph traversal). Success criteria: p95 ≤200ms, p99 ≤500ms, graceful degradation <1s if vector index fails, PostgreSQL within 2x cost of Neo4j. Deliverables: production-scale test environment, load testing framework, performance benchmark report comparing PostgreSQL vs Neo4j.

*[487 characters / 500 max]*

##### Activity 2: Multi-Format Document Extraction Pipeline (kr-p-002)

*[52 characters / 100 max]*

LLM-based extraction achieving 95%+ accuracy across PDF/Markdown/code. Hypothesis: format-specific preprocessing maintains accuracy. Experiment: labeled dataset (200+ documents), GPT-4 structured outputs, precision/recall tests, edge cases (scanned PDFs, malformed Markdown). Success criteria: ≥95% F1 overall, per-format targets (PDF ≥92%, Markdown ≥97%, Code ≥93%), <30s processing, <$0.10 cost. Deliverables: labeled dataset, format-specific extractors, accuracy benchmark report.

*[453 characters / 500 max]*

##### Activity 3: MCP Server Integration for AI Agents (kr-p-003)

*[47 characters / 100 max]*

Model Context Protocol server providing knowledge graph context to AI agents. Hypothesis: MCP improves task quality ≥20%, reduces hallucinations ≥30%. Experiment: Deploy to 5 pilot users, A/B test with/without MCP over 4 weeks, measure code quality (review scores), hallucination rate, satisfaction. Success criteria: 5+ daily users, ≥20% quality improvement, ≥30% hallucination reduction, <500ms p95 latency, ≥8/10 satisfaction. Deliverables: MCP server implementation, A/B test results, query pattern analysis.

*[500 characters / 500 max]*

#### Budget

**Yearly Costs:**

| Year | Cost Code | Amount (NOK) |
|------|-----------|--------------|
| 2025 | Personnel | 534,000 |
| 2025 | Equipment | 152,000 |
| 2025 | Overhead | 77,000 |
| 2025 | **2025 Total** | **763,000** |
| 2026 | Personnel | 747,000 |
| 2026 | Equipment | 213,000 |
| 2026 | Overhead | 107,000 |
| 2026 | **2026 Total** | **1,067,000** |
| | **WP1 Grand Total** | **1,830,000** |

**Cost Specification:**

Personnel (70%): R&D engineers for implementation, testing, experimentation. Equipment (20%): Cloud infrastructure (PostgreSQL clusters for load testing), LLM API costs (GPT-4/Claude/Gemini experiments). Overhead (10%): Office, admin, knowledge dissemination.

*[234 characters / 500 max - optional elaboration]*

---

### Work Package 2: EPF Self-Hosting and Feature Definition Framework

**Duration:** August 2025 to January 2026 (6 months)  
**R&D Category:** Experimental Development

#### R&D Challenges

Whether EPF framework structure is intuitive enough for teams to adopt without extensive training (external team completes first artifact <4 hours with only written guidance); whether structured feature definitions reduce developer rework from 30% baseline to <15% through AI-agent-readable specifications enabling accurate implementation plan generation.

*[325 characters / 500 max]*

*Describe the challenge where no solution exists today.*

#### Method and Approach

Complete all 6 READY artifacts for Emergent (North Star, Insight, Strategy, Value Models, Roadmap, Integration Spec); validate against schema; track time per artifact and blockers; test with external team providing only README + templates measuring completion time. Design feature definition template based on EPF principles (Why/How/What, traceability, AI-readability); create 15 definitions across 3 product lines; validate each traces to roadmap KR and AI agent can generate implementation plan; A/B test vs traditional tickets measuring rework rate.

*[585 characters / 1000 max]*

*Describe the systematic process to solve the challenge.*

#### Activities

##### Activity 4: EPF Framework Adoption Validation (kr-p-004)

*[44 characters / 100 max]*

EPF self-hosting feasibility: complete 6/6 READY artifacts, validate external team adoption. Hypothesis: intuitive enough for adoption without extensive training. Experiment: complete artifacts tracking time/blockers, external team first artifact <4hr with written guidance only. Success criteria: 6/6 pass schema, 0 TBD markers, 100% traceability, external team <4hr, ≥8/10 internal satisfaction, ≥7/10 external. Deliverables: 6 completed READY artifacts, adoption time tracking, external case study, improvement recommendations.

*[500 characters / 500 max]*

##### Activity 5: Feature Definition Template Validation (kr-p-005)

*[49 characters / 100 max]*

Feature definition template reducing rework through AI-readable specifications. Hypothesis: reduces rework 30%→<15%. Experiment: design template, create 15 definitions (Core:7, EPF:5, OpenSpec:3), validate AI agent generates accurate plans ≥90% cases, A/B test vs tickets measuring rework rate. Success criteria: 15+ definitions, 100% traceability to KRs, ≥90% AI accuracy, ≥8/10 developer satisfaction, <15% rework vs 30% baseline, 20%+ faster time-to-first-commit. Deliverables: template, 15 definitions, AI validation, rework comparison.

*[500 characters / 500 max]*

#### Budget

**Yearly Costs:**

| Year | Cost Code | Amount (NOK) |
|------|-----------|--------------|
| 2025 | Personnel | 356,000 |
| 2025 | Equipment | 102,000 |
| 2025 | Overhead | 50,000 |
| 2025 | **2025 Total** | **508,000** |
| 2026 | Personnel | 71,000 |
| 2026 | Equipment | 20,000 |
| 2026 | Overhead | 11,000 |
| 2026 | **2026 Total** | **102,000** |
| | **WP2 Grand Total** | **610,000** |

**Cost Specification:**

Personnel (70%): R&D engineers + product manager for framework design, artifact creation, adoption studies. Equipment (20%): Development tools, external team stipend. Overhead (10%): Office, admin, knowledge dissemination.

*[219 characters / 500 max - optional elaboration]*

---

### Work Package 3: EPF-Runtime MVP with Durable Workflow Orchestration

**Duration:** August 2026 to December 2027 (17 months)  
**R&D Category:** Experimental Development

#### R&D Challenges

Whether shared infrastructure (auth, RLS, multi-tenancy) from Core extends to Runtime with <500ms API latency and zero cross-tenant leakage; whether EPF artifacts stored as graph objects enable semantic search ≥85% precision; whether app switcher UI reduces context-switching ≥50%; whether Temporal workflows provide durability for EPF cycles (READY/FIRE/AIM spanning days/weeks) with <30s recovery, 100% state consistency.

*[465 characters / 500 max]*

*Describe the challenge where no solution exists today.*

#### Method and Approach

Implement Runtime API using Core infrastructure (Zitadel OAuth2, PostgreSQL RLS); write E2E tests covering multi-tenant isolation + scope-based auth; load test 100 concurrent tenants measuring p95 latency; security audit for cross-tenant exploits. Extend graph schema for EPF artifacts (6 READY types + features); implement YAML ingestion; test semantic search precision/recall on 50 queries vs keyword baseline. Design Runtime UI (workflow list/detail/wizard/timeline/notifications); integrate via app switcher; usability test 5 pilots measuring task completion time + context-switching overhead. Implement Temporal workflows for READY phase; test restart scenarios across 20+ cycles measuring recovery time + state consistency; test long-running approvals (12+ hours).

*[839 characters / 1000 max]*

*Describe the systematic process to solve the challenge.*

#### Activities

##### Activity 6: Shared Infrastructure Integration (kr-p-006)

*[39 characters / 100 max]*

Shared infrastructure (auth, RLS, multi-tenancy) extended to Runtime. Hypothesis: supports Runtime with <500ms API, zero leaks. Experiment: implement API, E2E tests (multi-tenant isolation, scope auth, RLS enforcement), load test 100 tenants, security audit. Success criteria: 100% E2E pass, 0 leaks in audit, <500ms p95 latency, 0 false auth positives/negatives, 0 critical vulnerabilities. Deliverables: Runtime API, E2E test suite, security audit report, load testing results, RLS policy documentation.

*[495 characters / 500 max]*

##### Activity 7: EPF Artifact Storage in Knowledge Graph (kr-p-007)

*[51 characters / 100 max]*

EPF artifacts as graph objects with semantic search. Hypothesis: enables semantic queries ≥85% precision. Experiment: extend schema for 6 READY + features, implement YAML ingestion, test 50 semantic queries vs keyword search measuring precision/recall. Success criteria: all types supported, ≥85% precision, 30%+ better than keyword search, 100% traceability accuracy, <300ms p95 latency, graceful malformed YAML handling. Deliverables: extended schema, ingestion pipeline, precision/recall benchmarks, test corpus (50+ artifacts).

*[500 characters / 500 max]*

##### Activity 8: Workflow Management UI Integration (kr-p-008)

*[43 characters / 100 max]*

Workflow UI with app switcher for Core↔Runtime transition. Hypothesis: reduces context-switching ≥50%. Experiment: implement UI (list/detail/wizard/timeline/notifications), integrate via app switcher, usability test 5 pilots measuring task completion + switching overhead, A/B test vs separate URL. Success criteria: full lifecycle UI completion, <10min task time, ≥8/10 satisfaction, <2s notifications, 50%+ faster switching, 0 critical bugs, 5/5 prefer integrated. Deliverables: UI components, usability results, A/B test analysis.

*[500 characters / 500 max]*

##### Activity 9: Durable Temporal Workflow Execution (kr-p-009)

*[44 characters / 100 max]*

Temporal workflow durability for EPF cycles spanning days/weeks. Hypothesis: <30s recovery, 100% state consistency. Experiment: implement READY workflow (validation, approval, transitions), test restart scenarios across 20+ cycles, test long-running approvals (12+ hours). Success criteria: survives 20+ restarts, <30s recovery, 100% state accuracy, ≥95% auto-retry success, 0 corruption. Deliverables: workflow definitions, restart test results, error handling guide.

*[500 characters / 500 max]*

#### Budget

**Yearly Costs:**

| Year | Cost Code | Amount (NOK) |
|------|-----------|--------------|
| 2026 | Personnel | 177,000 |
| 2026 | Equipment | 51,000 |
| 2026 | Overhead | 25,000 |
| 2026 | **2026 Total** | **253,000** |
| 2027 | Personnel | 390,000 |
| 2027 | Equipment | 111,000 |
| 2027 | Overhead | 56,000 |
| 2027 | **2027 Total** | **557,000** |
| | **WP3 Grand Total** | **810,000** |

**Cost Specification:**

Personnel (70%): R&D engineers for Runtime implementation, UI/UX development, workflow orchestration. Equipment (20%): Cloud infrastructure (multi-tenant testing environments), Temporal Cloud license, monitoring/observability tools. Overhead (10%): Office, admin, knowledge dissemination.

*[283 characters / 500 max - optional elaboration]*

---

## Section 8: Total Budget and Estimated Tax Deduction

### 8.1 Budget Summary by Year and Cost Code

| Year | Personnel (NOK) | Equipment (NOK) | Other Operating Costs (NOK) | Overhead (NOK) | Year Total (NOK) |
|------|-----------------|-----------------|----------------------------|----------------|------------------|
| 2025 | 890,000 | 254,000 | 0 | 127,000 | **1,271,000** |
| 2026 | 995,000 | 284,000 | 0 | 143,000 | **1,422,000** |
| 2027 | 390,000 | 111,000 | 0 | 56,000 | **557,000** |
| **Project Total** | **2,275,000** | **649,000** | **0** | **326,000** | **3,250,000** |

**Notes:**
- Personnel costs represent 70% of total budget (2,275,000 NOK) covering R&D engineers, product management, and technical leadership
- Equipment costs represent 20% of total budget (649,000 NOK) covering cloud infrastructure (PostgreSQL clusters, load testing environments, Temporal Cloud), LLM API costs (GPT-4/Claude/Gemini experiments), development tools, external team stipends
- Overhead costs represent 10% of total budget (326,000 NOK) covering office space, administrative support, knowledge dissemination activities
- Other Operating Costs: 0 NOK (all operational costs included in Equipment or Overhead categories)
- **Project duration:** 29 months total (27 active months excluding July 2026 and July 2027)
- **2025:** 5 active months (August to December) = 1,271,000 NOK
- **2026:** 12 active months (January-June, August-December) = 1,422,000 NOK
- **2027:** 11 active months (January-December excluding July) = 557,000 NOK

### 8.2 Budget Allocation by Work Package

| Work Package | Duration | Total Budget (NOK) | % of Total |
|--------------|----------|-------------------|------------|
| WP1: Production-Ready Knowledge Graph | Aug 2025 - Jul 2026 (12 months) | 1,830,000 | 56.3% |
| WP2: EPF Self-Hosting and Feature Definitions | Aug 2025 - Jan 2026 (6 months) | 610,000 | 18.8% |
| WP3: EPF-Runtime MVP with Durable Workflows | Aug 2026 - Dec 2027 (17 months) | 810,000 | 24.9% |
| **Total** | **29 months** | **3,250,000** | **100.0%** |

**Budget Distribution Rationale:**
- **WP1 (56.3%)**: Largest allocation reflects core technology R&D (knowledge graph scalability, multi-format extraction, MCP integration) with highest technical uncertainty and longest duration (12 months)
- **WP2 (18.8%)**: Mid-sized allocation for framework validation and adoption studies requiring external team participation and extensive documentation effort (6 months)
- **WP3 (24.9%)**: Substantial allocation for infrastructure integration, workflow orchestration, and UI development with focus on durability and multi-tenancy validation (17 months)

### 8.3 Estimated Tax Deduction

**Company Classification:** Small Company (≤50 employees, ≤10M EUR annual revenue)  
**Applicable Deduction Rate:** 20%

| Year | Eligible R&D Costs (NOK) | Estimated Tax Deduction (NOK) |
|------|-------------------------|------------------------------|
| 2025 | 1,271,000 | 254,200 |
| 2026 | 1,422,000 | 284,400 |
| 2027 | 557,000 | 111,400 |
| **Project Total** | **3,250,000** | **650,000** |

**Important Notes:**
1. **Small Company Rate:** 20% tax deduction (compared to 18% for large companies with ≥250 employees or ≥50M EUR annual revenue)
2. **Annual Cap:** 25,000,000 NOK maximum eligible costs per company per year (Eyedea AS budget well within limits)
3. **Overhead Limits:** Maximum 18% of total personnel costs for large companies; small companies may use actual overhead percentage (10% in this project)
4. **Equipment Requirements:** Equipment must be used ≥50% for R&D activities; disposed equipment value must be deducted from eligible costs
5. **Multi-Year Project:** Tax deductions claimed annually based on costs incurred in each calendar year
6. **Documentation:** Maintain detailed time tracking, expense records, and R&D activity logs for Research Council verification
7. **State Aid Rules:** SkatteFUNN operates under EU State Aid regulations; cumulative aid across all schemes must stay within thresholds

**Verification Notes:**
- All personnel costs directly related to R&D activities (knowledge graph development, framework validation, workflow orchestration)
- Equipment costs cover cloud infrastructure for production-scale testing and LLM API usage for extraction experiments
- Overhead percentage (10%) remains within allowable limits and represents actual costs
- Project duration spans 3 calendar years enabling optimal tax deduction timing

---

## EPF Traceability

This application was generated from the following EPF artifacts:

| EPF Document | File Path | Version |
|--------------|-----------|---------|
| North Star | `docs/EPF/_instances/emergent/READY/00_north_star.yaml` | 2.2.0 |
| Insight Synthesis | `docs/EPF/_instances/emergent/READY/02_insight_synthesis.yaml` | 2.2.0 |
| Strategy Formula | `docs/EPF/_instances/emergent/READY/04_strategy_formula.yaml` | 2.2.0 |
| Roadmap Recipe | `docs/EPF/_instances/emergent/READY/05_roadmap_recipe.yaml` | 2.2.0 |
| Value Models | `docs/EPF/_instances/emergent/FIRE/value_models/*.yaml` | 2.2.0 |

**Generation Metadata:**
- **Generated:** 2026-01-01
- **Generator Version:** 2.0.0
- **Schema Version:** 2.0.0 (skattefunn-application)
- **EPF Version:** 2.2.0
- **Template Version:** 2.0.0

**Direct Traceability:**

| Work Package | Activity | Source KR | TRL Progression | EPF Roadmap Path |
|--------------|----------|-----------|-----------------|------------------|
| WP1 | Activity 1 | kr-p-001 | TRL 4→6 | `tracks.product.key_results.kr-p-001` |
| WP1 | Activity 2 | kr-p-002 | TRL 3→5 | `tracks.product.key_results.kr-p-002` |
| WP1 | Activity 3 | kr-p-003 | TRL 3→6 | `tracks.product.key_results.kr-p-003` |
| WP2 | Activity 4 | kr-p-004 | TRL 2→4 | `tracks.product.key_results.kr-p-004` |
| WP2 | Activity 5 | kr-p-005 | TRL 2→4 | `tracks.product.key_results.kr-p-005` |
| WP3 | Activity 6 | kr-p-006 | TRL 2→5 | `tracks.product.key_results.kr-p-006` |
| WP3 | Activity 7 | kr-p-007 | TRL 2→5 | `tracks.product.key_results.kr-p-007` |
| WP3 | Activity 8 | kr-p-008 | TRL 2→6 | `tracks.product.key_results.kr-p-008` |
| WP3 | Activity 9 | kr-p-009 | TRL 2→5 | `tracks.product.key_results.kr-p-009` |

**TRL Compliance:**
- All 9 activities fall within TRL 2-7 range (SkatteFUNN eligible)
- Starting TRL range: 2-4 (early-stage experimental development and feasibility)
- Target TRL range: 4-6 (validated in relevant/representative environment)
- Combined progression demonstrates systematic technology maturation from concept to production-ready system
- Note: Basic research (TRL below 2) and production/operations (TRL above 7) are not included per SkatteFUNN requirements

**Validation Status:**
- ✅ All KRs have complete R&D descriptions (technical_hypothesis, experiment_design, success_criteria, uncertainty_addressed)
- ✅ TRL progressions documented with measurable milestones
- ✅ Budget allocation aligns with technical complexity and uncertainty levels
- ✅ Work packages sequenced logically (foundation→framework→runtime)

---

## Next Steps

### Internal Review Checklist

Before submitting this application, complete the following internal reviews:

**1. Accuracy Review:**
- [ ] Organization details correct (name, org number, manager, address)
- [ ] Contact information current and accurate for all 3 mandatory roles
- [ ] Project timeline matches actual development plans (Aug 2025 - Dec 2027)
- [ ] Budget figures reconcile with accounting forecasts

**2. Technical Review:**
- [ ] R&D descriptions clearly articulate technical challenges and uncertainties
- [ ] State-of-the-art comparison demonstrates market differentiation
- [ ] Success criteria are measurable and verifiable
- [ ] TRL progressions realistic and achievable within project timeline

**3. Budget Verification:**
- [ ] All costs match accounting system projections
- [ ] Cost code allocation follows SkatteFUNN guidelines (Personnel, Equipment, Overhead)
- [ ] Overhead percentage within allowable limits (10% of total, 18% of personnel for large companies)
- [ ] Equipment usage meets 50% R&D threshold
- [ ] Annual distribution realistic for project execution plan

**4. Character Limit Compliance:**
- [ ] All text fields within specified character limits
- [ ] Use online form character counter to verify (https://kunde.forskningsradet.no/skattefunn/)
- [ ] Consider brevity improvements if approaching limits

**5. Translation Considerations:**
- [ ] Application may be submitted in Norwegian or English (both accepted)
- [ ] Current draft in English with Norwegian titles in Section 2
- [ ] If translating, maintain technical accuracy and character limits
- [ ] Research Council may request clarifications in Norwegian during review

### Submission Process

**Official Submission:**
1. **Online Form:** Submit via https://kunde.forskningsradet.no/skattefunn/
2. **Account Required:** Create/log in to Research Council portal
3. **Copy-Paste Content:** Transfer each section directly from this document to corresponding online form fields
4. **Upload Supporting Documents:** Attach organization certificates, CVs for key personnel if requested
5. **Digital Signature:** Authorized signatory must approve via BankID/alternative authentication
6. **Confirmation:** Save submission confirmation number and PDF copy

**Processing Timeline:**
- **Standard Review:** 4-6 weeks from submission to decision
- **Request for Clarifications:** Research Council may contact for additional information (typical 1-2 week extension)
- **Approval Letter:** Includes project ID, approved costs, annual deduction amounts
- **Appeals:** If rejected, appeal deadline typically 3 weeks from decision notification

**Post-Approval Requirements:**
- **Annual Progress Reports:** Submit by March 31st following each project year
- **Final Report:** Submit within 3 months of project completion (by March 31, 2028)
- **Time Tracking:** Maintain detailed logs for all R&D personnel hours
- **Cost Documentation:** Retain invoices, receipts, timesheets for 10 years (verification audits possible)
- **Tax Deduction Claims:** Include approved project costs in corporate tax return (RF-1167 form)

**Contact Information:**

**Research Council of Norway - SkatteFUNN Unit**  
Email: skattefunn@forskningsradet.no  
Phone: +47 22 03 70 00  
Website: https://www.forskningsradet.no/skattefunn/

**Office Hours:** Monday-Friday 09:00-15:00 (CET/CEST)

**Helpdesk Support:**
- General questions about SkatteFUNN scheme rules and eligibility
- Technical assistance with online form submission
- Guidance on documentation requirements
- Status inquiries for pending applications

---

*End of Application Document* Existing approaches using Retrieval-Augmented Generation (RAG) and vector databases capture syntactic similarity but fail to represent semantic relationships between product features, business rules, and user intent. Vector search returns documents with similar embeddings but cannot traverse causal relationships, temporal evolution, or hierarchical dependencies that define organizational knowledge.

The fundamental technical limitation lies in the lack of systematic frameworks for representing evolving product knowledge in machine-readable, inference-capable formats. Current solutions treat product documentation as static text collections rather than dynamic knowledge graphs with typed relationships and temporal context. When AI agents query for "related features," vector search returns textually similar documents but misses functional dependencies (Feature A requires Feature B to work). When agents need historical context (why was this design decision made?), existing systems have no concept of temporal relationships between decisions, implementations, and outcomes.

This knowledge gap necessitates R&D into novel metadata architectures that enable autonomous agents to construct context-aware representations from heterogeneous documentation sources without manual schema definition. The unpredictability stems from the need to balance expressiveness (capturing complex domain logic) with computability (enabling real-time agent queries at <200ms latency). Traditional knowledge graphs require extensive manual curation, while fully automated extraction produces semantically shallow representations insufficient for agent reasoning.

### 3.3 Objectives and Innovation

**Primary Objective:**

Develop and validate a metadata-driven framework that enables autonomous AI agents to construct accurate, context-aware representations of organizational knowledge from heterogeneous documentation sources (PDF, Markdown, code, URLs) with ≥95% extraction accuracy and <200ms query latency at 10,000+ object scale.

**Sub-goals:**

1. Design novel hybrid storage architecture combining PostgreSQL with vector indexing that maintains <200ms p95 query latency for mixed semantic and graph traversal queries at production scale (10,000+ objects, 20+ concurrent users)

2. Implement LLM-based extraction pipeline achieving ≥95% accuracy across heterogeneous document formats (PDF, Markdown, code) through format-specific preprocessing and structured output validation

3. Develop Model Context Protocol (MCP) server integration that measurably improves AI agent task completion quality by ≥20% and reduces hallucination incidents by ≥30% through grounded knowledge graph context

4. Create workflow orchestration system using Temporal that provides <30s recovery time for durable EPF (Emergent Product Framework) cycle execution surviving service restarts

5. Validate EPF framework adoption feasibility through self-hosting: complete 6/6 READY artifacts with external team completing first artifact in <4 hours using only written guidance

**R&D Content and Technical Challenges:**

The primary R&D challenges lie in four interconnected domains:

**1. Hybrid Storage Architecture for Knowledge Graphs**

The main technical uncertainty lies in whether general-purpose relational databases (PostgreSQL with pgvector) can match specialized graph databases (Neo4j, TigerGraph) for hybrid workloads combining semantic similarity search with graph traversal. Existing literature benchmarks these systems independently but lacks empirical data on mixed query patterns: "Find entities semantically similar to X, then traverse relationships to depth 3, filtered by temporal constraints."

The unpredictability stems from performance trade-offs that cannot be determined analytically. Vector index size grows with embedding dimensionality (768d vs 1536d) affecting memory and query latency. Concurrent write operations during extraction may degrade read performance unpredictably. Index rebuild times after schema changes could block production systems. These interactions require systematic empirical testing under realistic load profiles.

Systematic R&D is required because: (a) existing benchmarks use synthetic workloads not representative of AI agent query patterns, (b) performance characteristics change non-linearly with scale (10K objects may behave differently from 1K), (c) failover behavior (graceful degradation when vector index unavailable) has not been characterized for mixed workloads.

**2. Multi-Format Document Extraction Accuracy**

Existing LLM extraction approaches (GPT-4, Claude) achieve 90-95% accuracy on clean, single-format datasets but degrade unpredictably on heterogeneous real-world documents. The technical challenge is not simply "applying AI" but developing systematic preprocessing pipelines that normalize diverse formats (scanned PDFs, malformed Markdown, minified code) into LLM-compatible inputs while preserving semantic structure.

The unpredictability arises from format-specific failure modes: scanned PDFs lose table structure in OCR, Markdown tables with merged cells confuse parsers, code comments require distinguishing documentation from implementation logic. These issues compound when documents mix formats (PDF with embedded images containing text, Markdown with code blocks containing documentation).

Existing accuracy metrics (BLEU, ROUGE) are insufficient for extraction tasks requiring structured output validation (entities must have IDs, relationships must reference valid entities). The R&D challenge involves creating domain-specific validation rules that detect semantic errors (extracted entity names that don't appear in source text, relationships between unrelated entities) beyond syntactic correctness.

**3. Context-Aware AI Agent Architecture**

No existing methodology quantitatively measures whether AI agents "understand" organizational context correctly. The R&D challenge involves creating novel evaluation frameworks that correlate with real-world agent decision quality. Existing metrics (code review scores, task completion time) are indirect proxies; we need direct measures of context utilization: Did the agent query relevant graph nodes? Did it use retrieved context in reasoning? Did context prevent hallucinations?

The unpredictability stems from the non-deterministic nature of LLM outputs combined with deterministic product constraint enforcement. Naive approaches produce hallucinations (agent suggests discontinued features) or outdated recommendations (agent ignores recent architecture changes). The technical uncertainty: What query strategies reliably surface relevant context? How much context fits in windows before dilution reduces quality? Does explicit citation increase or decrease user trust?

**4. Durable Workflow Orchestration**

Temporal workflow orchestration provides theoretical durability guarantees, but practical application to EPF cycles (READY/FIRE/AIM phases spanning days to weeks) introduces unpredictable failure modes. The R&D challenge: categorizing which errors are transient (retry automatically) vs permanent (require compensating actions) for knowledge work processes involving human approvals.

The unpredictability: Long-running workflows (approval routing spanning hours) strain Temporal's design assumptions. State serialization size limits may be exceeded for complex artifacts. Local development complexity (running Temporal server) may hinder team adoption despite production benefits. These trade-offs require systematic evaluation under realistic usage patterns.

**State-of-the-Art Comparison:**

Current approaches to AI agent context management rely on: (1) vector databases (Pinecone, Weaviate) for semantic search, (2) traditional knowledge graphs (Neo4j, RDF stores) for relationship traversal, or (3) hybrid RAG systems combining both.

**Vector Database Limitations:**
- Capture syntactic similarity but miss semantic relationships (cause/effect, dependencies)
- No concept of temporal evolution (when did this requirement change?)
- Cannot represent hierarchical constraints (Feature A requires Feature B)
- Scale challenges at 10K+ objects with mixed query patterns

**Traditional Knowledge Graph Limitations:**
- Require extensive manual schema definition and curation
- Lack built-in semantic search over unstructured content
- Poor performance for "find similar concepts" queries
- Limited AI agent integration (no standardized protocols like MCP)

**Existing RAG Systems Limitations:**
- Treat documents as independent text chunks, missing cross-document relationships
- No systematic framework for temporal context (evolution over time)
- Hallucination problems when context window dilutes relevant information
- Cannot distinguish obsolete from current information

Our R&D addresses these gaps through novel hybrid architecture combining vector embeddings (semantic search) with typed relationship graphs (reasoning), systematic temporal tracking (evolution), and standardized AI agent protocols (MCP). This integration has not been systematically investigated in literature or commercial products.

**Project Summary:**

This project develops Emergent Core—an AI-native knowledge graph system that automatically extracts structured metadata from unstructured organizational documents and exposes it to AI agents via Model Context Protocol. The core innovation lies in hybrid storage architecture (PostgreSQL + pgvector) that maintains <200ms query latency for mixed semantic/graph queries at production scale, combined with systematic validation frameworks measuring context fidelity in AI agent interactions. R&D outcomes will demonstrate whether general-purpose databases can match specialized graph systems for AI workloads, whether LLM extraction can achieve 95%+ accuracy across heterogeneous formats, and whether explicit context grounding measurably improves agent decision quality.

**Technology Readiness Level:**
- Starting TRL: 2-4 (varies by component: storage architecture at TRL 4, extraction pipeline at TRL 3, MCP integration at TRL 3, EPF framework at TRL 2)
- Target TRL: 4-6 (storage validated at TRL 6, extraction at TRL 5, MCP at TRL 6, EPF at TRL 4)

**Frascati Criteria Compliance:**

✓ **Novel:** This project generates new findings in hybrid storage architectures for AI agent workloads, multi-format extraction accuracy benchmarks, and systematic methodologies for measuring context fidelity in agent interactions. Literature lacks empirical data on PostgreSQL+pgvector performance for mixed semantic/graph queries at production scale.

✓ **Creative:** Original concepts include: (a) temporal relationship tracking in knowledge graphs enabling "why did this change?" queries, (b) validation frameworks measuring semantic correctness beyond syntactic accuracy in extraction, (c) context utilization metrics (query relevance, citation accuracy) for agent evaluation, (d) hybrid orchestration combining durable workflows (Temporal) with human-in-loop approvals.

✓ **Uncertain:** Technical outcomes are unpredictable because: (a) performance characteristics of hybrid storage change non-linearly with scale and cannot be determined analytically, (b) extraction accuracy degrades unpredictably on real-world heterogeneous documents vs clean single-format datasets, (c) optimal context retrieval strategies (when to query graph vs rely on training) depend on query patterns that emerge from actual usage, (d) Temporal state serialization limits may be exceeded by complex artifacts in ways not documented.

✓ **Systematic:** Planned methodology includes: controlled experiments with synthetic datasets (10K objects, 100 query patterns), A/B testing with pilot users (MCP on/off, extraction accuracy validation), load testing under realistic concurrent usage (20+ users), failover scenario testing (measure graceful degradation), external team adoption studies (time to first artifact, documentation sufficiency), security audits (cross-tenant isolation verification).

✓ **Transferable/Reproducible:** Results advance the field through: open-source benchmark datasets (graph query patterns, multi-format extraction test suite), published performance comparison white papers (PostgreSQL vs Neo4j for AI workloads), documented validation methodologies (context fidelity metrics, extraction accuracy frameworks), reusable architecture patterns (hybrid storage design, MCP integration guide).


## 10. EPF Traceability

This application was generated from the following EPF sources:

| EPF Source | Path | Used For |
|------------|------|----------|
| North Star | docs/EPF/_instances/emergent/READY/00_north_star.yaml | Vision, mission, problem context, company activities |
| Strategy Formula | docs/EPF/_instances/emergent/READY/04_strategy_formula.yaml | Technology strategy, differentiation, core competencies |
| Roadmap Recipe | docs/EPF/_instances/emergent/READY/05_roadmap_recipe.yaml | Timeline, work packages, R&D key results |
| Value Models | docs/EPF/_instances/emergent/FIRE/value_models/*.yaml | Problem definition, solution approach, innovation areas |

**Generated:** 2026-01-01T12:00:00Z  
**Generator:** EPF Wizard (wizard.instructions.md v2.0.0)  
**EPF Version:** 2.2.0  
**Application Version:** 2.0.0

**Direct Traceability:**
- WP1 Activity 1 → Roadmap KR kr-p-001 (Knowledge Graph Performance)
- WP1 Activity 2 → Roadmap KR kr-p-002 (Document Extraction)
- WP1 Activity 3 → Roadmap KR kr-p-003 (MCP Server Integration)
- WP2 Activity 4 → Roadmap KR kr-p-004 (EPF Framework Adoption)
- WP2 Activity 5 → Roadmap KR kr-p-005 (Feature Definitions)
- WP3 Activity 6 → Roadmap KR kr-p-006 (Infrastructure Integration)
- WP3 Activity 7 → Roadmap KR kr-p-007 (Artifact Storage)
- WP3 Activity 8 → Roadmap KR kr-p-008 (UI Integration)
- WP3 Activity 9 → Roadmap KR kr-p-009 (Temporal Workflows)

**TRL Compliance:** All 9 activities are within TRL 2-7 range (SkatteFUNN eligible). Basic research (TRL below 2) and production/operations (TRL above 7) are not included per SkatteFUNN requirements.

**SkatteFUNN Selection Rationale:** Option A selected - 9 proven KRs from Product track (kr-p-001 through kr-p-009). All KRs demonstrate:
- Clear technical uncertainties requiring systematic R&D
- Measurable experiment designs with success criteria
- TRL progressions within eligible range (2-7)
- Strong Frascati compliance (novel, creative, uncertain, systematic, transferable)

---

## Next Steps

1. **Technical Review:** Verify R&D descriptions, success criteria, and TRL progressions
2. **Budget Verification:** Confirm cost allocations match accounting projections
3. **Contact Information:** Verify accuracy of all contact details (phone +47 123 45 678, email nikolai@eyedea.no)
4. **Auditor Documentation:** Prepare documentation for Aug-Dec 2025 retroactive costs
5. **Official Submission:** Submit via Research Council portal with required attachments

**Application Status:** Draft - Ready for Review  
**Document Version:** 2.0.0  
**Last Updated:** 1 January 2026
