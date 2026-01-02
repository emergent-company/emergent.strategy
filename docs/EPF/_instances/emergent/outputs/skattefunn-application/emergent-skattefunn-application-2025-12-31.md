# SkatteFUNN - Tax Deduction Scheme Application

**Application Date:** 31 December 2025  
**Status:** Draft  
**Project Period:** 1 August 2025 to 31 December 2027 (29 months)  
**Total Budget:** 3,250,000 NOK

---

## 1. Project Owner

**Eyedea AS** (Org. No.: 926 006 985)  
**Manager:** Nikolai Fasting

---

## 2. Roles in the Project

### Mandatory Roles

| Name | Role | Organisation | E-mail | Phone | Access |
|------|------|--------------|--------|-------|--------|
| Nikolai Fasting | Creator of Application | Eyedea AS | nikolai@eyedea.no | +47 XXX XX XXX | Delete, Submit, Edit, Read, Withdraw, ChangeAccess |
| Nikolai Fasting | Organisation Representative | Eyedea AS | nikolai@eyedea.no | +47 XXX XX XXX | Edit, Read, Approve |
| Nikolai Fasting | Project Leader | Eyedea AS | nikolai@eyedea.no | +47 XXX XX XXX | Delete, Submit, Edit, Read, Withdraw, ChangeAccess |

---

## 3. Project Details

### 3.1 General Information

**Title (English):** Development of AI-Native Knowledge Graph System with Context-Aware Agent Integration

**Project Short Name:** EMERGENT-KG-RD

**Scientific Discipline:** Computer and Information Sciences - Software Engineering and AI Systems

### 3.2 Project Background and Company Activities

**Company Activities:**

Eyedea AS develops Emergent—an AI-powered knowledge management ecosystem comprising three core products: Emergent Core (knowledge engine with graph-based intelligence), EPF-Runtime (workflow orchestration system), and Emergent Tools (integration connectors). We build infrastructure that transforms unstructured organizational information into queryable, connected knowledge graphs that AI assistants can reason over.

**Project Background:**

Current AI agent architectures (OpenAI Assistants, LangChain agents, Claude) require manual context injection for every interaction, creating significant scalability bottlenecks. Existing approaches using Retrieval-Augmented Generation (RAG) and vector databases capture syntactic similarity but fail to represent semantic relationships between product features, business rules, and user intent. Vector search returns documents with similar embeddings but cannot traverse causal relationships, temporal evolution, or hierarchical dependencies that define organizational knowledge.

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

This project develops Emergent Core—an AI-native knowledge graph system that automatically extracts structured metadata from unstructured organizational documents and exposes it to AI agents via Model Context Protocol. The core innovation lies in hybrid storage architecture (PostgreSQL + pgvector) that maintains <200ms query latency for mixed semantic/graph queries at production scale, combined with systematic validation frameworks measuring context fidelity in AI agent interactions. R&D outcomes will demonstrate whether general-purpose databases can match specialized graph systems for AI workloads, whether LLM extraction can achieve 95%+ accuracy across heterogeneous formats, and whether explicit context grounding measurably improves agent decision quality. The system enables organizations to transition from manual context injection to autonomous agent understanding of evolving product knowledge.

**Technology Readiness Level:**
- Starting TRL: 2-4 (varies by component: storage architecture at TRL 4, extraction pipeline at TRL 3, MCP integration at TRL 3, EPF framework at TRL 2)
- Target TRL: 4-6 (storage validated at TRL 6, extraction at TRL 5, MCP at TRL 6, EPF at TRL 4)

**Frascati Criteria Compliance:**

✓ **Novel:** This project generates new findings in hybrid storage architectures for AI agent workloads, multi-format extraction accuracy benchmarks, and systematic methodologies for measuring context fidelity in agent interactions. Literature lacks empirical data on PostgreSQL+pgvector performance for mixed semantic/graph queries at production scale.

✓ **Creative:** Original concepts include: (a) temporal relationship tracking in knowledge graphs enabling "why did this change?" queries, (b) validation frameworks measuring semantic correctness beyond syntactic accuracy in extraction, (c) context utilization metrics (query relevance, citation accuracy) for agent evaluation, (d) hybrid orchestration combining durable workflows (Temporal) with human-in-loop approvals.

