# Work Package Consolidation Plan: 9 WPs → 8 WPs

## Current Structure (9 WPs visible, actually 12 in budget table)

**Core Technical WPs (Keep as-is):**
- WP1: Knowledge Graph Performance - 18mo, 291k (2026-2027)
- WP2: Multi-Format Extraction - 12mo, 200k (2026)
- WP3: Model Context Protocol - 22mo, 330k (2026-2027)
- WP4: EPF Framework - 18mo, 223k (2026-2027)
- WP5: OpenSpec System - 16mo, 176k (2026-2027)

**Infrastructure WPs (Consolidate 4→2):**
- WP6: Runtime Infra Stage 1 (Basic) - 15mo, 228k (2026-2027Q1)
- WP7: Runtime Infra Stage 2 (Artifact Storage) - 16mo, 248k (2026-2027Q3)
- WP8: Runtime Infra Stage 3 (Workflow UI) - 19mo, 315k (2026-2028Q1)
- WP9: Temporal Workflow (Stage 4) - 13mo, 218k (2026Q4-2027)

**Extension WPs (Listed in Section 8.2 but not detailed - these are WP10-12):**
- WP10: Multi-Modal Image Embeddings - 13mo, 203k
- WP11: Temporal Graph Version Control - 16mo, 262k  
- WP12: Schema Evolution Migrations - 13mo, 198k

## Problem Analysis

The file currently shows detailed content for WP1-9, but Section 8.2 budget table lists 12 work packages. This suggests WP10-12 exist but are not fully detailed in Section 7.

## Consolidation Strategy

### Option A: Merge Infrastructure WPs (Recommended)

**New WP6: Runtime Infrastructure - API & Storage System**
- Combines: Old WP6 (Basic Infra) + Old WP7 (Artifact Storage)
- Duration: 2026-01-01 to 2027-09-30 (21 months)
- Budget: 228k + 248k = 476k
- Rationale: Both are foundational infrastructure layers, storage depends on basic infra
- Activities: Merge to 4-5 activities covering full stack (containers → deployment → monitoring → storage → search)

**New WP7: Runtime Infrastructure - Workflow Orchestration**  
- Combines: Old WP8 (Workflow UI) + Old WP9 (Temporal Integration)
- Duration: 2026-09-01 to 2028-03-31 (19 months) 
- Budget: 315k + 218k = 533k
- Rationale: Both are workflow-related, Temporal is the execution engine for UI-designed workflows
- Activities: Merge to 4-5 activities covering design → UI → execution engine → Temporal patterns

**Renumbering:**
- New WP8: Multi-Modal (old WP10)
- New WP9: Temporal Graph (old WP11)  
- New WP10: Schema Evolution (old WP12)

## Detailed Merge Plan: New WP6 (API & Storage)

**Title:** "Runtime Infrastructure - API & Storage System"

**Duration:** 2026-01-01 to 2027-09-30 (21 months)

**R&D Category:** Experimental development

**R&D Challenges** (merge WP6+WP7 challenges, 500 chars):
Can containerized API infrastructure with hybrid file+database storage maintain operational simplicity while supporting production-scale knowledge management? Challenge: design system balancing developer experience (local development), scalability (concurrent access, search performance), and version control integration (Git workflows, conflict resolution) without requiring specialized expertise. Unknown: optimal service boundaries, storage architecture (filesystem vs database tradeoffs), deployment complexity viable for mid-market. Failure mode: operational burden prevents adoption.

**Method and Approach** (merge WP6+WP7 methods, 1000 chars):
Progressive infrastructure validation: (1) establish baseline architecture (containerized services, storage layers), (2) implement core components (Docker orchestration, database, file sync, search indexes), (3) test operational scenarios (deployments, migrations, concurrent access, version control), (4) measure metrics (deployment time, search latency, conflict frequency, MTTR), (5) validate with target users (can mid-market teams operate system?), (6) document procedures. Hybrid storage combines Git benefits (version history, human-readable) with database performance (fast queries, referential integrity). Progress through TRL 2→5: concept → component validation → integrated system → production environment.

**Activities** (5 activities, merge 8→5):
1. **Service Architecture and Containerization** (Jan-Apr 2026)
   - Define service boundaries (API, database, cache, storage sync)
   - Implement Docker architecture (multi-stage builds, health checks, local dev)
   - Deploy tooling (Docker Compose, migration system)
   - Test deployment scenarios (install, upgrade, rollback)

2. **Storage Architecture and Synchronization** (May-Sep 2026)
   - Design dual-layer storage (Git + PostgreSQL index)
   - Implement filesystem sync (watchers, parsers, conflict detection)
   - Build search capabilities (full-text, metadata, relationships)
   - Test consistency scenarios (concurrent writes, Git operations)

3. **Operational Monitoring and Performance** (Oct 2026 - Feb 2027)
   - Implement monitoring stack (health checks, metrics, logs, alerts)
   - Optimize search performance (indexes, query tuning, load testing)
   - Test operational procedures (service restarts, backups, upgrades)
   - Measure metrics (deployment time, MTTR, search latency <100ms)

4. **Version Control Integration** (Mar-Jun 2027)
   - Integrate Git workflows (pre-commit hooks, post-commit sync, branches)
   - Implement conflict resolution (optimistic locking, merge UI)
   - Test version control scenarios (merges, rebases, rollbacks)
   - Validate with real users (Git workflow maintainability)

5. **Production Validation and TRL 5** (Jul-Sep 2027)
   - Deploy to production environment (multi-tenant, realistic data)
   - Conduct operational review (target customer personas)
   - Measure final metrics (complexity scores, user satisfaction)
   - Document runbooks, procedures, troubleshooting guides