✓ **Uncertain:** Technical outcomes are unpredictable because: (a) performance characteristics of hybrid storage change non-linearly with scale and cannot be determined analytically, (b) extraction accuracy degrades unpredictably on real-world heterogeneous documents vs clean single-format datasets, (c) optimal context retrieval strategies (when to query graph vs rely on training) depend on query patterns that emerge from actual usage, (d) Temporal state serialization limits may be exceeded by complex artifacts in ways not documented.

✓ **Systematic:** Planned methodology includes: controlled experiments with synthetic datasets (10K objects, 100 query patterns), A/B testing with pilot users (MCP on/off, extraction accuracy validation), load testing under realistic concurrent usage (20+ users), failover scenario testing (measure graceful degradation), external team adoption studies (time to first artifact, documentation sufficiency), security audits (cross-tenant isolation verification).

✓ **Transferable/Reproducible:** Results advance the field through: open-source benchmark datasets (graph query patterns, multi-format extraction test suite), published performance comparison white papers (PostgreSQL vs Neo4j for AI workloads), documented validation methodologies (context fidelity metrics, extraction accuracy frameworks), reusable architecture patterns (hybrid storage design, MCP integration guide). Other organizations can apply findings to similar AI agent context management challenges.

---

## 4. Timeline and Work Packages

**Project Duration:** 1 August 2025 to 31 December 2027 (29 months)

### WP1: Production-Ready Knowledge Graph with AI-Native Query Capabilities
**Duration:** 12 months (overlapping activities)  
**Period:** August 2025 to July 2026  
**Budget:** 1,830,000 NOK

**Technical Objective:**  
Ship production-ready knowledge graph supporting 10,000+ objects with sub-200ms query latency, document ingestion across 3 file formats, and MCP server integration enabling Claude/Cursor to query contextually.

**R&D Activities:**

#### Activity 1.1: Knowledge Graph Performance Validation (kr-p-001)

**Technical Hypothesis:**  
PostgreSQL with pgvector extension can maintain sub-200ms query latency at 10,000+ object scale with concurrent AI agent queries performing mixed semantic search and graph traversal operations.

**Experiment Design:**
- Build production-scale test environment with 10,000+ real objects (documents, entities, relationships)
- Run load tests simulating 10-50 concurrent AI agent queries with realistic query patterns (semantic search + graph traversal)
- Measure p50/p95/p99 latency under sustained load over 7 days
- Test with different object distributions (document-heavy, entity-heavy, relationship-heavy) to identify performance bottlenecks
- Include failover testing: measure graceful degradation when vector index is unavailable (should fall back to pure graph traversal with acceptable latency increase)
- Compare PostgreSQL+pgvector vs Neo4j with vector plugin under identical workloads

**Success Criteria:**  
p95 latency ≤200ms for 95%+ of queries under 20 concurrent users sustained over 7 days. p99 latency ≤500ms. Zero query failures. Graceful degradation to <1s latency if vector index fails. PostgreSQL solution within 2x cost of Neo4j for equivalent performance.

**Uncertainty Addressed:**  
Whether PostgreSQL with vector indexing can scale to production requirements (10K+ objects) while maintaining AI-agent-acceptable latency (<200ms). Unknowns: memory usage at scale, vector index rebuild time, query optimization strategies for mixed semantic+graph queries, failover behavior, concurrent write impact on read latency, impact of embedding dimensionality (768d vs 1536d) on index size and query performance.

**TRL Progression:** TRL 4 → TRL 6 (Component validated in lab → System prototype demonstrated)

**Measurement Method:** Load testing with production-like data; Grafana metrics tracking p50/p95/p99 latency, query throughput, memory usage

**Expected Deliverables:**
- Production-scale test environment (10,000+ objects)
- Load testing framework and results
- Performance benchmark report comparing PostgreSQL vs Neo4j
- Failover behavior documentation
- Grafana dashboard templates

**Duration:** 4 months  
**Allocated Budget:** 610,000 NOK

---

#### Activity 1.2: Multi-Format Document Extraction Pipeline (kr-p-002)

**Technical Hypothesis:**  
LLM-based extraction pipeline can achieve 95%+ accuracy across heterogeneous document formats (PDF, Markdown, code) by using format-specific preprocessing and structured output validation with semantic error detection.

**Experiment Design:**
- Build labeled test dataset of 200+ documents (mix of PDF/Markdown/code with known entities/relationships)
- Implement format-specific extractors using GPT-4 with structured outputs
- Measure precision/recall against labeled data
- Iterate on prompt engineering and validation rules
- Test edge cases: scanned PDFs, malformed Markdown, minified code
- Compare cost per document across different LLM providers (GPT-4, Claude, Gemini)
- Develop semantic validation rules (entity names must appear in source, relationships must reference valid entities)

**Success Criteria:**  
≥95% extraction accuracy (F1 score) on held-out test set across all 3 formats. Per-format accuracy: PDF ≥92%, Markdown ≥97%, Code ≥93%. Processing time <30s per document on average. Cost <$0.10 per document extraction. Semantic validation catches ≥90% of hallucinated extractions.

**Uncertainty Addressed:**  
Whether LLM extraction can maintain high accuracy across diverse document formats without extensive manual rules. Unknowns: optimal chunking strategy for PDFs, handling of code comments vs code logic, Markdown table extraction, cost per document at scale, robustness to document quality variations (scanned vs native PDF), effectiveness of semantic validation vs syntactic checks.

**TRL Progression:** TRL 3 → TRL 5 (Experimental proof of concept → Component validated in relevant environment)

**Measurement Method:** Extraction quality tests against labeled dataset; cost tracking per document/format

**Expected Deliverables:**
- Labeled test dataset (200+ documents)
- Format-specific extraction implementations
- Accuracy benchmark report with per-format breakdowns
- Cost analysis across LLM providers
- Edge case documentation and handling strategies
- Semantic validation rule framework

**Duration:** 4 months  
**Allocated Budget:** 610,000 NOK

---

#### Activity 1.3: MCP Server Integration for AI Agents (kr-p-003)

**Technical Hypothesis:**  
Model Context Protocol (MCP) server integration can provide AI agents with relevant knowledge graph context that measurably improves task completion quality by ≥20% and reduces hallucination incidents by ≥30% compared to baseline without graph context.

**Experiment Design:**
- Implement MCP server exposing knowledge graph via standardized protocol (resources, tools, prompts)
- Deploy to 5 pilot users (internal developers)
- A/B test AI task completion with vs without MCP context access over 4 weeks
- Measure: task completion time, code quality (via review scores), hallucination rate (incorrect assumptions), and user satisfaction
- Track MCP query patterns, latency, and cache hit rates
- Document failure modes and edge cases where context retrieval doesn't help or misleads
- Analyze context utilization: query relevance, citation accuracy, context window usage

**Success Criteria:**  
5+ pilot users actively using MCP server daily. ≥20% improvement in task completion quality (measured via code review scores). ≥30% reduction in hallucination incidents. MCP query latency <500ms p95. Pilot user satisfaction score ≥8/10. Context utilization metrics show ≥80% query relevance (queries return pertinent results).

**Uncertainty Addressed:**  
Whether AI agents will meaningfully use knowledge graph context to improve outputs. Unknowns: optimal context retrieval strategies (when to query graph vs rely on training data), context window size limits, latency sensitivity for developer experience, whether developers trust AI suggestions more with explicit context citations, if citation overhead reduces code quality.

**TRL Progression:** TRL 3 → TRL 6 (Proof of concept → System prototype demonstrated in relevant environment)

**Measurement Method:** MCP server logs showing successful context retrievals; A/B test results; user satisfaction surveys

**Expected Deliverables:**
- MCP server implementation with resources/tools/prompts
- Pilot deployment documentation
- A/B test results and statistical analysis
- Query pattern analysis and optimization recommendations
- User satisfaction survey results
- Context utilization metrics framework

**Duration:** 4 months  
**Allocated Budget:** 610,000 NOK

---

### WP2: EPF Self-Hosting and Feature Definition Framework
**Duration:** 6 months  
**Period:** August 2025 to January 2026  
**Budget:** 610,000 NOK

**Technical Objective:**  
Validate EPF framework intuitiveness by completing all 6 READY artifacts for Emergent and creating 15+ feature definitions, demonstrating self-hosting capability and framework adoption feasibility.

**R&D Activities:**

#### Activity 2.1: EPF Framework Adoption Validation (kr-p-004)

**Technical Hypothesis:**  
EPF framework structure is intuitive enough for teams to adopt and complete READY phase artifacts without extensive training or consulting support, as measured by external team completing first artifact in <4 hours with only written guidance.