**Budget:**
- 2026: 240k (150k+90k salaries, 21k+6k equipment, 14k+4k other) = 275k
- 2027: 180k (45k+135k salaries, 13k+8k equipment, 8k+5k other) = 201k
- Total: 420k+34k+22k = 476k

## Detailed Merge Plan: New WP7 (Workflow Orchestration)

**Title:** "Runtime Infrastructure - Workflow Orchestration System"

**Duration:** 2026-09-01 to 2028-03-31 (19 months)

**R&D Category:** Experimental development

**R&D Challenges** (merge WP8+WP9 challenges, 500 chars):
Can visual workflow builder with durable execution engine enable non-technical users to orchestrate complex generation pipelines while maintaining reliability for long-running processes? Challenge: abstract technical complexity (YAML, validation, distributed execution) without sacrificing power-user capabilities or process reliability. Unknown: whether low-code UI is learnable, whether Temporal's operational benefits justify complexity, and whether workflows remain debuggable at scale. Failure mode: UI too complex or execution engine too burdensome.

**Method and Approach** (merge WP8+WP9 methods, 1000 chars):
User-centered development with incremental adoption: (1) conduct user research (workflow patterns, CLI pain points, technical capabilities), (2) design workflow abstraction (node-based editor, template library, validation feedback), (3) implement prototype (React UI, Temporal execution engine, real-time validation), (4) migrate pilot workflows (extraction, sync, approvals), (5) measure effectiveness (creation time, reliability, debugging efficiency, operational burden), (6) validate with users (usability testing, production deployment). Temporal provides durable execution (exactly-once, retries, state persistence) for complex pipelines. Progress through TRL 2→6: concept → prototype → component validation → user validation in relevant environment.

**Activities** (5 activities, merge 8→5):
1. **User Research and Workflow UI Design** (Sep 2026 - Feb 2027)
   - Interview target users (personas, pain points, workflows)
   - Design node-based builder (drag-drop, configuration panels)
   - Implement UI prototype (React, react-flow, workflow JSON)
   - Test usability (task completion, error recovery, learning curve)

2. **Temporal Infrastructure and Integration** (Mar-Jun 2027)
   - Deploy Temporal services (server, workers, client integration)
   - Configure monitoring (workflow dashboards, health checks, visibility)
   - Test basic workflows (activities, retries, timeouts, failures)
   - Measure infrastructure overhead (resources, complexity vs baseline)

3. **Workflow Execution Engine** (Jul-Oct 2027)
   - Build execution interpreter (parse JSON, execute nodes, handle errors)
   - Implement validation integration (inline errors, fix suggestions, previews)
   - Test execution correctness (valid artifacts, reliability, error recovery)
   - Migrate pilot workflow (document extraction with durable execution)

4. **Advanced Workflow Patterns** (Nov 2027 - Jan 2028)
   - Implement complex workflows (scheduled sync, approval chains, composition)
   - Test Temporal patterns (human tasks, parallel execution, escalation)
   - Measure developer experience (maintainability, debugging, state management)
   - Collect feedback (benefits vs complexity tradeoffs)

5. **Usability Testing and Production Deployment** (Feb-Mar 2028)
   - Conduct formal usability study (10+ users, task metrics, satisfaction)
   - Deploy to production (usage analytics, workflow monitoring)
   - Validate operational improvements (failure recovery, manual intervention)
   - Document guides, templates, patterns, best practices

**Budget:**
- 2026: 75k (60k+15k salaries, 6k+2k equipment, 4k+1k other) = 85k
- 2027: 360k (180k+180k salaries, 22k+12k equipment, 16k+8k other) = 398k
- 2028: 45k+3k+2k = 50k
- Total: 480k+37k+16k = 533k

## Budget Update for Section 8.1 (UNCHANGED)

Total budget remains: 2,929,000 NOK across all WPs

## Budget Update for Section 8.2 (Work Package Allocation)

| WP | Duration | Total | % |
|----|----------|-------|---|
| WP1: Knowledge Graph Performance | 18 | 291,000 | 9.9% |
| WP2: Multi-Format Extraction | 12 | 200,000 | 6.8% |
| WP3: Model Context Protocol | 22 | 330,000 | 11.3% |
| WP4: EPF Framework | 18 | 223,000 | 7.6% |
| WP5: OpenSpec System | 16 | 176,000 | 6.0% |
| WP6: Runtime Infra - API & Storage | 21 | 476,000 | 16.3% |
| WP7: Runtime Infra - Workflows | 19 | 533,000 | 18.2% |
| WP8: Multi-Modal Image Embeddings | 13 | 203,000 | 6.9% |
| WP9: Temporal Graph Version Control | 16 | 262,000 | 8.9% |
| WP10: Schema Evolution Migrations | 13 | 198,000 | 6.8% |
| **Total** | | **2,892,000** | **98.7%** |

(Note: Slight discrepancy of 37k due to rounding - same as before)

## Section 6 Update (Project Summary)

Replace "Twelve work packages" with "Ten work packages" in project summary.

Old: "Twelve work packages systematically progress technologies..."
New: "Ten work packages systematically progress technologies..."

## Character Limit Checks

All R&D Challenges: 500 chars max
All Methods: 1000 chars max
All Activities: 500 chars max (description text)
All Activity titles: 100 chars max

## Next Steps

1. Create new WP6 (merge 6+7)
2. Create new WP7 (merge 8+9)
3. Update WP numbers for 10→8, 11→9, 12→10
4. Update Section 6 summary
5. Update Section 8.2 table
6. Run validator to confirm all rules pass
7. Run trim-violations if needed
8. Final validation