**Experiment Design:**
- Complete all 6 READY artifacts for Emergent (North Star, Insight, Strategy, Value Models, Roadmap, Integration Spec)
- Validate each artifact against schema
- Track time spent per artifact, blockers encountered, questions raised
- Document patterns that emerge across artifacts (e.g., common traceability links, typical assumption types)
- Test with one external team: provide framework, minimal guidance (README + template), measure completion time and quality
- Conduct retrospective interviews on adoption experience

**Success Criteria:**  
6/6 READY artifacts pass schema validation. EPF health check shows 0 TBD markers. Traceability complete: every KR traces to North Star. External team completes first READY artifact in <4 hours with only written guidance (no live support). Internal team satisfaction: framework clarity ≥8/10. External team satisfaction: ≥7/10.

**Uncertainty Addressed:**  
Whether EPF structure is intuitive enough for teams to adopt without extensive training. Unknowns: optimal level of artifact detail (too rigid vs too flexible), whether schema validation catches meaningful errors vs creates friction, how much guidance is needed for first-time users, whether traceability overhead is worth the strategic clarity benefit, if written documentation alone is sufficient vs requiring workshops.

**TRL Progression:** TRL 2 → TRL 4 (Technology concept formulated → Component validated in laboratory environment)

**Measurement Method:** EPF health check passes with 0 TBD markers; external team case study documenting time-to-completion

**Expected Deliverables:**
- 6 completed READY artifacts for Emergent
- Adoption time tracking data with blocker analysis
- External team case study report
- Framework improvement recommendations
- Updated documentation based on adoption feedback

**Duration:** 3 months  
**Allocated Budget:** 305,000 NOK

---

#### Activity 2.2: Feature Definition Template Validation (kr-p-005)

**Technical Hypothesis:**  
Feature definition template structure enables consistent translation from strategic KRs to implementable technical specifications that AI agents can understand and act upon, reducing developer rework rate from 30% (baseline tickets) to <15%.

**Experiment Design:**
- Design feature definition template based on EPF principles (Why/How/What ontology, traceability, AI-readability)
- Create 15 feature definitions across three product lines (Core: 7, EPF: 5, OpenSpec: 3)
- Validate each definition: (1) traces cleanly to roadmap KR, (2) AI agent (Claude/GPT-4) can generate implementation plan from definition alone, (3) developer can understand scope without asking questions
- A/B test: give developers feature definition vs traditional ticket, measure time to first commit and rework rate
- Track AI agent success rate at generating accurate implementation plans

**Success Criteria:**  
15+ feature definitions created and validated. 100% traceability to roadmap KRs. AI agent generates accurate implementation plan in ≥90% of cases (human review). Developers prefer feature definitions over traditional tickets (satisfaction survey ≥8/10). Rework rate <15% (vs baseline 30% for tickets). Time to first commit reduced by ≥20%.

**Uncertainty Addressed:**  
Whether structured feature definitions reduce ambiguity enough to improve development velocity. Unknowns: optimal definition granularity (too detailed vs too abstract), whether AI agents can reliably generate implementation plans from definitions, if traceability overhead is worth strategic clarity, how to balance flexibility with structure, whether developers perceive definitions as helpful vs bureaucratic overhead.

**TRL Progression:** TRL 2 → TRL 4 (Concept formulated → Component validated in laboratory)

**Measurement Method:** Feature definition count in /FIRE/feature_definitions/; A/B test results comparing rework rates

**Expected Deliverables:**
- Feature definition template with examples
- 15 validated feature definitions (7 Core, 5 EPF, 3 OpenSpec)
- AI agent validation results with accuracy analysis
- Developer satisfaction survey results
- Rework rate comparison study
- Time-to-first-commit analysis

**Duration:** 3 months  
**Allocated Budget:** 305,000 NOK

---

### WP3: EPF-Runtime MVP with Durable Workflow Orchestration
**Duration:** 17 months  
**Period:** August 2026 to December 2027  
**Budget:** 810,000 NOK

**Technical Objective:**  
Ship EPF-Runtime MVP enabling programmatic workflow orchestration through 4 stages: shared infrastructure integration, artifact storage in knowledge graph, UI integration with app switcher, and durable Temporal workflow execution.

**R&D Activities:**

#### Activity 3.1: Shared Infrastructure Integration (kr-p-006)

**Technical Hypothesis:**  
Shared infrastructure (auth, RLS, multi-tenancy) architecture from Emergent Core can be extended to support EPF-Runtime workflow orchestration with <500ms API latency and zero cross-tenant data leakage verified by security audit.

**Experiment Design:**
- Implement EPF-Runtime API layer using existing Emergent Core infrastructure (Zitadel OAuth2, PostgreSQL RLS, NestJS)
- Create REST endpoints for workflow CRUD operations
- Write comprehensive E2E tests covering: multi-tenant isolation (tenant A cannot access tenant B workflows), scope-based authorization (user with 'workflow:read' cannot write), RLS enforcement at database level
- Load test with 100 concurrent tenants, measure p95 latency and memory usage
- Security audit: attempt cross-tenant access exploits, SQL injection, privilege escalation

**Success Criteria:**  
Workflow CRUD API functional with 100% E2E test pass rate. Multi-tenant isolation verified: 0 cross-tenant data leaks in security audit. API latency <500ms p95 under 100 concurrent tenants. Scope-based auth correctly denies unauthorized operations (0 false positives/negatives in auth tests). Database RLS policies enforce isolation (direct SQL queries cannot bypass). Security audit finds 0 critical/high vulnerabilities.

**Uncertainty Addressed:**  
Whether shared infrastructure can scale for Runtime workloads without architectural changes. Unknowns: performance impact of additional RLS policies on workflow tables, memory overhead of maintaining 100+ tenant contexts, optimal caching strategy for workflow metadata, whether scope model granularity is sufficient for workflow permissions (might need resource-level scopes), impact of workflow state size on database performance.

**TRL Progression:** TRL 2 → TRL 5 (Technology concept formulated → Component validated in relevant environment)

**Measurement Method:** E2E tests pass for workflow CRUD with multi-tenant isolation; security audit report with 0 critical findings

**Expected Deliverables:**
- EPF-Runtime API implementation
- E2E test suite with multi-tenant coverage
- Security audit report from external auditor
- Load testing results with performance analysis
- Performance optimization recommendations
- RLS policy documentation

**Duration:** 3 months  
**Allocated Budget:** 202,500 NOK

---

#### Activity 3.2: EPF Artifact Storage in Knowledge Graph (kr-p-007)

**Technical Hypothesis:**  
EPF artifacts (North Stars, Roadmaps, Feature Definitions) can be stored as knowledge graph objects with vector embeddings, enabling semantic search queries that return relevant results based on strategic similarity with ≥85% precision.

**Experiment Design:**
- Extend knowledge graph schema to support EPF artifact types (6 READY types + feature definitions)
- Implement ingestion pipeline: YAML → graph object + vector embedding
- Test semantic search: 'Find roadmaps similar to Emergent Q1 2025' should return relevant matches
- Compare semantic search vs keyword search: measure precision/recall on 50 test queries
- Test cross-artifact queries: 'Which features trace to knowledge graph KRs?'
- Measure query latency and relevance scoring accuracy
- Build test corpus of 50+ artifacts across multiple organizations

**Success Criteria:**  
All EPF artifact types (6 READY + features) supported in graph schema. Semantic search precision ≥85% (returns relevant artifacts in top 5 results). Semantic search outperforms keyword search by ≥30% on precision/recall. Cross-artifact traceability queries work correctly (100% accurate linkage). Query latency <300ms p95 for semantic search. Ingestion pipeline handles malformed YAML gracefully (validation errors, not crashes).

**Uncertainty Addressed:**  
Whether vector embeddings capture strategic similarity between EPF artifacts meaningfully. Unknowns: optimal embedding model for strategic documents (vs code/general text), chunking strategy for long artifacts (roadmaps), how to weight different artifact fields (objective vs key results vs assumptions), whether semantic similarity aligns with human judgment of strategic relevance, impact of artifact size variation on embedding quality.

**TRL Progression:** TRL 2 → TRL 5 (Concept formulated → Component validated in relevant environment)

**Measurement Method:** Can query 'Find roadmaps similar to X' and get relevant results; precision/recall benchmarks

**Expected Deliverables:**
- Extended knowledge graph schema for EPF artifacts
- YAML ingestion pipeline with validation
- Semantic search implementation
- Precision/recall benchmark results with human baseline
- Relevance scoring analysis
- Test corpus of 50+ artifacts

**Duration:** 3 months  
**Allocated Budget:** 202,500 NOK

---

#### Activity 3.3: Workflow Management UI Integration (kr-p-008)

**Technical Hypothesis:**  
Integrated workflow management UI in existing admin interface with app switcher pattern enables users to seamlessly transition between Core (knowledge management) and Runtime (workflow orchestration) capabilities without context loss, reducing context-switching time by ≥50%.

**Experiment Design:**
- Design and implement Runtime UI components: workflow list, workflow detail, workflow creation wizard, execution timeline, in-app notifications
- Integrate with existing admin UI via app switcher (top nav icon)
- Conduct usability testing with 5 pilot users: measure task completion time (create → execute → monitor workflow), error rate, satisfaction
- Test notification system: workflow status changes trigger real-time notifications within 2s
- Measure context-switching overhead (time to switch apps vs manual navigation)
- A/B test: app switcher vs separate URL, measure user preference and efficiency

**Success Criteria:**  
Users can complete full workflow lifecycle in UI without API access. Task completion time <10 minutes for simple workflow (create → start → monitor). Usability satisfaction ≥8/10. Notification delivery latency <2s. App switcher reduces context-switching time by ≥50% vs manual navigation. Zero critical UI bugs (data loss, auth bypass) in security review. 5/5 pilot users prefer integrated UI over separate app.

**Uncertainty Addressed:**  
Whether app switcher pattern provides sufficient integration between Core and Runtime without full UI merge. Unknowns: optimal notification frequency (too many vs too few), whether users understand workflow state transitions from timeline view, if wizard-based creation is easier than form-based, how to surface workflow errors/failures effectively without overwhelming user, whether single UI is preferred over separate specialized apps.

**TRL Progression:** TRL 2 → TRL 6 (No UI → System prototype demonstrated in operational environment)

**Measurement Method:** User can complete full workflow lifecycle from admin UI; usability test results

**Expected Deliverables:**
- Runtime UI components (list, detail, wizard, timeline, notifications)
- App switcher integration
- Usability test results with task completion analysis
- Notification system implementation
- Security review report
- A/B test results on integration preference

**Duration:** 3 months  
**Allocated Budget:** 202,500 NOK

---

#### Activity 3.4: Durable Temporal Workflow Execution (kr-p-009)

**Technical Hypothesis:**  
Temporal workflow orchestration provides sufficient durability and state management for EPF cycles (READY/FIRE/AIM) such that workflows survive service restarts and resume execution with <30s recovery time while maintaining 100% state consistency.

**Experiment Design:**
- Implement Temporal workflow definitions for READY phase: artifact validation, approval routing, state transitions
- Test restart scenarios: stop Temporal worker mid-workflow at various stages, restart, measure time to resume
- Test state persistence: verify workflow history survives restart, check no data loss across 20+ restart cycles
- Implement error handling: transient failures (network timeout → retry), permanent failures (validation error → compensating action)
- Measure recovery metrics: time from restart to workflow resumption, state consistency checks, error recovery success rate
- Compare vs in-memory orchestration baseline (no durability)
- Test long-running approval workflows (12+ hour duration)

**Success Criteria:**  
Workflow completes full READY phase (validation → approval → state transition). Workflow survives service restart without data loss across 20+ restart cycles. Workflow resumes execution within 30s of restart. State history 100% accurate (no missing steps). Error handling works for transient failures (auto-retry succeeds in ≥95% cases) and permanent failures (compensating action triggered). Zero workflow corruption cases (invalid state transitions). Long-running workflows (12+ hours) complete successfully.

**Uncertainty Addressed:**  
Whether Temporal learning curve is acceptable for team (new paradigm vs traditional API orchestration). Unknowns: optimal activity granularity (fine-grained vs coarse), how to handle long-running approvals (hours to days), state serialization size limits for complex workflows, error categorization strategy (which errors are transient vs permanent), local development complexity (Temporal server setup), production infrastructure requirements (Temporal cluster sizing).

**TRL Progression:** TRL 2 → TRL 5 (No orchestration → Component validated in relevant environment)

**Measurement Method:** Workflow completes READY phase, survives service restart, continues to FIRE; recovery time metrics

**Expected Deliverables:**
- Temporal workflow definitions for READY phase
- Restart scenario test results with recovery metrics
- Error handling documentation with categorization guide
- State consistency validation framework
- Local development guide with Temporal setup
- Production deployment recommendations
- Comparison analysis vs in-memory orchestration

**Duration:** 3 months  
**Allocated Budget:** 202,500 NOK

---

## 5. Budget and Tax Deduction

### 5.1 Total Budget Overview

| Year | Months Active | Amount (NOK) | Monthly Rate |
|------|---------------|--------------|--------------|
| 2025 | Aug-Dec (5 months) | 500,000 | 100,000 |
| 2026 | Jan-Jun, Aug-Dec (11 months) | 1,100,000 | 100,000 |
| 2027 | Jan-Dec (11 months, excluding July) | 1,650,000 | 150,000 |
| **Total** | **27 months active** | **3,250,000** | - |

**Note:** July excluded in 2026 and 2027 per budget specification (vacation period).

### 5.2 Budget Allocation by Work Package

| Work Package | Duration | Budget (NOK) | Personnel (70%) | Equipment (20%) | Overhead (10%) |
|--------------|----------|--------------|-----------------|-----------------|----------------|
| WP1: Production-Ready Knowledge Graph | 12 months | 1,830,000 | 1,281,000 | 366,000 | 183,000 |
| WP2: EPF Self-Hosting & Feature Definitions | 6 months | 610,000 | 427,000 | 122,000 | 61,000 |
| WP3: EPF-Runtime MVP with Durable Workflows | 17 months | 810,000 | 567,000 | 162,000 | 81,000 |
| **Total** | **35 months** | **3,250,000** | **2,275,000** | **650,000** | **325,000** |

**Note:** Work packages overlap in execution. Total calendar time: 29 months (Aug 2025 - Dec 2027, excluding Jul 2026/2027).

### 5.3 Cost Category Breakdown

| Category | Percentage | Amount (NOK) | Description |
|----------|------------|--------------|-------------|
| Personnel | 70% | 2,275,000 | Salaries for R&D engineers, product manager, technical writers |
| Equipment & Tools | 20% | 650,000 | Cloud infrastructure (PostgreSQL clusters for load testing), LLM API costs (GPT-4, Claude, Gemini for experiments), development tools (IDEs, profilers, testing frameworks), software licenses (monitoring, observability, Temporal Cloud) |
| Overhead | 10% | 325,000 | Office facilities, administration, compliance consulting, knowledge dissemination |
| **Total** | **100%** | **3,250,000** | |

**Personnel breakdown:**
- R&D Engineers (implementation, testing, experimentation): ~80% of personnel costs (1,820,000 NOK)
- Product Manager (planning, coordination, stakeholder management): ~10% of personnel costs (227,500 NOK)
- Technical Writers (R&D documentation, white papers): ~10% of personnel costs (227,500 NOK)

**Equipment breakdown:**
- Cloud infrastructure for R&D testing (PostgreSQL clusters, load testing environments, staging deployments): ~40% of equipment (260,000 NOK)
- LLM API costs for extraction experiments (GPT-4, Claude, Gemini testing across 200+ documents): ~35% of equipment (227,500 NOK)
- Development tools and software licenses (Temporal Cloud, monitoring tools, profilers): ~25% of equipment (162,500 NOK)

**Overhead breakdown:**
- Office space and utilities: ~50% of overhead (162,500 NOK)
- Administrative support (accounting, legal, HR): ~30% of overhead (97,500 NOK)
- Knowledge dissemination (conference attendance, publication fees): ~20% of overhead (65,000 NOK)

### 5.4 Estimated Tax Deduction

Based on SkatteFUNN rates:
- Small companies (<50 employees, <€10M revenue): **20% of eligible costs**
- Large companies: **18% of eligible costs**

**Estimated tax deduction (assuming small company):**
- 2025: 100,000 NOK (20% of 500,000 NOK)
- 2026: 220,000 NOK (20% of 1,100,000 NOK)
- 2027: 330,000 NOK (20% of 1,650,000 NOK)
- **Total estimated deduction:** 650,000 NOK

> **Note:** Actual tax deduction calculated by Norwegian Tax Administration based on auditor-approved returns. Maximum base amount: 25 million NOK per company per income year. This project budget (3.25M NOK) is well within the limit.

---

## 6. EPF Traceability

This application was generated from the following EPF sources:

| EPF Source | Path | Used For |
|------------|------|----------|
| North Star | docs/EPF/_instances/emergent/READY/00_north_star.yaml | Vision, mission, problem context, company activities |
| Strategy Formula | docs/EPF/_instances/emergent/READY/04_strategy_formula.yaml | Technology strategy, differentiation, core competencies |
| Roadmap Recipe | docs/EPF/_instances/emergent/READY/05_roadmap_recipe.yaml | Timeline, work packages, R&D key results |
| Value Models | docs/EPF/_instances/emergent/FIRE/value_models/*.yaml | Problem definition, solution approach, innovation areas |

**Generated:** 2025-12-31T12:00:00Z  
**Generator:** Manual (following wizard.instructions.md principles)  
**EPF Version:** 2.1.0

**Direct Traceability:**
- WP1 Activity 1.1 → Roadmap KR kr-p-001 (Knowledge Graph Performance)
- WP1 Activity 1.2 → Roadmap KR kr-p-002 (Document Extraction)
- WP1 Activity 1.3 → Roadmap KR kr-p-003 (MCP Server Integration)
- WP2 Activity 2.1 → Roadmap KR kr-p-004 (EPF Framework Adoption)
- WP2 Activity 2.2 → Roadmap KR kr-p-005 (Feature Definitions)
- WP3 Activity 3.1 → Roadmap KR kr-p-006 (Infrastructure Integration)
- WP3 Activity 3.2 → Roadmap KR kr-p-007 (Artifact Storage)
- WP3 Activity 3.3 → Roadmap KR kr-p-008 (UI Integration)
- WP3 Activity 3.4 → Roadmap KR kr-p-009 (Temporal Workflows)

All R&D activities in this application are within TRL 2-7 range (SkatteFUNN eligible). No TRL 1 (basic research) or TRL 8-9 (production/operations) activities included.

---

## Next Steps for Submission

1. **Review for Accuracy**
   - Verify organization details and org number (926 006 985)
   - Update contact information (phone number placeholder: +47 XXX XX XXX)
   - Confirm timeline feasibility (Aug 2025 - Jul 2027, 24 months)
   - Validate July exclusions in 2026/2027 match actual work schedule

2. **Technical Review**
   - Have technical lead review R&D challenge descriptions for accuracy
   - Ensure state-of-the-art comparison reflects current research landscape
   - Validate work package activities and success criteria are realistic
   - Verify TRL progressions align with expected technical maturity
   - Confirm budget allocations match resource requirements

3. **Budget Verification**
   - Confirm budget numbers match accounting projections and cash flow
   - Verify cost category allocations (70/20/10 split) follow SkatteFUNN guidelines
   - Check compliance with 25M NOK cap (currently 3.25M - well within limit)
   - Validate July exclusions in 2026/2027 reflect actual work schedule (vacation periods)
   - Ensure retroactive costs (Aug-Dec 2025) have proper documentation

4. **Complete Contact Information**
   - Replace phone number placeholder: +47 XXX XX XXX
   - Add any additional project participants if needed (optional roles)
   - Verify email addresses are correct and monitored
   - Confirm role assignments follow SkatteFUNN requirements

5. **Translation (if needed)**
   - This draft is in English (acceptable for Research Council)
   - Consider Norwegian version if technical reviewers prefer native language
   - Key technical terms should remain in English regardless

6. **Auditor Documentation (for retroactive costs)**
   - Prepare documentation for Aug-Dec 2025 costs already incurred
   - Ensure salary records, invoices, timesheets are ready for auditor review
   - SkatteFUNN requires auditor approval for retroactive applications

7. **Official Submission**
   - Submit via Research Council portal: https://kunde.forskningsradet.no/
   - Attach auditor documentation for 2025 costs (Aug-Dec retroactive)
   - Include organizational documents if first SkatteFUNN application
   - Prepare for potential follow-up questions on technical details
   - Allow 4-6 weeks for processing

8. **Timeline Note**
   - SkatteFUNN accepts applications year-round
   - Processing time: typically 4-6 weeks from submission
   - Retroactive applications allowed (Aug-Dec 2025 costs already incurred)
   - Project period: 1 Aug 2025 - 31 Dec 2027 (29 calendar months, 27 active months excluding Jul 2026/2027)
   - Must apply before significant R&D costs are incurred (retroactive window limited)

**Questions?**  
Contact Research Council of Norway SkatteFUNN team:
- Email: skattefunn@forskningsradet.no
- Phone: +47 22 03 70 00
- Portal: https://kunde.forskningsradet.no/

---

**Application Status:** Draft - Ready for Review  
**Document Version:** 1.0  
**Last Updated:** 31 December 2025
